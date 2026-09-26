import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, CellList, CellSimple, Switch, Typography } from '@maxhub/max-ui';
import { STUDY_FORMS } from '@posle9/core';

import { ProgramCompare } from '../components/ProgramCompare.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/states.jsx';
import {
  Card, Chip, DemoTag, ScreenHeader, SectionTitle, SourceNote, Tag, useToast,
} from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { formatScore, plural } from '../lib/format.js';
import { haptic, showBackButton } from '../lib/max-bridge.js';
import { loadLocal } from '../lib/storage.js';
import { useAsync } from '../lib/use-async.js';
import { AVERAGE_STORAGE_KEY } from './GradesScreen.jsx';

function minScore(programs) {
  const scores = programs.map((program) => program.passingScore).filter((score) => score !== null);
  return scores.length ? Math.min(...scores) : null;
}

function ProgramCard({ program, isFavorite, onToggleFavorite, pending, myAverage, isDemo }) {
  return (
    <Card className="program">
      <div className="program__head">
        <div>
          <Typography.Label variant="small" className="muted">{program.specialtyCode}</Typography.Label>
          <Typography.Body variant="medium-strong">{program.specialtyTitle}</Typography.Body>
        </div>
        <button
          type="button"
          className={`favorite-button ${isFavorite ? 'favorite-button--active' : ''}`}
          aria-pressed={isFavorite}
          aria-label={isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
          disabled={pending}
          onClick={onToggleFavorite}
        >
          {isFavorite ? '★' : '☆'}
        </button>
      </div>

      <dl className="facts facts--inline">
        <dt>Форма</dt>
        <dd>{STUDY_FORMS[program.form]}</dd>
        <dt>Срок</dt>
        <dd>{program.duration ?? '—'}</dd>
        <dt>Бюджетных мест</dt>
        <dd>{program.budgetPlaces ?? 'нет данных'}</dd>
        <dt>{`Проходной балл${program.scoreYear ? ` ${program.scoreYear}` : ''}`}</dt>
        <dd>{program.passingScore === null ? 'нет данных' : formatScore(program.passingScore)}</dd>
        {program.entranceTest && (
          <>
            <dt>Дополнительно</dt>
            <dd>{program.entranceTest}</dd>
          </>
        )}
      </dl>

      {myAverage !== null && program.passingScore !== null && (
        <Typography.Body variant="small" className="muted">
          {`Ваш текущий расчёт: ${formatScore(myAverage)}. Это ориентир, а не прогноз поступления — баллы меняются каждый год.`}
        </Typography.Body>
      )}

      <SourceNote title="Источник" url={program.sourceUrl} checkedAt={program.checkedAt} isDemo={isDemo} />
    </Card>
  );
}

function CollegeDetails({ collegeId, favoriteIds, onToggleFavorite, pendingIds, onBack }) {
  const college = useAsync(() => api.college(collegeId), [collegeId]);
  const myAverage = loadLocal(AVERAGE_STORAGE_KEY, null);

  useEffect(() => showBackButton(onBack), [onBack]);

  return (
    <div className="page">
      <button type="button" className="back-link" onClick={onBack}>← Все колледжи</button>
      {!college.data && college.status === 'loading' && <LoadingState />}
      {!college.data && college.status === 'error' && <ErrorState error={college.error} onRetry={college.reload} />}
      {college.data && (
        <>
          <ScreenHeader
            title={college.data.name}
            subtitle={[college.data.address ?? college.data.city, college.data.hasDormitory ? 'есть общежитие' : 'без общежития'].join(' · ')}
            after={college.data.isDemo ? <DemoTag /> : null}
          />
          <SectionTitle>{`Программы (${college.data.programs.length})`}</SectionTitle>
          <div className="stack">
            {college.data.programs.map((program) => (
              <ProgramCard
                key={program.id}
                program={program}
                isDemo={college.data.isDemo}
                myAverage={myAverage}
                isFavorite={favoriteIds.has(program.id)}
                pending={pendingIds.has(program.id)}
                onToggleFavorite={() => onToggleFavorite(program.id)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const NO_FILTERS = { city: null, interests: [], form: null, budgetOnly: false, withinMyScore: false };

/** Программы, где прошлогодний проходной балл не выше расчёта семьи. Без опубликованного балла — не показываем. */
function withinScore(colleges, average) {
  return colleges
    .map((college) => ({
      ...college,
      programs: college.programs.filter((program) => program.passingScore !== null && program.passingScore <= average),
    }))
    .filter((college) => college.programs.length > 0);
}

export function CollegesScreen({ profile, initialCompare = false, onOpenTab }) {
  const [filters, setFilters] = useState({
    ...NO_FILTERS,
    city: profile.city ?? null,
    interests: profile.interests ?? [],
  });
  // Средний балл считается и хранится только на устройстве, фильтр по нему тоже работает на устройстве
  const myAverage = loadLocal(AVERAGE_STORAGE_KEY, null);
  const [openCollegeId, setOpenCollegeId] = useState(null);
  const closeCollege = useCallback(() => setOpenCollegeId(null), []);
  const [comparing, setComparing] = useState(initialCompare);
  const closeCompare = useCallback(() => setComparing(false), []);
  const [pendingIds, setPendingIds] = useState(new Set());
  const [toast, showToast] = useToast();

  const reference = useAsync(() => Promise.all([api.cities(profile.regionId), api.interests()]), [profile.regionId]);
  const colleges = useAsync(
    () => api.colleges({
      regionId: profile.regionId, city: filters.city, interests: filters.interests, form: filters.form, budgetOnly: filters.budgetOnly,
    }),
    [profile.regionId, filters.city, filters.interests.join(','), filters.form, filters.budgetOnly],
  );
  const favorites = useAsync(() => api.favorites(), []);
  const favoriteIds = useMemo(() => new Set((favorites.data ?? []).map((item) => item.id)), [favorites.data]);
  const scoreFilterOn = filters.withinMyScore && myAverage !== null;
  const list = useMemo(
    () => (scoreFilterOn ? withinScore(colleges.data ?? [], myAverage) : colleges.data ?? []),
    [colleges.data, scoreFilterOn, myAverage],
  );

  const toggleFavorite = async (programId) => {
    const isFavorite = favoriteIds.has(programId);
    setPendingIds((previous) => new Set(previous).add(programId));
    try {
      if (isFavorite) {
        await api.removeFavorite(programId);
        showToast('Убрано из избранного');
      } else {
        await api.addFavorite(programId);
        haptic('success');
        showToast('Добавлено в избранное — оно видно в плане');
      }
      favorites.reload();
    } catch (error) {
      haptic('error');
      showToast(error.message, 'error');
    } finally {
      setPendingIds((previous) => {
        const next = new Set(previous);
        next.delete(programId);
        return next;
      });
    }
  };

  const setFilter = (patch) => setFilters((previous) => ({ ...previous, ...patch }));
  const resetFilters = () => setFilters(NO_FILTERS);

  if (comparing) {
    return (
      <>
        <ProgramCompare
          favorites={favorites}
          myAverage={loadLocal(AVERAGE_STORAGE_KEY, null)}
          pendingIds={pendingIds}
          onToggleFavorite={toggleFavorite}
          onBack={closeCompare}
        />
        {toast}
      </>
    );
  }

  if (openCollegeId) {
    return (
      <>
        <CollegeDetails
          collegeId={openCollegeId}
          favoriteIds={favoriteIds}
          pendingIds={pendingIds}
          onToggleFavorite={toggleFavorite}
          onBack={closeCollege}
        />
        {toast}
      </>
    );
  }

  const [cities, interests] = reference.data ?? [[], []];
  const hasFilters = filters.city || filters.interests.length || filters.form || filters.budgetOnly || filters.withinMyScore;
  const noColleges = Boolean(reference.data) && cities.length === 0;

  return (
    <div className="page">
      <ScreenHeader
        title="Колледжи региона"
        subtitle="Прошлогодние проходные баллы, источник и дата проверки. Добавляйте программы в избранное"
      />

      {favorites.data?.length > 0 && (
        <>
          <SectionTitle
            after={favorites.data.length >= 2
              ? <button type="button" className="link-button" onClick={() => setComparing(true)}>Сравнить рядом</button>
              : null}
          >
            {`Избранное (${favorites.data.length})`}
          </SectionTitle>
          <CellList mode="island" filled>
            {favorites.data.map((program) => (
              <CellSimple
                key={program.id}
                showChevron
                onClick={() => setOpenCollegeId(program.college.id)}
                title={program.specialtyTitle}
                subtitle={`${program.college.name} · ${STUDY_FORMS[program.form]} · балл ${formatScore(program.passingScore)}`}
              />
            ))}
          </CellList>
        </>
      )}

      {noColleges ? (
        <EmptyState
          title="Колледжей этого региона в справочнике пока нет"
          text="Сейчас собраны колледжи Республики Татарстан. Для своего региона смотрите сайт регионального министерства образования и сайты колледжей. Даты плана, напоминания и сравнение путей работают для любого региона"
        />
      ) : (
        <>
          <SectionTitle after={hasFilters ? <button type="button" className="link-button" onClick={resetFilters}>Сбросить</button> : null}>
            Фильтры
          </SectionTitle>

          {reference.status === 'error' && <ErrorState error={reference.error} onRetry={reference.reload} />}
          {reference.data && (
            <div className="filters">
              <div className="chips" aria-label="Город">
                <Chip selected={!filters.city} onClick={() => setFilter({ city: null })}>Все города</Chip>
                {cities.map((city) => (
                  <Chip key={city} selected={filters.city === city} onClick={() => setFilter({ city })}>{city}</Chip>
                ))}
              </div>
              <div className="chips" aria-label="Сферы">
                {interests.map((interest) => (
                  <Chip
                    key={interest.id}
                    selected={filters.interests.includes(interest.id)}
                    onClick={() => setFilter({
                      interests: filters.interests.includes(interest.id)
                        ? filters.interests.filter((id) => id !== interest.id)
                        : [...filters.interests, interest.id],
                    })}
                  >
                    {interest.emoji} {interest.title}
                  </Chip>
                ))}
              </div>
              <div className="chips" aria-label="Форма обучения">
                <Chip selected={!filters.form} onClick={() => setFilter({ form: null })}>Любая форма</Chip>
                {Object.entries(STUDY_FORMS).map(([form, title]) => (
                  <Chip key={form} selected={filters.form === form} onClick={() => setFilter({ form })}>{title}</Chip>
                ))}
              </div>
              <label className="switch-row">
                <span>Только с бюджетными местами</span>
                <Switch checked={filters.budgetOnly} onChange={() => setFilter({ budgetOnly: !filters.budgetOnly })} />
              </label>
              <label className="switch-row">
                <span>
                  <span>Где в прошлом году проходили с моим баллом</span>
                  <Typography.Body variant="small" className="muted">
                    {myAverage !== null
                      ? `Ваш расчёт — ${formatScore(myAverage)}. Это ориентир, а не прогноз: проходной балл меняется каждый год`
                      : 'Сначала посчитайте средний балл на вкладке «Балл»'}
                  </Typography.Body>
                </span>
                <Switch
                  checked={scoreFilterOn}
                  disabled={myAverage === null}
                  onChange={() => setFilter({ withinMyScore: !filters.withinMyScore })}
                />
              </label>
              {myAverage === null && onOpenTab && (
                <button type="button" className="link-button" onClick={() => onOpenTab('grades')}>Посчитать средний балл</button>
              )}
            </div>
          )}

          {scoreFilterOn && (
            <Typography.Body variant="small" className="muted hint">
              Показаны программы, где прошлогодний проходной балл не выше вашего расчёта. Программы, по которым колледж не опубликовал балл, скрыты — их можно посмотреть без этого фильтра.
            </Typography.Body>
          )}

          {list.some((college) => college.isDemo) && (
            <Typography.Body variant="small" className="muted hint">
              <DemoTag /> Колледжи и баллы вымышленные — для демонстрации. Реальные данные региона добавляются в справочник.
            </Typography.Body>
          )}

          <SectionTitle after={colleges.status === 'loading' && colleges.data ? <Tag>обновляем…</Tag> : null}>
            {colleges.data ? `Найдено: ${list.length}` : 'Колледжи'}
          </SectionTitle>

          {!colleges.data && colleges.status === 'loading' && <LoadingState text="Ищем колледжи…" />}
          {colleges.status === 'error' && <ErrorState error={colleges.error} onRetry={colleges.reload} />}
          {colleges.data && list.length === 0 && scoreFilterOn && (colleges.data.length > 0) && (
            <EmptyState
              title="С вашим баллом совпадений нет"
              text="В прошлом году проходные баллы по этой подборке были выше вашего расчёта или колледжи их не опубликовали. Баллы меняются каждый год — посмотрите все программы и подтяните оценки, пока это возможно"
              action={<Button size="medium" variant="secondary" onClick={() => setFilter({ withinMyScore: false })}>Показать все программы</Button>}
            />
          )}
          {colleges.data && list.length === 0 && cities.length > 0 && !(scoreFilterOn && colleges.data.length > 0) && (
            <EmptyState
              title="По этим фильтрам ничего не нашлось"
              text="Попробуйте выбрать другой город или убрать часть фильтров"
              action={<Button size="medium" variant="secondary" onClick={resetFilters}>Сбросить фильтры</Button>}
            />
          )}
          {list.length > 0 && (
            <CellList mode="island" filled>
              {list.map((college) => {
                const score = minScore(college.programs);
                const favoriteCount = college.programs.filter((program) => favoriteIds.has(program.id)).length;
                return (
                  <CellSimple
                    key={college.id}
                    showChevron
                    onClick={() => setOpenCollegeId(college.id)}
                    title={college.name}
                    subtitle={[
                      college.city,
                      `${college.programs.length} ${plural(college.programs.length, ['программа', 'программы', 'программ'])}`,
                      score !== null ? `балл от ${formatScore(score)}` : 'баллы не указаны',
                    ].join(' · ')}
                    after={favoriteCount > 0 ? <Tag tone="accent">{`★ ${favoriteCount}`}</Tag> : null}
                  />
                );
              })}
            </CellList>
          )}
        </>
      )}

      {toast}
    </div>
  );
}
