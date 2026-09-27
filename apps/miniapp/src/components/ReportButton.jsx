import { useState } from 'react';
import { Typography } from '@maxhub/max-ui';
import { REPORT_REASONS, REPORT_THANKS } from '@posle9/core';

import { api } from '../lib/api.js';
import { haptic } from '../lib/max-bridge.js';
import { Chip } from './ui.jsx';

/**
 * «Сообщить о неточности» у программы колледжа или пункта плана: причина из списка, без свободного текста.
 * Результат показывается на месте — кнопка работает и в «Моём плане», и в плане по ссылке.
 */
export function ReportButton({ targetType, targetId }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState(null);

  const send = async (reason) => {
    setStatus('sending');
    try {
      const result = await api.report({ targetType, targetId, reason });
      haptic('success');
      setMessage(result.created ? REPORT_THANKS : 'Вы уже сообщали об этом — спасибо, команда проекта проверит.');
      setStatus('sent');
    } catch (error) {
      haptic('error');
      setMessage(error.message);
      setStatus('error');
    }
  };

  if (status === 'sent') {
    return <Typography.Body variant="small" className="muted" role="status">{message}</Typography.Body>;
  }
  if (!open) {
    return <button type="button" className="link-button report__open" onClick={() => setOpen(true)}>Сообщить о неточности</button>;
  }
  return (
    <div className="report">
      <Typography.Body variant="small">Что не так? Команда проекта сверит факт с источником.</Typography.Body>
      <div className="chips">
        {REPORT_REASONS[targetType].map((reason) => (
          <Chip key={reason.id} disabled={status === 'sending'} onClick={() => send(reason.id)}>{reason.title}</Chip>
        ))}
      </div>
      {status === 'error' && <Typography.Body variant="small" className="warning-text">{message}</Typography.Body>}
      <button type="button" className="link-button" onClick={() => { setOpen(false); setStatus('idle'); }}>Отмена</button>
    </div>
  );
}
