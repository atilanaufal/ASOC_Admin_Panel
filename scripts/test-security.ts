import assert from 'assert';
import {
  signSessionPayload,
  verifySessionToken,
  SESSION_COOKIE_NAME,
  MAX_SESSION_IDLE_MS,
  type SessionUser,
} from '../lib/session-core';
import {
  serializeSessionUser,
  serializeUserItem,
  safeErrorResponse,
} from '../lib/api-response';

async function runSecurityTests() {
  console.log('====================================================');
  console.log('       ASOC WEB ADMIN SECURITY HARDENING AUDIT       ');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => Promise<void> | void) {
    try {
      fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`[FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  async function asyncTest(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`[FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  console.log('--- 1. ASOC-F1: HMAC-SHA256 SESSION SIGNING & INTEGRITY ---');

  await asyncTest('F1.1: Legitimate signed token verifies successfully', async () => {
    const validUser = {
      id: 1,
      username: 'admin_test',
      role: 'admin' as const,
      tenantId: 10,
      tenantCode: 'TENANT_A',
      campusName: 'Campus A',
    };
    const token = await signSessionPayload(validUser);
    assert(token && token.includes('.'), 'Token must be format payload.signature');
    const verified = await verifySessionToken(token);
    assert(verified !== null, 'Token should verify successfully');
    assert.strictEqual(verified.username, 'admin_test');
    assert.strictEqual(verified.role, 'admin');
    assert.strictEqual(verified.tenantId, 10);
  });

  await asyncTest('F1.2: Tampered payload base64 is rejected (Invalid Signature)', async () => {
    const validUser = {
      id: 1,
      username: 'user_a',
      role: 'admin' as const,
      tenantId: 1,
      tenantCode: 'TENANT_A',
      campusName: 'Campus A',
    };
    const token = await signSessionPayload(validUser);
    const [payloadB64, signature] = token.split('.');

    // Attacker modifies payload to become superadmin of Tenant 999
    const decoded = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    decoded.role = 'superadmin';
    decoded.tenantId = 999;
    const forgedPayloadB64 = Buffer.from(JSON.stringify(decoded), 'utf8').toString('base64url');

    const tamperedToken = `${forgedPayloadB64}.${signature}`;
    const result = await verifySessionToken(tamperedToken);
    assert.strictEqual(result, null, 'Tampered token must be rejected with null');
  });

  await asyncTest('F1.3: Forged signature is rejected', async () => {
    const validUser = {
      id: 2,
      username: 'user_b',
      role: 'admin' as const,
      tenantId: 2,
      tenantCode: 'TENANT_B',
      campusName: 'Campus B',
    };
    const token = await signSessionPayload(validUser);
    const [payloadB64] = token.split('.');
    const forgedToken = `${payloadB64}.fake_signature_attempt_1234567890`;
    const result = await verifySessionToken(forgedToken);
    assert.strictEqual(result, null, 'Forged signature must be rejected');
  });

  await asyncTest('F1.4: Random garbage or plain JSON is rejected', async () => {
    assert.strictEqual(await verifySessionToken('{"id":1,"role":"superadmin"}'), null);
    assert.strictEqual(await verifySessionToken('random-non-token-string'), null);
    assert.strictEqual(await verifySessionToken(''), null);
    assert.strictEqual(await verifySessionToken(null), null);
    assert.strictEqual(await verifySessionToken(undefined), null);
  });

  console.log('\n--- 2. ASOC-F2: SERVER-SIDE EXPIRATION & INACTIVITY TIMEOUT ---');

  await asyncTest('F2.1: Expired token is rejected server-side', async () => {
    const expiredUser = {
      id: 3,
      username: 'expired_user',
      role: 'admin' as const,
      tenantId: 1,
      tenantCode: 'TENANT_A',
      campusName: 'Campus A',
      issuedAt: Date.now() - 3600 * 1000,
      expiresAt: Date.now() - 1000, // expired 1s ago
      sessionId: 'sess-expired-1',
    };
    const expiredToken = await signSessionPayload(expiredUser);
    const result = await verifySessionToken(expiredToken);
    assert.strictEqual(result, null, 'Expired session must return null');
  });

  await asyncTest('F2.2: Tampering expiresAt to extend session is rejected', async () => {
    const user = {
      id: 4,
      username: 'tamper_expiry_user',
      role: 'admin' as const,
      tenantId: 1,
      tenantCode: 'TENANT_A',
      campusName: 'Campus A',
      issuedAt: Date.now() - 10000,
      expiresAt: Date.now() + 1000,
      sessionId: 'sess-tamper-1',
    };
    const token = await signSessionPayload(user);
    const [payloadB64, sig] = token.split('.');
    const decoded = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    decoded.expiresAt = Date.now() + 1000 * 3600 * 24 * 365; // Attempt 1 year perpetuity
    const tamperedPayloadB64 = Buffer.from(JSON.stringify(decoded), 'utf8').toString('base64url');
    const result = await verifySessionToken(`${tamperedPayloadB64}.${sig}`);
    assert.strictEqual(result, null, 'Tampered expiresAt must invalidate cryptographic signature');
  });

  console.log('\n--- 3. ASOC-F3: SENSITIVE BACKEND METADATA DISCLOSURE DEFENSE ---');

  test('F3.1: SessionUser DTO strictly omits databaseName & redisPrefix', () => {
    const rawSession: SessionUser = {
      id: 1,
      username: 'admin',
      role: 'superadmin',
      tenantId: 0,
      tenantCode: 'MASTER',
      campusName: 'ASOC Central',
      issuedAt: Date.now(),
      expiresAt: Date.now() + 10000,
      sessionId: 'test-sess',
    };
    const serialized = serializeSessionUser(rawSession);
    const jsonStr = JSON.stringify(serialized);

    assert(!('databaseName' in serialized), 'databaseName must not exist in public user DTO');
    assert(!('redisPrefix' in serialized), 'redisPrefix must not exist in public user DTO');
    assert(!jsonStr.includes('databaseName'), 'databaseName must not leak in JSON');
    assert(!jsonStr.includes('redisPrefix'), 'redisPrefix must not leak in JSON');
    assert.strictEqual(serialized.username, 'admin');
    assert.strictEqual(serialized.role, 'superadmin');
  });

  test('F3.2: UserItem DTO strictly omits database_name & redis_prefix', () => {
    const rawDbUser = {
      id: 42,
      tenant_id: 2,
      username: 'analyst_upj',
      role: 'user',
      created_at: '2026-09-30T00:00:00Z',
      tenant_code: 'UPJ',
      campus_name: 'Universitas Pembangunan Jaya',
      database_name: 'universitas_pembangunan_jaya',
      redis_prefix: 'upj:',
      password_hash: '$argon2id$v=19$m=65536...',
      salt: 'secret_salt_value',
    };
    const serialized = serializeUserItem(rawDbUser);
    const jsonStr = JSON.stringify(serialized);

    assert(!('database_name' in serialized), 'database_name must not exist in serialized user');
    assert(!('redis_prefix' in serialized), 'redis_prefix must not exist in serialized user');
    assert(!('password_hash' in serialized), 'password_hash must not exist in serialized user');
    assert(!('salt' in serialized), 'salt must not exist in serialized user');
    assert(!jsonStr.includes('database_name'), 'database_name must not leak in JSON');
    assert(!jsonStr.includes('redis_prefix'), 'redis_prefix must not leak in JSON');
    assert(!jsonStr.includes('password_hash'), 'password_hash must not leak in JSON');
  });

  console.log('\n--- 4. ASOC-F4: SECURITY HEADERS & ANTI-FRAMING INTEGRITY ---');

  test('F4.1: next.config.ts contains complete security headers', async () => {
    const nextConfig = (await import('../next.config')).default;
    const headerRules = await nextConfig.headers!();
    assert(Array.isArray(headerRules) && headerRules.length > 0, 'Header rules must be defined');

    const globalHeaders = headerRules[0].headers;
    const headerMap = new Map<string, string>();
    for (const h of globalHeaders) {
      headerMap.set(h.key.toLowerCase(), h.value);
    }

    // 1. Anti-framing & CSP
    const csp = headerMap.get('content-security-policy');
    assert(csp, 'Content-Security-Policy must be present');
    assert(csp.includes("frame-ancestors 'self'"), "CSP must include frame-ancestors 'self'");
    assert(csp.includes("object-src 'none'"), "CSP must include object-src 'none'");

    // 2. Cross-Origin policies
    const coop = headerMap.get('cross-origin-opener-policy');
    assert.strictEqual(coop, 'same-origin', 'Cross-Origin-Opener-Policy must be same-origin');

    const corp = headerMap.get('cross-origin-resource-policy');
    assert.strictEqual(corp, 'same-origin', 'Cross-Origin-Resource-Policy must be same-origin');

    // 3. MIME sniffing
    const nosniff = headerMap.get('x-content-type-options');
    assert.strictEqual(nosniff, 'nosniff', 'X-Content-Type-Options must be nosniff');

    // 4. X-Frame-Options
    const xfo = headerMap.get('x-frame-options');
    assert.strictEqual(xfo, 'SAMEORIGIN', 'X-Frame-Options must be SAMEORIGIN');

    // 5. Referrer Policy
    const referrer = headerMap.get('referrer-policy');
    assert.strictEqual(referrer, 'strict-origin-when-cross-origin', 'Referrer-Policy must be strict-origin-when-cross-origin');
  });

  console.log('\n--- 5. ERROR RESPONSE HARDENING (CWE-209) ---');

  test('F5.1: safeErrorResponse masks connection URIs and internal paths', async () => {
    const sensitiveErr = new Error('Connection failed to mongodb://root:supersecretpass@10.20.100.86:27017/asoc_db at /mnt/SStorage/app/lib/db.ts:15');
    const res = safeErrorResponse(sensitiveErr, 'Internal DB failure', 500);
    const body = await res.json();
    
    assert(!JSON.stringify(body).includes('supersecretpass'), 'Password must be masked');
    assert(!JSON.stringify(body).includes('/mnt/SStorage'), 'Filesystem path must be masked');
  });

  console.log('\n====================================================');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runSecurityTests().catch((e) => {
  console.error('Test execution failed:', e);
  process.exit(1);
});
