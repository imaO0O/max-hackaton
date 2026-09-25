import { useEffect, useState } from 'react';
import { Button, CellList, CellSimple, Radio, Typography } from '@maxhub/max-ui';
import { PATH_TITLES, PATH_VALUES } from '@posle9/core';

import { ErrorState, LoadingState } from '../components/states.jsx';
import {
  Card, Chip, DemoTag, ScreenHeader, SectionTitle, Segmented, Tag,
} from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { haptic, showBackButton } from '../lib/max-bridge.js';
import { useAsync } from '../lib/use-async.js';

const PATH_HINTS = {
  school10: 'Остаться в школе и поступать в вуз по ЕГЭ',
  college: 'Получить профессию после 9 класса',
  undecided: 'Покажем оба пути, чтобы сравнить',
};

export function OnboardingScreen({ initialProfile, onSaved, onCancel, notice = null }) {
  const reference = useAsync(() => Promise.all([api.regions(), api.interests()]), []);
  const [form, setForm] = useState(() => ({
    regionId: initialProfile?.regionId ?? null,
    city: initialProfile?.city ?? null,
    grade: initialProfile?.grade ?? 9,
    interests: initialProfile?.interests ?? [],
    path: initialProfile?.path ?? null,
  }));
  const cities = useAsync(
    () => (form.regionId ? api.cities(form.regionId) : Promise.resolve([])),
    [form.regionId],
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  useEffect(() => (onCancel ? showBackButton(onCancel) : undefined), [onCancel]);

  const update = (patch) => {
    setSaveError(null);
    setForm((previous) => ({ ...previous, ...patch }));
  };

  const toggleInterest = (id) => {
    update({
      interests: form.interests.includes(id)
        ? form.interests.filter((item) => item !== id)
        : [...form.interests, id],
    });
  };

  const canSave = Boolean(form.regionId && form.grade && form.path) && !saving;

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await api.saveProfile(form);
      haptic('success');
      onSaved(saved);
    } catch (error) {
      haptic('error');
      setSaveError(error.message);
      setSaving(false);
    }
  };

  if (!reference.data && reference.status === 'loading') return <LoadingState fullScreen />;
  if (!reference.data) return <ErrorState fullScreen error={reference.error} onRetry={reference.reload} />;

  const [regions, interests] = reference.data;

  return (
    <div className="page page--with-footer">
      <ScreenHeader
        title={onCancel ? 'Изменить ответы' : 'После 9-го'}
        subtitle={onCancel
          ? 'План и напоминания пересоберутся под новые ответы'
          : 'Ответьте на 5 вопросов — соберём план 9 класса, сравнение путей и подборку колледжей'}
      />

      {notice && (
        <Card className="notice">
          <Typography.Body variant="small">{notice}</Typography.Body>
        </Card>
      )}

      <SectionTitle>1. Регион</SectionTitle>
      <CellList mode="island" filled>
        {regions.map((region) => (
          <CellSimple
            key={region.id}
            as="label"
            title={region.name}
            subtitle={region.twoOgeExperiment ? 'Эксперимент: для колледжа можно сдать два ОГЭ вместо четырёх' : undefined}
            after={region.isDemo ? <DemoTag /> : undefined}
            before={(
              <Radio
                name="region"
                checked={form.regionId === region.id}
                onChange={() => update({ regionId: region.id, city: null })}
              />
            )}
          />
        ))}
      </CellList>

      <SectionTitle>2. Город для поиска колледжей</SectionTitle>
      {!form.regionId && (
        <Typography.Body variant="small" className="muted hint">Сначала выберите регион</Typography.Body>
      )}
      {form.regionId && (
        <>
          {cities.status === 'loading' && !cities.data && <LoadingState text="Загружаем города…" />}
          {cities.status === 'error' && <ErrorState error={cities.error} onRetry={cities.reload} />}
          {cities.data && (
            <div className="chips">
              <Chip selected={!form.city} onClick={() => update({ city: null })}>Любой город</Chip>
              {cities.data.map((city) => (
                <Chip key={city} selected={form.city === city} onClick={() => update({ city })}>{city}</Chip>
              ))}
            </div>
          )}
        </>
      )}

      <SectionTitle>3. Класс подростка</SectionTitle>
      <Segmented
        ariaLabel="Класс"
        value={form.grade}
        onChange={(grade) => update({ grade })}
        options={[{ value: 9, label: '9 класс' }, { value: 8, label: '8 класс' }]}
      />

      <SectionTitle after={form.interests.length ? <Tag>{`выбрано ${form.interests.length}`}</Tag> : null}>
        4. Что интересно подростку
      </SectionTitle>
      <div className="chips">
        {interests.map((interest) => (
          <Chip key={interest.id} selected={form.interests.includes(interest.id)} onClick={() => toggleInterest(interest.id)}>
            {interest.emoji} {interest.title}
          </Chip>
        ))}
      </div>
      <Typography.Body variant="small" className="muted hint">Можно пропустить, если пока непонятно.</Typography.Body>

      <SectionTitle>5. К какому пути склоняется семья</SectionTitle>
      <CellList mode="island" filled>
        {PATH_VALUES.map((path) => (
          <CellSimple
            key={path}
            as="label"
            title={PATH_TITLES[path]}
            subtitle={PATH_HINTS[path]}
            before={<Radio name="path" checked={form.path === path} onChange={() => update({ path })} />}
          />
        ))}
      </CellList>

      <Typography.Body variant="small" className="muted hint">
        Мы храним только ответы на эти вопросы и ID в MAX — без имени и оценок ребёнка.
      </Typography.Body>

      <footer className="sticky-footer">
        {saveError && <div className="inline-error" role="alert">{saveError}</div>}
        {!canSave && !saving && (
          <Typography.Body variant="small" className="muted footer-hint">
            {!form.regionId ? 'Выберите регион' : 'Выберите путь, чтобы продолжить'}
          </Typography.Body>
        )}
        <Button size="large" stretched disabled={!canSave} loading={saving} onClick={save}>
          {onCancel ? 'Сохранить' : 'Собрать план'}
        </Button>
      </footer>
    </div>
  );
}
