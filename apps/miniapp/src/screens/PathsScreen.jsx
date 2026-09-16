import { Button, Typography } from '@maxhub/max-ui';

import { ErrorState, LoadingState } from '../components/states.jsx';
import { Card, ScreenHeader, Tag } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useAsync } from '../lib/use-async.js';

function List({ items, marker = '•' }) {
  return (
    <ul className="list">
      {items.map((item) => (
        <li key={item}><span aria-hidden="true">{marker}</span> {item}</li>
      ))}
    </ul>
  );
}

export function PathsScreen({ profile, region, onOpenTab }) {
  const content = useAsync(() => api.content(), []);

  if (!content.data && content.status === 'loading') return <LoadingState />;
  if (!content.data) return <ErrorState error={content.error} onRetry={content.reload} />;

  const { paths, disclaimer } = content.data;

  return (
    <div className="page">
      <ScreenHeader
        title="Два пути после 9 класса"
        subtitle={profile.path === 'undecided'
          ? 'Сравните и обсудите с подростком — выбирать не обязательно сегодня'
          : 'Сравнение, чтобы спокойно обсудить решение с подростком'}
      />

      {region?.twoOgeExperiment && (
        <Card className="notice">
          <Typography.Body variant="small">
            В вашем регионе идёт эксперимент: аттестат можно получить, сдав ОГЭ только по русскому языку и математике.
            С таким аттестатом поступают в колледж на специальности из перечня региона. Для 10 класса нужны четыре ОГЭ —
            если сомневаетесь, сдавайте четыре.
          </Typography.Body>
        </Card>
      )}

      <div className="paths">
        {paths.map((path) => (
          <Card key={path.id} highlighted={profile.path === path.id} className="path-card">
            <div className="path-card__head">
              <Typography.Title variant="large-strong">{path.title}</Typography.Title>
              {profile.path === path.id && <Tag tone="accent">ваш выбор</Tag>}
            </div>
            <Typography.Body variant="small" className="muted">{path.subtitle}</Typography.Body>

            <dl className="facts">
              <dt>Сколько учиться</dt>
              <dd>{path.duration}</dd>
              <dt>Экзамены</dt>
              <dd><List items={path.exams} /></dd>
              <dt>Как поступить</dt>
              <dd>{path.admission}</dd>
              <dt>Плюсы</dt>
              <dd><List items={path.pros} marker="＋" /></dd>
              <dt>Минусы</dt>
              <dd><List items={path.cons} marker="−" /></dd>
              <dt>Что дальше</dt>
              <dd>{path.next}</dd>
            </dl>
          </Card>
        ))}
      </div>

      <div className="actions">
        <Button size="medium" variant="secondary" stretched onClick={() => onOpenTab('grades')}>
          Посчитать средний балл
        </Button>
        <Button size="medium" variant="secondary" stretched onClick={() => onOpenTab('colleges')}>
          Посмотреть колледжи
        </Button>
      </div>

      <Typography.Body variant="small" className="muted disclaimer">{disclaimer}</Typography.Body>
    </div>
  );
}
