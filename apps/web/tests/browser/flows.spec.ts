import { MAX_TICKET_ODDS } from '@myodd/shared';
import { expect, test, type Page } from '@playwright/test';

const slip = { id: 'test-slip', bookingCode: 'TEST123', shareUrl: '', totalOdds: 4, confidence: .6, riskLevel: 'LOWER', selectionCount: 1, expiresAt: null, displayStatus: 'ACTIVE', result: 'PENDING', playStatus: 'OPEN', selections: [{ homeTeam: 'Test Home', awayTeam: 'Test Away', league: 'Test League', marketName: 'Total goals', selectionName: 'Over 1.5', odds: 4, result: 'PENDING', playStatus: 'UPCOMING', kickoffAt: null }] };
const outcome = { requestId: 'test-request', status: 'partial_success', requested: 10, generated: 1, failed: 9, errors: [{ code: 'SHORTAGE', message: 'Fewer unique selections are available.', retryable: false }] };
const job = { id: 'test-job', status: 'COMPLETED', total: 1, progress: 1, failedCount: 0, groupId: 'test-group', publicId: 'test-group', error: null, outcome };
const group = { id: 'test-group', publicId: 'test-group', title: 'Test Collection', isOwner: false, isPublic: true, userSaved: true, slips: [slip], job, counts: { lower: 1, moderate: 0, higher: 0 }, createdAt: new Date().toISOString() };

async function mockApi(page: Page) {
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    const value = path.includes('/slips/markets') ? { version: 1, options: [{ id: 'goals.over.1.5', label: 'Over 1.5', category: 'Total Goals', available: true }] }
      : path.includes('/jobs/') ? job : path === '/api/groups/public' ? [] : path.includes('/groups/test-group') ? group : path.includes('/codes/') ? slip : { preferences: null };
    return route.fulfill({ json: value });
  });
}
test('Create generates with standalone modes and opens the result page', async ({ page }) => {
  await mockApi(page);
  let payload: Record<string, unknown> = {};
  await page.route('**/api/slips/generate-from-prompt', route => { payload = route.request().postDataJSON(); return route.fulfill({ status: 202, json: { jobId: 'test-job', groupId: 'test-group', publicId: 'test-group' } }); });
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Investor Mode Recommended/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /Gambler Mode Medium risk/ }).click();
  await page.locator('textarea').fill('Generate 5 tickets using over 1.5 targeting around 15 odds');
  await page.locator('textarea').press('ControlOrMeta+Enter');
  await expect(page).toHaveURL(/\/result\/test-group/);
  await expect(page.getByRole('heading', { name: 'Partial success' })).toBeVisible();
  expect(payload.riskMode).toBe('GAMBLER'); expect(payload.ticketCount).toBe(5); expect(payload.requestId).toMatch(/^[a-f0-9-]{36}$/);
});
test('copying a code does not open details, and each card has one result badge', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']); await mockApi(page);
  await page.goto('/result/test-group?job=test-job');
  await page.getByRole('button', { name: 'Copy code TEST123' }).click();
  await expect(page.getByText('Code copied!', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('TEST123');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.code-card .play-chip')).toHaveCount(1);
  await page.getByRole('button', { name: 'Open TEST123 details' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close picks' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]'))).toBe(true);
  await expect(page.getByText(/Settlement: Pending/).first()).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open TEST123 details' })).toBeFocused();
});
test('loaded tickets survive a subsequent API failure', async ({ page }) => {
  await mockApi(page); await page.goto('/result/test-group?job=test-job');
  await expect(page.getByRole('button', { name: 'Copy code TEST123' })).toBeVisible();
  await page.route('**/api/groups/test-group', route => route.fulfill({ status: 503, json: { message: 'Temporary provider error' } }));
  await page.getByRole('button', { name: 'Check results', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Results could not refresh' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'Copy code TEST123' })).toBeVisible();
});
test('failed initial results show an actionable error rather than a blank page', async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ status: 404, json: { message: 'This booking code is unavailable.' } }));
  await page.goto('/result/missing?job=missing');
  await expect(page.getByRole('heading', { name: 'Results could not refresh' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
});
test('settings have no theme controls and ignore old saved themes and OS appearance', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('myodd-ui-settings-v1', JSON.stringify({ theme: 'light' })));
  await page.emulateMedia({ colorScheme: 'light' }); await page.goto('/settings');
  await expect(page.getByRole('combobox', { name: 'Theme', exact: true })).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveAttribute('data-theme');
  const background = await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('body')).toHaveCSS('background-color', background);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('myodd-ui-settings-v1') || '{}').theme)).toBeUndefined();
});
test('market selection survives navigation', async ({ page }) => {
  await mockApi(page); await page.goto('/generate'); await page.getByRole('button', { name: /^Options/ }).click(); await page.getByRole('button', { name: /^Markets/ }).click();
  await page.getByLabel('Over 1.5', { exact: true }).check();
  await page.goto('/settings'); await page.goto('/generate');
  await page.getByRole('button', { name: /^Options/ }).click(); await page.getByRole('button', { name: /^Markets/ }).click(); await expect(page.getByLabel('Over 1.5', { exact: true })).toBeChecked();
});
test('unified save uses one request with editable title and optional public visibility', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('fixture-account', 'test-owner'));
  const saves: unknown[] = [];
  await page.route('**/api/account/settings', route => route.fulfill({ json: { settings: null } }));
  await page.route('**/api/account/saves/**', route => { saves.push(route.request().postDataJSON()); return route.fulfill({ json: { saved: true } }); });
  await page.goto('http://127.0.0.1:3101/collection-fixture');
  await page.getByRole('button', { name: 'Save Collection', exact: true }).click();
  await expect(page.getByLabel('Make this collection public')).not.toBeChecked();
  await page.getByLabel('Collection title').fill('My Weekend Picks');
  await page.getByLabel('Make this collection public').check();
  await page.getByRole('dialog').getByRole('button', { name: 'Save Collection', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(saves).toEqual([{ title: 'My Weekend Picks', isPublic: true }]);
});
test('save draft inputs survive the sign-in round trip', async ({ page }) => {
  await page.route('**/api/account/settings', route => route.fulfill({ json: { settings: null } }));
  await page.goto('http://127.0.0.1:3101/collection-fixture');
  await page.getByRole('button', { name: 'Save Collection', exact: true }).click();
  await page.getByLabel('Collection title').fill('Keep this title'); await page.getByLabel('Make this collection public').check();
  await page.getByRole('link', { name: 'Sign in to save' }).click();
  await page.evaluate(() => localStorage.setItem('fixture-account', 'test-owner'));
  await page.goto('http://127.0.0.1:3101/collection-fixture');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByLabel('Collection title')).toHaveValue('Keep this title');
  await expect(page.getByLabel('Make this collection public')).toBeChecked();
});
test('dismiss all removes visible notifications permanently across rerenders', async ({ page }) => {
  await page.goto('http://127.0.0.1:3101/toasts-fixture');
  await page.getByRole('button', { name: 'First toast' }).click(); await page.getByRole('button', { name: 'Second toast' }).click();
  await page.getByRole('button', { name: 'Dismiss all' }).click(); await expect(page.locator('.toast-item')).toHaveCount(0);
  await page.getByRole('button', { name: 'First toast' }).click(); await expect(page.locator('.toast-item')).toHaveCount(1);
});
for (const width of [320, 375, 767, 768, 1023, 1280]) {
  test(`major screens fit a ${width}px viewport`, async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height: 900 }); await mockApi(page);
    for (const path of ['/', '/generate', '/history', '/settings', '/result/test-group?job=test-job', '/code/TEST123']) {
      await page.goto(path); await expect(page.locator('main')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const overflowing = await page.locator('button:visible, input:visible, textarea:visible, select:visible').evaluateAll(nodes => nodes.filter(node => { const r = node.getBoundingClientRect(); return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1); }).map(node => node.textContent?.slice(0, 50)));
      expect(overflowing).toEqual([]);
      if (width === 375 && (path === '/generate' || path.startsWith('/result'))) await page.screenshot({ path: testInfo.outputPath(`${path === '/generate' ? 'generate' : 'results'}.png`), fullPage: true });
    }
  });
}

test('restored navigation, footer version, and compact options match each mode', async ({ page }) => {
  await mockApi(page); await page.goto('/');
  await expect(page.locator('.app-nav-desktop a')).toHaveText(['Create', 'Live', 'Predictions', 'Codes']);
  await expect(page.locator('.site-footer > :last-child')).toHaveClass('footer-version');
  for (const [name, min, max] of [['Investor Mode', '2', '5'], ['Gambler Mode', '5.01', '20'], ['Japa Mode', '20.01', '100'], ['Lagoslife Mode', '100.01', String(MAX_TICKET_ODDS)]]) {
    await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
    await page.getByRole('button', { name: /^Options/ }).click();
    const options = page.getByRole('dialog', { name: 'Generation options' });
    await expect(options.getByText('Matches', { exact: true })).toHaveCount(0);
    await expect(options.getByLabel('Min', { exact: true })).toHaveValue(min);
    await expect(options.getByLabel('Max', { exact: true })).toHaveAttribute('max', max);
    await expect(options.getByRole('region', { name: 'Markets', exact: true })).toBeVisible();
    await expect(options.getByRole('group', { name: 'Odds presets' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Close options' }).click();
  }
});
test('successful collections show codes without routine success and policy banners', async ({ page }) => {
  await mockApi(page);
  await page.route('**/api/groups/test-group', route => route.fulfill({ json: { ...group, job: { ...job, outcome: { ...outcome, status: 'success', requested: 1, generated: 1, failed: 0, errors: [] } } } }));
  await page.goto('/g/test-group');
  await expect(page.getByRole('button', { name: 'Copy code TEST123' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Codes ready' })).toHaveCount(0);
  await expect(page.locator('.collection-retention, .public-collection-heading')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open TEST123 details' })).toHaveCSS('text-decoration-line', 'none');
});

test('markets load only when expanded, with searchable grouped rows', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 800 }); await mockApi(page);
  let reads = 0;
  await page.route('**/api/slips/markets', route => { reads++; return route.fulfill({ json: { version: 1, options: Array.from({ length: 18 }, (_, i) => ({ id: `test-${i}`, label: `Over ${i}.5`, category: i < 9 ? 'Total Goals' : 'First Half', available: i !== 2 })) } }); });
  await page.goto('/'); await page.getByRole('button', { name: /^Options/ }).click();
  await expect(page.getByRole('button', { name: /^Markets/ })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('searchbox', { name: 'Search markets' })).toHaveCount(0); expect(reads).toBe(0);
  await page.getByRole('button', { name: /^Markets/ }).click();
  await expect(page.getByRole('group', { name: 'Total Goals', exact: true })).toBeVisible();
  await expect(page.locator('.market-options label').filter({ hasText: 'Over 2.5' }).getByRole('checkbox')).toBeDisabled();
  const choices = page.getByRole('region', { name: 'Market choices' });
  expect(await choices.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('expanded-markets.png') });
  await page.getByRole('searchbox', { name: 'Search markets' }).fill('First Half');
  await expect(page.getByRole('group', { name: 'Total Goals', exact: true })).toHaveCount(0);
  await page.getByLabel('Over 9.5', { exact: true }).check();
  await page.getByRole('button', { name: /^Markets/ }).click();
  await expect(page.getByRole('searchbox')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Markets/ })).toContainText('1 selected');
});
for (const width of [320, 1280]) {
  test(`mode information points to each card and links to its full explanation at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 }); await mockApi(page); await page.goto('/');
    for (const [name, hash] of [['Investor Mode', 'mode-investor'], ['Gambler Mode', 'mode-gambler'], ['Japa Mode', 'mode-japa'], ['Lagoslife Mode', 'mode-lagos-life']]) {
      const info = page.getByRole('button', { name: `About ${name}`, exact: true });
      await info.click();
      const tip = page.getByRole('dialog', { name: `About ${name}`, exact: true });
      await expect(tip).toBeVisible(); await expect(tip).toBeFocused();
      await expect(tip.getByRole('link', { name: /Learn more/ })).toHaveAttribute('href', `/terms#${hash}`);
      await expect(info).toHaveAttribute('aria-expanded', 'true');
      await expect.poll(async () => tip.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; })).toBe(true);
      await expect.poll(async () => {
        const anchor = await info.boundingBox(); const bubble = await tip.boundingBox();
        if (!anchor || !bubble) return false;
        return Math.min(Math.abs(bubble.y - (anchor.y + anchor.height) - 10), Math.abs(anchor.y - (bubble.y + bubble.height) - 10)) < 3;
      }).toBe(true);
      if (name === 'Investor Mode') await page.screenshot({ path: testInfo.outputPath('mode-information.png') });
      await page.keyboard.press('Escape'); await expect(tip).toHaveCount(0); await expect(info).toBeFocused();
    }
    await page.goto('/terms#mode-japa');
    await expect(page.locator('#mode-japa')).toBeInViewport();
    await expect(page.getByRole('heading', { name: 'How mode settings are applied' })).toBeVisible();
  });
}

test('Create rejects more than ten tickets and retains fifty-game controls', async ({ page }) => {
  await mockApi(page); let submitted = false;
  await page.route('**/api/slips/generate-from-prompt', route => { submitted = true; return route.abort(); });
  await page.goto('/'); await page.getByRole('button', { name: /^Options/ }).click();
  await expect(page.getByLabel('Total tickets').locator('option')).toHaveCount(11);
  await expect(page.getByLabel('Games per ticket', { exact: true }).locator('option')).toHaveCount(51);
  await page.getByRole('button', { name: 'Close options' }).click();
  for (const prompt of ['Create 11 tickets', 'Create eleven tickets', 'Split ABC123 into 11 parts']) {
    await page.locator('textarea').fill(prompt); await page.locator('textarea').press('ControlOrMeta+Enter');
    await expect(page.getByText('You can generate up to 10 tickets at a time.').last()).toBeVisible();
    await expect(page.locator('textarea')).toHaveValue(prompt); expect(submitted).toBe(false);
    await page.getByRole('button', { name: 'Dismiss notification' }).last().click();
  }
});

test('generation shows progress before one concise terminal empty result', async ({ page }) => {
  await mockApi(page);
  const raw = '0 of 50 original matches have eligible pre-match markets; unavailable matches were skipped. Found 0 of 10 requested unique combinations within the search budget.';
  let running = true;
  const currentJob = () => ({ ...job, status: running ? 'RUNNING' : 'FAILED', stage: running ? 'GENERATING' : 'FAILED', stageDetail: raw, error: raw, outcome: { ...outcome, status: 'empty', generated: 0, failed: 10, errors: [{ code: 'SHORTAGE', message: raw, retryable: false }] } });
  await page.route('**/api/jobs/**', route => route.fulfill({ json: currentJob() }));
  await page.route('**/api/groups/test-group', route => route.fulfill({ json: { ...group, slips: [], job: currentJob(), generationReport: { notices: [raw] } } }));
  await page.goto('/result/test-group?job=test-job');
  await expect(page.getByText(/search budget|original matches have eligible/)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Unable to create codes' })).toHaveCount(0);
  await expect(page.locator('.progress-quest')).toBeVisible();
  running = false;
  await expect(page.getByText('No eligible matches were available for this request. Try another match day or adjust your options.')).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('link', { name: 'Adjust request', exact: true })).toHaveCount(1);
  await expect(page.getByText(/search budget|original matches have eligible|0 of 10/)).toHaveCount(0);
});

test('toasts expire, pause on hover and focus, and keep Undo usable', async ({ page }) => {
  await page.clock.install(); await page.goto('http://127.0.0.1:3101/toasts-fixture');
  await page.getByRole('button', { name: 'Ordinary toast', exact: true }).click();
  await page.clock.runFor(4900); await expect(page.locator('.toast-item')).toHaveCount(1);
  await page.clock.runFor(101); await expect(page.locator('.toast-item')).toHaveCount(0);
  await page.getByRole('button', { name: 'First toast', exact: true }).click();
  await page.clock.runFor(3000); await page.locator('.toast-item').hover();
  await page.clock.runFor(10000); await expect(page.locator('.toast-item')).toHaveCount(1);
  await page.mouse.move(0, 0); await page.getByRole('button', { name: 'Dismiss notification' }).focus();
  await page.clock.runFor(10000); await expect(page.locator('.toast-item')).toHaveCount(1);
  await page.getByRole('button', { name: 'First toast', exact: true }).focus();
  await page.clock.runFor(5100); await expect(page.locator('.toast-item')).toHaveCount(0);
  await page.getByRole('button', { name: 'Action toast', exact: true }).click();
  await page.clock.runFor(6000); await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByText('Undo completed')).toBeVisible(); await expect(page.locator('.toast-item')).toHaveCount(0);
  await page.getByRole('button', { name: 'Action toast', exact: true }).click();
  await page.clock.runFor(8100); await expect(page.locator('.toast-item')).toHaveCount(0);
  await page.getByRole('button', { name: 'First toast', exact: true }).click(); await page.getByRole('button', { name: 'Second toast', exact: true }).click();
  await page.getByRole('button', { name: 'Dismiss all' }).click(); await page.clock.runFor(20000); await expect(page.locator('.toast-item')).toHaveCount(0);
});

test('collection checking is in menus and bulk actions use only selected IDs', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('fixture-account', 'test-owner'));
  const collections = Array.from({ length: 12 }, (_, i) => ({ ...group, publicId: `collection-${i}`, title: `Collection ${i}`, isOwner: i !== 11, slipCount: 10 }));
  const checked: string[] = []; const removed: string[][] = []; const restored: string[] = [];
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/check-play')) { checked.push(path.split('/')[3]); return route.fulfill({ json: { summary: { tickets: 10, done: 0, open: 10, live: 0, unknown: 0 } } }); }
    if (path.endsWith('/collections/remove')) { const ids = route.request().postDataJSON().publicIds; removed.push(ids); return route.fulfill({ json: { removed: ids } }); }
    if (path.includes('/account/saves/')) { restored.push(path.split('/').at(-1)!); return route.fulfill({ json: { saved: true } }); }
    return route.fulfill({ json: path.endsWith('/account/settings') ? { settings: null } : collections });
  });
  await page.goto('http://127.0.0.1:3101/history-fixture');
  await expect(page.locator('.library-cards > li')).toHaveCount(12);
  await expect(page.getByRole('button', { name: 'Verify played', exact: true })).toHaveCount(0);
  await expect(page.locator('.library-verify-btn')).toHaveCount(0);
  await page.getByRole('button', { name: 'Actions for Collection 0', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Check results', exact: true }).click();
  await expect.poll(() => checked).toEqual(['collection-0']); checked.length = 0;
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Check results/ })).toHaveCount(0);
  await expect(page.getByLabel('Select Collection 11', { exact: true })).toHaveCount(0);
  await page.getByLabel('Select Collection 1', { exact: true }).check(); await page.getByLabel('Select Collection 3', { exact: true }).check();
  await page.getByRole('button', { name: 'Check results (2)', exact: true }).click();
  await expect.poll(() => checked).toEqual(['collection-1', 'collection-3']);
  await expect(page.getByLabel('Select Collection 1', { exact: true })).toBeChecked();
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Delete selected (2)', exact: true }).click();
  expect(removed).toEqual([]);
  await expect(page.getByLabel('Select Collection 1', { exact: true })).toBeChecked();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete selected (2)', exact: true }).click();
  await expect.poll(() => removed).toEqual([['collection-1', 'collection-3']]);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => restored.sort()).toEqual(['collection-1', 'collection-3']);
  for (const width of [320, 375, 767, 768, 1023, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const layout of ['Grid', 'Compact', 'List']) {
      await page.getByRole('button', { name: new RegExp(layout, 'i') }).click();
      const count = await page.locator('.library-cards').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
      expect(count).toBeLessThanOrEqual(layout === 'List' ? 1 : 4);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
});

test('ten existing tickets remain visible with at most five cards per row', async ({ page }, testInfo) => {
  await mockApi(page);
  const tickets = Array.from({ length: 10 }, (_, i) => ({ ...slip, id: `slip-${i}`, bookingCode: `TEST${100+i}` }));
  const complete = { ...job, outcome: { ...outcome, status: 'success', generated: 10, failed: 0, errors: [] } };
  await page.route('**/api/jobs/**', route => route.fulfill({ json: complete }));
  await page.route('**/api/groups/test-group', route => route.fulfill({ json: { ...group, slips: tickets, job: complete } }));
  for (const width of [320, 375, 767, 768, 1023, 1280]) {
    await page.setViewportSize({ width, height: 900 }); await page.goto('/result/test-group?job=test-job');
    await expect(page.locator('.code-card')).toHaveCount(10);
    expect(await page.locator('.code-grid').first().evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBeLessThanOrEqual(5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 1280) await page.screenshot({ path: testInfo.outputPath('five-ticket-columns.png'), fullPage: true });
  }
});
