import { useState } from 'react';
import { Button, Typography } from '@maxhub/max-ui';

import { api } from '../lib/api.js';
import { haptic } from '../lib/max-bridge.js';
import { useAsync } from '../lib/use-async.js';
import { Card } from './ui.jsx';

const formatDay = (iso) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' });

/**
 * Шаг на эту неделю: одно конкретное действие, пока ближайшие сроки плана далеко.
 * Варианты и правила те же, что в чате (/api/week-step); через 5 дней бот спросит «Получилось?».
 */
export function WeekStepCard() {
  const state = useAsync(() => api.weekStep().catch(() => null), []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [note, setNote] = useState(null);
  const [choosing, setChoosing] = useState(false);

  const data = state.data;
  if (!data?.options.length) return null;
  const { current, options } = data;

  const run = async (action, successNote) => {
    setSaving(true);
    setError(null);
    try {
      state.setData(await action());
      setNote(successNote);
      setChoosing(false);
      haptic('success');
    } catch (actionError) {
      setError(actionError.message);
      haptic('error');
    } finally {
      setSaving(false);
    }
  };

  if (current?.status === 'chosen' && !choosing) {
    const askedAlready = Date.now() >= Date.parse(current.checkAt);
    return (
      <Card className="week-step">
        <Typography.Label variant="medium" className="muted">Шаг на эту неделю</Typography.Label>
        <Typography.Body variant="medium-strong">{current.title}</Typography.Body>
        <Typography.Body variant="small">{current.hint}</Typography.Body>
        <Typography.Body variant="small" className="muted">
          {askedAlready ? 'Получилось?' : `${formatDay(current.checkAt)} спросим в чате с ботом, получилось ли.`}
        </Typography.Body>
        <div className="button-row">
          <Button size="medium" loading={saving} onClick={() => run(() => api.answerWeekStep(current.id, 'done'), 'Отлично, записали! Выберите шаг на следующую неделю.')}>
            ✅ Сделано
          </Button>
          {askedAlready ? (
            <Button size="medium" variant="secondary" disabled={saving} onClick={() => run(() => api.answerWeekStep(current.id, 'not_yet'), 'Ничего страшного — такие дела часто занимают больше недели. Выберите шаг на эту неделю — тот же или другой.')}>
              Ещё нет
            </Button>
          ) : (
            <Button size="medium" variant="secondary" disabled={saving} onClick={() => setChoosing(true)}>Выбрать другой</Button>
          )}
        </div>
        {error && <Typography.Body variant="small" className="warning-text">{error}</Typography.Body>}
      </Card>
    );
  }

  return (
    <Card className="week-step">
      {note && <Typography.Body variant="small">{note}</Typography.Body>}
      <Typography.Body variant="medium-strong">Какой шаг сделаете на этой неделе?</Typography.Body>
      <Typography.Body variant="small" className="muted">Выберите один — через 5 дней спросим в чате с ботом, получилось ли.</Typography.Body>
      <div className="week-step__options">
        {options.map((option) => (
          <Button
            key={option.id}
            size="medium"
            variant="secondary"
            stretched
            className="button--wrap"
            innerClassNames={{ content: 'button--wrap__content' }}
            disabled={saving}
            onClick={() => run(() => api.chooseWeekStep(option.id), null)}
          >
            {option.button}
          </Button>
        ))}
      </div>
      {error && <Typography.Body variant="small" className="warning-text">{error}</Typography.Body>}
    </Card>
  );
}
