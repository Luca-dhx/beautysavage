import { loadTemplate, saveTemplate, mailFunctions, simulateSaleEmail } from '../services/mailService.js';
import EmailTemplate from '../models/EmailTemplate.js';
import EmailTemplateCategory from '../models/EmailTemplateCategory.js';

const ALLOWED_FUNCTIONS = new Set(mailFunctions.map(value => value.toLowerCase()));

function normalize(value) {
  if (!value) return null;
  return String(value || '').trim().toLowerCase() || null;
}

function validateFunction(functionName) {
  const normalized = normalize(functionName);
  if (!normalized || !ALLOWED_FUNCTIONS.has(normalized)) {
    return null;
  }
  return normalized;
}

export async function getTemplate(req, res) {
  try {
    const functionName = validateFunction(req.query.functionName);
    if (!functionName) {
      return res.status(400).json({ ok: false, error: 'Fonction de template invalide.' });
    }
    const template = await loadTemplate(functionName);
    if (!template) {
      return res.status(404).json({ ok: false, error: 'Template introuvable.' });
    }
    return res.json({
      ok: true,
      template: {
        functionName: template.functionName,
        subject: template.subject,
        bodyHtml: template.bodyHtml,
        fullHtml: template.fullHtml,
        mode: template.mode || 'text',
        updatedAt: template.updatedAt
      }
    });
  } catch (error) {
    console.error('Erreur lecture template mail', error);
    return res.status(500).json({ ok: false, error: 'Impossible de lire le template.' });
  }
}

export async function saveTemplateController(req, res) {
  try {
    const functionName = validateFunction(req.body?.functionName);
    if (!functionName) {
      return res.status(400).json({ ok: false, error: 'Fonction de template invalide.' });
    }
    const subject = String(req.body?.subject || '').trim();
    const bodyHtml = String(req.body?.bodyHtml || '');
    const fullHtml = String(req.body?.fullHtml || '');
    const mode = String(req.body?.mode || 'text').trim().toLowerCase();
    const template = await saveTemplate(functionName, subject, bodyHtml, fullHtml, mode);
    // If there was an isMetadataOnly doc, mark it as no longer metadata-only
    await EmailTemplate.updateOne(
      { functionName, isMetadataOnly: true },
      { $set: { isMetadataOnly: false } }
    );
    return res.json({
      ok: true,
      template: {
        functionName: template.functionName,
        subject: template.subject,
        bodyHtml: template.bodyHtml,
        fullHtml: template.fullHtml,
        mode: template.mode || 'text',
        updatedAt: template.updatedAt
      }
    });
  } catch (error) {
    console.error('Erreur sauvegarde template mail', error);
    return res.status(500).json({ ok: false, error: 'Impossible de sauvegarder le template.' });
  }
}

export async function simulateSale(req, res) {
  try {
    const { sale, success } = await simulateSaleEmail();
    if (!sale) {
      return res.status(404).json({ ok: false, error: 'Aucune vente disponible pour la simulation.' });
    }
    if (!success) {
      return res.status(500).json({ ok: false, error: "Impossible d'envoyer le mail de simulation." });
    }
    return res.json({
      ok: true,
      saleId: sale.saleId,
      customer: {
        firstName: sale.customer?.firstName || '',
        lastName: sale.customer?.lastName || '',
        email: sale.customer?.email || ''
      }
    });
  } catch (error) {
    console.error('Erreur simulation vente mail', error);
    return res.status(500).json({ ok: false, error: 'Erreur lors de la simulation de vente.' });
  }
}

export async function listCategories(_req, res) {
  try {
    const categories = await EmailTemplateCategory.find().sort({ order: 1 }).lean();
    return res.json({ ok: true, categories });
  } catch (error) {
    console.error('Erreur lecture catégories templates', error);
    return res.status(500).json({ ok: false, error: 'Impossible de lire les catégories.' });
  }
}

export async function listTemplates(_req, res) {
  try {
    const [categories, templates] = await Promise.all([
      EmailTemplateCategory.find().sort({ order: 1 }).lean(),
      EmailTemplate.find({ functionName: { $in: Array.from(ALLOWED_FUNCTIONS) } })
        .lean()
    ]);

    const categoryMap = new Map(categories.map(c => [String(c._id), c]));

    // Build result grouped by category
    const templatesByCategory = new Map();
    for (const cat of categories) {
      templatesByCategory.set(String(cat._id), { category: cat, templates: [] });
    }
    const uncategorized = [];

    for (const tpl of templates) {
      if (!ALLOWED_FUNCTIONS.has(tpl.functionName)) continue;
      const catId = tpl.categoryId ? String(tpl.categoryId) : null;
      if (catId && templatesByCategory.has(catId)) {
        templatesByCategory.get(catId).templates.push({
          functionName: tpl.functionName,
          recipient: tpl.recipient || 'client',
          isMetadataOnly: tpl.isMetadataOnly || false,
          updatedAt: tpl.updatedAt || null,
          categoryId: tpl.categoryId
        });
      } else {
        uncategorized.push({
          functionName: tpl.functionName,
          recipient: tpl.recipient || 'client',
          isMetadataOnly: tpl.isMetadataOnly || false,
          updatedAt: tpl.updatedAt || null,
          categoryId: null
        });
      }
    }

    // Add ALLOWED_FUNCTIONS that have no DB doc yet
    const dbFunctions = new Set(templates.map(t => t.functionName));
    for (const fn of ALLOWED_FUNCTIONS) {
      if (!dbFunctions.has(fn)) {
        uncategorized.push({
          functionName: fn,
          recipient: 'client',
          isMetadataOnly: true,
          updatedAt: null,
          categoryId: null
        });
      }
    }

    const groups = [];
    for (const [, group] of templatesByCategory) {
      if (group.templates.length) {
        groups.push(group);
      }
    }
    if (uncategorized.length) {
      groups.push({ category: null, templates: uncategorized });
    }

    return res.json({ ok: true, groups });
  } catch (error) {
    console.error('Erreur liste templates mail', error);
    return res.status(500).json({ ok: false, error: 'Impossible de lister les templates.' });
  }
}

export async function updateTemplateCategory(req, res) {
  try {
    const functionName = validateFunction(req.params.functionName);
    if (!functionName) {
      return res.status(400).json({ ok: false, error: 'Fonction de template invalide.' });
    }
    const categoryId = req.body?.categoryId || null;
    const recipient = String(req.body?.recipient || 'client').toLowerCase();
    if (!['client', 'institute', 'both'].includes(recipient)) {
      return res.status(400).json({ ok: false, error: 'Destinataire invalide.' });
    }
    if (categoryId) {
      const cat = await EmailTemplateCategory.findById(categoryId).lean();
      if (!cat) {
        return res.status(404).json({ ok: false, error: 'Catégorie introuvable.' });
      }
    }
    await EmailTemplate.updateOne(
      { functionName },
      { $set: { categoryId: categoryId || null, recipient } },
      { upsert: true }
    );
    return res.json({ ok: true });
  } catch (error) {
    console.error('Erreur mise à jour catégorie template', error);
    return res.status(500).json({ ok: false, error: 'Impossible de mettre à jour la catégorie.' });
  }
}
