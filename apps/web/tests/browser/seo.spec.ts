import { expect, test } from '@playwright/test';

const canonical = 'http://127.0.0.1:3100';
const token = 'c315TbfKdqoaKm_ZCFVUj_UGicyj8QmWpGurIdRyVzM';
test('public content and Google verification render without browser JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  for (const [path, heading] of [['/', 'Football booking codes.'], ['/about', 'About MyOdd'], ['/faq', 'MyOdd frequently asked questions'], ['/terms', 'Terms of Service'], ['/privacy', 'Privacy Policy']]) {
    const response = await page.goto(`${canonical}${path}`);
    expect(response?.status()).toBe(200);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toContainText(heading);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${canonical}${path === '/' ? '' : path}`);
    await expect(page.locator('meta[name="google-site-verification"]')).toHaveAttribute('content', token);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index, follow');
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', `${canonical}${path === '/' ? '' : path}`);
  }
  await page.goto(canonical);
  await expect(page.getByRole('heading', { name: 'How MyOdd works' })).toBeVisible();
  const schema = JSON.parse(await page.locator('script[type="application/ld+json"]').innerText());
  expect(schema['@graph'].map((value: { '@type': string }) => value['@type'])).toEqual(['Organization', 'WebSite', 'SoftwareApplication']);
  expect(JSON.stringify(schema)).not.toMatch(/aggregateRating|review|offers/);
  await context.close();
});

test('sitemap contains only durable canonical public routes and robots allows noindex discovery', async ({ request }) => {
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  expect(sitemap.headers()['content-type']).toContain('xml');
  const xml = await sitemap.text();
  const locations = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]);
  expect(locations).toEqual(['/', '/about', '/faq', '/terms', '/privacy'].map(path => `${canonical}${path === '/' ? '' : path}`));
  expect(xml).not.toContain('<lastmod>');
  const robots = await request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  expect(robots.headers()['content-type']).toContain('text/plain');
  expect(await robots.text()).toContain(`Sitemap: ${canonical}/sitemap.xml`);
  expect(await robots.text()).toContain('Disallow: /api/');
  expect(await robots.text()).not.toContain('Disallow: /g/');
});

test('utility pages are noindex and temporary public collections retain social previews', async ({ page }) => {
  for (const path of ['/generate', '/predictions', '/history', '/settings', '/sign-in', '/sign-up', '/g/test-group']) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  }
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', 'Test Collection · myOdd');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${canonical}/g/test-group`);
});

test('missing collection returns HTTP 404; backend outage remains a server error', async ({ request }) => {
  expect((await request.get('/g/missing')).status()).toBe(404);
  expect((await request.get('/g/temporary-failure')).status()).toBeGreaterThanOrEqual(500);
});

test('social image is a PNG and the public homepage fits mobile', async ({ page, request }) => {
  const social = await request.get('/opengraph-image');
  expect(social.status()).toBe(200);
  expect(social.headers()['content-type']).toContain('image/png');
  const png = await social.body();
  expect(png.readUInt32BE(16)).toBe(1200);
  expect(png.readUInt32BE(20)).toBe(630);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
