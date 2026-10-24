import { useState } from 'react';
import { Button, Typography } from '@maxhub/max-ui';

import { QuizFlow } from '../components/QuizFlow.jsx';
import { Card, ScreenHeader } from '../components/ui.jsx';

/** Перед онбордингом новой семьи — три вопроса о правилах «до» (можно пропустить). */
export function QuizGateScreen({ onDone, onSkip }) {
  const [started, setStarted] = useState(false);
  return (
    <div className="page">
      <ScreenHeader
        title="После 9-го"
        subtitle="План на год для семьи девятиклассника: сроки ОГЭ и поступления, колледжи по интересам и напоминания в чате"
      />
      <Card>
        {started ? <QuizFlow onBeforeDone={onDone} /> : (
          <>
            <Typography.Body variant="medium-strong">Сначала — три коротких вопроса о правилах, полминуты</Typography.Body>
            <Typography.Body variant="small">
              Ответы не оцениваются. Когда план будет готов, можно ответить ещё раз и увидеть, что изменилось.
            </Typography.Body>
            <Button size="large" stretched onClick={() => setStarted(true)}>Ответить на 3 вопроса</Button>
            <Button size="medium" variant="secondary" stretched onClick={onSkip}>Пропустить</Button>
          </>
        )}
      </Card>
    </div>
  );
}
