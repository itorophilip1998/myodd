// Exercise the real public session boundary with controlled Clerk hook states.
const { build } = require('esbuild');
const { chromium } = require('@playwright/test');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
(async () => {
  const result = await build({
    stdin: { contents: `import React, { useEffect } from 'react'; import { createRoot } from 'react-dom/client'; import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
      import { AccountSession } from './src/components/AccountSession'; import { api } from './src/lib/api';
      const client = new QueryClient();
      function PublicContent() { const query = useQuery({queryKey:['fixture-public'],queryFn:()=>api.publicGroups(1),retry:false}); useEffect(() => { void api.publicGroups(1).then(() => { document.getElementById('result').textContent = 'API ready'; }).catch(() => { document.getElementById('result').textContent = 'API denied'; }); }, []); return <><h1>Public football tools</h1><p id="result">Waiting for identity</p><p id="query">{query.isSuccess?'Query ready':query.isError?'Query denied':'Query waiting'}</p></>; }
      createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><AccountSession><PublicContent /></AccountSession></QueryClientProvider>);`, loader:'tsx',resolveDir:root },
    tsconfig: path.join(root,'tsconfig.json'),bundle:true,write:false,format:'iife',jsx:'automatic',
    define: {'process.env.NODE_ENV':'"production"','process.env.NEXT_PUBLIC_API_URL':'""','process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID':'""'},
    plugins:[{name:'controlled-clerk',setup(builder) {
      builder.onResolve({filter:/^@clerk\/nextjs$/},()=>({path:'clerk',namespace:'fixture'}));
      builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`import { useSyncExternalStore } from 'react';
        let state = { isLoaded:false, userId:null }; const token = async () => state.userId === 'no-token' ? null : 'fixture-token';
        const subscribe = cb => { window.addEventListener('fixture-auth',cb); return () => window.removeEventListener('fixture-auth',cb); };
        window.fixtureResolve = userId => { state = {isLoaded:true,userId}; window.dispatchEvent(new Event('fixture-auth')); };
        export const useAuth = () => ({...useSyncExternalStore(subscribe,()=>state),getToken:token});
        export const useSession = () => ({session:null}); export const useUser = () => ({user:null}); export const UserButton = () => null;`,loader:'js',resolveDir:root}));
      builder.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'link'}));
      builder.onLoad({filter:/.*/,namespace:'link'},()=>({contents:`import React from 'react'; export default props => React.createElement('a',props);`,loader:'js',resolveDir:root}));
    }}],
  });
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    for (const identity of [null,'fixture-user','no-token']) {
      const context = await browser.newContext();
      let requests = [];
      await context.route('http://127.0.0.1:3198/**', route => {
        const url = new URL(route.request().url());
        if (url.pathname.startsWith('/api/')) { requests.push({path:url.pathname,auth:route.request().headers().authorization}); return route.fulfill({json:url.pathname === '/api/groups/public'?[]:{settings:{}}}); }
        return route.fulfill({contentType:url.pathname === '/bundle.js'?'text/javascript':'text/html',body:url.pathname === '/bundle.js'?result.outputFiles[0].text:'<div id="root"></div><script src="/bundle.js"></script>'});
      });
      const page = await context.newPage(); await page.goto('http://127.0.0.1:3198/');
      await page.getByRole('heading',{name:'Public football tools'}).waitFor();
      assert.equal(await page.locator('#result').innerText(),'Waiting for identity');
      assert.equal(requests.length,0);
      await page.evaluate(id => window.fixtureResolve(id),identity);
      if (identity === 'no-token') {
        await page.getByText('API denied',{exact:true}).waitFor();
        await page.getByText('Query denied',{exact:true}).waitFor();
        assert.equal(requests.length,0);
        await context.close();
        continue;
      }
      await page.getByText('API ready',{exact:true}).waitFor();
      await page.getByText('Query ready',{exact:true}).waitFor();
      const call = requests.find(request => request.path === '/api/groups/public');
      assert.ok(call);
      assert.equal(call.auth,identity?'Bearer fixture-token':undefined);
      const next = identity ? null : 'next-user';
      const changed = page.waitForResponse(response => new URL(response.url()).pathname === '/api/groups/public');
      await page.evaluate(id => window.fixtureResolve(id),next);
      await changed;
      await page.getByText('Query ready',{exact:true}).waitFor();
      const latest = requests.filter(request => request.path === '/api/groups/public').at(-1);
      assert.equal(latest.auth,next?'Bearer fixture-token':undefined);
      await context.close();
    }
    console.log('PASS: public content renders during Clerk loading; API calls and queries wait for identity, use the resolved guest/authenticated session, refetch on sign-in/sign-out, and reject a missing signed-in token.');
  } finally { await browser.close(); }
})().catch(error=>{ console.error(error);process.exitCode=1; });
