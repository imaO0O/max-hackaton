import { useState } from 'react';
import { Typography } from '@maxhub/max-ui';

import { daysText, formatDateRange, monthKey, monthTitle } from '../lib/format.js';
import { SourceNote, Tag } from './ui.jsx';

const SCOPE_TAGS = {
  federal: { text: 'для всех регионов', tone: 'neutral' },
  regional: { text: 'регион', tone: 'accent' },
  recommendation: { text: 'совет', tone: 'soft' },
};

function statusText(item) {
  if (item.done) return 'выполнено';
  if (item.status === 'past') return 'прошло';
  if (item.status === 'current') return 'идёт сейчас';
  if (item.daysLeft === 0) return 'сегодня';
  return `через ${daysText(item.daysLeft)}`;
}

/** Шаги чек-листа: с отметками у владельца плана, только чтение — у подростка по ссылке. */
function ChecklistSteps({ item, onToggleStep, pendingSteps }) {
  return (
    <ul className="steps" aria-label={`Шаги: ${item.title}`}>
      {item.steps.map((step) => {
        const key = `${item.id}/${step.id}`;
        return (
          <li key={step.id} className={`steps__item ${step.done ? 'steps__item--done' : ''}`}>
            {onToggleStep ? (
              <button
                type="button"
                className={`checkbox checkbox--small ${step.done ? 'checkbox--checked' : ''}`}
                aria-pressed={step.done}
                aria-label={step.done ? `Снять отметку: ${step.title}` : `Отметить: ${step.title}`}
                disabled={pendingSteps.has(key)}
                onClick={() => onToggleStep(item, step)}
              >
                {step.done ? '✓' : ''}
              </button>
            ) : (
              <span className="steps__mark" aria-hidden="true">{step.done ? '✓' : '•'}</span>
            )}
            <Typography.Body variant="small">{step.title}</Typography.Body>
          </li>
        );
      })}
    </ul>
  );
}

function PlanItem({
  item, highlighted, onToggleDone, pending, regionIsDemo, onToggleStep, pendingSteps,
}) {
  const [expanded, setExpanded] = useState(highlighted);
  const scope = SCOPE_TAGS[item.scope];
  const steps = item.steps ?? [];
  const stepsDone = steps.filter((step) => step.done).length;

  return (
    <li className={`plan-item plan-item--${item.status} ${item.done ? 'plan-item--done' : ''} ${highlighted ? 'plan-item--next' : ''}`}>
      {onToggleDone ? (
        <button
          type="button"
          className={`checkbox ${item.done ? 'checkbox--checked' : ''}`}
          aria-pressed={item.done}
          aria-label={item.done ? `Снять отметку: ${item.title}` : `Отметить выполненным: ${item.title}`}
          disabled={pending}
          onClick={() => onToggleDone(item)}
        >
          {item.done ? '✓' : ''}
        </button>
      ) : (
        <span className="plan-item__dot" aria-hidden="true" />
      )}

      <div className="plan-item__body">
        <button type="button" className="plan-item__summary" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          <Typography.Label variant="small" className="muted">
            {formatDateRange(item.dateStart, item.dateEnd)}
            {item.isApproximate ? ' · ориентировочно' : ''}
          </Typography.Label>
          <Typography.Body variant="medium-strong" className="plan-item__title">{item.title}</Typography.Body>
          <span className="plan-item__meta">
            <Tag tone={item.status === 'current' || highlighted ? 'accent' : 'neutral'}>{statusText(item)}</Tag>
            <Tag tone={scope.tone}>{scope.text}</Tag>
            {steps.length > 0 && <Tag tone={stepsDone === steps.length ? 'soft' : 'neutral'}>{`шаги ${stepsDone} из ${steps.length}`}</Tag>}
          </span>
        </button>

        {expanded && (
          <div className="plan-item__details">
            <Typography.Body variant="small" className="preline">{item.description}</Typography.Body>
            {steps.length > 0 && <ChecklistSteps item={item} onToggleStep={onToggleStep} pendingSteps={pendingSteps} />}
            {item.scope !== 'recommendation' && (
              <SourceNote
                title={item.sourceTitle}
                url={item.sourceUrl}
                checkedAt={item.checkedAt}
                isDemo={item.scope === 'regional' && regionIsDemo}
              />
            )}
          </div>
        )}
      </div>
    </li>
  );
}

/** Пункты плана, сгруппированные по месяцам. Без onToggleDone — режим только для чтения. */
export function PlanTimeline({
  items, nextItemId, onToggleDone, pendingIds = new Set(), regionIsDemo, hidePast, onToggleStep, pendingSteps = new Set(),
}) {
  const visible = hidePast ? items.filter((item) => item.status !== 'past' || item.id === nextItemId) : items;
  const groups = [];
  for (const item of visible) {
    const key = monthKey(item.dateStart);
    if (groups.at(-1)?.key !== key) groups.push({ key, title: monthTitle(item.dateStart), items: [] });
    groups.at(-1).items.push(item);
  }

  return (
    <div className="timeline">
      {groups.map((group) => (
        <section key={group.key} className="timeline__month">
          <Typography.Label variant="medium-strong" className="timeline__month-title">{group.title}</Typography.Label>
          <ul className="timeline__items">
            {group.items.map((item) => (
              <PlanItem
                key={item.id}
                item={item}
                highlighted={item.id === nextItemId}
                onToggleDone={onToggleDone}
                pending={pendingIds.has(item.id)}
                regionIsDemo={regionIsDemo}
                onToggleStep={onToggleStep}
                pendingSteps={pendingSteps}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
