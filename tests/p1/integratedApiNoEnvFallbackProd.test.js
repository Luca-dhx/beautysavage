// S1B — Le fallback .env des credentials est INTERDIT en production (quel que soit le flag),
// AUTORISÉ en dev/test uniquement si ALLOW_ENV_CREDENTIAL_FALLBACK==='true'.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { startMemoryDb, stopMemoryDb, clearDatabase } from '../setup/testDb.js';
import { getCredential, IntegratedApiNotFoundError } from '../../services/integratedApiCredentialService.js';

describe('IntegratedAPI — fallback .env interdit en prod', () => {
  let prevNodeEnv, prevFlag, prevKey;

  beforeAll(async () => {
    const uri = await startMemoryDb();
    await mongoose.connect(uri, { dbName: 'beautysavage-database' });
  });
  afterAll(async () => {
    await stopMemoryDb();
  });
  beforeEach(async () => {
    await clearDatabase();
    prevNodeEnv = process.env.NODE_ENV;
    prevFlag = process.env.ALLOW_ENV_CREDENTIAL_FALLBACK;
    prevKey = process.env.BREVO_API_KEY;
    process.env.BREVO_API_KEY = 'xkeysib-FAKE-test-only-not-a-secret';
    process.env.ALLOW_ENV_CREDENTIAL_FALLBACK = 'true';
  });
  afterEach(() => {
    process.env.NODE_ENV = prevNodeEnv;
    process.env.ALLOW_ENV_CREDENTIAL_FALLBACK = prevFlag;
    if (prevKey === undefined) delete process.env.BREVO_API_KEY;
    else process.env.BREVO_API_KEY = prevKey;
  });

  it('dev + flag true + pas de coffre → fallback .env actif', async () => {
    process.env.NODE_ENV = 'test';
    const val = await getCredential('brevo', { role: 'api_key' });
    expect(val).toBe('xkeysib-FAKE-test-only-not-a-secret');
  });

  it('production + flag true + pas de coffre → fallback REFUSÉ (fail-loud)', async () => {
    process.env.NODE_ENV = 'production';
    await expect(getCredential('brevo', { role: 'api_key' })).rejects.toBeInstanceOf(IntegratedApiNotFoundError);
  });

  it('dev + flag false → aucun fallback (fail-loud)', async () => {
    process.env.NODE_ENV = 'test';
    process.env.ALLOW_ENV_CREDENTIAL_FALLBACK = 'false';
    await expect(getCredential('brevo', { role: 'api_key' })).rejects.toBeInstanceOf(IntegratedApiNotFoundError);
  });
});
