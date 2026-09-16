import { useMemo, useState } from 'react';
import { Button, CellList, CellSimple, Switch, Typography } from '@maxhub/max-ui';
import { PATH_TITLES, STUDY_FORMS } from '@posle9/core';

import { PlanTimeline } from '../components/PlanTimeline.jsx';
import { ErrorState, LoadingState } from '../components/states.jsx';
import {
  Card, DemoTag, ScreenHeader, SectionTitle, Tag, useToast,
} from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { daysText, formatDateRange, formatScore } from '../lib/format.js';
import { haptic, shareToMax } from '../lib/max-bridge.js';
import { useAsync } from '../lib/use-async.js';

export function PlanScreen({ onEditProfile, onProfileChange, onOpenTab }) {
  const plan = useAsync(() => api.plan(), []);
  const favorites = useAsync(() => api.favorites(), []);
  // Ссылка на план постоянная, поэтому готовим её заранее: MAX Bridge открывает экран шеринга
  // только сразу после нажатия, а ожидание ответа сервера в обработчике может это нарушить
  const preparedShare = useAsync(() => api.sharePlan(), []);
  const [pendingIds, setPendingIds] = useState(new Set());
  const [sharing, setSharing] = useState(false);
  const [savingReminders, setSavingReminders] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [toast, showToast] = useToast();

  const nextItem = useMemo(
    () => plan.data?.items.find((item) => item.id === plan.data.nextItemId) ?? null,
    [plan.data],
  );

  if (!plan.data && plan.status === 'loading') return <LoadingState text="Собираем план…" />;
  if (!plan.data) return <ErrorState error={plan.error} onRetry={plan.reload} />;

  const { items, region, profile, academicYear } = plan.data;
  const doneCount = items.filter((item) => item.done).length;
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
        subtitle={`${academicYear} · ${region.name} · ${PATH_TITLES[profile.path]}`}
        after={<button type="button" className="link-button" onClick={onEditProfile}>Изменить</button>}
      />

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
              {profile.remindersEnabled
                ? `Запланировано: ${plan.data.pendingReminders}. Приходят в 10:00 по времени региона`
                : 'Выключены — важные даты придётся отслеживать самостоятельно'}
            </Typography.Body>
          </span>
          <Switch checked={profile.remindersEnabled} disabled={savingReminders} onChange={toggleReminders} />
        </label>
      </Card>

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

      <SectionTitle>Избранные программы</SectionTitle>
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

      {toast}
    </div>
  );
}
