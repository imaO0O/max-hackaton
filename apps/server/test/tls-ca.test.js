import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import tls from 'node:tls';
import { X509Certificate } from 'node:crypto';

import { RUSSIAN_TRUSTED_ROOT_CA, trustRussianRootCa } from '../src/tls-ca.js';

test('сертификат Минцифры для Bot API MAX добавляется к доверенным', () => {
  const pem = fs.readFileSync(RUSSIAN_TRUSTED_ROOT_CA, 'utf8');
  const certificate = new X509Certificate(pem);
  assert.match(certificate.subject, /CN=Russian Trusted Root CA/);
  assert.equal(certificate.fingerprint256, 'D2:6D:2D:02:31:B7:C3:9F:92:CC:73:85:12:BA:54:10:35:19:E4:40:5D:68:B5:BD:70:3E:97:88:CA:8E:CF:31');

  if (trustRussianRootCa() === 'unsupported') return;
  const trusted = tls.getCACertificates('default').map((item) => new X509Certificate(item).fingerprint256);
  assert.ok(trusted.includes(certificate.fingerprint256));
});
