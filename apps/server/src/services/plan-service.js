import crypto from 'node:crypto';

import { academicYearFor, buildPlan, PATH_VALUES, GRADE_VALUES, reminderSchedule } from '@posle9/core';

import { transaction } from '../db/database.js';
import { isProfileComplete } from '../repositories/users.js';
import { badRequest, conflict, notFound, unavailable } from './errors.js';

const SHARE_PREFIX = 'plan_';

/** Ссылка, открывающая мини-приложение бота с планом. Формат диплинка: https://max.ru/<bot>?startapp=<payload> */
export function planShareLink(botUsername, token) {
  return `https://max.ru/${botUsername}?startapp=${SHARE_PREFIX}${token}`;
}

export function parseShareStartParam(startParam) {
  if (typeof startParam !== 'string' || !startParam.startsWith(SHARE_PREFIX)) return null;
  const token = startParam.slice(SHARE_PREFIX.length);
  return /^[A-Za-z0-9_-]{16,64}$/.test(token) ? token : null;
}

/**
 * Сценарии вокруг профиля семьи и плана: сохранение ответов, построение плана,
 * отметки, отправка плана подростку и расписание напоминаний.
 */
export function createPlanService({ db, repos, config, runtime, clock = () => new Date() }) {
  const { reference, users, plans, favorites, reminders } = repos;

  const currentAcademicYear = () => config.academicYear ?? academicYearFor(clock());

  function validateProfile(profile) {
    const region = reference.getRegion(profile.regionId);
    if (!region) throw badRequest('Регион не найден');
    if (!GRADE_VALUES.includes(profile.grade)) throw badRequest('Класс должен быть 8 или 9');
    if (!PATH_VALUES.includes(profile.path)) throw badRequest('Неизвестный вариант пути');
    if (profile.city && !reference.listCities(region.id).includes(profile.city)) {
      throw badRequest('Город не найден в регионе');
    }
    const knownInterests = new Set(reference.listInterests().map((interest) => interest.id));
    const interests = [...new Set(profile.interests ?? [])];
    if (interests.some((id) => !knownInterests.has(id))) throw badRequest('Неизвестная сфера интересов');
    return { ...profile, interests, city: profile.city || null };
  }

  function buildPlanFor(owner, plan) {
    const region = reference.getRegion(owner.regionId);
    const academicYear = currentAcademicYear();
    const built = buildPlan({
      keyDates: reference.listKeyDates(academicYear),
      profile: {
        academicYear,
        regionId: owner.regionId,
        path: owner.path,
        twoOgeExperiment: region.twoOgeExperiment,
      },
      doneIds: plans.listDoneItemIds(plan.id),
      now: clock(),
      utcOffsetHours: region.utcOffsetHours,
    });
    return { region, academicYear, ...built };
  }

  /** Пересобирает напоминания владельца плана и всех, кто на план подписан. */
  function syncReminders(ownerId) {
    const owner = users.get(ownerId);
    const plan = plans.getByUser(ownerId);
    if (!plan || !isProfileComplete(owner)) return;

    const { items, region } = buildPlanFor(owner, plan);
    const upcoming = items.filter((item) => !item.done);
    const schedule = reminderSchedule({ items: upcoming, utcOffsetHours: region.utcOffsetHours, now: clock() });

    transaction(db, () => {
      reminders.replacePending({ userId: owner.id, planId: plan.id, schedule });
      for (const followerId of plans.listFollowerIds(plan.id)) {
        reminders.replacePending({ userId: followerId, planId: plan.id, schedule });
      }
    });
  }

  function profileView(user) {
    return {
      regionId: user.regionId,
      city: user.city,
      grade: user.grade,
      path: user.path,
      interests: user.interests,
      remindersEnabled: user.remindersEnabled,
      isComplete: isProfileComplete(user),
    };
  }

  return {
    currentAcademicYear,
    syncReminders,

    getProfile(userId) {
      return profileView(users.ensure(userId));
    },

    saveProfile(userId, input) {
      users.ensure(userId);
      const profile = validateProfile(input);
      const user = transaction(db, () => {
        const updated = users.updateProfile(userId, profile);
        if (typeof input.remindersEnabled === 'boolean') {
          users.setRemindersEnabled(userId, input.remindersEnabled);
        }
        plans.getOrCreate(userId);
        return users.get(updated.id);
      });
      syncReminders(userId);
      return profileView(user);
    },

    setRemindersEnabled(userId, enabled) {
      users.ensure(userId);
      const user = users.setRemindersEnabled(userId, enabled);
      if (enabled) syncReminders(userId);
      return profileView(user);
    },

    getPlan(userId) {
      const user = users.ensure(userId);
      if (!isProfileComplete(user)) {
        throw conflict('profile_incomplete', 'Сначала ответьте на вопросы о регионе, классе и пути');
      }
      const plan = plans.getOrCreate(userId);
      const built = buildPlanFor(user, plan);
      return {
        academicYear: built.academicYear,
        today: built.today,
        region: built.region,
        profile: profileView(user),
        items: built.items,
        nextItemId: built.nextItemId,
        followersCount: plans.countFollowers(plan.id),
        pendingReminders: reminders.countPending(userId),
      };
    },

    setItemDone(userId, keyDateId, done) {
      const user = users.ensure(userId);
      if (!isProfileComplete(user)) {
        throw conflict('profile_incomplete', 'Сначала ответьте на вопросы о регионе, классе и пути');
      }
      const plan = plans.getOrCreate(userId);
      const { items } = buildPlanFor(user, plan);
      if (!items.some((item) => item.id === keyDateId)) {
        throw notFound('Пункт плана не найден');
      }
      plans.setItemDone(plan.id, keyDateId, done);
      syncReminders(userId);
      return { id: keyDateId, done };
    },

    /** Создаёт (или возвращает существующую) ссылку на план для подростка или второго родителя. */
    createShareLink(userId) {
      const user = users.ensure(userId);
      if (!isProfileComplete(user)) {
        throw conflict('profile_incomplete', 'Сначала ответьте на вопросы о регионе, классе и пути');
      }
      if (!runtime.botUsername) {
        throw unavailable('bot_unavailable', 'Бот ещё не подключён, отправить план пока нельзя');
      }
      const plan = plans.getOrCreate(userId);
      let token = plan.shareToken;
      if (!token) {
        token = crypto.randomBytes(16).toString('base64url');
        plans.setShareToken(plan.id, token);
      }
      const link = planShareLink(runtime.botUsername, token);
      return {
        token,
        link,
        text: `Я составил(а) план выбора пути после 9 класса. Посмотри и включи напоминания: ${link}`,
      };
    },

    getSharedPlan(viewerId, token) {
      users.ensure(viewerId);
      const plan = plans.getByShareToken(token);
      if (!plan) throw notFound('Ссылка на план недействительна');
      const owner = users.get(plan.userId);
      if (!isProfileComplete(owner)) throw notFound('План ещё не заполнен');
      const built = buildPlanFor(owner, plan);
      return {
        academicYear: built.academicYear,
        today: built.today,
        region: built.region,
        profile: { ...profileView(owner), remindersEnabled: undefined },
        items: built.items,
        nextItemId: built.nextItemId,
        isOwner: owner.id === viewerId,
        isFollowing: plans.isFollower(plan.id, viewerId),
        favorites: favorites.listProgramIds(owner.id).map((id) => reference.getProgram(id)).filter(Boolean),
      };
    },

    setFollowing(viewerId, token, follow) {
      users.ensure(viewerId);
      const plan = plans.getByShareToken(token);
      if (!plan) throw notFound('Ссылка на план недействительна');
      if (plan.userId === viewerId) throw badRequest('Это ваш собственный план');
      if (follow) {
        plans.addFollower(plan.id, viewerId);
        syncReminders(plan.userId);
      } else {
        plans.removeFollower(plan.id, viewerId);
        reminders.deletePending({ userId: viewerId, planId: plan.id });
      }
      return { isFollowing: follow };
    },
  };
}
