const DEFAULT_APP_BASE_URL = 'http://localhost:4000';

export function getAppBaseUrl() {
  const candidate = String(process.env.APP_BASE_URL || '').trim();
  if (candidate) {
    return candidate.replace(/\/+$/, '');
  }
  return DEFAULT_APP_BASE_URL;
}

export function buildCommissionInvoiceDownloadUrl(invoiceId, token) {
  if (!invoiceId || !token) {
    return '';
  }
  const base = getAppBaseUrl();
  const encodedInvoiceId = encodeURIComponent(String(invoiceId));
  const encodedToken = encodeURIComponent(String(token));
  return `${base}/commission-invoice/${encodedInvoiceId}?token=${encodedToken}`;
}
