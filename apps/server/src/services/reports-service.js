import {
  addWorkdays, isReportReason, parseReportResolution, REPORT_RESOLUTION_TITLES, REPORT_SLA_WORKDAYS, REPORT_TARGETS,
  reportReasonTitle,
} from '@posle9/core';

import { badRequest, notFound } from './errors.js';

const SUMMARY_DAYS = 30;

/** Сообщения о неточностях в данных: приём от семей и сводка для команды проекта. */
export function createReportService({ repos, clock = () => new Date() }) {
  const { reports, reference, users } = repos;

  function targetTitle(targetType, targetId) {
    if (targetType === REPORT_TARGETS.PROGRAM) {
      const program = reference.getProgram(targetId);
      return program ? `${program.specialtyTitle} — ${program.college.name}` : null;
    }
    return reference.getKeyDate(targetId)?.title ?? null;
  }

  return {
    create(userId, { targetType, targetId, reason }) {
      if (!Object.values(REPORT_TARGETS).includes(targetType)) throw badRequest('Неизвестный тип записи');
      if (!isReportReason(targetType, reason)) throw badRequest('Неизвестная причина');
      if (!targetTitle(targetType, targetId)) throw notFound('Запись не найдена');
      users.ensure(userId);
      const created = reports.create({
        userId, targetType, targetId, reason, createdAt: clock().toISOString(),
      });
      return { created };
    },

    /** Сводка для команды проекта: открытые сообщения со сроком обработки, просроченные помечены. */
    summaryText() {
      const today = clock().toISOString().slice(0, 10);
      const since = new Date(clock().getTime() - SUMMARY_DAYS * 24 * 3600 * 1000).toISOString();
      const groups = reports.openGroups().map((group) => {
        const due = addWorkdays(group.firstAt.slice(0, 10), REPORT_SLA_WORKDAYS);
        return { ...group, due, overdue: today > due };
      });
      const resolved = reports.resolvedStats(since);
      const resolvedLine = resolved.count
        ? `Закрыто за ${SUMMARY_DAYS} дней: ${resolved.count}, в среднем за ${resolved.avgDays.toFixed(1).replace('.', ',')} дн.`
        : `Закрыто за ${SUMMARY_DAYS} дней: 0.`;
      if (!groups.length) return `Открытых сообщений о неточностях нет. ${resolvedLine}`;
      const overdue = groups.filter((group) => group.overdue).length;
      const shortDate = (date) => `${date.slice(8, 10)}.${date.slice(5, 7)}`;
      return [
        `Открытые сообщения о неточностях: ${groups.length}${overdue ? `, просрочено: ${overdue}` : ''}. ${resolvedLine}`,
        '',
        ...groups.map((group) => `#${group.groupId} ${targetTitle(group.targetType, group.targetId) ?? group.targetId}\n`
          + `   ${reportReasonTitle(group.targetType, group.reason)} · семей: ${group.count} · получено ${shortDate(group.firstAt)}`
          + ` · срок до ${shortDate(group.due)}${group.overdue ? ' · ⚠️ просрочено' : ''}`),
        '',
        `Срок — ${REPORT_SLA_WORKDAYS} рабочих дня: сверить факт с первоисточником, исправить data/*.json с новой датой проверки или подтвердить, что данные верны.`,
        'Закрыть: /report_done <номер> исправлено — или — /report_done <номер> верно',
      ].join('\n');
    },

    /** Закрыть группу сообщений: «исправлено» или «данные верны». */
    resolve(groupId, word) {
      const resolution = parseReportResolution(word);
      if (!resolution) throw badRequest('Итог — «исправлено» или «верно»');
      const target = reports.getGroupTarget(groupId);
      if (!target) throw notFound('Сообщение не найдено');
      const closed = reports.resolve(groupId, resolution, clock().toISOString());
      return {
        closed,
        title: targetTitle(target.targetType, target.targetId) ?? target.targetId,
        resolutionTitle: REPORT_RESOLUTION_TITLES[resolution],
      };
    },
  };
}
