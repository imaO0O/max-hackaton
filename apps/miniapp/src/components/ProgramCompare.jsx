import { useEffect, useState } from 'react';
import { Button, Switch, Typography } from '@maxhub/max-ui';
import { STUDY_FORMS } from '@posle9/core';

import { formatScore } from '../lib/format.js';
import { showBackButton } from '../lib/max-bridge.js';
import { EmptyState, ErrorState, LoadingState } from './states.jsx';
import { DemoTag, ScreenHeader, SourceNote } from './ui.jsx';

const MIN_PROGRAMS = 2;

const budgetText = (places) => {
  if (places === null || places === undefined) return 'нет данных';
  return places === 0 ? 'нет' : String(places);
};

/**
 * Строки сравнения. text — значение для проверки «одинаково у всех», render — что показать в ячейке.
 */
const ROWS = [
  { id: 'college', label: 'Колледж', text: (program) => `${program.college.name}, ${program.college.city}` },
  { id: 'specialty', label: 'Код', text: (program) => program.specialtyCode },
  { id: 'form', label: 'Форма', text: (program) => STUDY_FORMS[program.form] },
  { id: 'duration', label: 'Срок', text: (program) => program.duration ?? '—' },
  { id: 'budget', label: 'Бюджетных мест', text: (program) => budgetText(program.budgetPlaces) },
  {
    id: 'score',
    label: 'Проходной балл',
    text: (program) => (program.passingScore === null
      ? 'нет данных'
      : `${formatScore(program.passingScore)}${program.scoreYear ? ` (${program.scoreYear})` : ''}`),
  },
  { id: 'entrance', label: 'Испытания, медосмотр', text: (program) => program.entranceTest ?? 'нет' },
  { id: 'dormitory', label: 'Общежитие', text: (program) => (program.college.hasDormitory ? 'есть' : 'нет') },
  {
    id: 'source',
    label: 'Источник',
    text: (program) => `${program.sourceUrl ?? ''}|${program.checkedAt ?? ''}|${program.college.isDemo}`,
    render: (program) => (
      <SourceNote title={program.sourceUrl ? 'Открыть' : null} url={program.sourceUrl} checkedAt={program.checkedAt} isDemo={program.college.isDemo} />
    ),
  },
];

/** Избранные программы рядом: столбец на программу, строки — факты из справочника. */
export function ProgramCompare({ favorites, myAverage, pendingIds, onToggleFavorite, onBack }) {
  const [onlyDifferences, setOnlyDifferences] = useState(false);

  useEffect(() => showBackButton(onBack), [onBack]);

  const programs = favorites.data ?? [];
  const rows = onlyDifferences && programs.length >= MIN_PROGRAMS
    ? ROWS.filter((row) => new Set(programs.map(row.text)).size > 1)
    : ROWS;

  return (
    <div className="page">
      <button type="button" className="back-link" onClick={onBack}>← Колледжи</button>
      <ScreenHeader
        title="Сравнение программ"
        subtitle="Избранные программы рядом. Уберите лишние звёздочкой"
      />

      {!favorites.data && favorites.status === 'loading' && <LoadingState text="Собираем избранное…" />}
      {!favorites.data && favorites.status === 'error' && <ErrorState error={favorites.error} onRetry={favorites.reload} />}

      {favorites.data && programs.length < MIN_PROGRAMS && (
        <EmptyState
          icon="⭐"
          title="Нужно хотя бы две программы"
          text="Отметьте звёздочкой программы в карточках колледжей — они появятся здесь рядом"
          action={<Button size="medium" variant="secondary" onClick={onBack}>К колледжам</Button>}
        />
      )}

      {programs.length >= MIN_PROGRAMS && (
        <>
          {myAverage !== null && (
            <Typography.Body variant="small" className="muted hint">
              {`Ваш текущий расчёт среднего балла: ${formatScore(myAverage)}. Это ориентир, а не прогноз поступления — проходные баллы меняются каждый год.`}
            </Typography.Body>
          )}
          {programs.some((program) => program.college.isDemo) && (
            <Typography.Body variant="small" className="muted hint">
              <DemoTag /> В сравнении есть вымышленные демо-программы.
            </Typography.Body>
          )}

          <label className="switch-row compare-toggle">
            <span>Только различия</span>
            <Switch checked={onlyDifferences} onChange={() => setOnlyDifferences(!onlyDifferences)} />
          </label>

          <div className="compare" role="region" aria-label="Таблица сравнения, прокручивается вбок" tabIndex={0}>
            <table className="compare__table">
              <colgroup>
                <col className="compare__label-col" />
                {programs.map((program) => <col key={program.id} className="compare__program-col" />)}
              </colgroup>
              <thead>
                <tr>
                  <th scope="col" className="compare__label">
                    <span className="visually-hidden">Параметр</span>
                  </th>
                  {programs.map((program) => (
                    <th key={program.id} scope="col" className="compare__head">
                      <div className="compare__head-inner">
                        <span className="compare__head-title">{program.specialtyTitle}</span>
                        <button
                          type="button"
                          className="favorite-button favorite-button--active compare__remove"
                          aria-label={`Убрать из избранного: ${program.specialtyTitle}, ${program.college.name}`}
                          disabled={pendingIds.has(program.id)}
                          onClick={() => onToggleFavorite(program.id)}
                        >
                          ★
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <th scope="row" className="compare__label">{row.label}</th>
                    {programs.map((program) => (
                      <td key={program.id} className="compare__cell">
                        {row.render ? row.render(program) : row.text(program)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {onlyDifferences && rows.length === 0 && (
            <Typography.Body variant="small" className="muted hint">Программы совпадают по всем параметрам.</Typography.Body>
          )}
        </>
      )}
    </div>
  );
}
