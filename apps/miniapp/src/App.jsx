import { useEffect, useState } from 'react';

import { ErrorState, LoadingState } from './components/states.jsx';
import { TabBar } from './components/TabBar.jsx';
import { api } from './lib/api.js';
import { loadLocal, saveLocal } from './lib/storage.js';
import { useAsync } from './lib/use-async.js';
import { CollegesScreen } from './screens/CollegesScreen.jsx';
import { GradesScreen } from './screens/GradesScreen.jsx';
import { NextScreen } from './screens/NextScreen.jsx';
import { OnboardingScreen } from './screens/OnboardingScreen.jsx';
import { PathsScreen } from './screens/PathsScreen.jsx';
import { PlanScreen } from './screens/PlanScreen.jsx';
import { QuizGateScreen } from './screens/QuizGateScreen.jsx';
import { SharedPlanScreen } from './screens/SharedPlanScreen.jsx';

/** Параметр запуска из ссылки https://max.ru/<bot>?startapp=plan_<token> */
function shareTokenFrom(startParam) {
  const match = /^plan_([A-Za-z0-9_-]{16,64})$/.exec(startParam ?? '');
  return match ? match[1] : null;
}

export function App() {
  const session = useAsync(() => api.session(), []);
  const [profile, setProfile] = useState(null);
  const [sharedToken, setSharedToken] = useState(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [tab, setTab] = useState(() => (loadLocal('visited', false) ? 'plan' : 'paths'));
  const [regionsById, setRegionsById] = useState({});
  const [compareOnOpen, setCompareOnOpen] = useState(false);
  const [experimentOnlyOnOpen, setExperimentOnlyOnOpen] = useState(false);
  const [dataDeleted, setDataDeleted] = useState(false);
  // Новой семье — сначала три вопроса «до»; если статус не загрузился, просто идём к опросу
  const quizStatus = useAsync(() => api.quizStatus().catch(() => null), []);
  const [quizGateDone, setQuizGateDone] = useState(false);
  const [quizNotice, setQuizNotice] = useState(null);
  // «План собран» или «План обновлён» — над ближайшим шагом, пока не перешли на другую вкладку
  const [planNotice, setPlanNotice] = useState(null);

  useEffect(() => {
    if (!session.data) return;
    setProfile(session.data.profile);
    // Ссылка на план — по ней; без ссылки подросток, подписанный на план семьи, видит этот план, а не опрос
    setSharedToken(shareTokenFrom(session.data.startParam) ?? session.data.familyPlanToken ?? null);
  }, [session.data]);

  useEffect(() => {
    api.regions()
      .then((regions) => setRegionsById(Object.fromEntries(regions.map((region) => [region.id, region]))))
      .catch(() => setRegionsById({}));
  }, []);

  const changeTab = (next, { compare = false, experimentOnly = false } = {}) => {
    saveLocal('visited', true);
    setPlanNotice(null);
    setCompareOnOpen(compare);
    setExperimentOnlyOnOpen(experimentOnly);
    setTab(next);
    window.scrollTo({ top: 0 });
  };

  if (!session.data && session.status === 'loading') {
    return <LoadingState fullScreen text="Открываем план…" />;
  }
  if (!session.data && session.status === 'error') {
    return <ErrorState fullScreen error={session.error} onRetry={session.reload} />;
  }

  if (sharedToken) {
    return <SharedPlanScreen token={sharedToken} onOpenOwnPlan={() => setSharedToken(null)} />;
  }

  const newFamily = !profile?.isComplete && !editingProfile && !dataDeleted;
  if (newFamily && !quizGateDone && quizStatus.status === 'loading' && !quizStatus.data) {
    return <LoadingState fullScreen text="Открываем план…" />;
  }
  if (newFamily && !quizGateDone && quizStatus.data?.phase === 'before') {
    return (
      <QuizGateScreen
        onDone={() => { setQuizNotice('Спасибо! Ответы сравним, когда план будет готов.'); setQuizGateDone(true); }}
        onSkip={() => { api.skipQuiz().catch(() => {}); setQuizGateDone(true); }}
      />
    );
  }

  if (!profile?.isComplete || editingProfile) {
    return (
      <OnboardingScreen
        initialProfile={profile}
        notice={dataDeleted ? 'Данные удалены. Чтобы снова собрать план, ответьте на вопросы.' : quizNotice}
        onCancel={profile?.isComplete ? () => setEditingProfile(false) : undefined}
        onSaved={(saved) => {
          const firstTime = !profile?.isComplete;
          setProfile(saved);
          setEditingProfile(false);
          setDataDeleted(false);
          changeTab('plan');
          setPlanNotice(firstTime ? 'built' : 'updated');
        }}
      />
    );
  }

  const region = regionsById[profile.regionId] ?? null;

  return (
    <div className="app">
      <main className="app__content">
        {tab === 'paths' && <PathsScreen profile={profile} region={region} onOpenTab={changeTab} />}
        {tab === 'grades' && <GradesScreen region={region} />}
        {tab === 'colleges' && (
          <CollegesScreen
            profile={profile}
            region={region}
            initialCompare={compareOnOpen}
            initialExperimentOnly={experimentOnlyOnOpen}
            onOpenTab={changeTab}
          />
        )}
        {tab === 'plan' && (
          <PlanScreen
            notice={planNotice}
            onEditProfile={() => setEditingProfile(true)}
            onProfileChange={setProfile}
            onOpenTab={changeTab}
            onDataDeleted={() => {
              setProfile(null);
              setDataDeleted(true);
              setTab('paths');
              window.scrollTo({ top: 0 });
            }}
          />
        )}
        {tab === 'next' && <NextScreen />}
      </main>
      <TabBar value={tab} onChange={changeTab} />
    </div>
  );
}
