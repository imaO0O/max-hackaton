import { isProfileComplete } from '../repositories/users.js';
import { EVENTS } from '../services/analytics.js';
import { AppError } from '../services/errors.js';
import {
  planItemKeyboard, planItemsKeyboard, planPreviewKeyboard, reminderKeyboard, shareKeyboard, sharedPlanKeyboard, startKeyboard,
} from './keyboards.js';
import { planItemCard, planItemLabel, planText, texts } from './texts.js';

const PLAN_PREVIEW_ITEMS = 5;
const MAX_ITEM_BUTTONS = 10;
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

/**
 * Весь сценарий в чате, без мини-приложения: меню, ближайшие даты, карточки пунктов с отметками,
 * отправка плана подростку и чужой план по ссылке https://max.ru/<бот>?start=plan_<токен>.
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

  function menuView(userId) {
    const user = users.ensure(userId);
    return {
      text: isProfileComplete(user) ? texts.menu : texts.needSurvey,
      keyboard: startKeyboard({
        hasProfile: isProfileComplete(user), botUsername: runtime.botUsername, remindersEnabled: user.remindersEnabled,
      }),
    };
  }

  function planPreviewView(userId) {
    const plan = services.plan.getPlan(userId);
    return { text: planText(plan, { limit: PLAN_PREVIEW_ITEMS }), keyboard: planPreviewKeyboard(runtime.botUsername) };
  }

  function planAllView(userId) {
    const plan = services.plan.getPlan(userId);
    const upcoming = plan.items.filter((item) => item.status !== 'past').slice(0, MAX_ITEM_BUTTONS);
    const text = upcoming.length ? `${planText(plan)}\n\n${texts.planItemsHint}` : planText(plan);
    return { text, keyboard: planItemsKeyboard(upcoming, planItemLabel) };
  }

  /** Карточка пункта. Из своего плана — со статусом и отметкой; иначе (подросток по чужому плану) — только сведения. */
  function itemView(userId, itemId) {
    const user = users.ensure(userId);
    if (isProfileComplete(user)) {
      const item = services.plan.getPlan(userId).items.find((row) => row.id === itemId);
      if (item) return { text: planItemCard(item), keyboard: planItemKeyboard({ item, canMarkDone: true }) };
    }
    const keyDate = reference.getKeyDate(itemId);
    if (!keyDate) return null;
    return { text: planItemCard(keyDate), keyboard: planItemKeyboard({ item: keyDate, canMarkDone: false }) };
  }

  function shareView(userId) {
    const share = services.plan.createShareLink(userId);
    return { intro: texts.shareIntro, text: share.text, keyboard: shareKeyboard(share.text) };
  }

  function sharedPlanView(viewerId, token) {
    const shared = services.plan.getSharedPlan(viewerId, token);
    const intro = shared.isOwner ? texts.sharedOwn : texts.sharedIntro;
    return {
      shared,
      text: `${intro}\n\n${planText(shared, { limit: PLAN_PREVIEW_ITEMS })}`,
      keyboard: sharedPlanKeyboard({ botUsername: runtime.botUsername, token, isFollowing: shared.isFollowing }),
    };
  }

  const isNotFound = (error) => error instanceof AppError && error.statusCode === 404;

  // Команды — новое сообщение

  async function sendPlanPreview(ctx) {
    const userId = userIdOf(ctx);
    if (!isProfileComplete(users.ensure(userId))) return show(ctx, surveyView(), { edit: false });
    services.analytics.track(EVENTS.PLAN_VIEWED_IN_CHAT, userId, { from: 'command' });
    return show(ctx, planPreviewView(userId), { edit: false });
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
      const view = sharedPlanView(userId, token);
      if (!view.shared.isOwner) services.analytics.track(EVENTS.SHARED_PLAN_OPENED, userId, { from: 'chat' });
      return show(ctx, view, { edit: false });
    } catch (error) {
      if (isNotFound(error)) return ctx.reply(texts.sharedInvalid);
      throw error;
    }
  }

  // Кнопки — редактирование того же сообщения

  bot.action('menu:show', (ctx) => show(ctx, menuView(userIdOf(ctx)), { edit: true }));

  bot.action('plan:show', async (ctx) => {
    const userId = userIdOf(ctx);
    if (!isProfileComplete(users.ensure(userId))) return show(ctx, surveyView(), { edit: true });
    services.analytics.track(EVENTS.PLAN_VIEWED_IN_CHAT, userId, { from: 'menu' });
    return show(ctx, planPreviewView(userId), { edit: true });
  });

  bot.action('plan:all', async (ctx) => {
    const userId = userIdOf(ctx);
    if (!isProfileComplete(users.ensure(userId))) return show(ctx, surveyView(), { edit: true });
    services.analytics.track(EVENTS.PLAN_VIEWED_IN_CHAT, userId, { from: 'all_dates' });
    return show(ctx, planAllView(userId), { edit: true });
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
    const reminderText = ctx.message?.body?.text;
    if (!reminderText) return ctx.answerOnCallback({ notification });
    return ctx.answerOnCallback({
      notification,
      message: {
        text: reminderText,
        attachments: [reminderKeyboard(runtime.botUsername, { keyDateId: itemId, canMarkDone: true, done })],
      },
    });
  });

  bot.action('share:show', (ctx) => sendShare(ctx, { edit: true }));

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
    const view = sharedPlanView(userId, token);
    return show(ctx, { text: `${follow ? texts.followOn : texts.followOff}\n\n${view.text}`, keyboard: view.keyboard }, { edit: true });
  });

  return { sendPlanPreview, sendMenu, sendShare, openSharedPlan };
}
