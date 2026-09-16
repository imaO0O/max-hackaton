import { useCallback, useEffect, useRef, useState } from 'react';
import { Typography } from '@maxhub/max-ui';

import { openExternalLink } from '../lib/max-bridge.js';
import { formatShortDate } from '../lib/format.js';

export function ScreenHeader({ title, subtitle, after }) {
  return (
    <header className="screen-header">
      <div className="screen-header__text">
        <Typography.Headline variant="medium" className="screen-header__title">{title}</Typography.Headline>
        {subtitle && <Typography.Body variant="small" className="muted">{subtitle}</Typography.Body>}
      </div>
      {after}
    </header>
  );
}

export function Card({ children, className = '', highlighted = false, ...props }) {
  return (
    <section className={`card ${highlighted ? 'card--highlighted' : ''} ${className}`} {...props}>
      {children}
    </section>
  );
}

export function Tag({ children, tone = 'neutral' }) {
  return <span className={`tag tag--${tone}`}>{children}</span>;
}

export function DemoTag() {
  return <Tag tone="warning">демо-данные</Tag>;
}

/** Источник и дата проверки факта. Без даты проверки показывается «не проверено». */
export function SourceNote({ title, url, checkedAt, isDemo }) {
  return (
    <div className="source-note">
      {isDemo && <DemoTag />}
      {url ? (
        <button type="button" className="link-button" onClick={() => openExternalLink(url)}>
          {title || 'Источник'} ↗
        </button>
      ) : (
        <span className="muted">{title || 'Источник не указан'}</span>
      )}
      <span className={checkedAt ? 'muted' : 'warning-text'}>
        {checkedAt ? `проверено ${formatShortDate(checkedAt)}` : 'не проверено'}
      </span>
    </div>
  );
}

export function Chip({ selected, onClick, children, disabled }) {
  return (
    <button
      type="button"
      className={`chip ${selected ? 'chip--selected' : ''}`}
      aria-pressed={selected}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function Segmented({ options, value, onChange, ariaLabel }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className={`segmented__item ${value === option.value ? 'segmented__item--active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function SectionTitle({ children, after }) {
  return (
    <div className="section-title">
      <Typography.Label variant="medium-strong" className="section-title__text">{children}</Typography.Label>
      {after}
    </div>
  );
}

/** Всплывающее сообщение о результате действия. */
export function useToast() {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);

  const show = useCallback((text, tone = 'default') => {
    clearTimeout(timer.current);
    setToast({ text, tone, id: Date.now() });
    timer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  const node = toast ? (
    <div key={toast.id} className={`toast toast--${toast.tone}`} role="status" aria-live="polite">{toast.text}</div>
  ) : null;

  return [node, show];
}
