import { Typography } from '@maxhub/max-ui';
import {
  DATA_STATUS, dataStatusExplanation, keyDateDataStatus, localDateString, programDataStatus,
} from '@posle9/core';

import { openExternalLink } from '../lib/max-bridge.js';

const TONES = {
  [DATA_STATUS.CONFIRMED]: 'ok',
  [DATA_STATUS.DEMO]: 'neutral',
  [DATA_STATUS.ADVICE]: 'neutral',
  [DATA_STATUS.APPROXIMATE]: 'info',
};

const today = () => localDateString(new Date(), 3);

function StatusPlate({
  tone, title, lines, url, linkText,
}) {
  return (
    <div className={`data-status data-status--${tone}`}>
      <Typography.Label variant="medium-strong">{title}</Typography.Label>
      {lines.map((line) => <Typography.Body key={line} variant="small">{line}</Typography.Body>)}
      {url && <button type="button" className="link-button" onClick={() => openExternalLink(url)}>{`${linkText} ↗`}</button>}
    </div>
  );
}

function explain(program, college) {
  const info = programDataStatus({ ...program, college }, { today: today() });
  // Не опубликован только прошлогодний балл — так у большинства колледжей, плашка спокойнее
  return { ...dataStatusExplanation(info), tone: info.minor ? 'info' : TONES[info.status] ?? 'warning' };
}

/**
 * Статус данных программы: подтверждено или нет, дата проверки, что колледж не опубликовал
 * и что семье уточнить в приёмной комиссии. Логика и тексты — общие с ботом (@posle9/core).
 * compact — только заголовок и ссылка: пояснение уже показано один раз для всего колледжа.
 */
export function DataStatus({ program, college, compact = false }) {
  const { title, lines, askAdmission, tone } = explain(program, college);
  return (
    <StatusPlate
      tone={tone}
      title={title}
      lines={compact ? [] : lines}
      url={program.sourceUrl}
      linkText={askAdmission ? 'Приёмная комиссия и источник' : 'Источник'}
    />
  );
}

/**
 * Одно и то же пояснение у всех программ колледжа (например, колледж не публикует баллы) — показываем один раз,
 * а у программ остаются заголовок с датой проверки и ссылка. null — если пояснения разные или данные подтверждены.
 */
export function sharedCollegeStatus(programs, college) {
  if (programs.length < 2) return null;
  const explanations = programs.map((program) => explain(program, college));
  const [first] = explanations;
  const same = explanations.every((item) => item.tone === first.tone && item.lines.join('\n') === first.lines.join('\n'));
  return same && first.askAdmission ? first : null;
}

/** Общее пояснение о данных для всех программ колледжа. */
export function CollegeDataStatus({ status }) {
  return <StatusPlate tone={status.tone} title="Для всех программ колледжа" lines={status.lines} />;
}

/** Статус даты плана: подтверждена, ориентировочная, давно не проверялась — и где уточнить. */
export function KeyDateStatus({ item, regionIsDemo }) {
  const { status, title, lines } = keyDateDataStatus(item, { today: today(), regionIsDemo });
  return (
    <StatusPlate
      tone={TONES[status] ?? 'warning'}
      title={title}
      lines={lines.filter((line) => !line.startsWith('Источник'))}
      url={status === DATA_STATUS.DEMO ? null : item.sourceUrl}
      linkText={item.sourceTitle ?? 'Источник'}
    />
  );
}
