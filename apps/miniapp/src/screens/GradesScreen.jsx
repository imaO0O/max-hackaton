import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Switch, Typography } from '@maxhub/max-ui';
import {
  DEFAULT_SUBJECTS, ELECTIVE_EXAM_SUBJECT_IDS, MATH_COURSES, MAX_ELECTIVE_EXAMS, calculateAttestat,
} from '@posle9/core';

import { Card, ScreenHeader, SectionTitle, Tag, useToast } from '../components/ui.jsx';
import { formatScore } from '../lib/format.js';
import { hapticSelection } from '../lib/max-bridge.js';
import { loadLocal, removeLocal, saveLocal } from '../lib/storage.js';

const STORAGE_KEY = 'grades:v1';
export const AVERAGE_STORAGE_KEY = 'grades:average';

const emptyCourses = () => Object.fromEntries(MATH_COURSES.map((course) => [course.id, null]));

function initialSubjects() {
  return DEFAULT_SUBJECTS.map((subject) => ({
    id: subject.id,
    title: subject.title,
    annual: null,
    exam: null,
    required: subject.exam === 'required',
    electiveExam: false,
    finishedEarlier: Boolean(subject.finishedEarlier),
    custom: false,
    // По ФООП математика в 7–9 классах — три курса. Отметки по курсам можно выключить в настройках предмета
    courses: subject.id === 'math' ? emptyCourses() : null,
  }));
}

function GradePicker({ value, onChange, label, ariaLabel = label }) {
  return (
    <div className="grade-picker" role="group" aria-label={ariaLabel}>
      <span className="grade-picker__label">{label}</span>
      {[2, 3, 4, 5].map((grade) => (
        <button
          key={grade}
          type="button"
          className={`grade-picker__item ${value === grade ? 'grade-picker__item--active' : ''}`}
          aria-pressed={value === grade}
          onClick={() => {
            hapticSelection();
            onChange(value === grade ? null : grade);
          }}
        >
          {grade}
        </button>
      ))}
    </div>
  );
}

export function GradesScreen({ region }) {
  const [subjects, setSubjects] = useState(() => loadLocal(STORAGE_KEY, null) ?? initialSubjects());
  const [expandedId, setExpandedId] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  const [toast, showToast] = useToast();
  const twoOge = Boolean(region?.twoOgeExperiment);

  const electiveCount = subjects.filter((subject) => subject.electiveExam).length;
  const takesExam = (subject) => subject.required || subject.electiveExam;

  const result = useMemo(() => calculateAttestat(subjects.map((subject) => ({
    id: subject.id,
    title: subject.title,
    annual: subject.annual,
    courses: subject.courses ? MATH_COURSES.map((course) => subject.courses[course.id]) : undefined,
    exam: subject.exam,
    takesExam: takesExam(subject),
    finishedEarlier: subject.finishedEarlier,
  }))), [subjects]);

  useEffect(() => {
    saveLocal(STORAGE_KEY, subjects);
    saveLocal(AVERAGE_STORAGE_KEY, result.average);
  }, [subjects, result.average]);

  const updateSubject = (id, patch) => {
    setSubjects((previous) => previous.map((subject) => (subject.id === id ? { ...subject, ...patch } : subject)));
  };

  const updateCourse = (id, courseId, grade) => {
    setSubjects((previous) => previous.map((subject) => (
      subject.id === id ? { ...subject, courses: { ...subject.courses, [courseId]: grade } } : subject
    )));
  };

  const toggleElective = (subject) => {
    if (!subject.electiveExam && electiveCount >= MAX_ELECTIVE_EXAMS) {
      showToast(`На ОГЭ выбирают не больше ${MAX_ELECTIVE_EXAMS} предметов`, 'error');
      return;
    }
    updateSubject(subject.id, { electiveExam: !subject.electiveExam, exam: subject.electiveExam ? null : subject.exam });
  };

  const addSubject = () => {
    const title = newTitle.trim();
    if (!title) return;
    if (subjects.some((subject) => subject.title.toLowerCase() === title.toLowerCase())) {
      showToast('Такой предмет уже есть', 'error');
      return;
    }
    setSubjects((previous) => [...previous, {
      id: `custom-${Date.now()}`, title, annual: null, exam: null,
      required: false, electiveExam: false, finishedEarlier: false, custom: true,
    }]);
    setNewTitle('');
  };

  const reset = () => {
    removeLocal(STORAGE_KEY);
    setSubjects(initialSubjects());
    setExpandedId(null);
    showToast('Оценки очищены');
  };

  const showPotential = result.potentialAverage !== null && result.potentialAverage > result.average;

  return (
    <div className="page">
      <ScreenHeader
        title="Средний балл аттестата"
        subtitle="По нему идёт конкурс в колледж. Оценки хранятся только на этом устройстве"
      />

      <Card className="score-card" aria-live="polite">
        <Typography.Label variant="medium" className="muted">Средний балл сейчас</Typography.Label>
        <div className="score-card__value">{formatScore(result.average)}</div>
        <Typography.Body variant="small" className="muted">
          {result.gradedCount
            ? `Учтено предметов: ${result.gradedCount} из ${result.totalCount}`
            : 'Отметьте годовые оценки ниже — балл пересчитается сразу'}
        </Typography.Body>

        {showPotential && (
          <div className="score-card__potential">
            Если подтянуть на балл предметы, которые ещё идут, — до <b>{formatScore(result.potentialAverage)}</b>
          </div>
        )}

        {result.influenceable.length > 0 && (
          <ul className="list list--compact">
            {result.influenceable.slice(0, 5).map((row) => (
              <li key={row.id}>
                {row.title}: {row.current} → {row.current + 1}
                <span className="muted"> (+{formatScore(row.deltaIfPlusOne)})</span>
              </li>
            ))}
          </ul>
        )}

        {result.warnings.includes('unsatisfactory') && (
          <div className="inline-error">С итоговой «2» аттестат не выдаётся — уточните в школе, как исправить оценку.</div>
        )}
        {result.awaitingExamCount > 0 && (
          <Typography.Body variant="small" className="muted">
            {`Без оценки за ОГЭ пока учтена только годовая: ${result.rows.filter((row) => row.awaitingExam).map((row) => row.title).join(', ')}.`}
          </Typography.Body>
        )}
      </Card>

      <Typography.Body variant="small" className="muted hint">
        Итоговая по предметам ОГЭ — среднее годовой и экзаменационной с округлением.
        {twoOge
          ? ` В регионе эксперимент: для колледжа можно сдать только русский язык и математику, для 10 класса нужны ещё ${MAX_ELECTIVE_EXAMS} предмета по выбору — отметьте их, если подросток сдаёт.`
          : ` Отметьте до ${MAX_ELECTIVE_EXAMS} предметов по выбору.`}
        {' '}Сверьте список предметов с аттестатом у классного руководителя.
      </Typography.Body>

      <SectionTitle after={<button type="button" className="link-button" onClick={reset}>Очистить</button>}>
        Предметы
      </SectionTitle>

      <div className="subjects">
        {subjects.map((subject) => {
          const exam = takesExam(subject);
          const canBeElective = ELECTIVE_EXAM_SUBJECT_IDS.includes(subject.id);
          const expanded = expandedId === subject.id;
          return (
            <Card key={subject.id} className="subject">
              <div className="subject__head">
                <Typography.Body variant="medium-strong" className="subject__title">{subject.title}</Typography.Body>
                <div className="subject__tags">
                  {exam && <Tag tone="accent">ОГЭ</Tag>}
                  {subject.finishedEarlier && <Tag>оценка уже итоговая</Tag>}
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-expanded={expanded}
                  aria-label={`Настройки предмета ${subject.title}`}
                  onClick={() => setExpandedId(expanded ? null : subject.id)}
                >
                  ⋯
                </button>
              </div>

              {subject.courses ? MATH_COURSES.map((course) => (
                <GradePicker
                  key={course.id}
                  label={course.shortTitle}
                  ariaLabel={`Годовая: ${course.title}`}
                  value={subject.courses[course.id]}
                  onChange={(grade) => updateCourse(subject.id, course.id, grade)}
                />
              )) : (
                <GradePicker
                  label={subject.finishedEarlier ? 'Итоговая' : 'Годовая'}
                  value={subject.annual}
                  onChange={(annual) => updateSubject(subject.id, { annual })}
                />
              )}
              {exam && (
                <GradePicker
                  label="За ОГЭ"
                  value={subject.exam}
                  onChange={(value) => updateSubject(subject.id, { exam: value })}
                />
              )}

              {expanded && (
                <div className="subject__settings">
                  <label className="switch-row">
                    <span>Предмет закончился в прошлые годы — оценка уже итоговая</span>
                    <Switch
                      checked={subject.finishedEarlier}
                      onChange={() => updateSubject(subject.id, { finishedEarlier: !subject.finishedEarlier })}
                    />
                  </label>
                  {subject.id === 'math' && (
                    <label className="switch-row">
                      <span>В журнале три курса: алгебра, геометрия, вероятность и статистика</span>
                      <Switch
                        checked={Boolean(subject.courses)}
                        onChange={() => updateSubject(subject.id, { courses: subject.courses ? null : emptyCourses() })}
                      />
                    </label>
                  )}
                  {canBeElective && (
                    <label className="switch-row">
                      <span>Сдаёт ОГЭ по этому предмету</span>
                      <Switch checked={subject.electiveExam} onChange={() => toggleElective(subject)} />
                    </label>
                  )}
                  {subject.custom && (
                    <Button
                      size="small"
                      variant="secondary"
                      onClick={() => setSubjects((previous) => previous.filter((item) => item.id !== subject.id))}
                    >
                      Удалить предмет
                    </Button>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <SectionTitle>Нет предмета из аттестата?</SectionTitle>
      <div className="add-subject">
        <Input
          placeholder="Например, Родной язык"
          value={newTitle}
          maxLength={60}
          onChange={(event) => setNewTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') addSubject();
          }}
        />
        <Button size="medium" variant="secondary" disabled={!newTitle.trim()} onClick={addSubject}>Добавить</Button>
      </div>

      {toast}
    </div>
  );
}
