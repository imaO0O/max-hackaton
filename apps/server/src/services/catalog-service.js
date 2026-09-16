import { STUDY_FORMS } from '@posle9/core';

import { badRequest, notFound } from './errors.js';

/** Справочники, поиск колледжей и избранное. */
export function createCatalogService({ repos, content }) {
  const { reference, users, favorites } = repos;

  return {
    listRegions() {
      return reference.listRegions();
    },

    listCities(regionId) {
      if (!reference.getRegion(regionId)) throw notFound('Регион не найден');
      return reference.listCities(regionId);
    },

    listInterests() {
      return reference.listInterests();
    },

    listSpecialties(interestId) {
      return reference.listSpecialties({ interestId });
    },

    getContent() {
      return content;
    },

    searchColleges(filters) {
      if (!reference.getRegion(filters.regionId)) throw notFound('Регион не найден');
      if (filters.form && !Object.hasOwn(STUDY_FORMS, filters.form)) throw badRequest('Неизвестная форма обучения');
      return reference.searchColleges(filters);
    },

    getCollege(id) {
      const college = reference.getCollege(id);
      if (!college) throw notFound('Колледж не найден');
      return college;
    },

    listFavorites(userId) {
      users.ensure(userId);
      return favorites.listProgramIds(userId).map((id) => reference.getProgram(id)).filter(Boolean);
    },

    addFavorite(userId, programId) {
      users.ensure(userId);
      if (!reference.getProgram(programId)) throw notFound('Программа не найдена');
      favorites.add(userId, programId);
      return { programId, isFavorite: true };
    },

    removeFavorite(userId, programId) {
      users.ensure(userId);
      favorites.remove(userId, programId);
      return { programId, isFavorite: false };
    },
  };
}
