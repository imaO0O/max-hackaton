/**
 * Минимальный клиент Supabase Storage (REST): скачать, загрузить и создать закрытый бакет.
 * Ключ нового формата (sb_secret_…) передаётся только в заголовке apikey — он не JWT.
 * Старый service_role-ключ (JWT, начинается с eyJ) дополнительно идёт в Authorization.
 */

export class StorageError extends Error {
  constructor(message, { status = null, notFound = false } = {}) {
    super(message);
    this.status = status;
    this.notFound = notFound;
  }
}

/** Supabase отвечает «нет такого объекта» по-разному: 404 или 400 с кодом в теле. */
function isNotFound(status, body) {
  if (status === 404) return true;
  return status === 400 && /NoSuchKey|NoSuchBucket|not_found|"statusCode":"404"/i.test(body);
}

export function createSupabaseStorage({ url, key, bucket, fetch = globalThis.fetch, timeoutMs = 20_000 }) {
  const base = `${url.replace(/\/+$/, '')}/storage/v1`;
  const headers = { apikey: key };
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  const objectUrl = (objectPath) => `${base}/object/${encodeURIComponent(bucket)}/${objectPath.split('/').map(encodeURIComponent).join('/')}`;

  async function request(method, requestUrl, { body, extraHeaders = {} } = {}) {
    let response;
    try {
      response = await fetch(requestUrl, {
        method,
        headers: { ...headers, ...extraHeaders },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new StorageError(`Supabase Storage недоступен: ${error.message}`);
    }
    return response;
  }

  async function failure(response, action) {
    const text = await response.text().catch(() => '');
    return new StorageError(`${action}: HTTP ${response.status} ${text.slice(0, 200)}`, {
      status: response.status,
      notFound: isNotFound(response.status, text),
    });
  }

  return {
    bucket,

    /** @returns {Promise<Buffer|null>} содержимое объекта или null, если его нет */
    async download(objectPath) {
      const response = await request('GET', objectUrl(objectPath));
      if (response.ok) return Buffer.from(await response.arrayBuffer());
      const error = await failure(response, `скачивание ${objectPath}`);
      if (error.notFound) return null;
      throw error;
    },

    async upload(objectPath, content) {
      const response = await request('POST', objectUrl(objectPath), {
        body: content,
        extraHeaders: { 'Content-Type': 'application/octet-stream', 'x-upsert': 'true', 'Cache-Control': 'no-cache' },
      });
      if (!response.ok) throw await failure(response, `загрузка ${objectPath}`);
    },

    /** Создаёт закрытый бакет, если его ещё нет. */
    async ensureBucket() {
      const existing = await request('GET', `${base}/bucket/${encodeURIComponent(bucket)}`);
      if (existing.ok) return 'exists';
      const error = await failure(existing, `бакет ${bucket}`);
      if (!error.notFound) throw error;
      const created = await request('POST', `${base}/bucket`, {
        body: JSON.stringify({ id: bucket, name: bucket, public: false }),
        extraHeaders: { 'Content-Type': 'application/json' },
      });
      if (!created.ok) throw await failure(created, `создание бакета ${bucket}`);
      return 'created';
    },
  };
}
