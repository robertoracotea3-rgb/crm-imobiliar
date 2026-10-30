import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { isPublicWebsiteHost } from '@/lib/site-host';
export default async function robots(): Promise<MetadataRoute.Robots> { const host = (await headers()).get('host'); if (!isPublicWebsiteHost(host)) return { rules: [{ userAgent: '*', disallow: '/' }] }; return { rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/login', '/register', '/dashboard', '/properties/'] }], sitemap: 'https://www.kiraimobiliare.ro/sitemap.xml', host: 'https://www.kiraimobiliare.ro' }; }
