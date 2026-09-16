import { Typography } from '@maxhub/max-ui';

import { ErrorState, LoadingState } from '../components/states.jsx';
import { Card, ScreenHeader, SourceNote, Tag } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useAsync } from '../lib/use-async.js';

export function NextScreen() {
  const content = useAsync(() => api.content(), []);

  if (!content.data && content.status === 'loading') return <LoadingState />;
  if (!content.data) return <ErrorState error={content.error} onRetry={content.reload} />;

  return (
    <div className="page">
      <ScreenHeader
        title="Что дальше"
        subtitle="Как из 11 класса и из колледжа поступают в вуз — чтобы выбор после 9 класса не закрыл дорогу"
      />

      <div className="stack">
        {content.data.nextSteps.map((section) => (
          <Card key={section.id}>
            <div className="path-card__head">
              <Typography.Title variant="medium-strong">{section.title}</Typography.Title>
            </div>
            {section.badge && <Tag tone="warning">{section.badge}</Tag>}
            <ul className="list">
              {section.points.map((point) => <li key={point}>{point}</li>)}
            </ul>
            <div className="stack stack--tight">
              {section.sources.map((source) => (
                <SourceNote key={source.url} title={source.title} url={source.url} checkedAt={source.checkedAt} />
              ))}
            </div>
          </Card>
        ))}
      </div>

      <Typography.Body variant="small" className="muted disclaimer">{content.data.disclaimer}</Typography.Body>
    </div>
  );
}
