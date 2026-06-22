import mongoose from 'mongoose';

import Theme from '../models/Theme.js';

const COLOR_KEYS = ['primary', 'secondary', 'background', 'surface', 'text'];
const DERIVED_KEYS = ['surfaceHeader', 'accent', 'accentStrong'];

function formatColor(value) {
  const candidate = String(value || '').trim();
  return candidate || null;
}

function normalizeAllColors(source = {}) {
  const normalized = {};
  for (const key of COLOR_KEYS) {
    const value = formatColor(source[key]);
    if (!value) {
      return null;
    }
    normalized[key] = value;
  }
  return normalized;
}

function normalizeDerivedTokens(source = {}, { allowPartial = false } = {}) {
  const normalized = {};
  let hasAny = false;
  for (const key of DERIVED_KEYS) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      hasAny = true;
      normalized[key] = formatColor(source[key]);
    } else if (!allowPartial) {
      normalized[key] = null;
    }
  }
  if (allowPartial && !hasAny) {
    return null;
  }
  return normalized;
}

function buildDerivedTokensObject(source = {}) {
  const normalized = {};
  for (const key of DERIVED_KEYS) {
    normalized[key] = formatColor(source[key]) || null;
  }
  return normalized;
}

function buildThemePayload(theme) {
  if (!theme) return null;
  return {
    id: theme._id?.toString(),
    name: theme.name,
    colors: theme.colors,
    derivedTokens: buildDerivedTokensObject(theme.derivedTokens),
    logoUrl: theme.logoUrl || '',
    slogan: theme.slogan || '',
    isActive: Boolean(theme.isActive),
    createdAt: theme.createdAt
  };
}

export async function listThemes(_req, res) {
  try {
    const themes = await Theme.find().sort({ createdAt: -1 }).lean();
    const payload = themes.map(buildThemePayload);
    return res.json({ ok: true, themes: payload });
  } catch (error) {
    console.error('Impossible de lister les themes', error);
    return res.status(500).json({ ok: false, error: 'Impossible de recuperer les themes.' });
  }
}

export async function createTheme(req, res) {
  const { name, colors, logoUrl, slogan, derivedTokens } = req.body || {};
  const normalizedName = String(name || '').trim();
  if (!normalizedName) {
    return res.status(400).json({ ok: false, error: 'Le nom du theme est requis.' });
  }
  const normalizedColors = normalizeAllColors(colors);
  if (!normalizedColors) {
    return res.status(400).json({ ok: false, error: 'Toutes les couleurs sont requises.' });
  }
  const normalizedDerivedTokens = normalizeDerivedTokens(derivedTokens || {});
  try {
    const existing = await Theme.findOne({ name: normalizedName }).lean();
    if (existing) {
      return res.status(409).json({ ok: false, error: 'Un theme porte deja ce nom.' });
    }
    const theme = await Theme.create({
      name: normalizedName,
      colors: normalizedColors,
      derivedTokens: normalizedDerivedTokens,
      logoUrl: String(logoUrl || '').trim(),
      slogan: String(slogan || '').trim()
    });
    return res.status(201).json({ ok: true, theme: buildThemePayload(theme.toObject()) });
  } catch (error) {
    console.error('Impossible de creer le theme', error);
    return res.status(500).json({ ok: false, error: 'Impossible de creer le theme.' });
  }
}

export async function updateTheme(req, res) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ ok: false, error: 'Identifiant invalide.' });
  }
  const { name, colors, logoUrl, slogan, derivedTokens } = req.body || {};
  try {
    const theme = await Theme.findById(id);
    if (!theme) {
      return res.status(404).json({ ok: false, error: 'Theme introuvable.' });
    }
    if (name) {
      const normalizedName = String(name).trim();
      if (normalizedName && normalizedName !== theme.name) {
        const taken = await Theme.findOne({ name: normalizedName, _id: { $ne: theme._id } }).lean();
        if (taken) {
          return res.status(409).json({ ok: false, error: 'Un theme porte deja ce nom.' });
        }
        theme.name = normalizedName;
      }
    }
    if (colors) {
      const normalizedColors = normalizeAllColors(colors);
      if (!normalizedColors) {
        return res.status(400).json({ ok: false, error: 'Toutes les couleurs sont requises.' });
      }
      theme.colors = normalizedColors;
    }
    if (derivedTokens) {
      const normalizedPatch = normalizeDerivedTokens(derivedTokens, { allowPartial: true });
      if (normalizedPatch) {
        theme.derivedTokens = {
          ...buildDerivedTokensObject(theme.derivedTokens),
          ...normalizedPatch
        };
      }
    }
    if (typeof logoUrl === 'string') {
      theme.logoUrl = logoUrl.trim();
    }
    if (typeof slogan === 'string') {
      theme.slogan = slogan.trim();
    }
    await theme.save();
    return res.json({ ok: true, theme: buildThemePayload(theme.toObject()) });
  } catch (error) {
    console.error('Impossible de mettre a jour le theme', error);
    return res.status(500).json({ ok: false, error: 'Impossible de mettre a jour le theme.' });
  }
}

export async function activateTheme(req, res) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ ok: false, error: 'Identifiant invalide.' });
  }
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const theme = await Theme.findById(id).session(session);
    if (!theme) {
      await session.abortTransaction();
      return res.status(404).json({ ok: false, error: 'Theme introuvable.' });
    }
    await Theme.updateMany({ isActive: true }, { isActive: false }, { session });
    theme.isActive = true;
    await theme.save({ session });
    await session.commitTransaction();
    return res.json({ ok: true, theme: buildThemePayload(theme.toObject()) });
  } catch (error) {
    await session.abortTransaction();
    console.error('Impossible d activer le theme', error);
    return res.status(500).json({ ok: false, error: 'Impossible d activer le theme.' });
  } finally {
    session.endSession();
  }
}

export async function getActiveTheme(_req, res) {
  try {
    const theme = await Theme.findOne({ isActive: true }).lean();
    return res.json({ ok: true, theme: buildThemePayload(theme) });
  } catch (error) {
    console.error('Impossible de charger le theme actif', error);
    return res.status(500).json({ ok: false, error: 'Impossible de charger le theme actif.' });
  }
}
