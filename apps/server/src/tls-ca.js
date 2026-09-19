import fs from 'node:fs';
import tls from 'node:tls';

/**
 * Bot API MAX (platform-api2.max.ru) использует сертификат Минцифры России — Russian Trusted Root CA.
 * Его нет в списке доверенных центров Node.js, без него бот не подключается (UNABLE_TO_GET_ISSUER_CERT_LOCALLY).
 * Сертификат добавляется к стандартным только для этого процесса, системные настройки не меняются.
 * Источник: https://gu-st.ru/content/lending/russian_trusted_root_ca_pem.crt
 * SHA-256: D2:6D:2D:02:31:B7:C3:9F:92:CC:73:85:12:BA:54:10:35:19:E4:40:5D:68:B5:BD:70:3E:97:88:CA:8E:CF:31
 */
export const RUSSIAN_TRUSTED_ROOT_CA = new URL('../certs/russian-trusted-root-ca.pem', import.meta.url);

/** @returns {'added' | 'unsupported'} */
export function trustRussianRootCa() {
  // tls.setDefaultCACertificates есть в Node.js 24.5+. В Docker сертификат дополнительно подключается через NODE_EXTRA_CA_CERTS
  if (typeof tls.setDefaultCACertificates !== 'function' || typeof tls.getCACertificates !== 'function') {
    return 'unsupported';
  }
  const certificate = fs.readFileSync(RUSSIAN_TRUSTED_ROOT_CA, 'utf8');
  tls.setDefaultCACertificates([...tls.getCACertificates('default'), certificate]);
  return 'added';
}
