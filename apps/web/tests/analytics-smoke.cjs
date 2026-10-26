// Production-like browser bundles. Google requests are always intercepted.
const path = require('node:path');
const esbuild = require('esbuild');
const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const webRoot = path.resolve(__dirname, '..');
const origin = 'http://127.0.0.1:3199';
const html = '<!doctype html><div id="root"></div><script src="/bundle.js"></script>';
async function bundle(mode = 'production', configured = true) {
  const result = await esbuild.build({
    stdin: { contents: `import React, { StrictMode } from 'react'; import { createRoot } from 'react-dom/client';
      import { Analytics } from './src/components/Analytics';
      import { track, trackOnce, entryAttribution } from './src/lib/analytics';
      import { beginAuthFlow, completeAuthFlow } from './src/lib/auth-analytics';
      Object.assign(window, { smokeTrack: track, smokeTrackOnce: trackOnce, smokeAttribution: entryAttribution, beginAuthFlow, completeAuthFlow });
      window.smokeNavigate = path => { history.pushState({}, '', path); window.dispatchEvent(new Event('test-navigation')); };
      createRoot(document.getElementById('root')).render(<StrictMode><Analytics /></StrictMode>);`, loader: 'tsx', resolveDir: webRoot },
    tsconfig: path.join(webRoot, 'tsconfig.json'), bundle: true, write: false, format: 'iife', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': JSON.stringify(mode), 'process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID': JSON.stringify(configured ? 'G-MYODDTEST1' : ''), 'process.env.NEXT_PUBLIC_GA_MANUAL_EVENTS_CONFIRMED': '"true"' },
    plugins: [{ name: 'test-pathname', setup(build) {
      build.onResolve({filter: /^next\/navigation$/}, () => ({path: 'test-pathname', namespace: 'test'}));
      build.onLoad({filter: /.*/, namespace: 'test'}, () => ({contents: `import { useSyncExternalStore } from 'react'; const subscribe = fn => { window.addEventListener('test-navigation', fn); return () => window.removeEventListener('test-navigation', fn); }; export const usePathname = () => useSyncExternalStore(subscribe, () => location.pathname);`, loader: 'js', resolveDir: webRoot}));
      build.onResolve({filter: /^next\/link$/}, () => ({path: 'test-link', namespace: 'test-link'}));
      build.onLoad({filter: /.*/, namespace: 'test-link'}, () => ({contents: `import React from 'react'; export default function Link(props) { return React.createElement('a', props); }`, loader: 'js', resolveDir: webRoot}));
    } }],
  });
  return result.outputFiles[0].text;
}
(async () => {
  const production = await bundle();
  const development = await bundle('development');
  const unconfigured = await bundle('production', false);
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    const context = await browser.newContext();
    await context.route(`${origin}/**`, route => route.fulfill({ contentType: route.request().url().endsWith('/bundle.js') ? 'text/javascript' : 'text/html', body: route.request().url().endsWith('/bundle.js') ? production : html }));
    let scripts = 0;
    await context.route('https://www.googletagmanager.com/**', route => { scripts++; return route.fulfill({contentType:'text/javascript',body:''}); });
    const page = await context.newPage();
    await page.goto(`${origin}/result/private-token?prompt=secret#booking-code`);
    await page.getByRole('button',{name:'No thanks',exact:true}).waitFor();
    assert.equal(await page.locator('#myodd-ga').count(),0);
    await page.evaluate(() => window.smokeTrack('generate_started'));
    assert.equal(await page.evaluate(() => (window.dataLayer ?? []).length),0);
    await page.getByRole('button',{name:'No thanks',exact:true}).click();
    await page.reload();
    await page.getByRole('button',{name:'Enable usage analytics',exact:true}).waitFor();
    assert.equal(scripts,0);
    await page.getByRole('button',{name:'Enable usage analytics',exact:true}).click();
    await page.waitForFunction(() => (window.dataLayer ?? []).some(x => x[0] === 'event' && x[1] === 'page_view'));
    const queue = await page.evaluate(() => window.dataLayer.map(x => Array.from(x)));
    assert.equal(queue.find(x => x[0] === 'config')[2].send_page_view,false);
    assert.deepEqual(queue.find(x => x[0] === 'consent' && x[1] === 'default')[2], {analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
    const view = queue.find(x => x[0] === 'event' && x[1] === 'page_view');
    assert.equal(view[2].page_path,'/result/generation');
    assert.equal(view[2].page_location,`${origin}/result/generation`);
    assert.equal(queue.filter(x => x[0] === 'event' && x[1] === 'page_view').length,1);
    assert.equal(JSON.stringify(queue).includes('private-token'),false);
    await page.evaluate(() => {
      window.smokeTrack('generate_completed',{requested:10,generated:8,failed:2,prompt:'secret',page_path:'/private-token'});
      window.smokeTrack('market_selected',{count:NaN,requested:-1,generated:'booking-code',failed:Infinity});
      window.smokeTrack('unknown-event',{count:1});
      window.smokeTrackOnce('collection_saved','private-collection',{count:1});
      window.smokeTrackOnce('collection_saved','private-collection',{count:1});
      window.smokeNavigate('/g/private-token?code=secret');
    });
    await page.waitForFunction(() => window.dataLayer.filter(x => x[0] === 'event' && x[1] === 'page_view').length === 2);
    await page.evaluate(() => window.smokeNavigate('/g/private-token?code=another-secret'));
    await page.waitForTimeout(100);
    const events = await page.evaluate(() => window.dataLayer.filter(x => x[0] === 'event').map(x => Array.from(x)));
    assert.equal(events.filter(x => x[1] === 'page_view').length,2);
    assert.equal(events.filter(x => x[1] === 'collection_saved').length,1);
    assert.equal(events.some(x => x[1] === 'unknown-event'),false);
    assert.equal(events.find(x => x[1] === 'generate_completed')[2].requested,10);
    const invalid = events.find(x => x[1] === 'market_selected')[2];
    for (const key of ['count','requested','generated','failed']) assert.equal(key in invalid,false);
    assert.equal(JSON.stringify(events).includes('secret'),false);
    assert.equal(JSON.stringify(events).includes('private-collection'),false);
    // Explicit auth flow only; no session-restoration login or duplicate events.
    await page.evaluate(() => {
      window.completeAuthFlow({id:'restored-session',createdAt:new Date(Date.now()-60000)},new Date(0));
      window.beginAuthFlow();
      const createdAt = new Date();
      window.completeAuthFlow({id:'new-registration',createdAt},createdAt);
      window.completeAuthFlow({id:'new-registration',createdAt},createdAt);
      window.beginAuthFlow();
      window.completeAuthFlow({id:'new-login',createdAt:new Date()},new Date(0));
    });
    assert.equal(await page.evaluate(() => window.dataLayer.filter(x => x[0] === 'event' && x[1] === 'sign_up').length),1);
    assert.equal(await page.evaluate(() => window.dataLayer.filter(x => x[0] === 'event' && x[1] === 'login').length),1);
    // Revocation propagates to other tabs and stops all new application events.
    const other = await context.newPage();
    await other.goto(`${origin}/`);
    await other.getByRole('button',{name:'Disable usage analytics',exact:true}).waitFor();
    await other.getByRole('button',{name:'Disable usage analytics',exact:true}).click();
    await page.getByRole('button',{name:'Enable usage analytics',exact:true}).waitFor();
    const count = await page.evaluate(() => window.dataLayer.filter(x => x[0] === 'event').length);
    await page.evaluate(() => window.smokeTrack('generate_started'));
    assert.equal(await page.evaluate(() => window.dataLayer.filter(x => x[0] === 'event').length),count);
    assert.equal(await page.evaluate(() => window['ga-disable-G-MYODDTEST1']),true);
    const before = scripts;
    await page.getByRole('button',{name:'Enable usage analytics',exact:true}).click();
    await page.waitForFunction(() => window.dataLayer.filter(x => x[0] === 'event' && x[1] === 'page_view').length === 3);
    assert.equal(scripts,before);
    // Source data is minimized on public entry pages and discarded elsewhere.
    await page.evaluate(() => {
      Object.defineProperty(document,'referrer',{configurable:true,value:'https://google.com/private-path?email=secret'});
      window.smokeNavigate('/?utm_source=google&utm_medium=organic&utm_campaign=launch&prompt=private');
    });
    assert.deepEqual(await page.evaluate(() => window.smokeAttribution()),{page_referrer:'https://google.com',campaign_source:'google',campaign_medium:'organic',campaign_name:'launch'});
    await page.evaluate(() => window.smokeNavigate('/?utm_campaign=PRIVATECODE&utm_source=person@example.com'));
    assert.deepEqual(await page.evaluate(() => window.smokeAttribution()),{page_referrer:'https://google.com'});
    await page.evaluate(() => window.smokeNavigate('/g/private-token?utm_source=google'));
    assert.deepEqual(await page.evaluate(() => window.smokeAttribution()),{});
    // A blocked tag does not break controls or throw into the application.
    await context.route('https://www.googletagmanager.com/**', route => route.abort());
    await page.reload();
    await page.getByText('Analytics could not load.',{exact:false}).waitFor();
    await page.getByRole('button',{name:'Disable usage analytics',exact:true}).click();
    // Tracking remains off for development and missing IDs.
    for (const source of [development, unconfigured]) {
      const off = await browser.newContext();
      await off.addInitScript(() => localStorage.setItem('myodd-analytics-consent','granted'));
      await off.route(`${origin}/**`, route => route.fulfill({contentType:route.request().url().endsWith('/bundle.js')?'text/javascript':'text/html',body:route.request().url().endsWith('/bundle.js')?source:html}));
      const disabled = await off.newPage(); await disabled.goto(origin);
      await disabled.waitForFunction(() => !!window.smokeTrack);
      assert.equal(await disabled.evaluate(() => window.smokeTrack('generate_started')),false);
      assert.equal(await disabled.locator('#myodd-ga').count(),0);
      await off.close();
    }
    await context.close();
    console.log('PASS: production consent, persistence, cross-tab withdrawal, StrictMode/navigation deduplication, payload filtering, auth outcomes, attribution minimization, blocked tags, and development/unconfigured isolation. Google delivery was mocked.');
  } finally { await browser.close(); }
})().catch(err => {console.error(err);process.exitCode=1;});
