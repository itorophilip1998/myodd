import { GenerateWorkspace } from '@/components/GenerateWorkspace';
import { SeoContent } from '@/components/SeoContent';
import { HOME_TITLE, HOME_DESCRIPTION, publicMetadata, siteUrl } from '@/lib/public-seo';

export const metadata = publicMetadata('/', HOME_TITLE, HOME_DESCRIPTION);
export default function HomePage() {
  const url = siteUrl().origin;
  const structuredData = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'Organization', '@id': `${url}/#organization`, name: 'MyOdd', url, logo: `${url}/icon.png` },
    { '@type': 'WebSite', '@id': `${url}/#website`, name: 'MyOdd', url, publisher: { '@id': `${url}/#organization` } },
    { '@type': 'SoftwareApplication', name: 'MyOdd', url, applicationCategory: 'UtilitiesApplication', operatingSystem: 'Web', description: HOME_DESCRIPTION, publisher: { '@id': `${url}/#organization` } },
  ] };
  return <><GenerateWorkspace seoContent={<SeoContent />} /><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }} /></>;
}
