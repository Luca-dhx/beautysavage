export const getVendorConfig = () => ({
  name: process.env.INSTITUTE_NAME || 'Beauty Savage',
  email: process.env.INVOICE_CONTACT_EMAIL || process.env.MAIL_FROM,
  address: {
    line1: process.env.INSTITUTE_ADDRESS_LINE1,
    city: process.env.INSTITUTE_CITY,
    postal_code: process.env.INSTITUTE_POSTAL_CODE,
    country: process.env.INSTITUTE_COUNTRY || 'FR'
  },
  siret: process.env.INSTITUTE_SIRET,
  vatMention: process.env.INSTITUTE_VAT_MENTION || 'TVA non applicable, article 293B du CGI'
});
