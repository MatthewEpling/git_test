// End-to-end checks in headless Chromium against the dev server.
//   npm run test:e2e        (screenshots go to test-results/)
// Plays the original stand-in campaign through the real UI: settlement → hunt → showdown
// (3D and 2D board clicks, keyboard) → aftermath → settlement → year 2, then save/resume,
// undo, content-pack import and narrow-screen layout.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shots = path.join(root, 'test-results');
mkdirSync(shots, { recursive: true });
const port = 5191;
const base = `http://localhost:${port}`;

const server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'pipe' });
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(base)).ok) break;
  } catch {
    // not up yet
  }
  await new Promise((r) => setTimeout(r, 500));
}

const results = [];
const errors = [];
async function check(name, fn) {
  const t = Date.now();
  try {
    await fn();
    results.push(`✓ ${name} (${Date.now() - t} ms)`);
  } catch (e) {
    results.push(`✗ ${name}: ${e.message.split('\n')[0]}`);
  }
}
const assert = (c, msg) => {
  if (!c) throw new Error(msg);
};

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
async function newPage(viewport = { width: 1440, height: 950 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return page;
}

const page = await newPage();
const phase = async () => (await page.locator('.topbar .phase').textContent())?.trim();
const title = async () => ((await page.locator('#decision-title').textContent()) ?? '').trim();
const options = () => page.locator('.decision .option:not(.is-disabled)');
async function clickOption(re) {
  const labels = await options().allTextContents();
  const i = labels.findIndex((l) => re.test(l));
  if (i < 0) throw new Error(`no enabled option matching ${re} in “${await title()}”: ${labels.map((l) => l.slice(0, 40)).join(' | ')}`);
  await options().nth(i).click();
}

/** One sensible step of play through the UI. */
async function step() {
  const t = await title();
  const labels = await options().allTextContents();
  const pick = (re) => labels.findIndex((l) => re.test(l));
  if (/^Move /.test(t)) {
    // Click the highlighted square nearest the monster on the 2D board, else from the list.
    const cells = page.locator('.decision .options.cells .option:not(.is-disabled)');
    const n = await cells.count();
    let best = 0;
    let bestD = 99;
    for (let i = 0; i < n; i++) {
      const tt = (await cells.nth(i).getAttribute('title')) ?? '';
      const dd = /adjacent/.test(tt) ? 1 : Number(/(\d+) from the monster/.exec(tt)?.[1] ?? 99);
      if (dd < bestD) {
        bestD = dd;
        best = i;
      }
    }
    await page.locator('.decision details summary').click();
    await cells.nth(best).click();
    return;
  }
  for (const re of [/^Depart with/, /^Attack with/, /^Move \(/, /^Dodge/, /^End .*activation/]) {
    const i = pick(re);
    if (i >= 0) return options().nth(i).click();
  }
  await options().first().click();
}

await check('title screen explains what the app is and isn’t', async () => {
  await page.goto(base);
  await page.getByRole('heading', { name: 'Lantern Table' }).waitFor();
  await page.getByText(/original stand-in content only/).waitFor();
  await page.screenshot({ path: `${shots}/title.png` });
});

await check('a new campaign starts in the settlement with four survivors', async () => {
  await page.getByLabel('Name').fill('E2E campaign');
  await page.locator('input[spellcheck="false"]').fill('e2e-seed-7');
  await page.getByRole('button', { name: 'Begin' }).click();
  await page.locator('#decision-title').waitFor();
  assert((await title()) === 'Departing survivors', `first decision is “${await title()}”`);
  assert((await page.locator('.sheet').count()) === 4, 'expected 4 survivor sheets');
});

await check('illegal choices are shown with the reason and cannot be picked', async () => {
  // Deselect everyone: “Depart” becomes unavailable with a reason.
  for (const name of ['Asha', 'Bren', 'Corin', 'Dova']) await clickOption(new RegExp(`^✔ ${name}`));
  const depart = page.locator('.decision .option', { hasText: 'Depart with 0 survivors' });
  await depart.getByText('Unavailable: Choose at least one survivor to depart.').waitFor();
  // Force the click past Playwright's own disabled check, to prove the app ignores it.
  await depart.click({ force: true });
  assert((await title()) === 'Departing survivors', 'a disabled option advanced the game');
  for (const name of ['Asha', 'Bren', 'Corin', 'Dova']) await clickOption(new RegExp(`^${name}`));
});

await check('the hunt resolves events automatically and reaches the showdown', async () => {
  await clickOption(/^Depart with 4/);
  await clickOption(/level 1/);
  for (let i = 0; i < 30 && (await phase()) !== 'showdown'; i++) await step();
  assert((await phase()) === 'showdown', 'never reached the showdown');
  assert((await page.locator('.entry', { hasText: /^HUNT|Hunt space/ }).count()) > 0, 'no hunt events in the log');
});

await check('the 3D board renders and stays up', async () => {
  await page.locator('.board3d canvas').waitFor({ timeout: 20000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${shots}/showdown-3d.png` });
  assert((await page.getByText('graphics context was lost').count()) === 0, 'the 3D board lost its graphics context');
});

await check('2D board: a highlighted square can be chosen with the keyboard to move', async () => {
  await page.getByRole('button', { name: '2D', exact: true }).click();
  await page.locator('.board2d svg').waitFor();
  for (let i = 0; i < 40 && !/activation$/.test(await title()); i++) await step();
  await clickOption(/^Move \(/);
  const squares = page.locator('.b2-move');
  assert((await squares.count()) > 0, 'no highlighted squares to move to');
  const before = await page.locator('.b2-survivor.active circle').getAttribute('cx');
  // Keyboard: focus a highlighted square and press Enter.
  await squares.last().focus();
  await page.keyboard.press('Enter');
  const after = await page.locator('.b2-survivor.active circle').getAttribute('cx').catch(() => null);
  assert(before !== after || (await title()).endsWith('activation'), 'moving via the board did nothing');
  await page.screenshot({ path: `${shots}/showdown-2d.png` });
});

await check('the showdown plays to a result and the aftermath gives rewards', async () => {
  for (let i = 0; i < 600 && (await phase()) === 'showdown'; i++) await step();
  assert((await phase()) !== 'showdown', 'showdown never ended');
  const log = (await page.locator('.log .entries').textContent()) ?? '';
  assert(/Victory|Defeat/.test(log), 'no showdown result in the log');
  if (/Victory/.test(log)) assert(/Rewards:/.test(log), 'victory without rewards');
});

await check('log entries explain why', async () => {
  const withWhy = page.locator('.log .entry details');
  assert((await withWhy.count()) > 5, 'few log entries carry an explanation');
  await withWhy.last().locator('summary').click();
  await withWhy.last().locator('.why').waitFor();
});

await check('settlement phase: unavailable actions say why, then the next year starts', async () => {
  assert((await phase()) === 'settlement', `phase is ${await phase()}`);
  await page.screenshot({ path: `${shots}/settlement.png` });
  const reasons = await page.locator('.decision .why-not').count();
  assert(reasons > 0, 'no disabled options with reasons in the settlement phase');
  await clickOption(/^End the settlement phase/);
  await page.locator('.topbar', { hasText: 'Year 2' }).waitFor();
});

await check('undo steps back one choice', async () => {
  const t = await title();
  await page.getByRole('button', { name: '↶ Undo' }).click();
  await page.waitForTimeout(200);
  assert((await title()) !== t || (await page.locator('.topbar', { hasText: 'Year 1' }).count()) > 0, 'undo changed nothing');
  await page.getByRole('button', { name: '↶ Undo' }).click();
});

await check('the campaign survives a reload and resumes at the same decision', async () => {
  await page.waitForFunction(() => document.querySelector('.save')?.textContent === 'Saved');
  const t = await title();
  const year = await page.locator('.topbar .title span').first().textContent();
  await page.reload();
  await page.getByRole('button', { name: 'E2E campaign', exact: true }).click();
  await page.locator('#decision-title').waitFor();
  assert((await title()) === t, `resumed at “${await title()}”, expected “${t}”`);
  assert((await page.locator('.topbar .title span').first().textContent()) === year, 'resumed in a different year');
});

await check('content packs: invalid files are rejected with reasons; valid ones are kept locally', async () => {
  await page.getByRole('button', { name: 'Menu' }).click();
  const bad = path.join(shots, 'bad-pack.json');
  writeFileSync(bad, JSON.stringify({ meta: { id: 'x' } }));
  await page.locator('label.file', { hasText: 'Import pack' }).locator('input').setInputFiles(bad);
  await page.getByText(/isn't a valid content pack/).waitFor();
  const good = JSON.parse(readFileSync(path.join(root, 'src/content/standin/pack.json'), 'utf8'));
  good.meta.id = 'my-test-pack';
  good.meta.name = 'My test pack';
  const goodPath = path.join(shots, 'good-pack.json');
  writeFileSync(goodPath, JSON.stringify(good));
  await page.locator('label.file', { hasText: 'Import pack' }).locator('input').setInputFiles(goodPath);
  await page.getByText(/Imported “My test pack”/).waitFor();
  await page.locator('.packs', { hasText: 'yours, stored locally' }).waitFor();
});

await check('narrow screens have no horizontal scroll', async () => {
  const phone = await newPage({ width: 390, height: 844 });
  await phone.goto(base);
  await phone.getByRole('heading', { name: 'Lantern Table' }).waitFor();
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert(overflow <= 0, `title overflows by ${overflow}px`);
  await phone.getByRole('button', { name: 'Begin' }).click();
  await phone.locator('#decision-title').waitFor();
  const overflow2 = await phone.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  await phone.screenshot({ path: `${shots}/phone.png`, fullPage: false });
  assert(overflow2 <= 0, `game screen overflows by ${overflow2}px`);
});

await browser.close();
server.kill();
console.log(results.join('\n'));
console.log(errors.length ? `\nBrowser errors:\n${errors.join('\n')}` : '\nNo browser errors.');
process.exit(results.some((r) => r.startsWith('✗')) || errors.length ? 1 : 0);
