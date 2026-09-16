import { Button, Panel, Spinner, Typography } from '@maxhub/max-ui';

export function LoadingState({ text = 'Загружаем…', fullScreen = false }) {
  const content = (
    <div className="state" role="status" aria-live="polite">
      <Spinner size={28} appearance="themed" />
      <Typography.Body variant="small" className="state__text">{text}</Typography.Body>
    </div>
  );
  return fullScreen ? <Panel centeredX centeredY className="fullscreen">{content}</Panel> : content;
}

export function ErrorState({ error, onRetry, fullScreen = false }) {
  const content = (
    <div className="state" role="alert">
      <div className="state__icon" aria-hidden="true">⚠️</div>
      <Typography.Title variant="small-strong">Не получилось загрузить</Typography.Title>
      <Typography.Body variant="small" className="state__text">
        {error?.message || 'Попробуйте ещё раз'}
      </Typography.Body>
      {onRetry && (
        <Button size="medium" variant="secondary" onClick={onRetry}>Повторить</Button>
      )}
    </div>
  );
  return fullScreen ? <Panel centeredX centeredY className="fullscreen">{content}</Panel> : content;
}

export function EmptyState({ icon = '🔍', title, text, action }) {
  return (
    <div className="state">
      <div className="state__icon" aria-hidden="true">{icon}</div>
      <Typography.Title variant="small-strong">{title}</Typography.Title>
      {text && <Typography.Body variant="small" className="state__text">{text}</Typography.Body>}
      {action}
    </div>
  );
}
