import { useState } from 'react';
import { Button, Typography } from '@maxhub/max-ui';
import { QUIZ_QUESTIONS } from '@posle9/core';

import { api } from '../lib/api.js';

/**
 * Три вопроса о правилах. Ответы проверяет сервер: он же решает, «до» это или «после».
 * После «до» правильные ответы не показываем — иначе «после» измеряло бы подсказку, а не план.
 */
export function QuizFlow({ onBeforeDone }) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const submit = async (finalAnswers) => {
    setSaving(true);
    setError(null);
    try {
      const saved = await api.submitQuiz(finalAnswers);
      if (saved.phase === 'before') onBeforeDone?.(saved);
      else setResult(saved);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSaving(false);
    }
  };

  const choose = (optionIndex) => {
    const question = QUIZ_QUESTIONS[index];
    const next = { ...answers, [question.id]: optionIndex };
    setAnswers(next);
    if (index + 1 < QUIZ_QUESTIONS.length) setIndex(index + 1);
    else submit(next);
  };

  if (result) {
    return (
      <div className="quiz">
        <Typography.Body variant="medium-strong">
          {`Ваш результат: ${result.score} из ${result.total}${result.before ? ` (до плана — ${result.before.score} из ${result.before.total})` : ''}`}
        </Typography.Body>
        {QUIZ_QUESTIONS.map((question) => (
          <Typography.Body key={question.id} variant="small">
            {`${result.answers[question.id] ? '✅' : '❌'} ${question.explanation}`}
          </Typography.Body>
        ))}
      </div>
    );
  }

  const question = QUIZ_QUESTIONS[index];
  return (
    <div className="quiz">
      <Typography.Label variant="small" className="muted">{`Вопрос ${index + 1} из ${QUIZ_QUESTIONS.length}`}</Typography.Label>
      <Typography.Body variant="medium-strong">{question.text}</Typography.Body>
      <div className="quiz__options">
        {question.options.map((option, optionIndex) => (
          <Button key={option} size="medium" variant="secondary" stretched disabled={saving} onClick={() => choose(optionIndex)}>
            {option}
          </Button>
        ))}
      </div>
      {error && (
        <Typography.Body variant="small" className="warning-text">
          {`${error} `}
          <button type="button" className="link-button" onClick={() => submit(answers)}>Повторить</button>
        </Typography.Body>
      )}
    </div>
  );
}
