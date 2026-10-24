import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/public-seo';
export const dynamic = 'force-dynamic';
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', allow: ['/', '/g/'], disallow: ['/history', '/settings', '/result/', '/code/', '/sign-in', '/sign-up', '/api/'] }, sitemap: new URL('/sitemap.xml', siteUrl()).href };
}
