import { useEffect, useMemo, useState } from 'react';
import { Button, CellList, CellSimple, Switch, Typography } from '@maxhub/max-ui';
import { PATH_TITLES, STUDY_FORMS, planPeriodLabel } from '@posle9/core';

import { PlanTimeline } from '../components/PlanTimeline.jsx';
import { ErrorState, LoadingState } from '../components/states.jsx';
import {
  Card, DemoTag, ScreenHeader, SectionTitle, Tag, useToast,
} from '../components/ui.jsx';
import { api } from '../lib/api.js';
import {
  daysText, formatDateRange, formatScore, reminderTimeText,
} from '../lib/format.js';
import { downloadFile, haptic, shareToMax } from '../lib/max-bridge.js';
import { clearLocal } from '../lib/storage.js';
import { useAsync } from '../lib/use-async.js';

export function PlanScreen({ onEditProfile, onProfileChange, onOpenTab, onDataDeleted }) {
  const plan = useAsync(() => api.plan(), []);
  const favorites = useAsync(() => api.favorites(), []);
  // Ссылка на план постоянная, поэтому готовим её заранее: MAX Bridge открывает экран шеринга
  // только сразу после нажатия, а ожидание ответа сервера в обработчике может это нарушить
  const preparedShare = useAsync(() => api.sharePlan(), []);
  // Файл календаря MAX Bridge тоже скачивает только сразу после нажатия — ссылку готовим заранее.
  // Она действует 10 минут, поэтому, пока экран открыт, обновляем её за минуту до конца
  const calendarLink = useAsync(() => api.calendarLink().then((link) => ({ ...link, receivedAt: Date.now() })), []);
  const [pendingIds, setPendingIds] = useState(new Set());
  const [sharing, setSharing] = useState(false);
  const [savingReminders, setSavingReminders] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toast, showToast] = useToast();

  useEffect(() => {
    if (!calendarLink.data) return undefined;
    const timer = setTimeout(calendarLink.reload, Math.max(30, calendarLink.data.expiresInSeconds - 60) * 1000);
    return () => clearTimeout(timer);
  }, [calendarLink.data, calendarLink.reload]);

  const nextItem = useMemo(
    () => plan.data?.items.find((item) => item.id === plan.data.nextItemId) ?? null,
    [plan.data],
  );

  if (!plan.data && plan.status === 'loading') return <LoadingState text="Собираем план…" />;
  if (!plan.data) return <ErrorState error={plan.error} onRetry={plan.reload} />;

  const { items, region, profile, academicYear, isAdvance } = plan.data;
  const doneCount = items.filter((item) => item.done).length;
  const upcomingCount = items.filter((item) => item.status !== 'past').length;
  const grade9Count = items.filter((item) => item.grade !== 8).length;
  const pastCount = items.filter((item) => item.status === 'past' && item.id !== plan.data.nextItemId).length;

  const toggleDone = async (item) => {
    const done = !item.done;
    setPendingIds((previous) => new Set(previous).add(item.id));
    plan.setData((data) => ({ ...data, items: data.items.map((row) => (row.id === item.id ? { ...row, done } : row)) }));
    try {
      await api.setItemDone(item.id, done);
      if (done) haptic('success');
      plan.reload();
    } catch (error) {
      plan.setData((data) => ({ ...data, items: data.items.map((row) => (row.id === item.id ? { ...row, done: !done } : row)) }));
      haptic('error');
      showToast(error.message, 'error');
    } finally {
      setPendingIds((previous) => {
        const next = new Set(previous);
        next.delete(item.id);
        return next;
      });
    }
  };

  const sharePlan = async () => {
    setSharing(true);
    try {
      const share = preparedShare.data ?? await api.sharePlan();
      const result = await shareToMax({ text: share.text, link: share.link });
      if (result === 'copied') showToast('Ссылка скопирована — отправьте её подростку в MAX');
      if (result === 'failed') showToast(`Не удалось открыть отправку. Ссылка: ${share.link}`, 'error');
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setSharing(false);
    }
  };

  const addToCalendar = async () => {
    const prepared = calendarLink.data;
    const fresh = prepared && Date.now() - prepared.receivedAt < (prepared.expiresInSeconds - 30) * 1000;
    setDownloading(true);
    try {
      let link = prepared;
      if (!fresh) {
        link = await api.calendarLink();
        calendarLink.setData({ ...link, receivedAt: Date.now() });
      }
      const result = await downloadFile(link.url, link.fileName);
      showToast(result === 'downloaded'
        ? 'Файл скачан — откройте его, и даты появятся в календаре телефона'
        : 'Файл календаря открыт в браузере — сохраните его и откройте в календаре');
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setDownloading(false);
    }
  };

  const revokeShare = async () => {
    setRevoking(true);
    try {
      const result = await api.revokeShare();
      haptic('success');
      showToast(result.followersRemoved > 0
        ? `Ссылка отозвана, напоминания по ней отключены: ${result.followersRemoved}`
        : 'Ссылка отозвана — старая больше не откроется');
      preparedShare.reload();
      plan.reload();
    } catch (error) {
      haptic('error');
      showToast(error.message, 'error');
    } finally {
      setRevoking(false);
    }
  };

  const deleteData = async () => {
    setDeleting(true);
    try {
      await api.deleteMyData();
      clearLocal();
      haptic('success');
      onDataDeleted();
    } catch (error) {
      haptic('error');
      showToast(error.message, 'error');
      setDeleting(false);
    }
  };

  const toggleReminders = async () => {
    setSavingReminders(true);
    try {
      const updated = await api.setReminders(!profile.remindersEnabled);
      onProfileChange(updated);
      showToast(updated.remindersEnabled ? 'Напоминания включены' : 'Напоминания выключены');
      plan.reload();
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setSavingReminders(false);
    }
  };

  return (
    <div className="page">
      <ScreenHeader
        title="Мой план"
        subtitle={`${planPeriodLabel(plan.data)} · ${region.name} · ${PATH_TITLES[profile.path]}`}
        after={<button type="button" className="link-button" onClick={onEditProfile}>Изменить</button>}
      />

      {isAdvance && (
        <Card className="notice">
          <Typography.Body variant="medium-strong">План на 8–9 класс</Typography.Body>
          <Typography.Body variant="small">
            {grade9Count === 0
              ? `Сейчас в плане шаги 8 класса. Полный план 9 класса откроется в следующем учебном году: даты ${academicYear} ещё не опубликованы. Добавим их, как только они появятся, и пришлём напоминания в чат с ботом.`
              : `В плане шаги 8 класса и даты ${academicYear} учебного года, когда подросток будет в 9 классе. Напоминания придут заранее.`}
          </Typography.Body>
          <Typography.Body variant="small">
            А пока можно сравнить два пути и посчитать средний балл: оценки по предметам, которые заканчиваются в 8 классе, тоже войдут в аттестат.
          </Typography.Body>
          <div className="button-row">
            <Button size="medium" variant="secondary" onClick={() => onOpenTab('paths')}>Два пути</Button>
            <Button size="medium" variant="secondary" onClick={() => onOpenTab('grades')}>Посчитать балл</Button>
          </div>
        </Card>
      )}

      {region.isDemo && (
        <Card className="notice">
          <Typography.Body variant="small">
            <DemoTag /> Регион и колледжи демонстрационные. Федеральные даты нужно сверять с источниками — у каждого пункта есть ссылка.
          </Typography.Body>
        </Card>
      )}

      {nextItem && (
        <Card highlighted className="next-step">
          <Typography.Label variant="medium" className="muted">Ближайший шаг</Typography.Label>
          <Typography.Title variant="medium-strong">{nextItem.title}</Typography.Title>
          <Typography.Body variant="small">
            {formatDateRange(nextItem.dateStart, nextItem.dateEnd)}
            {nextItem.status === 'current' ? ' · идёт сейчас' : ''}
            {nextItem.status === 'upcoming' && nextItem.daysLeft > 0 ? ` · через ${daysText(nextItem.daysLeft)}` : ''}
          </Typography.Body>
        </Card>
      )}

      <div className="actions">
        <Button size="large" stretched loading={sharing} onClick={sharePlan}>
          Отправить план подростку
        </Button>
        {upcomingCount > 0 && (
          <Button size="large" variant="secondary" stretched loading={downloading} onClick={addToCalendar}>
            Добавить даты в календарь
          </Button>
        )}
      </div>
      {plan.data.followersCount > 0 && (
        <Typography.Body variant="small" className="muted hint">
          {`План открыли по ссылке и получают напоминания: ${plan.data.followersCount}`}
        </Typography.Body>
      )}

      <Card>
        <label className="switch-row">
          <span>
            <Typography.Body variant="medium-strong">Напоминания в чате с ботом</Typography.Body>
            <Typography.Body variant="small" className="muted">
              {!profile.remindersEnabled && 'Выключены — важные даты придётся отслеживать самостоятельно'}
              {profile.remindersEnabled && (isAdvance && plan.data.pendingReminders === 0
                ? 'Включены — придут, когда появятся новые даты плана'
                : `Запланировано: ${plan.data.pendingReminders}. Приходят в ${reminderTimeText(region.utcOffsetHours)}`)}
            </Typography.Body>
          </span>
          <Switch checked={profile.remindersEnabled} disabled={savingReminders} onChange={toggleReminders} />
        </label>
      </Card>

      {items.length > 0 && (
        <>
          <SectionTitle
            after={pastCount > 0 ? (
              <button type="button" className="link-button" onClick={() => setShowPast(!showPast)}>
                {showPast ? 'Скрыть прошедшие' : `Показать прошедшие (${pastCount})`}
              </button>
            ) : <Tag>{`выполнено ${doneCount} из ${items.length}`}</Tag>}
          >
            Даты года
          </SectionTitle>

          <PlanTimeline
            items={items}
            nextItemId={plan.data.nextItemId}
            onToggleDone={toggleDone}
            pendingIds={pendingIds}
            regionIsDemo={region.isDemo}
            hidePast={!showPast}
          />
        </>
      )}

      <SectionTitle
        after={favorites.data?.length >= 2
          ? <button type="button" className="link-button" onClick={() => onOpenTab('colleges', { compare: true })}>Сравнить рядом</button>
          : null}
      >
        Избранные программы
      </SectionTitle>
      {favorites.status === 'error' && <ErrorState error={favorites.error} onRetry={favorites.reload} />}
      {favorites.data && favorites.data.length === 0 && (
        <Card>
          <Typography.Body variant="small" className="muted">Пока пусто. Отмечайте программы звёздочкой в разделе колледжей.</Typography.Body>
          <Button size="medium" variant="secondary" onClick={() => onOpenTab('colleges')}>Открыть колледжи</Button>
        </Card>
      )}
      {favorites.data?.length > 0 && (
        <CellList mode="island" filled>
          {favorites.data.map((program) => (
            <CellSimple
              key={program.id}
              title={program.specialtyTitle}
              subtitle={`${program.college.name} · ${STUDY_FORMS[program.form]} · балл ${formatScore(program.passingScore)}`}
            />
          ))}
        </CellList>
      )}

      <SectionTitle>Ваши данные</SectionTitle>
      <Card>
        <Typography.Body variant="small">
          Храним только ваш ID в MAX, ответы на вопросы (регион, город, класс, интересы, путь), отметки плана, избранные программы и расписание напоминаний. Имена не храним, оценки из калькулятора остаются только на этом устройстве.
        </Typography.Body>
        <Button size="medium" variant="secondary" loading={revoking} onClick={revokeShare}>Отозвать ссылку на план</Button>
        <Typography.Body variant="small" className="muted">
          Старая ссылка перестанет открываться, а те, кто открыл план по ней, перестанут получать напоминания. Новую ссылку можно отправить в любой момент.
        </Typography.Body>
        {confirmingDelete ? (
          <div className="stack stack--tight">
            <Typography.Body variant="medium-strong">Удалить все данные?</Typography.Body>
            <Typography.Body variant="small">
              План, отметки, избранное и ссылка на план перестанут работать, напоминания не придут. Оценки на этом устройстве тоже удалятся. Отменить удаление нельзя.
            </Typography.Body>
            <div className="button-row">
              <Button size="medium" variant="destructive" loading={deleting} onClick={deleteData}>Да, удалить</Button>
              <Button size="medium" variant="secondary" disabled={deleting} onClick={() => setConfirmingDelete(false)}>Отмена</Button>
            </div>
          </div>
        ) : (
          <Button size="medium" variant="ghost" onClick={() => setConfirmingDelete(true)}>Удалить мои данные</Button>
        )}
      </Card>

      {toast}
    </div>
  );
}
