// End-to-end checks in headless Chromium against the dev server.
//   npm run test:e2e            (starts its own dev server)
//   E2E_URL=http://localhost:5173 npm run test:e2e
// Needs Playwright's Chromium: `npx playwright install chromium`.
import { chromium } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixtures = path.join(root, 'tests/fixtures');
const shots = process.env.E2E_SHOTS ?? path.join(root, 'test-results');
await mkdir(shots, { recursive: true });

let server;
let base = process.env.E2E_URL;
if (!base) {
  execFileSync(process.execPath, [path.join(root, 'scripts/prepare-core.mjs')], { stdio: 'inherit' });
  base = 'http://localhost:5179';
  server = spawn('npx', ['vite', '--port', '5179', '--strictPort'], { cwd: root, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

const results = [];
const errors = [];
async function check(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push(`✓ ${name} (${Date.now() - t0} ms)`);
  } catch (e) {
    results.push(`✗ ${name}: ${e.message.split('\n')[0]}`);
  }
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});

async function newPage(viewport = { width: 1400, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource|badge|media\.retroachievements/i.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  return page;
}

/** Fraction of non-black pixels in the visible game canvas. */
const litFraction = (page) =>
  page.evaluate(() => {
    const src = document.querySelector('canvas.display');
    const c = document.createElement('canvas');
    c.width = 160;
    c.height = 120;
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0, 160, 120);
    const d = g.getImageData(0, 0, 160, 120).data;
    let lit = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 40) lit++;
    return lit / (160 * 120);
  });

async function toolbar(page, name) {
  await page.mouse.move(300 + Math.random() * 50, 300);
  await page.getByRole('button', { name, exact: true }).first().click();
}

async function openGame(page, file) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose files' }).click();
  await (await chooser).setFiles(path.join(fixtures, file));
  await page.waitForSelector('.overlay-top', { timeout: 30000 });
  await page.waitForFunction(() => window.__dreamport?.session?.frameCount > 30, null, { timeout: 30000 });
}

// ───────────────────────── Home, BIOS, library, player ─────────────────────────
const page = await newPage();
await check('home renders', async () => {
  await page.goto(base);
  await page.getByRole('heading', { name: 'Drop a game here' }).waitFor();
  await page.screenshot({ path: `${shots}/home-desktop.png` });
});

await check('rejects a BIOS of the wrong size', async () => {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add BIOS files…' }).click();
  await (await chooser).setFiles({ name: 'dc_boot.bin', mimeType: 'application/octet-stream', buffer: Buffer.alloc(1000) });
  await page.getByText(/exactly 2,097,152 bytes/).waitFor();
});

await check('commercial disc without a BIOS explains what is needed', async () => {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('checkbox', { name: /Keep in my library/ }).uncheck();
  await page.getByRole('button', { name: 'Choose files' }).click();
  await (await chooser).setFiles({ name: 'Fake.chd', mimeType: 'application/octet-stream', buffer: Buffer.alloc(4096) });
  await page.getByText(/needs a Dreamcast BIOS/).waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: 'Back to library' }).click();
  await page.getByRole('checkbox', { name: /Keep in my library/ }).check();
});

await check('opens a homebrew game into the library and renders frames', async () => {
  await openGame(page, 'inputtest.elf');
  await page.waitForTimeout(1500);
  const lit = await litFraction(page);
  assert(lit > 0.05, `screen looks blank (${(lit * 100).toFixed(1)}% lit)`);
  const fps = await page.evaluate(() => window.__dreamport.session.frameCount);
  assert(fps > 30, 'emulation is not advancing');
  await page.screenshot({ path: `${shots}/player.png` });
});

await check('keyboard reaches the emulated controller', async () => {
  await page.locator('canvas.display').click();
  await page.keyboard.down('KeyK');
  await page.waitForTimeout(200);
  const pressed = await page.evaluate(() => window.__dreamport.session.input.state(0, 1, 0, 256));
  await page.keyboard.up('KeyK');
  assert(pressed & 1, `RetroPad B (Dreamcast A) not set: mask ${pressed}`);
});

await check('menu, save state and load state', async () => {
  await page.keyboard.press('Escape');
  await page.getByRole('navigation', { name: 'Game menu' }).waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${shots}/menu.png` });
  await page.getByRole('button', { name: /^Save state \(slot 1\)/ }).click();
  await page.getByText('Saved to slot 1.').waitFor({ timeout: 20000 });
  await toolbar(page, 'Save states');
  await page.getByRole('button', { name: 'Load slot 1' }).waitFor();
  await page.screenshot({ path: `${shots}/states.png` });
  await page.getByRole('button', { name: 'Load slot 1' }).click();
  await page.getByText('Loaded slot 1.').waitFor({ timeout: 20000 });
});

await check('filters compile and change the picture', async () => {
  await toolbar(page, 'Settings');
  for (const label of ['Sharp pixels', 'Sharp bilinear', 'Bicubic (Catmull-Rom)', 'Scanlines', 'LCD grid', 'FXAA (anti-aliasing)', 'Composite video', 'CRT']) {
    await page.getByRole('radio', { name: new RegExp(`^${label.replace(/[()]/g, '\\$&')}`) }).click();
    await page.waitForTimeout(120);
  }
  await page.getByRole('button', { name: 'Close' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${shots}/player-crt.png` });
});

await check('emulation and controls settings show the core options', async () => {
  await toolbar(page, 'Settings');
  await page.getByRole('tab', { name: 'Emulation' }).click();
  await page.getByLabel('Internal Resolution').waitFor();
  await page.getByLabel('Internal Resolution').selectOption('1280x960');
  await page.screenshot({ path: `${shots}/settings-emulation.png` });
  await page.getByRole('tab', { name: 'Controls' }).click();
  await page.getByLabel('Player 1 device').waitFor();
  await page.screenshot({ path: `${shots}/settings-controls.png` });
  await page.getByRole('button', { name: 'Close' }).click();
  await page.waitForTimeout(800);
  const lit = await litFraction(page);
  assert(lit > 0.05, 'blank after changing internal resolution');
});

await check('exit returns to the library and replays from it', async () => {
  await toolbar(page, 'Exit game');
  await page.getByRole('button', { name: /Play Inputtest/i }).waitFor({ timeout: 15000 });
  await page.screenshot({ path: `${shots}/library.png` });
  await page.getByRole('button', { name: /Play Inputtest/i }).click();
  await page.waitForFunction(() => window.__dreamport?.session?.frameCount > 30, null, { timeout: 30000 });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Exit game' }).last().click();
  await page.getByRole('heading', { name: 'Library' }).waitFor();
});

// ───────────────────────── Achievements (mocked RetroAchievements) ─────────────────────────
await check('achievements: sign in, identify, unlock', async () => {
  await page.route('**/ra/dorequest.php', async (route) => {
    const p = new URLSearchParams(route.request().postData() ?? '');
    const r = p.get('r');
    const body =
      r === 'login2'
        ? { Success: true, User: 'tester', Token: 'tok123', Score: 1234 }
        : r === 'gameid'
          ? { Success: true, GameID: 0 }
          : r === 'officialgameslist'
            ? { Success: true, Response: { 999: 'Achtest' } }
            : r === 'patch'
              ? {
                  Success: true,
                  PatchData: {
                    ID: 999,
                    Title: 'Achtest',
                    Achievements: [
                      { ID: 1, Title: 'Flag raised', Description: 'The test flag reaches 0x42', Points: 10, MemAddr: '0xH0103cc=66', BadgeName: '00000', Flags: 3 },
                      { ID: 2, Title: 'Long haul', Description: 'Counter reaches a million', Points: 25, MemAddr: 'M:0xX0103c8>=100000000', BadgeName: '00000', Flags: 3 },
                    ],
                  },
                }
              : r === 'unlocks'
                ? { Success: true, UserUnlocks: [] }
                : { Success: false, Error: 'unexpected' };
    await route.fulfill({ json: body });
  });
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('tab', { name: 'Achievements' }).click();
  await page.getByLabel('RetroAchievements username').fill('tester');
  await page.getByLabel('Password').fill('secret');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText('tester', { exact: true }).waitFor();
  await page.screenshot({ path: `${shots}/settings-achievements.png` });
  await page.getByRole('button', { name: 'Close' }).click();
  await openGame(page, 'achtest.elf');
  await page.waitForFunction(() => window.__dreamport.runner()?.views().length === 2, null, { timeout: 30000 });
  await page.waitForTimeout(300);
  // Raise the flag in emulated RAM, as the game would.
  await page.evaluate(() => (window.__dreamport.session.core.memory(2)[0x0103cc] = 0x42));
  await page.getByText('Flag raised (10)').waitFor({ timeout: 20000 });
  await toolbar(page, 'Achievements');
  await page.getByText('1 of 2 unlocked').waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${shots}/achievements.png` });
  await page.keyboard.press('Escape');
});

// ───────────────────────── Netplay (two browsers) ─────────────────────────
async function netplay(mode) {
  const hostPage = await newPage({ width: 1200, height: 800 });
  await hostPage.goto(base);
  await openGame(hostPage, 'inputtest.elf');
  await toolbar(hostPage, 'Online play');
  const guestPage = await newPage({ width: 1000, height: 700 });
  if (mode === 'room') {
    await hostPage.getByRole('button', { name: 'Host with a room code' }).click();
    const code = (await hostPage.locator('.code-box').textContent()).trim();
    assert(/^[A-Z0-9]{6}$/.test(code), `bad room code ${code}`);
    await hostPage.screenshot({ path: `${shots}/netplay-host.png` });
    await guestPage.goto(`${base}/#join=${code}`);
    await guestPage.getByLabel('Your name').fill('Bea');
    await guestPage.getByRole('button', { name: 'Join game' }).click();
  } else {
    await hostPage.getByText('No room server? Invite with codes instead').click();
    await hostPage.getByRole('button', { name: 'Create invite code' }).click();
    const invite = await hostPage.locator('textarea[readonly]').inputValue();
    await guestPage.goto(base);
    await guestPage.getByRole('button', { name: 'Use an invite code' }).click();
    await guestPage.getByLabel('Your name').fill('Cal');
    await guestPage.getByLabel('Invite code from the host').fill(invite);
    await guestPage.getByRole('button', { name: 'Create my reply code' }).click();
    const reply = await guestPage.locator('textarea[readonly]').inputValue();
    await hostPage.getByPlaceholder('DP1.…').fill(reply);
    await hostPage.getByRole('button', { name: 'Connect' }).click();
  }
  await guestPage.getByText('You are player 2').waitFor({ timeout: 30000 });
  await guestPage.waitForFunction(() => document.querySelector('video.display')?.videoWidth > 0, null, { timeout: 30000 });
  await guestPage.keyboard.down('KeyL'); // Dreamcast B = RetroPad A (bit 8)
  await hostPage.waitForFunction(() => (window.__dreamport.session.input.state(1, 1, 0, 256) & (1 << 8)) !== 0, null, { timeout: 10000 });
  await guestPage.keyboard.up('KeyL');
  await guestPage.screenshot({ path: `${shots}/netplay-guest-${mode}.png` });
  await hostPage.screenshot({ path: `${shots}/netplay-host-${mode}.png` });
  await hostPage.context().close();
  await guestPage.context().close();
}
await check('netplay via room code: stream + guest input', () => netplay('room'));
await check('netplay via invite codes (no server)', () => netplay('invite'));

// ───────────────────────── Mobile layout ─────────────────────────
await check('mobile home has no horizontal scroll', async () => {
  const m = await newPage({ width: 390, height: 844 });
  await m.goto(base);
  await m.getByRole('heading', { name: 'Drop a game here' }).waitFor();
  const wide = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  await m.screenshot({ path: `${shots}/home-mobile.png`, fullPage: true });
  assert(!wide, 'page scrolls sideways');
  await m.context().close();
});

await browser.close();
server?.kill();
console.log(results.join('\n'));
console.log(errors.length ? `\nBrowser errors:\n${[...new Set(errors)].slice(0, 20).join('\n')}` : '\nNo browser errors.');
process.exit(results.some((r) => r.startsWith('✗')) || errors.length ? 1 : 0);
