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
  expect(payload.riskMode).toBe('GAMBLER'); expect(payload.ticketCount).toBeUndefined(); expect(payload.requestId).toMatch(/^[a-f0-9-]{36}$/);
});
for (const systemMode of ['Investor', 'Gambler']) {
test(`${systemMode} Mode sends a system ticket for the selected match day`, async ({ page }) => {
  await mockApi(page);
  let payload: Record<string, unknown> = {};
  await page.route('**/api/slips/generate-from-prompt', route => { payload = route.request().postDataJSON(); return route.fulfill({ status: 202, json: { jobId: 'test-job', groupId: 'test-group', publicId: 'test-group' } }); });
  await page.goto('/');
  await page.getByRole('button', { name: new RegExp(`^${systemMode} Mode`) }).click();
  await expect(page.getByRole('button', { name: /^Options/ })).toHaveCount(0);
  await expect(page.getByTitle('Match days')).toBeVisible();
  await page.locator('textarea').fill('5 tickets between 4 and 5 odds, double chance, exactly 10 games');
  await page.locator('textarea').press('ControlOrMeta+Enter');
  await expect(page).toHaveURL(/\/result\/test-group/);
  expect(payload.riskMode).toBe(systemMode.toUpperCase());
  expect(payload.ticketCount).toBeUndefined();
  expect(payload.gamesPerTicket).toBeUndefined();
  expect(payload.minimumOdds).toBeUndefined();
  expect(payload.maximumOdds).toBeUndefined();
  expect(payload.selectedMarketIds).toEqual([]);
  expect(payload.operation).toBe('generate');
  expect(payload.matchDate).toEqual(expect.any(String));
  expect(String(payload.instruction)).toContain(`${systemMode} Mode system ticket`);
  expect(String(payload.instruction)).not.toContain('Generate 5 tickets');
  expect(String(payload.instruction)).not.toContain('Exactly 10 games');
});
}
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
  await expect(page.getByText('Reconnecting to updates. Your saved codes are below.')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'Copy code TEST123' })).toBeVisible();
});
test('failed initial results show an actionable error rather than a blank page', async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ status: 404, json: { message: 'This booking code is unavailable.' } }));
  await page.goto('/result/missing?job=missing');
  await expect(page.getByRole('heading', { name: 'Open your generation' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
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
  await mockApi(page); await page.goto('/generate');
  await page.getByRole('button', { name: /Japa Mode High risk/ }).click();
  await page.getByRole('button', { name: /^Options/ }).click(); await page.getByRole('button', { name: /^Markets/ }).click();
  await page.getByLabel('Over 1.5', { exact: true }).check();
  await page.goto('/settings'); await page.goto('/generate');
  await page.getByRole('button', { name: /Japa Mode High risk/ }).click();
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
  await expect(page.locator('.app-nav-desktop a')).toHaveText(['Create', 'Predictions', 'Codes']);
  await expect(page.locator('.site-footer > :last-child')).toHaveClass('footer-version');
  for (const [name, min, max] of [['Investor Mode', '3', '6'], ['Gambler Mode', '6.1', '20'], ['Japa Mode', '20.01', '100'], ['Lagoslife Mode', '100', null]] as const) {
    await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
    if (name === 'Investor Mode' || name === 'Gambler Mode') {
      await expect(page.getByRole('button', { name: /^Options/ })).toHaveCount(0);
      await expect(page.getByTitle('Match days')).toBeVisible();
      continue;
    }
    await page.getByRole('button', { name: /^Options/ }).click();
    const options = page.getByRole('dialog', { name: 'Generation options' });
    await expect(options.getByText('Matches', { exact: true })).toHaveCount(0);
    await expect(options.getByLabel('Min', { exact: true })).toHaveValue(min);
    if (max == null) await expect(options.getByLabel('Max', { exact: true })).not.toHaveAttribute('max');
    else await expect(options.getByLabel('Max', { exact: true })).toHaveAttribute('max', max);
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

test('markets use the bundled catalog without provider requests', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 800 }); await mockApi(page);
  let reads = 0;
  await page.route('**/api/slips/markets', route => { reads++; return route.fulfill({ json: { version: 1, options: Array.from({ length: 18 }, (_, i) => ({ id: `test-${i}`, label: `Over ${i}.5`, category: i < 9 ? 'Total Goals' : 'First Half', available: i !== 2 })) } }); });
  await page.goto('/');
  await page.getByRole('button', { name: /Japa Mode High risk/ }).click();
  await page.getByRole('button', { name: /^Options/ }).click();
  await expect(page.getByRole('button', { name: /^Markets/ })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('searchbox', { name: 'Search markets' })).toHaveCount(0); expect(reads).toBe(0);
  await page.getByRole('button', { name: /^Markets/ }).click();
  await expect(page.getByRole('group', { name: 'Total Goals', exact: true })).toBeVisible();
  await expect(page.getByLabel('Over 2.5', { exact: true })).toBeEnabled();
  expect(reads).toBe(0);
  const choices = page.getByRole('region', { name: 'Market choices' });
  expect(await choices.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('expanded-markets.png') });
  await page.getByRole('searchbox', { name: 'Search markets' }).fill('Double Chance');
  await expect(page.getByRole('group', { name: 'Total Goals', exact: true })).toHaveCount(0);
  await page.getByLabel('1X', { exact: true }).check();
  await page.getByRole('button', { name: /^Markets/ }).click();
  await expect(page.getByRole('searchbox')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Markets/ })).toContainText('1 selected');
  expect(reads).toBe(0);
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
  await page.goto('/');
  await page.getByRole('button', { name: /Japa Mode High risk/ }).click();
  await page.getByRole('button', { name: /^Options/ }).click();
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
  await page.route('**/api/groups/test-group', route => route.fulfill({ json: { ...group, slips: [], job: currentJob(), generationReport: { notices: [raw], diagnostics: { eligibleEvents: 0 } } } }));
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

test('result reads recover automatically after connection resets without submitting another generation', async ({ page }) => {
  await mockApi(page); let groupReads = 0; let jobReads = 0; let generations = 0;
  await page.route('**/api/slips/generate*', route => { generations++; return route.abort(); });
  await page.route('**/api/jobs/**', route => { jobReads++; return route.fulfill(jobReads <= 3 ? { status: 503, json: { message: 'ECONNRESET' } } : { json: job }); });
  await page.route('**/api/groups/test-group', route => { groupReads++; return route.fulfill(groupReads <= 3 ? { status: 503, json: { message: 'ECONNREFUSED' } } : { json: group }); });
  await page.goto('/result/test-group?job=test-job');
  await expect(page.getByText(/Reconnecting to your generation/).first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('button', { name: 'Copy code TEST123' })).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/ECONN|Results could not refresh/)).toHaveCount(0); expect(generations).toBe(0);
});
test('an unavailable job endpoint cannot hide a collection with completed tickets', async ({ page }) => {
  await mockApi(page); let reads = 0;
  await page.route('**/api/jobs/**', route => { reads++; return route.fulfill({ status: 503, json: { message: 'Service restarting' } }); });
  await page.goto('/result/test-group?job=test-job');
  await expect(page.getByRole('button', { name: 'Copy code TEST123' })).toBeVisible();
  await expect.poll(() => reads).toBeGreaterThanOrEqual(3);
  await expect(page.locator('.result-connection')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Results could not refresh/ })).toHaveCount(0);
});
test('terminal progress arriving before persisted tickets keeps fetching until codes load', async ({ page }) => {
  await mockApi(page); let reads = 0;
  const completed = { ...job, outcome: { ...outcome, status: 'success', generated: 1, requested: 1, failed: 0, errors: [] } };
  await page.route('**/api/jobs/**', route => route.fulfill({ json: completed }));
  await page.route('**/api/groups/test-group', route => { reads++; return route.fulfill({ json: { ...group, job: completed, slips: reads < 4 ? [] : [slip] } }); });
  await page.goto('/result/test-group?job=test-job');
  await expect(page.getByRole('button', { name: 'Copy code TEST123' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('heading', { name: 'Unable to create codes' })).toHaveCount(0);
});
test('fresh prompts do not inherit hidden original-only settings without a source code', async ({ page }) => {
  await mockApi(page); let payload: any;
  await page.addInitScript(() => localStorage.setItem('myodd-ui-settings-v1', JSON.stringify({ defaultsVersion: 3, defaultScope: 'original_only' })));
  await page.route('**/api/slips/generate-from-prompt', route => { payload = route.request().postDataJSON(); return route.fulfill({ status: 202, json: { jobId: 'test-job', groupId: 'test-group', publicId: 'test-group' } }); });
  await page.goto('/');
  await page.getByRole('button', { name: /Japa Mode High risk/ }).click();
  await page.locator('textarea').fill('Create two tickets'); await page.locator('textarea').press('ControlOrMeta+Enter');
  await expect(page).toHaveURL(/result/); expect(payload.bookingCode).toBeUndefined(); expect(payload.instruction).not.toContain('Only use the original matches');
  expect(payload.ticketCount).toBe(2);
});

test('saved collection reads reconnect after a temporary API restart', async ({ page }) => {
  await mockApi(page); let reads = 0;
  await page.route('**/api/groups/test-group', route => { reads++; return route.fulfill(reads <= 3 ? { status: 503, json: { message: 'Service restarting' } } : { json: group }); });
  await page.goto('/g/test-group');
  await expect(page.getByText('Reconnecting to your collection')).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('button', { name: 'Copy code TEST123' })).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('Collection not found.')).toHaveCount(0);
});


test('ready tickets hide progress even while the job is still running', async ({ page }) => {
  await mockApi(page);
  const runningJob = { ...job, status: 'RUNNING', stage: 'CREATING_BOOKINGS' };
  await page.route('**/api/jobs/**', route => route.fulfill({ json: runningJob }));
  await page.route('**/api/groups/test-group', route => route.fulfill({ json: { ...group, job: runningJob } }));
  await page.goto('/result/test-group?job=test-job');
  await expect(page.getByRole('button', { name: 'Copy code TEST123' })).toBeVisible();
  await expect(page.locator('.progress-quest, .logo-loader')).toHaveCount(0);
});

test('Live is removed and legal documents are centered', async ({ page }, testInfo) => {
  await mockApi(page);
  await page.goto('/privacy');
  await expect(page.getByRole('link', { name: 'Live', exact: true })).toHaveCount(0);
  for (const path of ['/privacy', '/terms']) {
    await page.goto(path);
    await expect(page.locator('.legal-page-head')).toHaveCSS('text-align', 'center');
    await expect(page.locator('.legal-page-head .eyebrow')).toHaveCSS('justify-content', 'center');
    await expect(page.locator('.legal-switch')).toHaveCSS('justify-content', 'center');
    const bounds = await page.locator('.legal-workspace').boundingBox();
    expect(Math.abs(bounds!.x + bounds!.width / 2 - (await page.evaluate(() => innerWidth)) / 2)).toBeLessThan(2);
  }
  await page.screenshot({ path: testInfo.outputPath('centered-legal.png'), fullPage: true });
  const response = await page.goto('/live');
  expect(response?.status()).toBe(404);
  const sitemap = await page.request.get('/sitemap.xml');
  expect(await sitemap.text()).not.toContain('/live');
});


test('Investor Mode rejects oversized prompts before submission', async ({ page }) => {
  await mockApi(page); let submitted = false;
  await page.route('**/api/slips/generate-from-prompt', route => { submitted = true; return route.abort(); });
  await page.goto('/');
  await page.locator('textarea').fill('Create fifty tickets');
  await page.locator('textarea').press('ControlOrMeta+Enter');
  await expect(page.getByText('You can generate up to 10 tickets at a time.').last()).toBeVisible();
  expect(submitted).toBe(false);
});


for (const maximum of ['5000000', '']) {
  test(`Lagoslife submits ${maximum || 'unlimited'} maximum odds without a hidden cap`, async ({ page }) => {
    await mockApi(page); let payload: Record<string, unknown> = {};
    await page.route('**/api/slips/generate-from-prompt', route => { payload = route.request().postDataJSON(); return route.fulfill({ status: 202, json: { jobId: 'test-job', groupId: 'test-group', publicId: 'test-group' } }); });
    await page.goto('/');
    await page.getByRole('button', { name: /Lagoslife Mode Super high risk/ }).click();
    await page.getByRole('button', { name: /^Options/ }).click();
    await expect(page.getByLabel('Min', { exact: true })).toHaveValue('100');
    await expect(page.getByLabel('Max', { exact: true })).not.toHaveAttribute('max');
    await page.getByLabel('Max', { exact: true }).fill(maximum);
    await page.getByRole('button', { name: 'Close options' }).click();
    await page.locator('textarea').fill('Create one ticket');
    await page.locator('textarea').press('ControlOrMeta+Enter');
    await expect(page).toHaveURL(/\/result\/test-group/, { timeout: 15000 });
    expect(payload.minimumOdds).toBe(100);
    expect(payload.maximumOdds).toBe(maximum ? Number(maximum) : null);
    expect(String(payload.instruction)).not.toContain('must not exceed 10000');
  });
}

test('Lagoslife expands compact prompt odds before submitting', async ({ page }) => {
  await mockApi(page); let payload: Record<string, unknown> = {};
  await page.route('**/api/slips/generate-from-prompt', route => { payload = route.request().postDataJSON(); return route.fulfill({ status: 202, json: { jobId: 'test-job', groupId: 'test-group', publicId: 'test-group' } }); });
  await page.goto('/');
  await page.getByRole('button', { name: /Lagoslife Mode Super high risk/ }).click();
  await page.locator('textarea').fill('Create one ticket from 100 to 5m odds');
  await page.locator('textarea').press('ControlOrMeta+Enter');
  await expect(page).toHaveURL(/\/result\/test-group/, { timeout: 15000 });
  expect(payload.minimumOdds).toBe(100); expect(payload.maximumOdds).toBe(5000000);
});


test('exact-odds shortage explains the constraint instead of claiming matches are missing', async ({ page }) => {
  await mockApi(page);
  const failed = { ...job, status: 'FAILED', outcome: { ...outcome, status: 'empty', generated: 0, failed: 10, errors: [{ code: 'SHORTAGE', message: 'No candidates within search budget.', retryable: false }] } };
  await page.route('**/api/jobs/**', route => route.fulfill({ json: failed }));
  await page.route('**/api/groups/test-group', route => route.fulfill({ json: { ...group, slips: [], job: failed, generationReport: { notices: [], diagnostics: { eligibleEvents: 101 }, effectiveConfig: { minimumOdds: 10000, maximumOdds: 10000 } } } }));
  await page.goto('/result/test-group?job=test-job');
  await expect(page.getByText('No tickets were found at exactly 10,000 odds. Use a wider odds range or adjust your options.')).toBeVisible();
  await expect(page.getByText(/No eligible matches/)).toHaveCount(0);
});

test('ticket stays active after menu dismissal, loading and reload until another ticket is selected', async ({ page }, testInfo) => {
  await mockApi(page);
  const tickets = [slip, { ...slip, id: 'second-slip', bookingCode: 'TEST456' }];
  await page.route('**/api/groups/test-group', route => route.fulfill({ json: { ...group, slips: tickets } }));
  await page.route('**/api/codes/TEST123/verify', route => route.fulfill({ json: { codes: ['TEST123'], unavailable: 0 } }));
  await page.addInitScript(() => { window.open = (() => ({ opener: null, close() {} })) as unknown as typeof window.open; });
  await page.goto('/result/test-group?job=test-job');
  const first = page.locator('.code-card').nth(0); const second = page.locator('.code-card').nth(1);
  await expect(first).toBeVisible();
  const inactiveBackground = await first.evaluate(el => getComputedStyle(el).backgroundColor);
  await first.getByRole('button', { name: 'Ticket actions', exact: true }).click();
  await expect(first).toHaveClass(/is-active-ticket/);
  await page.keyboard.press('Escape');
  await second.hover();
  await expect(first).toHaveClass(/is-active-ticket/);
  await expect(second).not.toHaveClass(/is-active-ticket/);
  await first.getByRole('button', { name: 'Ticket actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Load ticket', exact: true }).click();
  await expect(page.getByText('Opening SportyBet…')).toBeVisible();
  await expect(first).toHaveClass(/is-active-ticket/);
  await page.reload();
  await expect(first).toHaveClass(/is-active-ticket/);
  await second.getByRole('button', { name: 'Ticket actions', exact: true }).click();
  await expect(second).toHaveClass(/is-active-ticket/);
  await expect(first).not.toHaveClass(/is-active-ticket/);
  await expect(page.locator('.code-card.is-active-ticket')).toHaveCount(1);
  await expect(second).not.toHaveCSS('background-color', inactiveBackground);
  await page.keyboard.press('Escape');
  await page.mouse.move(0, 0);
  await page.screenshot({ path: testInfo.outputPath('active-ticket.png'), fullPage: true });
});

test('prediction performance distinguishes ticket wins, selection scores and the collecting state', async ({ page }) => {
  await mockApi(page);
  await page.route('**/api/learning/performance', route => route.fulfill({ json: {
    overall: { samples: 120, winRate: .8, brier: .15, logLoss: .4 }, baseline: { brier: .18 },
    tickets: { won: 2, lost: 8, void: 0, awaitingVerification: 1, winRate: .2 },
    byMode: [{ name: 'INVESTOR', samples: 120, winRate: .8, brier: .15 }], byModel: [],
    learning: { state: 'collecting', active: null, lastEvaluation: { reason: 'Collecting more verified outcomes before training.' } },
  } }));
  await page.goto('/predictions');
  const panel = page.locator('.prediction-performance');
  await panel.locator('summary').click();
  await expect(panel).toContainText('120 verified selections');
  await expect(panel).toContainText('80.0%');
  await expect(panel).toContainText('20.0%');
  await expect(panel).toContainText('Collecting verified outcomes');
  await expect(panel.getByRole('table', { name: 'Results by mode' })).toBeVisible();
});
