import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/public-seo';
export const dynamic = 'force-dynamic';
export default function robots(): MetadataRoute.Robots {
  // Let crawlers see noindex directives on public utility pages.
  return { rules: { userAgent: '*', allow: '/', disallow: ['/api/'] }, sitemap: new URL('/sitemap.xml', siteUrl()).href };
}
