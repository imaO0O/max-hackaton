// Проверка справочных данных без запуска сервера: npm run data:check
import { loadConfig } from '../config.js';
import { loadReferenceData } from './reference-data.js';

const { dataDir } = loadConfig({ ...process.env, BOT_ENABLED: 'false', AUTH_DEV_BYPASS: 'true' });

try {
  const data = loadReferenceData(dataDir);
  const programs = data.colleges.reduce((total, college) => total + college.programs.length, 0);
  const unchecked = data.keyDates.filter((item) => item.scope !== 'recommendation' && !item.checkedAt).length;
  console.log(`Данные в порядке: регионов ${data.regions.length}, колледжей ${data.colleges.length}, программ ${programs}, ключевых дат ${data.keyDates.length}.`);
  if (unchecked > 0) {
    console.log(`Внимание: ${unchecked} дат без checkedAt — сверьте их с первоисточником перед пилотом.`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
