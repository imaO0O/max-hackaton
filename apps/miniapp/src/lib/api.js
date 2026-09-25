import { getInitData } from './max-bridge.js';

// Локальная разработка вне MAX: пользователь и параметр запуска задаются через .env.development.local
// или в адресной строке (?devUser=200&startapp=plan_...). В обычной сборке переменные не заданы.
const devSearch = new URLSearchParams(window.location.search);
const DEV_USER_ID = import.meta.env.VITE_DEV_USER_ID
  ? (devSearch.get('devUser') ?? import.meta.env.VITE_DEV_USER_ID)
  : null;
const DEV_START_PARAM = DEV_USER_ID ? (devSearch.get('startapp') ?? import.meta.env.VITE_DEV_START_PARAM) : null;

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request(method, path, body) {
  const headers = {};
  const initData = getInitData();
  if (initData) {
    headers['X-Max-Init-Data'] = initData;
  } else if (DEV_USER_ID) {
    // Только для локальной разработки вне MAX: сервер принимает заголовок при AUTH_DEV_BYPASS=true
    headers['X-Dev-User-Id'] = DEV_USER_ID;
    if (DEV_START_PARAM) headers['X-Dev-Start-Param'] = DEV_START_PARAM;
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'network_error', 'Нет соединения. Проверьте интернет и попробуйте ещё раз');
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      data?.error?.code ?? 'http_error',
      data?.error?.message ?? 'Не удалось загрузить данные. Попробуйте ещё раз',
    );
  }
  return data;
}

const query = (params) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    // Пустой список (например, сферы интересов не выбраны) не передаём: сервер не принимает пустой параметр
    if (value === undefined || value === null || value === '' || value === false) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    search.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  const string = search.toString();
  return string ? `?${string}` : '';
};

export const api = {
  session: () => request('GET', '/session'),
  regions: () => request('GET', '/regions').then((data) => data.regions),
  cities: (regionId) => request('GET', `/regions/${encodeURIComponent(regionId)}/cities`).then((data) => data.cities),
  interests: () => request('GET', '/interests').then((data) => data.interests),
  content: () => request('GET', '/content'),
  colleges: ({ regionId, city, interests, form, budgetOnly }) => request(
    'GET',
    `/colleges${query({ regionId, city, interests, form, budgetOnly })}`,
  ).then((data) => data.colleges),
  college: (id) => request('GET', `/colleges/${encodeURIComponent(id)}`).then((data) => data.college),
  favorites: () => request('GET', '/favorites').then((data) => data.favorites),
  addFavorite: (programId) => request('PUT', `/favorites/${encodeURIComponent(programId)}`),
  removeFavorite: (programId) => request('DELETE', `/favorites/${encodeURIComponent(programId)}`),
  saveProfile: (profile) => request('PUT', '/profile', profile).then((data) => data.profile),
  setReminders: (enabled) => request('PUT', '/profile/reminders', { enabled }).then((data) => data.profile),
  plan: () => request('GET', '/plan'),
  setItemDone: (itemId, done) => request('PUT', `/plan/items/${encodeURIComponent(itemId)}`, { done }),
  sharePlan: () => request('POST', '/plan/share'),
  sharedPlan: (token) => request('GET', `/shared-plans/${encodeURIComponent(token)}`),
  followSharedPlan: (token, follow) => request('PUT', `/shared-plans/${encodeURIComponent(token)}/follow`, { follow }),
};
