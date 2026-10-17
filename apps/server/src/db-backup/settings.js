/** Настройки копии или null, если она выключена. */
export function backupSettings(env) {
  const url = env.SUPABASE_URL?.trim();
  const key = env.SUPABASE_SECRET_KEY?.trim();
  if (!url && !key) return null;
  if (!url || !key) throw new Error('Для копии базы нужны обе переменные: SUPABASE_URL и SUPABASE_SECRET_KEY');
  // http допускается только для проверки на этой же машине
  if (!/^(https:\/\/[^/\s]+|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$))/.test(url)) {
    throw new Error('SUPABASE_URL — адрес проекта вида https://<проект>.supabase.co');
  }
  const bucket = env.DB_BACKUP_BUCKET?.trim() || 'posle9-db';
  if (!/^[a-z0-9][a-z0-9_-]{2,62}$/.test(bucket)) throw new Error('DB_BACKUP_BUCKET: 3–63 символа, строчная латиница, цифры, «_» и «-»');
  const intervalSeconds = Number(env.DB_BACKUP_INTERVAL_SECONDS || 30);
  if (!Number.isInteger(intervalSeconds) || intervalSeconds < 10) throw new Error('DB_BACKUP_INTERVAL_SECONDS — целое число не меньше 10');
  return { url, key, bucket, intervalMs: intervalSeconds * 1000 };
}
