// Result formatting: 10-significant-digit display, Norm/Fix/Sci/Eng modes,
// and the S⇔D "exact form" search (fractions, π multiples, surds).

import * as Z from './complex.js';
import { num, bin, fn, cst } from './parser.js';

export const DEFAULT_DISPLAY = { mode: 'norm', norm: 1, digits: 10, eng: false };

const SIG = 10;

/** Round to n significant digits and drop float noise like 0.30000000000000004. */
export function sigRound(x, digits = SIG) {
  if (!Number.isFinite(x) || x === 0) return x;
  const s = x.toPrecision(digits);
  return parseFloat(s);
}

/**
 * Format a real number the way the fx-375ES would.
 * Returns { text, mantissa, exponent } — exponent is null unless ×10ⁿ is shown.
 */
export function formatReal(x, disp = DEFAULT_DISPLAY) {
  if (Number.isNaN(x)) return { text: 'Math ERROR', mantissa: 'Math ERROR', exponent: null };
  if (!Number.isFinite(x)) return { text: '∞', mantissa: '∞', exponent: null };

  if (disp.mode === 'fix') {
    const d = disp.digits;
    if (Math.abs(x) >= 1e10) return sciFormat(x, SIG - 1);
    const t = x.toFixed(d);
    return { text: normaliseMinus(t), mantissa: normaliseMinus(t), exponent: null };
  }
  if (disp.mode === 'sci') {
    return sciFormat(x, Math.max(0, disp.digits - 1));
  }
  if (disp.mode === 'eng') {
    return engFormat(x, disp);
  }

  // Norm 1 / Norm 2
  const lowerLimit = disp.norm === 1 ? 1e-2 : 1e-9;
  const v = sigRound(x, SIG);
  if (v === 0) return { text: '0', mantissa: '0', exponent: null };
  const mag = Math.abs(v);
  if (mag >= 1e10 || mag < lowerLimit) return sciFormat(v, SIG - 1);

  let t = trimZeros(v.toPrecision(Math.max(1, SIG)));
  if (t.includes('e')) return sciFormat(v, SIG - 1);
  return { text: normaliseMinus(t), mantissa: normaliseMinus(t), exponent: null };
}

function sciFormat(x, decimals) {
  const s = x.toExponential(Math.min(19, Math.max(0, decimals)));
  let [m, e] = s.split('e');
  m = trimZeros(m);
  const exp = parseInt(e, 10);
  return {
    text: `${normaliseMinus(m)}×10^${exp}`,
    mantissa: normaliseMinus(m),
    exponent: exp,
  };
}

function engFormat(x, disp) {
  if (x === 0) return { text: '0', mantissa: '0', exponent: null };
  let exp = Math.floor(Math.log10(Math.abs(x)));
  let e3 = Math.floor(exp / 3) * 3;
  let m = x / Math.pow(10, e3);
  m = sigRound(m, SIG);
  if (Math.abs(m) >= 1000) { m /= 1000; e3 += 3; }
  const mant = trimZeros(String(sigRound(m, SIG)));
  if (e3 === 0) return { text: mant, mantissa: mant, exponent: null };
  return { text: `${mant}×10^${e3}`, mantissa: mant, exponent: e3 };
}

function trimZeros(s) {
  if (!s.includes('.')) return s;
  if (s.includes('e') || s.includes('E')) {
    const [m, e] = s.split(/[eE]/);
    return `${trimZeros(m)}e${e}`;
  }
  return s.replace(/\.?0+$/, '');
}

const normaliseMinus = (s) => s.replace(/^-/, '−'); // U+2212 MINUS SIGN

/** Format a complex value for the answer line. */
export function formatComplex(z, disp = DEFAULT_DISPLAY, polar = false) {
  if (z.im === 0) return formatReal(z.re, disp).text;
  if (polar) {
    const r = formatReal(Z.abs(z), disp).text;
    const th = formatReal(Z.arg(z), disp).text;
    return `${r}∠${th}`;
  }
  const reTxt = z.re === 0 ? '' : formatReal(z.re, disp).text;
  const imAbs = Math.abs(z.im);
  let imTxt = formatReal(imAbs, disp).text;
  if (imTxt === '1') imTxt = '';
  const sign = z.im < 0 ? '−' : '+';
  if (reTxt === '') return `${z.im < 0 ? '−' : ''}${imTxt}ⅈ`;
  return `${reTxt}${sign}${imTxt}ⅈ`;
}

// --- BASE-N -----------------------------------------------------------------

export function formatBaseN(value, base, bits = 32) {
  let n = Math.trunc(value);
  if (n < 0) n = Math.pow(2, bits) + n;
  const s = n.toString(base).toUpperCase();
  if (base === 2) return s.replace(/(.{4})(?=.)/g, '$1 ');
  return s;
}

// --- Exact forms (S⇔D) ------------------------------------------------------

const EXACT_EPS = 1e-11;

/** Continued-fraction rational approximation. Returns {p, q} or null. */
export function ratApprox(x, maxDen = 100000) {
  if (!Number.isFinite(x)) return null;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  let h1 = 1, h0 = 0, k1 = 0, k0 = 1, b = x;
  for (let i = 0; i < 40; i++) {
    const a = Math.floor(b);
    const h2 = a * h1 + h0, k2 = a * k1 + k0;
    if (k2 > maxDen) break;
    h0 = h1; h1 = h2; k0 = k1; k1 = k2;
    const approx = h1 / k1;
    if (Math.abs(approx - x) <= EXACT_EPS * Math.max(1, x)) {
      return { p: sign * h1, q: k1 };
    }
    const frac = b - a;
    if (frac < 1e-13) break;
    b = 1 / frac;
  }
  return null;
}

function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; }

/** Pull square factors out: √n → a√b. */
function simplifySurd(n) {
  let a = 1, b = Math.round(n);
  for (let f = 2; f * f <= b; f++) {
    while (b % (f * f) === 0) { b /= f * f; a *= f; }
  }
  return { a, b };
}

/** Build `p/q` as an AST, collapsing to an integer when q is 1. */
function ratAst(p, q) {
  if (q === 1) return num(p);
  if (p < 0) return { k: 'neg', a: bin('div', num(-p), num(q)) };
  return bin('div', num(p), num(q));
}

/**
 * Try to recognise x as an exact expression.
 * Returns an AST (for natural display) or null when only a decimal will do.
 */
export function exactForm(x, opts = {}) {
  if (!Number.isFinite(x) || x === 0) return null;
  const digits = (n) => String(Math.abs(n)).replace(/\D/g, '').length;

  // 1. Plain rational (Casio shows fractions up to 10 total digits).
  const r = ratApprox(x, 1e7);
  if (r && r.q !== 1 && digits(r.p) + digits(r.q) <= 10) return ratAst(r.p, r.q);
  if (r && r.q === 1) return null; // integers already display fine

  // 2. Rational multiple of π.
  const rp = ratApprox(x / Math.PI, 100000);
  if (rp && digits(rp.p) + digits(rp.q) <= 8) {
    const sign = rp.p < 0 ? -1 : 1;
    const p = Math.abs(rp.p);
    let numer = p === 1 ? cst('pi') : bin('mul', num(p), cst('pi'));
    let node = rp.q === 1 ? numer : bin('div', numer, num(rp.q));
    return sign < 0 ? { k: 'neg', a: node } : node;
  }

  // 3. Surd form a√b / c  (detected via x² being rational).
  if (opts.surds !== false) {
    const sq = ratApprox(x * x, 100000);
    if (sq && sq.p > 0) {
      // x = ±√(p/q) = ±√(p·q)/q
      const inner = sq.p * sq.q;
      if (inner <= 1e12) {
        const { a, b } = simplifySurd(inner);
        if (b !== 1) {
          const g = gcd(a, sq.q);
          const aa = a / g, cc = sq.q / g;
          if (digits(aa) + digits(b) + digits(cc) <= 10) {
            let node = aa === 1 ? fn('sqrt', [num(b)]) : bin('mul', num(aa), fn('sqrt', [num(b)]));
            if (cc !== 1) node = bin('div', node, num(cc));
            const value = (aa * Math.sqrt(b)) / cc;
            if (Math.abs(value - Math.abs(x)) <= EXACT_EPS * Math.max(1, Math.abs(x))) {
              return x < 0 ? { k: 'neg', a: node } : node;
            }
          }
        }
      }
    }
  }
  return null;
}

/** Improper fraction → mixed number AST (a b/c), for the a b/c ⇔ d/c toggle. */
export function toMixed(ast) {
  if (!ast) return null;
  let negFlag = false;
  let node = ast;
  if (node.k === 'neg') { negFlag = true; node = node.a; }
  if (node.k !== 'div' || node.a.k !== 'num' || node.b.k !== 'num') return null;
  const p = node.a.v, q = node.b.v;
  if (Math.abs(p) < q) return null;
  const whole = Math.trunc(p / q);
  const rem = Math.abs(p) - Math.abs(whole) * q;
  if (rem === 0) return null;
  const mixed = { k: 'mixed', w: num(Math.abs(whole)), n: num(rem), d: num(q) };
  return negFlag ? { k: 'neg', a: mixed } : mixed;
}

/** Mixed number AST → improper fraction AST. */
export function toImproper(ast) {
  let negFlag = false;
  let node = ast;
  if (node.k === 'neg') { negFlag = true; node = node.a; }
  if (node.k !== 'mixed') return null;
  const p = node.w.v * node.d.v + node.n.v;
  const out = bin('div', num(p), num(node.d.v));
  return negFlag ? { k: 'neg', a: out } : out;
}

/** Decimal degrees → degrees / minutes / seconds string. */
export function toDMS(x) {
  const sign = x < 0 ? '−' : '';
  x = Math.abs(x);
  let d = Math.floor(x);
  let mFull = (x - d) * 60;
  let m = Math.floor(mFull);
  let s = (mFull - m) * 60;
  s = Math.round(s * 1e6) / 1e6;
  if (s >= 60) { s -= 60; m += 1; }
  if (m >= 60) { m -= 60; d += 1; }
  return `${sign}${d}°${m}°${trimZeros(String(s))}°`;
}
