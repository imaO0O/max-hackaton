import { isReportReason, REPORT_TARGETS, reportReasonTitle } from '@posle9/core';

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
        userId, targetType, targetId, reason,
      });
      return { created };
    },

    /** Текст для команды проекта: за 30 дней, самые частые сверху. */
    summaryText() {
      const since = new Date(clock().getTime() - SUMMARY_DAYS * 24 * 3600 * 1000).toISOString();
      const rows = reports.summary({ since });
      if (!rows.length) return `Сообщений о неточностях за ${SUMMARY_DAYS} дней нет.`;
      return [
        `Сообщения о неточностях за ${SUMMARY_DAYS} дней: ${reports.count(since)}`,
        '',
        ...rows.map((row, index) => `${index + 1}. ${targetTitle(row.targetType, row.targetId) ?? row.targetId}\n`
          + `   ${reportReasonTitle(row.targetType, row.reason)} · семей: ${row.count} · ${row.lastAt.slice(0, 10)}`),
        '',
        'Сверьте факты с источником, исправьте data/*.json и обновите сервер.',
      ].join('\n');
    },
  };
}
