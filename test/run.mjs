// Headless test suite for the calculation engine.
//   node test/run.mjs
// Browser/UI behaviour is exercised separately by test/browser.mjs.

import { parse, stringify, CalcError } from '../src/parser.js';
import { makeContext, evaluate } from '../src/evaluator.js';
import * as Z from '../src/complex.js';
import * as F from '../src/format.js';
import * as S from '../src/symbolic.js';
import { solveEquation, solvePolynomialCoeffs, solveSimultaneous } from '../src/solve.js';
import { integrate as quad, derivative, polynomialRoots } from '../src/numeric.js';
import { Editor, serializeList, nodesFromAst } from '../src/editor.js';

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  const ok = typeof expected === 'function' ? expected(actual) : Object.is(actual, expected) || actual === expected;
  if (ok) passed++;
  else failures.push(`${name}\n    expected: ${typeof expected === 'function' ? '(predicate)' : expected}\n    actual:   ${actual}`);
}

const near = (target, tol = 1e-9) => (v) => Number.isFinite(v) && Math.abs(v - target) <= tol;

// --- Parser & evaluator -----------------------------------------------------

function num(src, opts = {}) {
  const ctx = makeContext(opts);
  const v = evaluate(parse(src), ctx);
  return v.im === 0 ? v.re : v;
}

check('precedence 1+2*3', num('1+2*3'), 7);
check('implicit mult binds tighter than ÷ (6÷2(1+2))', num('6/2(1+2)'), 1);
check('1÷2π = 1/(2π)', num('1/2π'), near(1 / (2 * Math.PI)));
check('unary minus below ^: -2^2', num('-2^2'), -4);
check('^ is right associative: 2^3^2', num('2^3^2'), 512);
check('2π/3', num('2π/3'), near((2 * Math.PI) / 3));
check('postfix factorial', num('5!'), 120);
check('percent', num('50%'), 0.5);
check('nPr binds tighter than ×', num('2*3nPr2'), 12);
check('nCr', num('5nCr2'), 10);
check('scientific notation ⏨', num('2⏨3'), 2000);
check('negative exponent 2⏨-3', num('2⏨-3'), near(0.002));

check('sin 30 in Deg', num('sin(30)', { angle: 'deg' }), near(0.5, 1e-12));
check('sin π/2 in Rad', num('sin(π/2)', { angle: 'rad' }), near(1));
check('sin 100 in Gra', num('sin(100)', { angle: 'gra' }), near(1));
check('asin 0.5 in Deg', num('asin(0.5)', { angle: 'deg' }), near(30));

check('log is base 10', num('log(1000)'), near(3));
check('logb(2,8)', num('logb(2,8)'), near(3));
check('ln e', num('ln(ℯ)'), near(1));
check('cbrt of a negative stays real', num('cbrt(-8)'), -2);
check('nroot(3,27)', num('nroot(3,27)'), near(3));
check('GCD', num('GCD(12,18)'), 6);
check('LCM', num('LCM(4,6)'), 12);
check('Int truncates toward zero', num('Int(-2.7)'), -2);
check('Intg floors', num('Intg(-2.7)'), -3);

check('Σ X² from 1 to 10', num('sumf(X^2,1,10)'), 385);
check('∫ sin X dx 0..π in Rad', num('integ(sin(X),0,π)', { angle: 'rad' }), near(2, 1e-8));
check('d/dx X³ at 2', num('deriv(X^3,2)'), near(12, 1e-6));

check('division by zero raises Math ERROR', (() => {
  try { num('1/0'); return 'no error'; } catch (e) { return e.kind; }
})(), 'Math ERROR');
check('bad syntax raises Syntax ERROR', (() => {
  try { num('1+'); return 'no error'; } catch (e) { return e.kind; }
})(), 'Syntax ERROR');

// --- Complex ----------------------------------------------------------------

const cnum = (src) => evaluate(parse(src), makeContext({ complexMode: true, angle: 'rad' }));
check('(1+i)² = 2i', (() => { const z = cnum('(1+ⅈ)^2'); return `${z.re},${z.im}`; })(), (s) => {
  const [re, im] = s.split(',').map(Number);
  return Math.abs(re) < 1e-12 && Math.abs(im - 2) < 1e-12;
});
check('1/i = −i', (() => { const z = cnum('1/ⅈ'); return `${z.re},${z.im}`; })(), (s) => {
  const [re, im] = s.split(',').map(Number);
  return Math.abs(re) < 1e-12 && Math.abs(im + 1) < 1e-12;
});
check('abs(3+4i) = 5', cnum('abs(3+4ⅈ)').re, 5);
check('conjg(3+4i)', cnum('conjg(3+4ⅈ)').im, -4);
check('e^(iπ) = −1', (() => { const z = cnum('ℯ^(ⅈπ)'); return Math.abs(z.re + 1) < 1e-12 && Math.abs(z.im) < 1e-12; })(), true);
check('sqrt(−4) = 2i', cnum('sqrt(-4)').im, 2);
check('polar 2∠(π/3)', (() => { const z = cnum('2∠(π/3)'); return Math.abs(z.re - 1) < 1e-12 && Math.abs(z.im - Math.sqrt(3)) < 1e-12; })(), true);

// --- Formatting & exact forms ----------------------------------------------

const exact = (x) => { const a = F.exactForm(x); return a ? stringify(a) : null; };
check('exact 0.5 → 1/2', exact(0.5), '1/2');
check('exact 1/3', exact(1 / 3), '1/3');
check('exact √2', exact(Math.SQRT2), 'sqrt(2)');
check('exact π/4', exact(Math.PI / 4), 'π/4');
check('exact 3π/2', exact((3 * Math.PI) / 2), '3*π/2');
check('exact of an integer is null', exact(7), null);
check('exact of a transcendental is null', exact(Math.log(7)), null);
check('format 1e12 uses ×10ⁿ', F.formatReal(1e12).text, '1×10^12');
check('format 0.001 in Norm 1 uses ×10ⁿ', F.formatReal(0.001).text, '1×10^-3');
check('format 0.001 in Norm 2 is plain', F.formatReal(0.001, { mode: 'norm', norm: 2, digits: 10 }).text, '0.001');
check('formatBaseN hex', F.formatBaseN(255, 16), 'FF');
check('formatBaseN two’s complement', F.formatBaseN(-1, 16), 'FFFFFFFF');
check('toDMS', F.toDMS(1.5), '1°30°0°');
check('complex display', F.formatComplex(Z.C(3, -4)), '3−4ⅈ');

// --- Symbolic ---------------------------------------------------------------

const sym = (src) => S.simplify(S.fromAst(parse(src)));
const integ = (src, v = 'X') => { const r = S.integrate(sym(src), v); return r ? stringify(S.toDisplayAst(r)) : null; };
const der = (src, v = 'X') => stringify(S.toDisplayAst(S.diff(sym(src), v)));

check('simplify collects like terms', stringify(S.toDisplayAst(sym('X+X+X'))), '3*X');
check('simplify cancels', stringify(S.toDisplayAst(sym('X-X'))), '0');
check('simplify powers', stringify(S.toDisplayAst(sym('X^2*X^3'))), 'X^5');
check('√8 simplifies to 2√2', stringify(S.toDisplayAst(sym('sqrt(8)'))), '2*sqrt(2)');
check('√(1/2) rationalises', stringify(S.toDisplayAst(sym('sqrt(1/2)'))), 'sqrt(2)/2');

check('∫x² dx', integ('X^2'), 'X^3/3');
check('∫1/x dx', integ('1/X'), 'ln(abs(X))');
check('∫sin(2x+1) dx', integ('sin(2X+1)'), (s) => /cos\(2\*X\+1\)\/2/.test(s) && s.startsWith('-'));
check('∫x·e^x dx (by parts)', integ('X*ℯ^X'), (s) => /exp\(X\)/.test(s) && /X/.test(s));
check('∫ln x dx', integ('ln(X)'), (s) => /ln\(X\)\*X/.test(s) && /-X/.test(s));
check('∫1/(x²+1) dx', integ('1/(X^2+1)'), 'atan(X)');
check('∫sin²x dx (power reduction)', integ('sin(X)^2'), (s) => /X\/2/.test(s) && /sin\(2\*X\)\/4/.test(s));
check('∫x/(x²+1) dx (substitution)', integ('X/(X^2+1)'), 'ln(abs(X^2+1))/2');
check('∫ rational partial fractions', integ('(2X+3)/((X+1)(X-2))'), (s) => /ln\(abs\(X\+1\)\)/.test(s) && /ln\(abs\(X-2\)\)/.test(s));
check('∫ e^(x²) has no closed form', integ('ℯ^(X^2)'), null);

check('d/dx x³+2x', der('X^3+2X'), '3*X^2+2');
check('d/dx sin x', der('sin(X)'), 'cos(X)');
check('d/dx product rule', der('X*sin(X)'), (s) => /cos\(X\)\*X/.test(s) && /sin\(X\)/.test(s));
check('d/dx chain rule', der('sin(X^2)'), (s) => /cos\(X\^2\)/.test(s) && /2/.test(s));
check('d/dx ln x', der('ln(X)'), (s) => /X\^\(-1\)|1\/X/.test(s));

// Every antiderivative must actually differentiate back to the integrand.
for (const src of ['X^2', '1/X', 'sin(2X+1)', 'X*ℯ^X', 'ln(X)', '1/(X^2+1)', 'X/(X^2+1)', 'X^3-2X+1', 'cos(3X)']) {
  const anti = S.integrate(sym(src), 'X');
  if (!anti) { failures.push(`round-trip ${src}: no antiderivative`); continue; }
  const back = S.simplify(S.diff(anti, 'X'));
  const target = sym(src);
  let worst = 0;
  for (const x of [0.37, 1.21, 2.8, -1.6]) {
    const a = S.evalNumeric(S.substitute(back, 'X', S.FLT(x)));
    const b = S.evalNumeric(S.substitute(target, 'X', S.FLT(x)));
    if (Number.isFinite(a) && Number.isFinite(b)) worst = Math.max(worst, Math.abs(a - b));
  }
  check(`d/dx(∫ ${src}) == ${src}`, worst, (w) => w < 1e-8);
}

// --- Solver -----------------------------------------------------------------

const ctxR = makeContext({ angle: 'rad' });
const roots = (src, v = 'X') => solveEquation(parse(src), v, ctxR, {}).roots.map((r) => r.value.re);
const rootsFull = (src, v = 'X') => solveEquation(parse(src), v, ctxR, {});

check('linear 2X+6=0', roots('2X+6=0'), (a) => a.length === 1 && a[0] === -3);
check('quadratic X²−5X+6=0', roots('X^2-5X+6=0'), (a) => a.length === 2 && a[0] === 2 && a[1] === 3);
check('quadratic exact surd', rootsFull('X^2-2=0').roots[1].exact, (e) => stringify(e) === 'sqrt(2)');
check('quadratic complex roots', rootsFull('X^2+X+1=0').roots, (rs) =>
  rs.length === 2 && Math.abs(rs[0].value.re + 0.5) < 1e-9 && Math.abs(rs[0].value.im - Math.sqrt(3) / 2) < 1e-9);
check('double root reported once', rootsFull('X^2-4X+4=0').roots.length, 1);
check('cubic with three rational roots', roots('X^3-6X^2+11X-6=0'), (a) =>
  a.length === 3 && a.join(',') === '1,2,3');
check('transcendental cos X = X', roots('cos(X)=X'), (a) => a.length === 1 && Math.abs(a[0] - 0.7390851332) < 1e-8);
check('two roots of e^X = 3X', roots('ℯ^X=3X'), (a) => a.length === 2);
check('no real solution', rootsFull('X^2+1=0').roots, (rs) => rs.length === 2 && rs.every((r) => r.value.im !== 0));
check('solve for a different variable', solveEquation(parse('3A-9=0'), 'A', ctxR, {}).roots[0].value.re, 3);

check('EQN quadratic by coefficients', solvePolynomialCoeffs([1, -3, 2]).roots.map((r) => r.value.re), (a) => a.join(',') === '1,2');
check('EQN cubic by coefficients', solvePolynomialCoeffs([1, 0, -1, 0]).roots.map((r) => r.value.re).sort((x, y) => x - y),
  (a) => a.join(',') === '-1,0,1');
check('simultaneous 2×2', solveSimultaneous([[2, 1, 7], [1, -1, -1]]).roots.map((r) => r.value.re), (a) => a.join(',') === '2,3');
check('simultaneous 3×3', solveSimultaneous([[1, 1, 1, 6], [0, 2, 5, -4], [2, 5, -1, 27]]).roots.map((r) => r.value.re),
  (a) => a.map((v) => Math.round(v * 1e6) / 1e6).join(',') === '5,3,-2');
check('singular system reported', solveSimultaneous([[1, 1, 2], [2, 2, 4]]).kind, 'singular');

// --- Numeric routines -------------------------------------------------------

check('quadrature of a smooth function', quad((x) => Math.exp(-x * x), -5, 5).value, near(Math.sqrt(Math.PI), 1e-9));
check('quadrature with an endpoint singularity', quad((x) => 1 / Math.sqrt(x), 0, 1).value, near(2, 1e-6));
check('quadrature of an oscillation', quad((x) => Math.sin(50 * x), 0, Math.PI).value, near((1 - Math.cos(50 * Math.PI)) / 50, 1e-9));
check('Ridders derivative', derivative((x) => Math.exp(x), 1).value, near(Math.E, 1e-9));
check('polynomial roots incl. complex', polynomialRoots([1, 0, 1]), (rs) =>
  rs.length === 2 && Math.abs(Math.abs(rs[0].im) - 1) < 1e-9);

// --- Editor -----------------------------------------------------------------

const ed = new Editor();
ed.insertTemplate('frac', {}, 'num');
ed.insertChar('3');
ed.moveVertical(1, []);
ed.insertChar('4');
check('editor serialises a fraction', ed.serialize(), '(3/4)');
check('▼ moved into the denominator', ed.cursor.list.length, 1);
ed.moveRight();
ed.insertChar('+', '+');
ed.insertTemplate('sqrt', {}, 'a');
ed.insertChar('2');
check('editor serialises √', ed.serialize(), '(3/4)+sqrt(2)');
check('serialised editor output parses', (() => {
  try { parse(ed.serialize()); return 'ok'; } catch (e) { return e.kind; }
})(), 'ok');
ed.backspace();
ed.backspace();
check('DEL removes the template', ed.serialize(), '(3/4)+');

const ed2 = new Editor();
ed2.setNodes(nodesFromAst(parse('sqrt(2)/3+X^2')));
check('AST → editor nodes round-trips', (() => {
  const v1 = evaluate(parse('sqrt(2)/3+X^2'), makeContext());
  const v2 = evaluate(parse(ed2.serialize()), makeContext());
  return Math.abs(v1.re - v2.re) < 1e-12;
})(), true);

// --- Report -----------------------------------------------------------------

console.log(`\n${passed} passed, ${failures.length} failed\n`);
if (failures.length) {
  for (const f of failures) console.log(`FAIL  ${f}`);
  process.exit(1);
}
