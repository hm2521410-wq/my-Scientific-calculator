// End-to-end UI tests. Drives real pointer gestures (taps and flicks) against
// a locally served copy of the app.
//
//   npx http-server -p 8123 -c-1 .
//   node test/browser.mjs [http://127.0.0.1:8123]
//
// Requires Playwright: npm i -D playwright  (or a global install).

const BASE = process.argv[2] || 'http://127.0.0.1:8123';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('Playwright is not installed — skipping browser tests.');
  console.error('  npm i -D playwright && npx playwright install chromium');
  process.exit(0);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 412, height: 915 } });

const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE: ${m.text()}`); });

await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(250);

/** Press a key; `dir` other than 'center' performs a flick in that direction. */
async function press(id, dir = 'center') {
  const box = await page.locator(`[data-key-id="${id}"]`).boundingBox();
  if (!box) throw new Error(`no such key: ${id}`);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  if (dir !== 'center') {
    const [dx, dy] = { up: [0, -40], down: [0, 40], left: [-40, 0], right: [40, 0] }[dir];
    await page.mouse.move(cx + dx, cy + dy, { steps: 4 });
  }
  await page.mouse.up();
  await page.waitForTimeout(35);
}

const seq = async (...steps) => { for (const s of steps) await press(...(Array.isArray(s) ? s : [s])); };
const result = async () => (await page.locator('#result').innerText()).replace(/\s+/g, ' ').trim();

let passed = 0;
const failures = [];
async function check(name, steps, expect) {
  await press('ac');
  await steps();
  const got = await result();
  if (expect(got)) passed++;
  else failures.push(`${name}\n    got: ${got}`);
}

async function setAngle(label) {
  await press('mode', 'up');
  await page.waitForTimeout(180);
  await page.locator('.setup-opt', { hasText: label }).click();
  await page.waitForTimeout(120);
  await page.locator('.panel-close').click();
  await page.waitForTimeout(80);
}

// --- Degree mode ------------------------------------------------------------

await check('tap sequence 1+2×3', () => seq('n1', 'add', 'n2', 'mul', 'n3', 'eq'), (r) => r.startsWith('7'));
await check('fraction template 3/4+1/4', () =>
  seq('frac', 'n3', 'down', 'n4', 'right', 'add', 'frac', 'n1', 'down', 'n4', 'right', 'eq'), (r) => r.startsWith('1'));
await check('√8 shows the exact surd', () => seq('sqrt', 'n8', 'right', 'eq'), (r) => /2\s*√\s*2/.test(r));
await check('sin 30 in Deg', () => seq('sin', 'n3', 'n0', 'right', 'eq'), (r) => /1 2|0\.5/.test(r));
await check('flick ↑ reaches the SHIFT legend (x³)', () => seq('n2', ['sq', 'up'], 'eq'), (r) => r.startsWith('8'));
await check('flick ↑ on ×10ˣ inserts π', () => seq(['e10', 'up'], 'eq'), (r) => r.startsWith('π'));
await check('flick ↓ reaches the extra legend (sinh)', () =>
  seq(['sin', 'down'], 'n0', 'right', 'eq'), (r) => r.startsWith('0'));
await check('SHIFT key still works as a modifier', () => seq('shift', 'sq', 'n2', 'eq'), (r) => r.length > 0);
await check('DEL removes the last entry', () => seq('n1', 'n2', 'n3', 'del', 'eq'), (r) => r.startsWith('1 2'));
await check('Ans carries the previous result', () =>
  seq('n7', 'eq', 'add', 'ans', 'eq'), (r) => r.startsWith('1 4'));

// --- Equation solving -------------------------------------------------------

await check('quadratic solved from the = sign', () =>
  seq(['rparen', 'right'], 'sq', 'sub', 'n5', ['rparen', 'right'], 'add', 'n6', ['calc', 'right'], 'n0', 'eq'),
(r) => /X₁ = 2/.test(r) && /X₂ = 3/.test(r));

await check('SOLVE via flick ↑ on CALC', () =>
  seq(['rparen', 'right'], 'sq', 'sub', 'n9', ['calc', 'right'], 'n0', ['calc', 'up']),
(r) => /3/.test(r) && /−\s*3|-3/.test(r));

// --- Symbolic calculus ------------------------------------------------------

await check('symbolic ∫ of X²', () => seq(['rparen', 'right'], 'sq', ['integ', 'down']),
  (r) => /X\s*3\s*3/.test(r.replace(/[^\dX]/g, ' ').replace(/\s+/g, ' ')) || /X 3 3/.test(r));
await check('symbolic ∫ of 1/(X²+1)', () =>
  seq('n1', 'div', 'lparen', ['rparen', 'right'], 'sq', 'add', 'n1', 'right', ['integ', 'down']),
(r) => /tan⁻¹/.test(r));
await check('symbolic d/dx via flick ↑', () =>
  seq('sin', ['rparen', 'right'], 'right', 'mul', ['rparen', 'right'], ['ddx', 'up']),
(r) => /cos/.test(r) && /sin/.test(r));

// --- Radian mode ------------------------------------------------------------

await setAngle('Rad');
await check('numeric ∫ sin X dx from 0 to π', () =>
  seq('integ', 'n0', 'right', ['e10', 'up'], 'right', 'sin', ['rparen', 'right'], 'right', 'eq'),
(r) => r.startsWith('2'));
await check('Σ X² from 1 to 10', () =>
  seq('sigma', 'n1', 'right', 'n1', 'n0', 'right', ['rparen', 'right'], 'sq', 'eq'),
(r) => r.replace(/\s/g, '').startsWith('385'));
await check('d/dx X³ at 2', () =>
  seq('ddx', ['rparen', 'right'], 'sq', ['rparen', 'right'], 'right', 'n2', 'eq'),
(r) => r.replace(/\s/g, '').startsWith('12'));
await setAngle('Deg');

// --- Complex mode -----------------------------------------------------------

await press('n2', 'up');   // SHIFT+2 → CMPLX
await page.waitForTimeout(100);
await check('(1+ⅈ)² = 2ⅈ', () => seq('lparen', 'n1', 'add', ['eng', 'right'], 'right', 'sq', 'eq'),
  (r) => /2\s*ⅈ/.test(r));
await check('S⇔D switches to polar form', () =>
  seq('lparen', 'n1', 'add', ['eng', 'right'], 'right', 'sq', 'eq', 'sd'), (r) => /∠/.test(r));

await press('mode');
await page.waitForTimeout(150);
await page.locator('.panel-item', { hasText: 'COMP' }).click();
await page.waitForTimeout(120);

// --- Panels -----------------------------------------------------------------

const panels = [
  ['MODE', () => press('mode')],
  ['SETUP', () => press('mode', 'up')],
  ['CONST', () => press('n7', 'up')],
  ['CONV', () => press('n8', 'up')],
  ['CLR', () => press('n9', 'up')],
  ['STO', () => press('rcl', 'up')],
  ['RCL', () => press('rcl')],
  ['HIST', () => press('hist')],
  ['HELP', () => press('help')],
  ['hyp', () => press('hyp')],
  ['DRG', () => press('ans', 'up')],
];
for (const [name, open] of panels) {
  await open();
  await page.waitForTimeout(140);
  const isOpen = await page.locator('.overlay.open').count();
  if (isOpen) passed++; else failures.push(`panel ${name} did not open`);
  await page.locator('.panel-close').click().catch(() => {});
  await page.waitForTimeout(80);
}

// EQN: quadratic by coefficients
await press('mode');
await page.waitForTimeout(140);
await page.locator('.panel-item', { hasText: 'EQN' }).click();
await page.waitForTimeout(160);
await page.locator('.panel-item', { hasText: '2次方程式' }).click();
await page.waitForTimeout(120);
const coef = page.locator('.coef-cell input');
await coef.nth(0).fill('1');
await coef.nth(1).fill('-5');
await coef.nth(2).fill('6');
await page.locator('.panel-btn.primary').click();
await page.waitForTimeout(160);
const eqnOut = (await page.locator('.panel-output').innerText()).replace(/\s+/g, ' ');
if (/x₁ = 2/.test(eqnOut) && /x₂ = 3/.test(eqnOut)) passed++;
else failures.push(`EQN quadratic: ${eqnOut}`);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (errors.length) console.log(`\nconsole/page errors:\n${errors.join('\n')}`);
if (failures.length) { for (const f of failures) console.log(`FAIL  ${f}`); }
await browser.close();
process.exit(failures.length || errors.length ? 1 : 0);
