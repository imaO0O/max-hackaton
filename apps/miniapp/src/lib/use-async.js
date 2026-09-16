import { useCallback, useEffect, useState } from 'react';

/**
 * Загрузка данных с состояниями loading / success / error и повтором.
 * Предыдущие данные сохраняются во время повторной загрузки, чтобы экран не мигал.
 */
export function useAsync(loader, deps) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((previous) => ({ status: 'loading', data: previous.data, error: null }));
    loader().then(
      (data) => {
        if (!cancelled) setState({ status: 'success', data, error: null });
      },
      (error) => {
        if (!cancelled) setState((previous) => ({ status: 'error', data: previous.data, error }));
      },
    );
    return () => {
      cancelled = true;
    };
    // loader намеренно не в зависимостях: перезапуск управляется deps и reload()
  }, [...deps, attempt]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  const setData = useCallback((updater) => {
    setState((previous) => ({
      ...previous,
      data: typeof updater === 'function' ? updater(previous.data) : updater,
    }));
  }, []);

  return { ...state, reload, setData };
}
