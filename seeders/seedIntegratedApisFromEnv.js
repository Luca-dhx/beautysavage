// seeders/seedIntegratedApisFromEnv.js
// Idempotent pre-seed of the IntegratedApi vault from the existing .env secrets.
//
// Seeds three integrations (mono-tenant): stripe-institut, stripe-dev, brevo.
// Reads the current .env values, encrypts them, and stores them. Runtime for
// dual_environment providers is derived from the key PREFIX:
//   sk_test_ / pk_test_ -> test     sk_live_ / pk_live_ -> prod
// webhook_secret (whsec_, no env indicator) is attached to the SAME runtime as
// the account's secret_key (documented coupling).
//
// IMPORTANT: never logs a secret value. Idempotent: re-running does not duplicate
// credentials; a role already present (active, for that runtime) is left untouched.

import IntegratedApi from '../models/IntegratedApi.js';
import { encryptCredential, lastFour, validateCredentialVaultKey } from '../utils/credentialVault.js';

function detectRuntimeFromValue(value) {
  const v = String(value || '');
  if (/^sk_test_|^pk_test_/.test(v)) return 'test';
  if (/^sk_live_|^pk_live_/.test(v)) return 'prod';
  return null; // unknown — caller decides
}

const DEFINITIONS = [
  {
    slug: 'stripe-institut',
    name: 'Stripe Institut',
    provider: 'stripe',
    runtimeModel: 'dual_environment',
    roles: [
      { role: 'secret_key', type: 'secret_key', env: 'STRIPE_SECRET_KEY', drivesMode: true },
      { role: 'publishable_key', type: 'publishable_key', env: 'STRIPE_PUBLISHABLE_KEY' },
      { role: 'webhook_secret', type: 'webhook_secret', env: 'STRIPE_WEBHOOK_SECRET', followsSecretRuntime: true }
    ]
  },
  {
    slug: 'stripe-dev',
    name: 'Stripe Developer',
    provider: 'stripe',
    runtimeModel: 'dual_environment',
    roles: [
      { role: 'secret_key', type: 'secret_key', env: 'STRIPE_DEV_SECRET_KEY', drivesMode: true },
      { role: 'publishable_key', type: 'publishable_key', env: 'STRIPE_DEV_PUBLISHABLE_KEY' },
      { role: 'webhook_secret', type: 'webhook_secret', env: 'STRIPE_DEV_WEBHOOK_SECRET', followsSecretRuntime: true }
    ]
  },
  {
    slug: 'brevo',
    name: 'Brevo',
    provider: 'brevo',
    runtimeModel: 'single',
    roles: [
      { role: 'api_key', type: 'api_key', env: 'BREVO_API_KEY' },
      // Sprint pré-React A3 — secret partagé du webhook Brevo. Optionnel hors prod
      // (rôle seedé seulement si BREVO_WEBHOOK_SECRET est défini), OBLIGATOIRE en
      // production (le contrôleur refuse en 503 si absent). Jamais loggé.
      { role: 'webhook_secret', type: 'webhook_secret', env: 'BREVO_WEBHOOK_SECRET' }
    ]
  }
];

/**
 * Seed/refresh the IntegratedApi vault from env. Safe to call at every boot.
 * @returns {Promise<{seeded: string[], skipped: string[], details: object[]}>}
 */
export async function seedIntegratedApisFromEnv() {
  // Without a valid vault key we cannot encrypt — do nothing (caller relies on
  // env fallback). validateCredentialVaultKey() throws in production.
  if (!validateCredentialVaultKey()) {
    return { seeded: [], skipped: DEFINITIONS.map(d => d.slug), details: [{ reason: 'vault_key_invalid' }] };
  }

  const result = { seeded: [], skipped: [], details: [] };

  for (const def of DEFINITIONS) {
    // Determine the account runtime from the secret_key prefix (dual only).
    let accountRuntime = null;
    if (def.runtimeModel === 'dual_environment') {
      const secretRole = def.roles.find(r => r.drivesMode);
      accountRuntime = detectRuntimeFromValue(process.env[secretRole.env]) || 'test'; // default test if unknown
    }

    let api = await IntegratedApi.findOne({ slug: def.slug });
    const created = !api;
    if (!api) {
      api = new IntegratedApi({
        slug: def.slug,
        name: def.name,
        provider: def.provider,
        runtimeModel: def.runtimeModel,
        mode: def.runtimeModel === 'dual_environment' ? accountRuntime : 'test',
        credentials: []
      });
    }

    let added = 0;
    for (const r of def.roles) {
      const rawValue = String(process.env[r.env] || '').trim();
      if (!rawValue) continue; // no value to seed (e.g. missing prod key)

      let runtime = null;
      if (def.runtimeModel === 'dual_environment') {
        runtime = r.followsSecretRuntime ? accountRuntime : (detectRuntimeFromValue(rawValue) || accountRuntime);
      }

      // Idempotence: an ACTIVE credential already present for (role, runtime) → skip.
      const exists = (api.credentials || []).some(
        c => c.isActive === true && String(c.role).toLowerCase() === r.role && (c.runtime ?? null) === (runtime ?? null)
      );
      if (exists) continue;

      api.credentials.push({
        role: r.role,
        type: r.type,
        runtime,
        encryptedValue: encryptCredential(rawValue),
        lastFourChars: lastFour(rawValue),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      added += 1;
    }

    if (created || added > 0) {
      await api.save();
      result.seeded.push(def.slug);
      result.details.push({ slug: def.slug, created, credentialsAdded: added, mode: api.mode });
    } else {
      result.skipped.push(def.slug);
      result.details.push({ slug: def.slug, created: false, credentialsAdded: 0, mode: api.mode });
    }
  }

  console.log(`[seedIntegratedApis] seeded=[${result.seeded.join(', ')}] skipped=[${result.skipped.join(', ')}]`);
  return result;
}

export default seedIntegratedApisFromEnv;
