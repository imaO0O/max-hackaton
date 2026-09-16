import { useState } from 'react';
import { Button, CellList, CellSimple, Typography } from '@maxhub/max-ui';
import { PATH_TITLES, STUDY_FORMS } from '@posle9/core';

import { PlanTimeline } from '../components/PlanTimeline.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/states.jsx';
import { Card, DemoTag, ScreenHeader, SectionTitle, useToast } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { formatScore } from '../lib/format.js';
import { haptic } from '../lib/max-bridge.js';
import { useAsync } from '../lib/use-async.js';

/** План семьи, открытый подростком или вторым родителем по ссылке. Только чтение и подписка на напоминания. */
export function SharedPlanScreen({ token, onOpenOwnPlan }) {
  const shared = useAsync(() => api.sharedPlan(token), [token]);
  const [following, setFollowing] = useState(false);
  const [toast, showToast] = useToast();

  if (!shared.data && shared.status === 'loading') return <LoadingState fullScreen text="Открываем план…" />;
  if (!shared.data && shared.error?.status === 404) {
    return (
      <div className="page">
        <EmptyState
          icon="🔗"
          title="Ссылка на план недействительна"
          text="Попросите прислать ссылку ещё раз или составьте свой план"
          action={<Button size="medium" onClick={onOpenOwnPlan}>Составить свой план</Button>}
        />
      </div>
    );
  }
  if (!shared.data) return <ErrorState fullScreen error={shared.error} onRetry={shared.reload} />;

  const data = shared.data;

  const toggleFollow = async () => {
    setFollowing(true);
    try {
      const result = await api.followSharedPlan(token, !data.isFollowing);
      shared.setData((previous) => ({ ...previous, isFollowing: result.isFollowing }));
      haptic('success');
      showToast(result.isFollowing
        ? 'Готово! Напоминания придут в чат с ботом'
        : 'Напоминания по этому плану выключены');
    } catch (error) {
      haptic('error');
      showToast(error.message, 'error');
    } finally {
      setFollowing(false);
    }
  };

  return (
    <div className="page">
      <ScreenHeader
        title={data.isOwner ? 'Это ваш план' : 'План после 9 класса'}
        subtitle={`${data.academicYear} · ${data.region.name} · ${PATH_TITLES[data.profile.path]}`}
        after={data.region.isDemo ? <DemoTag /> : null}
      />

      {data.isOwner ? (
        <Card>
          <Typography.Body variant="small">Так план увидит тот, кому вы отправили ссылку.</Typography.Body>
          <Button size="medium" variant="secondary" onClick={onOpenOwnPlan}>Вернуться к своему плану</Button>
        </Card>
      ) : (
        <Card highlighted>
          <Typography.Body variant="small">
            С вами поделились планом выбора пути после 9 класса. Включите напоминания — бот напишет перед важными датами.
          </Typography.Body>
          <Button
            size="large"
            stretched
            variant={data.isFollowing ? 'secondary' : 'primary'}
            loading={following}
            onClick={toggleFollow}
          >
            {data.isFollowing ? 'Не получать напоминания' : 'Получать напоминания'}
          </Button>
        </Card>
      )}

      <SectionTitle>Даты года</SectionTitle>
      <PlanTimeline items={data.items} nextItemId={data.nextItemId} regionIsDemo={data.region.isDemo} hidePast />

      {data.favorites.length > 0 && (
        <>
          <SectionTitle>Программы, которые понравились семье</SectionTitle>
          <CellList mode="island" filled>
            {data.favorites.map((program) => (
              <CellSimple
                key={program.id}
                title={program.specialtyTitle}
                subtitle={`${program.college.name} · ${STUDY_FORMS[program.form]} · балл ${formatScore(program.passingScore)}`}
              />
            ))}
          </CellList>
        </>
      )}

      {!data.isOwner && (
        <div className="actions">
          <Button size="medium" variant="secondary" stretched onClick={onOpenOwnPlan}>Составить свой план</Button>
        </div>
      )}

      {toast}
    </div>
  );
}
