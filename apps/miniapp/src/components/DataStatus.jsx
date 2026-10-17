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

/**
 * Статус данных программы: подтверждено или нет, дата проверки, что колледж не опубликовал
 * и что семье уточнить в приёмной комиссии. Логика и тексты — общие с ботом (@posle9/core).
 */
export function DataStatus({ program, college }) {
  const info = programDataStatus({ ...program, college }, { today: today() });
  const { title, lines, askAdmission } = dataStatusExplanation(info);
  // Не опубликован только прошлогодний балл — так у большинства колледжей, плашка спокойнее
  const tone = info.minor ? 'info' : TONES[info.status] ?? 'warning';
  return (
    <StatusPlate
      tone={tone}
      title={title}
      lines={lines}
      url={program.sourceUrl}
      linkText={askAdmission ? 'Приёмная комиссия и источник' : 'Источник'}
    />
  );
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
