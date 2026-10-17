import { useState } from 'react';
import { Button, Typography } from '@maxhub/max-ui';

import { QuizFlow } from './QuizFlow.jsx';
import { Card } from './ui.jsx';

/** Карточка «Проверьте себя» на экране плана: три вопроса, сравнение с ответами до плана. */
export function QuizCard() {
  const [open, setOpen] = useState(false);
  const [beforeSaved, setBeforeSaved] = useState(false);

  return (
    <Card>
      {beforeSaved && (
        <Typography.Body variant="small">Спасибо! Посмотрите план и ответьте ещё раз — тогда сравним, что изменилось.</Typography.Body>
      )}
      {!beforeSaved && open && <QuizFlow onBeforeDone={() => setBeforeSaved(true)} />}
      {!beforeSaved && !open && (
        <>
          <Typography.Body variant="medium-strong">🧠 Проверьте себя: 3 вопроса о правилах</Typography.Body>
          <Typography.Body variant="small" className="muted">Сравним с ответами до плана — так видно, помог ли он.</Typography.Body>
          <Button size="medium" variant="secondary" onClick={() => setOpen(true)}>Ответить</Button>
        </>
      )}
    </Card>
  );
}
