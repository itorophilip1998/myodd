// Validate the actual production build locally, with Clerk/GA off and a fixture API.
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('@playwright/test');
const root = path.resolve(__dirname, '..');
const origin = 'http://127.0.0.1:3210';
const canonical = 'https://myodd.org';
const token = 'c315TbfKdqoaKm_ZCFVUj_UGicyj8QmWpGurIdRyVzM';
(async () => {
  const api = http.createServer((req, res) => {
    res.setHeader('Content-Type','application/json');
    if (req.url === '/api/groups/public-example/public-metadata') return res.end(JSON.stringify({publicId:'public-example',title:'Public Example',createdAt:'2026-10-25T00:00:00Z'}));
    if (req.url === '/api/groups/temporary-failure/public-metadata') { res.statusCode = 503; return res.end('{}'); }
    res.statusCode = 404; res.end('{}');
  });
  await new Promise((resolve,reject) => { api.once('error',reject); api.listen(3211,'127.0.0.1',resolve); });
  let output = '';
  const server = spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','-p','3210','-H','127.0.0.1'], {
    cwd:root,env:{...process.env,NODE_ENV:'production',NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:'',CLERK_SECRET_KEY:'',PUBLIC_WEB_URL:canonical,GOOGLE_SITE_VERIFICATION:token,API_PROXY_TARGET:'http://127.0.0.1:3211'},stdio:['ignore','pipe','pipe'],
  });
  server.stdout.on('data',chunk=>{output+=chunk;});server.stderr.on('data',chunk=>{output+=chunk;});
  let browser;
  try {
    for (let attempt=0;attempt<100;attempt++) {
      if (server.exitCode !== null) throw new Error(`Production server exited: ${output}`);
      try { if ((await fetch(`${origin}/robots.txt`)).ok) break; } catch {}
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    browser = await chromium.launch({channel:'chrome',headless:true});
    const context = await browser.newContext({javaScriptEnabled:false});
    const page = await context.newPage();
    for (const route of ['/', '/about', '/faq', '/terms', '/privacy']) {
      const response=await page.goto(`${origin}${route}`);
      assert.equal(response.status(),200,route);
      assert.equal(await page.locator('h1').count(),1,route);
      assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'),`${canonical}${route === '/' ? '' : route}`);
      assert.equal(await page.locator('meta[name="google-site-verification"]').getAttribute('content'),token);
      assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'),'index, follow');
    }
    await page.goto(origin);
    assert.ok((await page.locator('article').innerText()).includes('How MyOdd works'));
    const data=JSON.parse(await page.locator('script[type="application/ld+json"]').innerText());
    assert.deepEqual(data['@graph'].map(item=>item['@type']),['Organization','WebSite','SoftwareApplication']);
    for (const route of ['/generate','/predictions','/history','/settings','/sign-in','/sign-up','/g/public-example']) {
      assert.equal((await page.goto(`${origin}${route}`)).status(),200,route);
      assert.match(await page.locator('meta[name="robots"]').getAttribute('content'),/noindex/);
    }
    assert.equal(await page.locator('meta[property="og:title"]').getAttribute('content'),'Public Example · myOdd');
    assert.equal((await fetch(`${origin}/g/missing`)).status,404);
    assert.equal((await fetch(`${origin}/g/temporary-failure`)).status,500);
    const sitemap=await (await fetch(`${origin}/sitemap.xml`)).text();
    assert.deepEqual([...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(match=>match[1]),['/','/about','/faq','/terms','/privacy'].map(route=>`${canonical}${route === '/' ? '' : route}`));
    assert.ok(!sitemap.includes('<lastmod>'));
    const robots=await (await fetch(`${origin}/robots.txt`)).text();
    assert.ok(robots.includes(`Sitemap: ${canonical}/sitemap.xml`));
    const social=await fetch(`${origin}/opengraph-image`);
    assert.equal(social.status,200);
    assert.match(social.headers.get('content-type'),/image\/png/);
    const png=Buffer.from(await social.arrayBuffer());
    assert.equal(png.readUInt32BE(16),1200);assert.equal(png.readUInt32BE(20),630);
    await fs.writeFile('/tmp/myodd-social-preview.png',png);
    await context.close();
    const mobile=await browser.newContext({viewport:{width:375,height:812},deviceScaleFactor:1,isMobile:true,hasTouch:true});
    const live=await mobile.newPage();
    await live.addInitScript(()=>{
      window.lab={lcp:0,cls:0};
      new PerformanceObserver(list=>{for(const entry of list.getEntries()) window.lab.lcp=entry.startTime;}).observe({type:'largest-contentful-paint',buffered:true});
      new PerformanceObserver(list=>{for(const entry of list.getEntries()) if(!entry.hadRecentInput) window.lab.cls+=entry.value;}).observe({type:'layout-shift',buffered:true});
    });
    await live.goto(origin);
    await live.locator('textarea').waitFor();
    await live.waitForTimeout(800);
    assert.equal(await live.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    const lab=await live.evaluate(()=>window.lab);
    await live.screenshot({path:'/tmp/myodd-home-mobile.png',fullPage:true});
    await mobile.close();
    console.log(JSON.stringify({result:'PASS',checks:'production server HTML, verification, canonicals, structured data, noindex, HTTP 404/500, sitemap, robots, social PNG, mobile overflow',localLab:{lcpMilliseconds:Math.round(lab.lcp),cls:lab.cls},screenshots:['/tmp/myodd-social-preview.png','/tmp/myodd-home-mobile.png'],note:'Local production build with fixture API. No field Core Web Vitals or live Google/Clerk delivery was measured.'},null,2));
  } finally {
    if(browser) await browser.close();
    if(server.exitCode===null) { server.kill('SIGTERM'); await once(server,'exit'); }
    await new Promise(resolve=>api.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
