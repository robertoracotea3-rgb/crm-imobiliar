import type { MetadataRoute } from 'next';

// CRM privat — blocăm complet indexarea pe crm.kiraimobiliare.ro.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', disallow: '/' },
  };
}
