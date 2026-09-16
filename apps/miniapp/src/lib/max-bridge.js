/**
 * Обёртка над MAX Bridge (window.WebApp). Каждый метод имеет запасной вариант,
 * потому что часть возможностей не поддерживается веб-версией или обычным браузером.
 */

export function getWebApp() {
  return typeof window === 'undefined' ? undefined : window.WebApp;
}

export function getInitData() {
  return getWebApp()?.initData || '';
}

export function getPlatform() {
  return getWebApp()?.platform || 'web';
}

export function notifyReady() {
  try {
    getWebApp()?.ready?.();
  } catch {
    // Метод есть не во всех версиях клиента
  }
}

/** Открывает внешнюю ссылку. MAX требует, чтобы вызов был в обработчике нажатия. */
export function openExternalLink(url) {
  const webApp = getWebApp();
  if (webApp?.openLink) {
    try {
      webApp.openLink(url);
      return;
    } catch {
      // перейдём к window.open
    }
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Делится текстом со ссылкой в чатах MAX.
 * @returns {Promise<'shared' | 'copied' | 'failed'>}
 */
export async function shareToMax({ text, link }) {
  const webApp = getWebApp();
  const insideMax = Boolean(getInitData());
  if (insideMax && webApp?.shareMaxContent) {
    try {
      // Экран выбора чата может оставаться открытым долго — не блокируем кнопку дольше пары секунд
      await Promise.race([
        Promise.resolve(webApp.shareMaxContent({ text, link })),
        new Promise((resolve) => { setTimeout(resolve, 2000); }),
      ]);
      return 'shared';
    } catch {
      // попробуем диплинк
    }
  }
  if (insideMax && webApp?.openMaxLink) {
    try {
      webApp.openMaxLink(`https://max.ru/:share?text=${encodeURIComponent(text)}`);
      return 'shared';
    } catch {
      // попробуем буфер обмена
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}

export function haptic(type = 'success') {
  try {
    getWebApp()?.HapticFeedback?.notificationOccurred?.(type);
  } catch {
    // Тактильный отклик недоступен на десктопе и в вебе
  }
}

export function hapticSelection() {
  try {
    getWebApp()?.HapticFeedback?.selectionChanged?.();
  } catch {
    // Тактильный отклик недоступен на десктопе и в вебе
  }
}

/** Показывает системную кнопку «Назад» MAX, пока handler задан. Возвращает функцию отписки. */
export function showBackButton(handler) {
  const backButton = getWebApp()?.BackButton;
  if (!backButton) return () => {};
  try {
    backButton.onClick(handler);
    backButton.show();
  } catch {
    return () => {};
  }
  return () => {
    try {
      backButton.offClick(handler);
      backButton.hide();
    } catch {
      // клиент уже закрыл приложение
    }
  };
}
