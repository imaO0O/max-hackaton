import { useState } from 'react';
import { Button, Typography } from '@maxhub/max-ui';

import { api } from '../lib/api.js';
import { useAsync } from '../lib/use-async.js';
import { QuizFlow } from './QuizFlow.jsx';
import { Card } from './ui.jsx';

/** Подпись по фазе, которую определяет сервер: «до» (подросток по ссылке) или «после» — со сравнением, если «до» было. */
function captionFor(status) {
  if (status?.phase === 'before') {
    return {
      title: '🧠 3 вопроса о правилах',
      text: 'Ответьте сейчас, а потом ещё раз, когда разберётесь с планом, — так видно, помог ли он.',
    };
  }
  if (status?.before) {
    return {
      title: '🧠 Проверьте себя: 3 вопроса о правилах',
      text: `Сравним с вашими ответами до плана (${status.before.score} из ${status.before.total}) — так видно, помог ли он.`,
    };
  }
  return { title: '🧠 Проверьте себя: 3 вопроса о правилах', text: 'Что запомнилось из плана о сроках и правилах — с разбором ответов.' };
}

/** Карточка «Проверьте себя» на экране плана и плана семьи. */
export function QuizCard() {
  const status = useAsync(() => api.quizStatus().catch(() => null), []);
  const [open, setOpen] = useState(false);
  const [beforeSaved, setBeforeSaved] = useState(false);
  const caption = captionFor(status.data);

  return (
    <Card>
      {beforeSaved && (
        <Typography.Body variant="small">Спасибо! Посмотрите план и ответьте ещё раз — тогда сравним, что изменилось.</Typography.Body>
      )}
      {!beforeSaved && open && <QuizFlow onBeforeDone={() => setBeforeSaved(true)} />}
      {!beforeSaved && !open && (
        <>
          <Typography.Body variant="medium-strong">{caption.title}</Typography.Body>
          <Typography.Body variant="small" className="muted">{caption.text}</Typography.Body>
          <Button size="medium" variant="secondary" disabled={!status.data && status.status === 'loading'} onClick={() => setOpen(true)}>Ответить</Button>
        </>
      )}
    </Card>
  );
}
