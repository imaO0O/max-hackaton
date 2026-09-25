import { daysBetween } from '@posle9/core';

import { isProfileComplete } from '../repositories/users.js';
import { EVENTS } from '../services/analytics.js';
import { AppError } from '../services/errors.js';
import {
  followerMenuKeyboard, menuKeyboard, planItemKeyboard, planItemsKeyboard, planPreviewKeyboard, reminderKeyboard,
  revokeConfirmKeyboard, shareKeyboard, sharedPlanKeyboard, startKeyboard,
} from './keyboards.js';
import {
  planItemCard, planItemLabel, planText, plural, reminderText, texts,
} from './texts.js';

const PLAN_PREVIEW_ITEMS = 5;
const MAX_ITEM_BUTTONS = 10;
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

/**
 * Весь сценарий в чате, без мини-приложения: меню, ближайшие даты, карточки пунктов с отметками,
 * отправка плана подростку и чужой план по ссылке https://max.ru/<бот>?start=plan_<токен>.
 * Тот, кто подписался на чужой план (обычно подросток), видит его в меню и по /plan как «План семьи».
 * Переходы по кнопкам редактируют одно сообщение, команды присылают новое.
 */
export function registerPlanChat({ bot, users, reference, services, runtime }) {
  const userIdOf = (ctx) => ctx.user?.user_id;
  const payloadOf = (ctx) => ctx.callback?.payload ?? '';

  const show = (ctx, view, { edit }) => (edit
    ? ctx.answerOnCallback({ message: { text: view.text, attachments: [view.keyboard] } })
    : ctx.reply(view.text, { attachments: [view.keyboard] }));

  function surveyView() {
    return { text: texts.needSurvey, keyboard: startKeyboard({ hasProfile: false }) };
  }

  /** План, который видит пользователь: свой, а если своего нет — план семьи, на который он подписан. */
  function currentPlan(userId) {
    if (isProfileComplete(users.ensure(userId))) return { plan: services.plan.getPlan(userId), own: true };
    const token = services.plan.getFollowedShareToken(userId);
    return token ? { plan: services.plan.getSharedPlan(userId, token), own: false, token } : null;
  }

  /**
   * Меню: у родителя — весь сценарий, у подписчика без своего плана — план семьи,
   * у нового пользователя — предложение ответить на вопросы.
   */
  function menuView(userId, { greeting = false, withReminderExample = false } = {}) {
    const user = users.ensure(userId);
    const familyToken = services.plan.getFollowedShareToken(userId);
    if (isProfileComplete(user)) {
      return {
        text: greeting ? texts.welcomeBack : texts.menu,
        keyboard: menuKeyboard({
          botUsername: runtime.botUsername,
          remindersEnabled: user.remindersEnabled,
          withReminderExample,
          withFamilyPlan: Boolean(familyToken),
        }),
      };
    }
    if (familyToken) {
      return {
        text: texts.followerMenu,
        keyboard: followerMenuKeyboard({
          botUsername: runtime.botUsername, token: familyToken, remindersEnabled: user.remindersEnabled, withReminderExample,
        }),
      };
    }
    return { text: greeting ? texts.welcome : texts.needSurvey, keyboard: startKeyboard({ hasProfile: false }) };
  }

  function planPreviewView(current) {
    if (current.own) {
      return { text: planText(current.plan, { limit: PLAN_PREVIEW_ITEMS }), keyboard: planPreviewKeyboard(runtime.botUsername) };
    }
    return sharedPlanView(current.plan, current.token, { intro: texts.familyPlanIntro });
  }

  function planAllView(plan, { own }) {
    const upcoming = plan.items.filter((item) => item.status !== 'past').slice(0, MAX_ITEM_BUTTONS);
    const text = upcoming.length ? `${planText(plan)}\n\n${own ? texts.planItemsHint : texts.sharedItemsHint}` : planText(plan);
    return { text, keyboard: planItemsKeyboard(upcoming, planItemLabel) };
  }

  /**
   * Карточка пункта. Из своего плана — со статусом и отметкой; из плана семьи — со статусом, но без отметки;
   * иначе (например, по старой ссылке) — только сведения из справочника.
   */
  function itemView(userId, itemId) {
    const current = currentPlan(userId);
    const item = current?.plan.items.find((row) => row.id === itemId);
    if (item) {
      return { text: planItemCard(item), keyboard: planItemKeyboard({ item, canMarkDone: current.own, back: 'plan:all' }) };
    }
    const keyDate = reference.getKeyDate(itemId);
    if (!keyDate) return null;
    return { text: planItemCard(keyDate), keyboard: planItemKeyboard({ item: keyDate, canMarkDone: false, back: 'menu:show' }) };
  }

  function shareView(userId) {
    const share = services.plan.createShareLink(userId);
    const { followersCount } = services.plan.getPlan(userId);
    const followers = followersCount > 0
      ? `\n\nПо этой ссылке уже подписались: ${followersCount}. Если ссылка попала не туда — её можно отозвать.`
      : '';
    return { intro: `${texts.shareIntro}${followers}`, text: share.text, keyboard: shareKeyboard(share.text) };
  }

  function sharedPlanView(shared, token, { intro } = {}) {
    const header = intro ?? (shared.isOwner ? texts.sharedOwn : texts.sharedIntro);
    return {
      shared,
      text: `${header}\n\n${planText(shared, { limit: PLAN_PREVIEW_ITEMS })}`,
      keyboard: sharedPlanKeyboard({ botUsername: runtime.botUsername, token, isFollowing: shared.isFollowing }),
    };
  }

  const isNotFound = (error) => error instanceof AppError && error.statusCode === 404;

  // Команды — новое сообщение

  async function sendPlanPreview(ctx) {
    const userId = userIdOf(ctx);
    const current = currentPlan(userId);
    if (!current) return show(ctx, surveyView(), { edit: false });
    services.analytics.track(EVENTS.PLAN_VIEWED_IN_CHAT, userId, { from: 'command', own: current.own });
    return show(ctx, planPreviewView(current), { edit: false });
  }

  async function sendMenu(ctx) {
    return show(ctx, menuView(userIdOf(ctx)), { edit: false });
  }

  async function sendShare(ctx, { edit = false } = {}) {
    const userId = userIdOf(ctx);
    if (!isProfileComplete(users.ensure(userId))) return show(ctx, surveyView(), { edit });
    const view = shareView(userId);
    // Сначала пояснение с кнопкой «Отправить в MAX», потом отдельное сообщение, которое удобно переслать
    await show(ctx, { text: view.intro, keyboard: view.keyboard }, { edit });
    return ctx.reply(view.text);
  }

  async function openSharedPlan(ctx, token) {
    const userId = userIdOf(ctx);
    if (!TOKEN_RE.test(token)) return ctx.reply(texts.sharedInvalid);
    try {
      const view = sharedPlanView(services.plan.getSharedPlan(userId, token), token);
      if (!view.shared.isOwner) services.analytics.track(EVENTS.SHARED_PLAN_OPENED, userId, { from: 'chat' });
      return show(ctx, view, { edit: false });
    } catch (error) {
      if (isNotFound(error)) return ctx.reply(texts.sharedInvalid);
      throw error;
    }
  }

  /**
   * Пример напоминания по ближайшему пункту плана — чтобы увидеть его, не дожидаясь даты.
   * Выглядит и работает как настоящее: с кнопками «Сделано» и «Подробнее».
   */
  async function sendReminderExample(ctx) {
    const current = currentPlan(userIdOf(ctx));
    if (!current) return show(ctx, surveyView(), { edit: false });
    const { plan } = current;
    const item = plan.items.find((row) => row.id === plan.nextItemId) ?? plan.items.at(-1);
    if (!item) return ctx.reply(texts.noDatesYet);
    const inProgress = item.status === 'current' && item.dateEnd;
    const example = reminderText({
      keyDate: item,
      anchor: inProgress ? 'end' : 'start',
      daysBefore: Math.max(0, inProgress ? daysBetween(plan.today, item.dateEnd) : (item.daysLeft ?? 0)),
    });
    return ctx.reply(`${example}\n\n${texts.reminderExampleNote}`, {
      attachments: [reminderKeyboard(runtime.botUsername, { keyDateId: item.id, canMarkDone: current.own, done: item.done })],
    });
  }

  // Кнопки — редактирование того же сообщения

  bot.action('menu:show', (ctx) => show(ctx, menuView(userIdOf(ctx)), { edit: true }));

  bot.action('plan:show', async (ctx) => {
    const userId = userIdOf(ctx);
    const current = currentPlan(userId);
    if (!current) return show(ctx, surveyView(), { edit: true });
    services.analytics.track(EVENTS.PLAN_VIEWED_IN_CHAT, userId, { from: 'menu', own: current.own });
    return show(ctx, planPreviewView(current), { edit: true });
  });

  bot.action('plan:all', async (ctx) => {
    const userId = userIdOf(ctx);
    const current = currentPlan(userId);
    if (!current) return show(ctx, surveyView(), { edit: true });
    services.analytics.track(EVENTS.PLAN_VIEWED_IN_CHAT, userId, { from: 'all_dates', own: current.own });
    return show(ctx, planAllView(current.plan, { own: current.own }), { edit: true });
  });

  // Все даты плана по ссылке — и для того, кто ещё не подписался
  bot.action(/^shared-all:/, async (ctx) => {
    const token = payloadOf(ctx).slice('shared-all:'.length);
    if (!TOKEN_RE.test(token)) return ctx.answerOnCallback({ message: { text: texts.sharedInvalid } });
    try {
      const shared = services.plan.getSharedPlan(userIdOf(ctx), token);
      return show(ctx, planAllView(shared, { own: shared.isOwner }), { edit: true });
    } catch (error) {
      if (isNotFound(error)) return ctx.answerOnCallback({ message: { text: texts.sharedInvalid } });
      throw error;
    }
  });

  // План семьи из меню родителя, который сам подписан на чужой план
  bot.action('family:show', async (ctx) => {
    const userId = userIdOf(ctx);
    const token = services.plan.getFollowedShareToken(userId);
    if (!token) return show(ctx, menuView(userId), { edit: true });
    return show(ctx, sharedPlanView(services.plan.getSharedPlan(userId, token), token, { intro: texts.familyPlanIntro }), { edit: true });
  });

  bot.action(/^item:/, async (ctx) => {
    const view = itemView(userIdOf(ctx), payloadOf(ctx).slice('item:'.length));
    if (!view) return ctx.answerOnCallback({ message: { text: texts.itemNotFound } });
    return show(ctx, view, { edit: true });
  });

  bot.action(/^item-(done|undo):/, async (ctx) => {
    const userId = userIdOf(ctx);
    const [action, itemId] = payloadOf(ctx).split(':');
    const done = action === 'item-done';
    try {
      services.plan.setItemDone(userId, itemId, done);
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 409) return show(ctx, surveyView(), { edit: true });
      if (isNotFound(error)) return ctx.answerOnCallback({ message: { text: texts.itemNotFound } });
      throw error;
    }
    if (done) services.analytics.track(EVENTS.ITEM_DONE, userId, { itemId, from: 'chat' });
    return show(ctx, itemView(userId, itemId), { edit: true });
  });

  // Кнопки под напоминанием: само напоминание остаётся в чате

  bot.action(/^ritem:/, async (ctx) => {
    const view = itemView(userIdOf(ctx), payloadOf(ctx).slice('ritem:'.length));
    if (!view) return ctx.answerOnCallback({ notification: texts.itemNotFound });
    await ctx.answerOnCallback({ notification: texts.detailsBelow });
    return show(ctx, view, { edit: false });
  });

  bot.action(/^r(done|undo):/, async (ctx) => {
    const userId = userIdOf(ctx);
    const [action, itemId] = payloadOf(ctx).split(':');
    const done = action === 'rdone';
    try {
      services.plan.setItemDone(userId, itemId, done);
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 409) {
        await ctx.answerOnCallback({ notification: texts.needSurvey });
        return show(ctx, surveyView(), { edit: false });
      }
      if (isNotFound(error)) return ctx.answerOnCallback({ notification: texts.itemNotFound });
      throw error;
    }
    if (done) services.analytics.track(EVENTS.ITEM_DONE, userId, { itemId, from: 'reminder' });
    const notification = done ? texts.itemMarked : texts.itemUnmarked;
    // Тот же текст напоминания, меняется только кнопка
    const shownText = ctx.message?.body?.text;
    if (!shownText) return ctx.answerOnCallback({ notification });
    return ctx.answerOnCallback({
      notification,
      message: {
        text: shownText,
        attachments: [reminderKeyboard(runtime.botUsername, { keyDateId: itemId, canMarkDone: true, done })],
      },
    });
  });

  bot.action('share:show', (ctx) => sendShare(ctx, { edit: true }));

  bot.action('share:revoke', (ctx) => show(ctx, { text: texts.revokeConfirm, keyboard: revokeConfirmKeyboard() }, { edit: true }));

  bot.action('share:revoke-confirm', async (ctx) => {
    const userId = userIdOf(ctx);
    const { revoked, followersRemoved } = services.plan.revokeShareLink(userId);
    const menu = menuView(userId);
    const text = revoked
      ? `Ссылка отозвана${followersRemoved ? `, напоминания отключены у ${followersRemoved} ${plural(followersRemoved, ['подписчика', 'подписчиков', 'подписчиков'])}` : ''}. Чтобы отправить план заново, нажмите «Отправить план подростку» — будет новая ссылка.`
      : texts.revokeNothing;
    return show(ctx, { text, keyboard: menu.keyboard }, { edit: true });
  });

  bot.action(/^(follow|unfollow):/, async (ctx) => {
    const userId = userIdOf(ctx);
    const [action, token] = payloadOf(ctx).split(':');
    const follow = action === 'follow';
    try {
      services.plan.setFollowing(userId, token, follow);
    } catch (error) {
      if (isNotFound(error)) return ctx.answerOnCallback({ message: { text: texts.sharedInvalid } });
      if (error instanceof AppError && error.statusCode === 400) {
        return ctx.answerOnCallback({ message: { text: texts.sharedOwn } });
      }
      throw error;
    }
    if (follow) services.analytics.track(EVENTS.FOLLOW_STARTED, userId, { from: 'chat' });
    const view = sharedPlanView(services.plan.getSharedPlan(userId, token), token);
    return show(ctx, { text: `${follow ? texts.followOn : texts.followOff}\n\n${view.text}`, keyboard: view.keyboard }, { edit: true });
  });

  return {
    menuView, sendPlanPreview, sendMenu, sendShare, openSharedPlan, sendReminderExample,
  };
}
