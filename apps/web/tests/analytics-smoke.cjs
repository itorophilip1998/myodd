// Test-only production bundle; Google requests are intercepted before any external delivery.
const path = require('node:path');
const webRoot = path.resolve(__dirname, '..');
const esbuild = require('esbuild');
const { chromium } = require('@playwright/test');
const http = require('node:http');
const assert = require('node:assert/strict');
(async () => {
  const built = await esbuild.build({
    stdin: { contents: `import React from 'react'; import { createRoot } from 'react-dom/client'; import { Analytics } from './src/components/Analytics'; import { track } from './src/lib/analytics'; window.smokeTrack = track; createRoot(document.getElementById('root')).render(<Analytics />);`, loader: 'tsx', resolveDir: webRoot },
    tsconfig: path.join(webRoot, 'tsconfig.json'),
    bundle: true, write: false, format: 'iife', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID': '"G-MYODDTEST1"', 'process.env.NEXT_PUBLIC_GA_MANUAL_EVENTS_CONFIRMED': '"true"' },
    plugins: [{ name: 'test-pathname', setup(build) { build.onResolve({filter: /^next\/navigation$/}, () => ({path: 'test-pathname', namespace: 'test'})); build.onLoad({filter: /.*/, namespace: 'test'}, () => ({contents: `export const usePathname = () => '/result/private-token';`, loader: 'js'})); } }],
  });
  const server = http.createServer((req,res) => {
    if (req.url === '/bundle.js') { res.setHeader('Content-Type','text/javascript'); res.end(built.outputFiles[0].text); }
    else { res.setHeader('Content-Type','text/html'); res.end('<div id="root"></div><script src="/bundle.js"></script>'); }
  });
  let browser;
  try {
    await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
    browser = await chromium.launch({channel:'chrome',headless:true});
    const page = await browser.newPage();
    let scripts = 0;
    await page.route('https://www.googletagmanager.com/**', route => { scripts++; return route.fulfill({contentType:'text/javascript',body:''}); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    await page.goto(`${origin}/result/private-token`);
    await page.getByRole('button',{name:'No thanks',exact:true}).waitFor();
    assert.equal(await page.locator('#myodd-ga').count(),0);
    await page.evaluate(() => window.smokeTrack('generate_started'));
    assert.equal(await page.evaluate(() => (window.dataLayer ?? []).length),0);
    await page.getByRole('button',{name:'No thanks',exact:true}).click();
    await page.getByRole('button',{name:'Enable usage analytics',exact:true}).waitFor();
    assert.equal(await page.locator('#myodd-ga').count(),0);
    await page.getByRole('button',{name:'Enable usage analytics',exact:true}).click();
    await page.waitForFunction(() => (window.dataLayer ?? []).some(x => x[0] === 'event' && x[1] === 'page_view'));
    const queue = await page.evaluate(() => window.dataLayer.map(x => Array.from(x)));
    const config = queue.find(x => x[0] === 'config');
    assert.equal(config[1],'G-MYODDTEST1');
    assert.equal(config[2].send_page_view,false);
    const view = queue.find(x => x[0] === 'event' && x[1] === 'page_view');
    assert.equal(view[2].page_path,'/result/generation');
    assert.equal(view[2].page_location,`${origin}/result/generation`);
    assert.equal(JSON.stringify(queue).includes('private-token'),false);
    await page.evaluate(() => window.smokeTrack('generate_completed',{requested:10,generated:8,failed:2}));
    assert.equal(await page.evaluate(() => window.dataLayer.filter(x => x[0] === 'event' && x[1] === 'generate_completed').length),1);
    await page.getByRole('button',{name:'Disable usage analytics',exact:true}).click();
    await page.getByRole('button',{name:'Enable usage analytics',exact:true}).waitFor();
    const count = await page.evaluate(() => window.dataLayer.filter(x => x[0] === 'event').length);
    await page.evaluate(() => window.smokeTrack('generate_started'));
    assert.equal(await page.evaluate(() => window.dataLayer.filter(x => x[0] === 'event').length),count);
    assert.equal(await page.evaluate(() => window['ga-disable-G-MYODDTEST1']),true);
    await page.getByRole('button',{name:'Enable usage analytics',exact:true}).click();
    await page.waitForFunction(() => window.dataLayer.filter(x => x[0] === 'event' && x[1] === 'page_view').length === 2);
    assert.equal(scripts,1);
    console.log('PASS: production Analytics waits for consent, respects denial/revocation, emits one sanitized page view per consent activation, records aggregate events, and loads its script once. Google script requests were mocked; real delivery requires the actual GA4 ID.');
  } finally { if(browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(err => {console.error(err);process.exitCode=1;});
