import { Typography } from '@maxhub/max-ui';
import {
  DATA_STATUS, dataStatusExplanation, localDateString, programDataStatus,
} from '@posle9/core';

import { openExternalLink } from '../lib/max-bridge.js';

const TONES = {
  [DATA_STATUS.CONFIRMED]: 'ok',
  [DATA_STATUS.DEMO]: 'neutral',
};

/**
 * Статус данных программы: подтверждено или нет, дата проверки, что колледж не опубликовал
 * и что семье уточнить в приёмной комиссии. Логика и тексты — общие с ботом (@posle9/core).
 */
export function DataStatus({ program, college }) {
  const info = programDataStatus({ ...program, college }, { today: localDateString(new Date(), 3) });
  const { title, lines, askAdmission } = dataStatusExplanation(info);
  const tone = TONES[info.status] ?? 'warning';
  return (
    <div className={`data-status data-status--${tone}`}>
      <Typography.Label variant="medium-strong">{title}</Typography.Label>
      {lines.map((line) => <Typography.Body key={line} variant="small">{line}</Typography.Body>)}
      {program.sourceUrl && (
        <button type="button" className="link-button" onClick={() => openExternalLink(program.sourceUrl)}>
          {askAdmission ? 'Приёмная комиссия и источник ↗' : 'Источник ↗'}
        </button>
      )}
    </div>
  );
}
