// controllers/devDiagnosticController.js
// Dev-only diagnostics. Read-only views over observability data.
// PRIVACY: returns SendLog rows which contain NO email, token, or secret
// (recipient is a SHA-256 hash; no credentials are ever stored on SendLog).

import SendLog from '../models/SendLog.js';

const SAFE_FIELDS = [
  'channel', 'provider', 'templateKey', 'recipientHash', 'status',
  'providerMessageId', 'subject', 'contextType', 'contextId', 'metadata',
  'queuedAt', 'sentAt', 'deliveredAt', 'openedAt', 'bouncedAt',
  'errorCode', 'errorMessageSafe', 'createdAt', 'updatedAt'
].join(' ');

export async function getSendLogs(req, res) {
  try {
    const limit = Math.min(Math.max(Number(req.query?.limit) || 50, 1), 200);
    const filter = {};
    if (req.query?.status) filter.status = String(req.query.status);
    const logs = await SendLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .select(SAFE_FIELDS)
      .lean();
    return res.json({ ok: true, count: logs.length, logs });
  } catch (error) {
    console.error('[devDiagnostic] getSendLogs error', error?.message || error);
    return res.status(500).json({ ok: false, error: 'Erreur serveur.' });
  }
}

export default getSendLogs;
