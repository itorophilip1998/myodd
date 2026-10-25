import type { MetadataRoute } from 'next';
import { PUBLIC_ROUTES, siteUrl } from '@/lib/public-seo';
export const dynamic = 'force-dynamic';
export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map(path => ({ url: new URL(path, siteUrl()).href }));
}
