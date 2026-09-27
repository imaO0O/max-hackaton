import { useState } from 'react';
import { Typography } from '@maxhub/max-ui';
import {
  EXAM_ADVICE, EXAM_ADVICE_NOTE, EXAM_QUESTIONS, examChoiceFromPath, experimentListNote, needsProfessionQuestion,
  recommendExams,
} from '@posle9/core';

import {
  Card, Chip, SourceNote, Tag,
} from './ui.jsx';

function Question({ question, value, onChange }) {
  return (
    <div className="exam-advice__question">
      <Typography.Body variant="small">{question.text}</Typography.Body>
      <div className="chips" role="radiogroup" aria-label={question.text}>
        {question.options.map((option) => (
          <Chip key={option.id} selected={value === option.id} onClick={() => onChange(option.id)}>{option.title}</Chip>
        ))}
      </div>
    </div>
  );
}

/**
 * «2 или 4 ОГЭ?»: два вопроса и рекомендация. Логика и тексты — из packages/core, те же, что в чате с ботом (/oge).
 * Первый ответ подсказан путём из опроса. Избранное подсказывает второй: какие из отмеченных программ в перечне.
 */
export function ExamAdvice({
  profile, region, favorites = [], onShowListed,
}) {
  const [choice, setChoice] = useState(() => examChoiceFromPath(profile.path));
  const [profession, setProfession] = useState(null);

  const twoOgeExperiment = region?.twoOgeExperiment ?? false;
  const list = region?.experimentList ?? null;
  const askProfession = needsProfessionQuestion({ regionId: profile.regionId, twoOgeExperiment, choice });
  const answered = !askProfession || profession !== null;
  const result = recommendExams({
    regionId: profile.regionId, twoOgeExperiment, choice, profession: askProfession ? profession : undefined,
  });
  const advice = EXAM_ADVICE[result.reason];

  const regionFavorites = favorites.filter((program) => program.college.regionId === profile.regionId);
  const listedFavorites = regionFavorites.filter((program) => program.inExperimentList);
  const otherFavorites = regionFavorites.filter((program) => !program.inExperimentList);

  return (
    <Card className="exam-advice">
      <Typography.Label variant="medium-strong">Сколько ОГЭ сдавать: 2 или 4?</Typography.Label>

      <Question question={EXAM_QUESTIONS.choice} value={choice} onChange={(next) => { setChoice(next); setProfession(null); }} />

      {askProfession && (
        <>
          <Question question={EXAM_QUESTIONS.profession} value={profession} onChange={setProfession} />
          {listedFavorites.length > 0 && (
            <Typography.Body variant="small" className="muted">
              {`В избранном из перечня: ${listedFavorites.map((program) => program.specialtyTitle).join('; ')}`}
            </Typography.Body>
          )}
          {otherFavorites.length > 0 && (
            <Typography.Body variant="small" className="muted">
              {`В избранном не из перечня: ${otherFavorites.map((program) => program.specialtyTitle).join('; ')}`}
            </Typography.Body>
          )}
        </>
      )}

      {answered && (
        <div className="exam-advice__result" role="status" aria-live="polite">
          <Tag tone={result.exams === 2 ? 'soft' : 'accent'}>{advice.title}</Tag>
          <Typography.Body variant="small">{advice.text}</Typography.Body>
          {list && ['college_listed', 'college_unknown'].includes(result.reason) && (
            <Typography.Body variant="small" className="muted">{experimentListNote(list.year)}</Typography.Body>
          )}
        </div>
      )}

      {list && onShowListed && (
        <button type="button" className="link-button" onClick={onShowListed}>
          {`Программы из перечня ${list.year} года`}
        </button>
      )}

      <Typography.Body variant="small" className="muted">{EXAM_ADVICE_NOTE}</Typography.Body>
      {list && (
        <SourceNote title={`Перечень ${list.year}`} url={list.sourceUrl} checkedAt={list.checkedAt} isDemo={region.isDemo} />
      )}
    </Card>
  );
}
