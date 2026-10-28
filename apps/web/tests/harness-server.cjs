// Test-only browser harness. No test routes, fake authentication, or fixtures ship in Next.js.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

(async () => {
  const result = await esbuild.build({
    entryPoints: [path.join(__dirname, 'harness.tsx')], bundle: true, write: false, format: 'iife', jsx: 'automatic',
    tsconfig: path.join(__dirname, '../tsconfig.json'),
    define: { 'process.env.NODE_ENV': '"development"', 'process.env.NEXT_PUBLIC_API_URL': '""', 'process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID': '""' },
    plugins: [{ name: 'fixture-session', setup(build) {
      build.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'fixture-router', namespace: 'router' }));
      build.onLoad({ filter: /.*/, namespace: 'router' }, () => ({ loader: 'js', contents: `export const useRouter = () => ({ push: url => { location.href = url; }, replace: url => { location.replace(url); } });` }));
      build.onResolve({ filter: /(?:^|\/)AccountSession$/ }, () => ({ path: 'fixture-session', namespace: 'fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ loader: 'js', resolveDir: path.join(__dirname, '..'), contents: `
        import { useState, useEffect } from 'react';
        export function SignInPrompt() { return null; }
        export function useAccountSession() {
          const read = () => localStorage.getItem('fixture-account') || '';
          const [id, set] = useState(read);
          useEffect(() => { const sync = () => set(read()); window.addEventListener('fixture-auth', sync); return () => window.removeEventListener('fixture-auth', sync); }, []);
          return { configured: true, signedIn: !!id, userId: id || null };
        }` }));
    } }],
  });
  http.createServer((req, res) => {
    // Server-side SEO requests cannot be intercepted with page.route().
    if (req.url === '/api/groups/test-group/public-metadata') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ publicId: 'test-group', title: 'Test Collection', createdAt: '2026-10-25T00:00:00Z' })); return; }
    if (req.url === '/api/groups/temporary-failure/public-metadata') { res.statusCode = 503; res.end('temporarily unavailable'); return; }
    if (req.url === '/harness.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(result.outputFiles[0].text); return; }
    if (req.url === '/harness.css') { res.setHeader('Content-Type', 'text/css'); res.end(fs.readFileSync(path.join(__dirname, '../src/app/globals.css'))); return; }
    if (req.url?.startsWith('/api/')) { res.setHeader('Content-Type', 'application/json'); res.statusCode = 404; res.end(JSON.stringify({ message: 'Test provider unavailable' })); return; }
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/harness.css"></head><body><div id="root"></div><script>window.process={env:{NODE_ENV:"development"}};</script><script src="/harness.js"></script></body></html>');
  }).listen(3101, '127.0.0.1');
})().catch(error => { console.error(error); process.exit(1); });
