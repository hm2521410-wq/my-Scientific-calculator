// Symbolic algebra: canonical simplification, differentiation and integration.
//
// The parser AST is converted into a canonical internal form first:
//   numbers are exact rationals, subtraction/division/negation disappear into
//   n-ary sums, n-ary products and powers. That makes term collection and
//   pattern matching tractable. `toDisplayAst` converts back, reintroducing
//   fractions, subtraction and unary minus so results read naturally.

import { num as astNum, bin, fn as astFn, cst } from './parser.js';
import { ratApprox } from './format.js';

// --- Exact rational numbers -------------------------------------------------

const MAXINT = 1e15;

function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; }

/** Exact rational node, reduced, with q > 0. Falls back to a float node. */
export function R(p, q = 1) {
  if (q === 0) return FLT(NaN);
  if (!Number.isInteger(p) || !Number.isInteger(q)) return FLT(p / q);
  if (q < 0) { p = -p; q = -q; }
  const g = gcd(p, q) || 1;
  p /= g; q /= g;
  if (Math.abs(p) > MAXINT || q > MAXINT) return FLT(p / q);
  return { k: 'num', p, q };
}
export const FLT = (v) => ({ k: 'flt', v });

export const isNum = (n) => n.k === 'num' || n.k === 'flt';
export const isRat = (n) => n.k === 'num';
export const valueOf = (n) => (n.k === 'num' ? n.p / n.q : n.v);
export const isInt = (n) => n.k === 'num' && n.q === 1;

const ZERO = R(0), ONE = R(1), NEG_ONE = R(-1), HALF = R(1, 2);

const isZero = (n) => isNum(n) && valueOf(n) === 0;
const isOne = (n) => isNum(n) && valueOf(n) === 1;

/** Convert a float back to an exact rational when it clearly is one. */
export function rationalize(v) {
  if (!Number.isFinite(v)) return FLT(v);
  if (Number.isInteger(v) && Math.abs(v) <= MAXINT) return R(v, 1);
  const r = ratApprox(v, 1e6);
  if (r && Math.abs(r.p / r.q - v) < 1e-12 * Math.max(1, Math.abs(v))) return R(r.p, r.q);
  return FLT(v);
}

function nAdd(a, b) {
  if (isRat(a) && isRat(b)) return R(a.p * b.q + b.p * a.q, a.q * b.q);
  return FLT(valueOf(a) + valueOf(b));
}
function nMul(a, b) {
  if (isRat(a) && isRat(b)) return R(a.p * b.p, a.q * b.q);
  return FLT(valueOf(a) * valueOf(b));
}
function nDiv(a, b) {
  if (isRat(a) && isRat(b) && b.p !== 0) return R(a.p * b.q, a.q * b.p);
  return FLT(valueOf(a) / valueOf(b));
}
function nNeg(a) { return isRat(a) ? R(-a.p, a.q) : FLT(-a.v); }

function nPow(a, b) {
  if (isRat(a) && isRat(b) && b.q === 1 && Math.abs(b.p) < 64) {
    const e = b.p;
    if (e >= 0) return R(Math.pow(a.p, e), Math.pow(a.q, e));
    if (a.p === 0) return FLT(Infinity);
    return R(Math.pow(a.q, -e), Math.pow(a.p, -e));
  }
  if (isRat(a) && isRat(b) && a.p >= 0) {
    // Exact roots such as 4^(1/2) = 2 or 8^(1/3) = 2.
    const rp = Math.pow(a.p, b.p / b.q);
    const rq = Math.pow(a.q, b.p / b.q);
    if (Number.isInteger(Math.round(rp * 1e9) / 1e9) && Number.isInteger(Math.round(rq * 1e9) / 1e9)) {
      const ip = Math.round(rp), iq = Math.round(rq);
      if (Math.abs(Math.pow(ip, b.q / 1) - Math.pow(a.p, b.p)) < 1e-6) return R(ip, iq);
    }
  }
  return FLT(Math.pow(valueOf(a), valueOf(b)));
}

// --- Internal node constructors ---------------------------------------------

export const V = (n) => ({ k: 'var', n });
export const CONST = (n) => ({ k: 'const', n });          // 'pi' | 'e' | 'i'
export const SUM = (a) => ({ k: 'sum', a });
export const PROD = (a) => ({ k: 'prod', a });
export const POW = (a, b) => ({ k: 'pow', a, b });
export const FN = (n, args) => ({ k: 'fn', n, args });

export const add = (...xs) => simplify(SUM(xs));
export const mul = (...xs) => simplify(PROD(xs));
export const sub = (a, b) => add(a, mul(NEG_ONE, b));
export const div = (a, b) => mul(a, POW(b, NEG_ONE));
export const neg = (a) => mul(NEG_ONE, a);
export const pw = (a, b) => simplify(POW(a, b));

// --- Conversion from the parser AST ----------------------------------------

export function fromAst(node) {
  switch (node.k) {
    case 'num': return rationalize(node.v);
    case 'const': return CONST(node.n);
    case 'var': return V(node.n);
    case 'paren': return fromAst(node.a);
    case 'neg': return PROD([NEG_ONE, fromAst(node.a)]);
    case 'add': return SUM([fromAst(node.a), fromAst(node.b)]);
    case 'sub': return SUM([fromAst(node.a), PROD([NEG_ONE, fromAst(node.b)])]);
    case 'mul': return PROD([fromAst(node.a), fromAst(node.b)]);
    case 'div': return PROD([fromAst(node.a), POW(fromAst(node.b), NEG_ONE)]);
    case 'pow': return POW(fromAst(node.a), fromAst(node.b));
    case 'pct': return PROD([fromAst(node.a), R(1, 100)]);
    case 'fact': return FN('fact', [fromAst(node.a)]);
    case 'mixed': return SUM([fromAst(node.w), PROD([fromAst(node.n), POW(fromAst(node.d), NEG_ONE)])]);
    case 'ans': return V('Ans');
    case 'preans': return V('PreAns');
    case 'fn': {
      // Normalise a few spellings so the rule tables only see one form.
      if (node.n === 'sqrt') return POW(fromAst(node.args[0]), HALF);
      if (node.n === 'cbrt') return POW(fromAst(node.args[0]), R(1, 3));
      if (node.n === 'nroot') return POW(fromAst(node.args[1]), POW(fromAst(node.args[0]), NEG_ONE));
      if (node.n === 'exp') return POW(CONST('e'), fromAst(node.args[0]));
      if (node.n === 'exp10') return POW(R(10), fromAst(node.args[0]));
      if (node.n === 'log' && node.args.length === 1) return FN('log10', [fromAst(node.args[0])]);
      return FN(node.n, node.args.map(fromAst));
    }
    default: return FLT(NaN);
  }
}

// --- Canonical key (structural identity) ------------------------------------

export function key(n) {
  switch (n.k) {
    case 'num': return `#${n.p}/${n.q}`;
    case 'flt': return `~${n.v}`;
    case 'var': return `v${n.n}`;
    case 'const': return `c${n.n}`;
    case 'sum': return `+(${n.a.map(key).sort().join(',')})`;
    case 'prod': return `*(${n.a.map(key).sort().join(',')})`;
    case 'pow': return `^(${key(n.a)},${key(n.b)})`;
    case 'fn': return `${n.n}(${n.args.map(key).join(',')})`;
    default: return '?';
  }
}

export const equal = (a, b) => key(a) === key(b);

// --- Simplification ---------------------------------------------------------

export function simplify(n) {
  if (!n) return FLT(NaN);
  switch (n.k) {
    case 'num': case 'flt': case 'var': case 'const': return n;
    case 'sum': return simpSum(n.a.map(simplify));
    case 'prod': return simpProd(n.a.map(simplify));
    case 'pow': return simpPow(simplify(n.a), simplify(n.b));
    case 'fn': return simpFn(n.n, n.args.map(simplify));
    default: return n;
  }
}

function simpSum(parts) {
  const flat = [];
  const push = (t) => { if (t.k === 'sum') t.a.forEach(push); else flat.push(t); };
  parts.forEach(push);

  let constant = ZERO;
  const terms = new Map(); // key -> { coeff, node }
  for (const t of flat) {
    if (isNum(t)) { constant = nAdd(constant, t); continue; }
    const { coeff, rest } = splitCoeff(t);
    const kk = key(rest);
    const cur = terms.get(kk);
    if (cur) cur.coeff = nAdd(cur.coeff, coeff);
    else terms.set(kk, { coeff, node: rest });
  }

  const out = [];
  for (const { coeff, node } of terms.values()) {
    if (isZero(coeff)) continue;
    out.push(isOne(coeff) ? node : simpProd([coeff, node]));
  }
  out.sort(termOrder);
  if (!isZero(constant)) out.push(constant);
  if (out.length === 0) return ZERO;
  if (out.length === 1) return out[0];
  return SUM(out);
}

/** Split a product into its leading numeric coefficient and the rest. */
function splitCoeff(t) {
  if (t.k !== 'prod') return { coeff: ONE, rest: t };
  const nums = t.a.filter(isNum);
  const rest = t.a.filter((x) => !isNum(x));
  let coeff = ONE;
  for (const x of nums) coeff = nMul(coeff, x);
  if (rest.length === 0) return { coeff, rest: ONE };
  return { coeff, rest: rest.length === 1 ? rest[0] : PROD(rest) };
}

function simpProd(parts) {
  const flat = [];
  const push = (t) => { if (t.k === 'prod') t.a.forEach(push); else flat.push(t); };
  parts.forEach(push);

  let coeff = ONE;
  const bases = new Map(); // key -> { base, exp }
  for (const t of flat) {
    if (isNum(t)) {
      if (valueOf(t) === 0) return ZERO;
      coeff = nMul(coeff, t);
      continue;
    }
    let base = t, exp = ONE;
    if (t.k === 'pow') { base = t.a; exp = t.b; }
    const kk = key(base);
    const cur = bases.get(kk);
    if (cur) cur.exp = simpSum([cur.exp, exp]);
    else bases.set(kk, { base, exp });
  }

  const out = [];
  for (const { base, exp } of bases.values()) {
    const p = simpPow(base, exp);
    if (isNum(p)) { coeff = nMul(coeff, p); continue; }
    if (isOne(p)) continue;
    out.push(p);
  }
  if (valueOf(coeff) === 0) return ZERO;
  out.sort(factorOrder);
  if (!isOne(coeff)) out.unshift(coeff);
  if (out.length === 0) return ONE;
  if (out.length === 1) return out[0];
  return PROD(out);
}

function simpPow(a, b) {
  if (isZero(b)) return ONE;
  if (isOne(b)) return a;
  if (isOne(a)) return ONE;
  if (isZero(a)) return valueOf(b) > 0 ? ZERO : FLT(Infinity);
  if (isNum(a) && isNum(b)) {
    if (isRat(a) && isRat(b) && b.q !== 1) {
      const rad = simpRadical(a, b);
      if (rad) return rad;
      return POW(a, b); // keep surds exact: √2 must not collapse to 1.414…
    }
    return nPow(a, b);
  }
  if (a.k === 'pow') {
    // (x^m)^n → x^(m·n) — valid for the integer/rational exponents we produce.
    const inner = a.b, outer = b;
    if (isNum(inner) && isNum(outer)) return simpPow(a.a, nMul(inner, outer));
    if (isNum(outer) && isInt(outer)) return simpPow(a.a, simpProd([inner, outer]));
  }
  if (a.k === 'prod' && isNum(b) && isInt(b)) {
    return simpProd(a.a.map((f) => simpPow(f, b)));
  }
  if (a.k === 'const' && a.n === 'e' && b.k === 'fn' && b.n === 'ln') return b.args[0];
  return POW(a, b);
}

/**
 * Normalise (p/q)^(m/n) into c·rem^(1/n): pulls perfect n-th powers out of the
 * radical and rationalises the denominator, so √8 → 2√2 and √(1/2) → √2/2.
 * Returns null when the base is negative or the numbers get too large.
 */
function simpRadical(a, b) {
  const n = b.q;
  const m = b.p;
  if (n < 2 || n > 6 || Math.abs(m) > 8) return null;
  if (a.p < 0) return null; // negative bases stay symbolic (complex territory)

  const ipow = (base, e) => {
    let r = 1;
    for (let i = 0; i < e; i++) {
      r *= base;
      if (!Number.isSafeInteger(r)) return null;
    }
    return r;
  };

  const am = Math.abs(m);
  let P = ipow(a.p, am), Q = ipow(a.q, am);
  if (P === null || Q === null) return null;
  if (m < 0) { [P, Q] = [Q, P]; }
  if (P === 0) return ZERO;

  // (P/Q)^(1/n) = (P·Q^(n-1))^(1/n) / Q
  const qPow = ipow(Q, n - 1);
  if (qPow === null) return null;
  const N = P * qPow;
  if (!Number.isSafeInteger(N) || N > 1e15) return null;

  let coeff = 1, rem = N;
  for (let f = 2; ipow(f, n) !== null && ipow(f, n) <= rem; f++) {
    const fn2 = ipow(f, n);
    while (rem % fn2 === 0) { rem /= fn2; coeff *= f; }
  }
  const outside = R(coeff, Q);
  if (rem === 1) return outside;
  // Nothing came out of the radical — leave it alone (and stop recursing).
  if (coeff === 1 && Q === 1) return null;
  return simpProd([outside, POW(R(rem), R(1, n))]);
}

const FN_TABLE = {
  ln: (x) => {
    if (x.k === 'const' && x.n === 'e') return ONE;
    if (isOne(x)) return ZERO;
    if (x.k === 'pow' && x.b.k === 'num') return simpProd([x.b, FN('ln', [x.a])]);
    return null;
  },
  log10: (x) => (isOne(x) ? ZERO : isNum(x) && valueOf(x) === 10 ? ONE : null),
  abs: (x) => (isNum(x) ? (valueOf(x) < 0 ? nNeg(x) : x) : null),
  sin: (x) => (isZero(x) ? ZERO : null),
  cos: (x) => (isZero(x) ? ONE : null),
  tan: (x) => (isZero(x) ? ZERO : null),
  sinh: (x) => (isZero(x) ? ZERO : null),
  cosh: (x) => (isZero(x) ? ONE : null),
  tanh: (x) => (isZero(x) ? ZERO : null),
  atan: (x) => (isZero(x) ? ZERO : null),
  asin: (x) => (isZero(x) ? ZERO : null),
};

function simpFn(name, args) {
  const rule = FN_TABLE[name];
  if (rule) {
    const r = rule(...args);
    if (r) return r;
  }
  return FN(name, args);
}

/** Ordering used for display: higher powers of the main variable first. */
function termOrder(a, b) {
  const da = degreeHint(b) - degreeHint(a);
  if (da !== 0) return da;
  return key(a) < key(b) ? -1 : 1;
}
function factorOrder(a, b) {
  const wa = a.k === 'pow' && isNum(a.b) && valueOf(a.b) < 0 ? 1 : 0;
  const wb = b.k === 'pow' && isNum(b.b) && valueOf(b.b) < 0 ? 1 : 0;
  if (wa !== wb) return wa - wb;
  return key(a) < key(b) ? -1 : 1;
}
function degreeHint(n) {
  switch (n.k) {
    case 'var': return 1;
    case 'pow': return isNum(n.b) ? valueOf(n.b) * degreeHint(n.a) : degreeHint(n.a);
    case 'prod': return n.a.reduce((s, x) => s + degreeHint(x), 0);
    case 'sum': return Math.max(...n.a.map(degreeHint));
    case 'fn': return 0.5;
    default: return 0;
  }
}

// --- Structural helpers -----------------------------------------------------

export function containsVar(n, v) {
  switch (n.k) {
    case 'var': return n.n === v;
    case 'sum': case 'prod': return n.a.some((x) => containsVar(x, v));
    case 'pow': return containsVar(n.a, v) || containsVar(n.b, v);
    case 'fn': return n.args.some((x) => containsVar(x, v));
    default: return false;
  }
}

export function substitute(n, v, value) {
  switch (n.k) {
    case 'var': return n.n === v ? value : n;
    case 'sum': return SUM(n.a.map((x) => substitute(x, v, value)));
    case 'prod': return PROD(n.a.map((x) => substitute(x, v, value)));
    case 'pow': return POW(substitute(n.a, v, value), substitute(n.b, v, value));
    case 'fn': return FN(n.n, n.args.map((x) => substitute(x, v, value)));
    default: return n;
  }
}

/** Replace every structural occurrence of `target` with `replacement`. */
export function replaceAll(n, target, replacement) {
  if (equal(n, target)) return replacement;
  switch (n.k) {
    case 'sum': return SUM(n.a.map((x) => replaceAll(x, target, replacement)));
    case 'prod': return PROD(n.a.map((x) => replaceAll(x, target, replacement)));
    case 'pow': return POW(replaceAll(n.a, target, replacement), replaceAll(n.b, target, replacement));
    case 'fn': return FN(n.n, n.args.map((x) => replaceAll(x, target, replacement)));
    default: return n;
  }
}

/** Match a·x + b with a, b free of x. */
export function linearIn(expr, x) {
  const e = simplify(expr);
  if (!containsVar(e, x)) return { a: ZERO, b: e };
  const terms = e.k === 'sum' ? e.a : [e];
  let a = ZERO, b = ZERO;
  for (const t of terms) {
    if (!containsVar(t, x)) { b = add(b, t); continue; }
    const { coeff, rest } = splitCoeff(t);
    if (rest.k === 'var' && rest.n === x) { a = add(a, coeff); continue; }
    return null;
  }
  return { a, b };
}

/** Polynomial coefficients in x, lowest order first. Returns null if not polynomial. */
export function polyCoeffs(expr, x, maxDeg = 24) {
  const e = simplify(expand(expr));
  const terms = e.k === 'sum' ? e.a : [e];
  const coeffs = [];
  const put = (deg, c) => {
    if (deg > maxDeg) throw new Error('degree too high');
    while (coeffs.length <= deg) coeffs.push(ZERO);
    coeffs[deg] = add(coeffs[deg], c);
  };
  try {
    for (const t of terms) {
      if (!containsVar(t, x)) { put(0, t); continue; }
      const { coeff, rest } = splitCoeff(t);
      const d = monomialDegree(rest, x);
      if (d === null) return null;
      put(d, coeff);
    }
  } catch { return null; }
  if (coeffs.length === 0) coeffs.push(ZERO);
  return coeffs;
}

function monomialDegree(n, x) {
  if (n.k === 'var') return n.n === x ? 1 : (containsVar(n, x) ? null : 0);
  if (!containsVar(n, x)) return 0;
  if (n.k === 'pow') {
    if (!isNum(n.b) || !isInt(n.b) || n.b.p < 0) return null;
    const inner = monomialDegree(n.a, x);
    return inner === null ? null : inner * n.b.p;
  }
  if (n.k === 'prod') {
    let d = 0;
    for (const f of n.a) {
      const fd = monomialDegree(f, x);
      if (fd === null) return null;
      d += fd;
    }
    return d;
  }
  return null;
}

/** Distribute products over sums and expand integer powers of sums. */
export function expand(n) {
  const e = simplify(n);
  switch (e.k) {
    case 'sum': return simplify(SUM(e.a.map(expand)));
    case 'prod': {
      let acc = [ONE];
      for (const f of e.a.map(expand)) {
        const parts = f.k === 'sum' ? f.a : [f];
        const next = [];
        for (const a of acc) for (const p of parts) next.push(simplify(PROD([a, p])));
        acc = next;
        if (acc.length > 400) return simplify(PROD(e.a));
      }
      return simplify(SUM(acc));
    }
    case 'pow': {
      const base = expand(e.a);
      if (isNum(e.b) && isInt(e.b) && e.b.p >= 0 && e.b.p <= 12 && base.k === 'sum') {
        let acc = ONE;
        for (let i = 0; i < e.b.p; i++) acc = expand(PROD([acc, base]));
        return acc;
      }
      return simplify(POW(base, e.b));
    }
    default: return e;
  }
}

// --- Differentiation --------------------------------------------------------

export function diff(expr, x) {
  return simplify(d(simplify(expr), x));
}

function d(n, x) {
  if (!containsVar(n, x)) return ZERO;
  switch (n.k) {
    case 'var': return n.n === x ? ONE : ZERO;
    case 'sum': return SUM(n.a.map((t) => d(t, x)));
    case 'prod': {
      const terms = n.a.map((_, i) =>
        PROD(n.a.map((f, j) => (i === j ? d(f, x) : f))));
      return SUM(terms);
    }
    case 'pow': {
      const { a, b } = n;
      if (!containsVar(b, x)) {
        // n·f^(n-1)·f'
        return PROD([b, POW(a, simpSum([b, NEG_ONE])), d(a, x)]);
      }
      if (!containsVar(a, x)) {
        // a^f · ln a · f'
        return PROD([n, FN('ln', [a]), d(b, x)]);
      }
      // General: f^g · (g'·ln f + g·f'/f)
      return PROD([n, SUM([
        PROD([d(b, x), FN('ln', [a])]),
        PROD([b, d(a, x), POW(a, NEG_ONE)]),
      ])]);
    }
    case 'fn': {
      const u = n.args[0];
      const du = d(u, x);
      const chain = (outer) => PROD([outer, du]);
      switch (n.n) {
        case 'sin': return chain(FN('cos', [u]));
        case 'cos': return chain(PROD([NEG_ONE, FN('sin', [u])]));
        case 'tan': return chain(SUM([ONE, POW(FN('tan', [u]), R(2))]));
        case 'asin': return chain(POW(SUM([ONE, PROD([NEG_ONE, POW(u, R(2))])]), R(-1, 2)));
        case 'acos': return chain(PROD([NEG_ONE, POW(SUM([ONE, PROD([NEG_ONE, POW(u, R(2))])]), R(-1, 2))]));
        case 'atan': return chain(POW(SUM([ONE, POW(u, R(2))]), NEG_ONE));
        case 'sinh': return chain(FN('cosh', [u]));
        case 'cosh': return chain(FN('sinh', [u]));
        case 'tanh': return chain(SUM([ONE, PROD([NEG_ONE, POW(FN('tanh', [u]), R(2))])]));
        case 'asinh': return chain(POW(SUM([POW(u, R(2)), ONE]), R(-1, 2)));
        case 'acosh': return chain(POW(SUM([POW(u, R(2)), NEG_ONE]), R(-1, 2)));
        case 'atanh': return chain(POW(SUM([ONE, PROD([NEG_ONE, POW(u, R(2))])]), NEG_ONE));
        case 'ln': return chain(POW(u, NEG_ONE));
        case 'log10': return chain(POW(PROD([u, FN('ln', [R(10)])]), NEG_ONE));
        case 'abs': return chain(PROD([u, POW(FN('abs', [u]), NEG_ONE)]));
        default: return FN('deriv_unknown', [n, V(x)]);
      }
    }
    default: return ZERO;
  }
}

// --- Integration ------------------------------------------------------------

const E = CONST('e');
const PI = CONST('pi');

/**
 * Symbolic antiderivative of `expr` with respect to `x`.
 * Returns an internal expression, or null when no closed form was found.
 */
export function integrate(expr, x, depth = 0) {
  if (depth > 6) return null;
  const e = simplify(expr);

  if (!containsVar(e, x)) return simplify(PROD([e, V(x)]));
  if (e.k === 'var' && e.n === x) return simplify(PROD([HALF, POW(V(x), R(2))]));

  // Linearity over sums.
  if (e.k === 'sum') {
    const parts = [];
    for (const t of e.a) {
      const r = integrate(t, x, depth + 1);
      if (!r) return null;
      parts.push(r);
    }
    return simplify(SUM(parts));
  }

  // Pull out constant factors.
  if (e.k === 'prod') {
    const consts = e.a.filter((f) => !containsVar(f, x));
    const rest = e.a.filter((f) => containsVar(f, x));
    if (consts.length > 0) {
      const inner = integrate(rest.length === 1 ? rest[0] : PROD(rest), x, depth + 1);
      if (!inner) return null;
      return simplify(PROD([...consts, inner]));
    }
  }

  const direct = integrateAtom(e, x, depth);
  if (direct) return simplify(direct);

  const bySub = integrateBySubstitution(e, x, depth);
  if (bySub) return simplify(bySub);

  const byParts = integrateByParts(e, x, depth);
  if (byParts) return simplify(byParts);

  const rational = integrateRational(e, x, depth);
  if (rational) return simplify(rational);

  const trig = integrateTrigPower(e, x, depth);
  if (trig) return simplify(trig);

  return null;
}

/** Table-driven rules for f(ax+b) shapes. */
function integrateAtom(e, x, depth) {
  // Powers: u^n where u is linear in x.
  if (e.k === 'pow') {
    const base = e.a, exp = e.b;
    if (!containsVar(exp, x)) {
      const lin = linearIn(base, x);
      if (lin && !isZero(lin.a)) {
        if (isNum(exp) && valueOf(exp) === -1) {
          return div(FN('ln', [FN('abs', [base])]), lin.a);
        }
        const np1 = add(exp, ONE);
        return div(POW(base, np1), mul(lin.a, np1));
      }
    }
    if (!containsVar(base, x)) {
      // c^(ax+b)
      const lin = linearIn(exp, x);
      if (lin && !isZero(lin.a)) {
        const lnc = base.k === 'const' && base.n === 'e' ? ONE : FN('ln', [base]);
        return div(e, mul(lin.a, lnc));
      }
    }
  }

  if (e.k === 'var' && e.n === x) return mul(HALF, POW(V(x), R(2)));

  if (e.k === 'fn' && e.args.length === 1) {
    const u = e.args[0];
    const lin = linearIn(u, x);
    if (!lin || isZero(lin.a)) return null;
    const a = lin.a;
    switch (e.n) {
      case 'sin': return div(neg(FN('cos', [u])), a);
      case 'cos': return div(FN('sin', [u]), a);
      case 'tan': return div(neg(FN('ln', [FN('abs', [FN('cos', [u])])])), a);
      case 'sinh': return div(FN('cosh', [u]), a);
      case 'cosh': return div(FN('sinh', [u]), a);
      case 'tanh': return div(FN('ln', [FN('cosh', [u])]), a);
      case 'ln': return div(sub(mul(u, FN('ln', [u])), u), a);
      case 'log10': return div(div(sub(mul(u, FN('ln', [u])), u), FN('ln', [R(10)])), a);
      case 'asin': return div(add(mul(u, FN('asin', [u])), pw(sub(ONE, pw(u, R(2))), HALF)), a);
      case 'acos': return div(sub(mul(u, FN('acos', [u])), pw(sub(ONE, pw(u, R(2))), HALF)), a);
      case 'atan': return div(sub(mul(u, FN('atan', [u])), mul(HALF, FN('ln', [add(ONE, pw(u, R(2)))]))), a);
      default: return null;
    }
  }
  return null;
}

/**
 * u-substitution: look for a sub-expression g(x) whose derivative divides out.
 */
function integrateBySubstitution(e, x, depth) {
  if (depth > 4) return null;
  const cands = subexpressions(e, x);
  const U = 'u'; // a variable name the user can never type

  for (const g of cands) {
    if (g.k === 'var' && g.n === x) continue;
    const gp = diff(g, x);
    if (isZero(gp)) continue;
    const quotient = simplify(PROD([e, POW(gp, NEG_ONE)]));
    const replaced = simplify(replaceAll(quotient, g, V(U)));
    if (containsVar(replaced, x)) continue;
    const anti = integrate(replaced, U, depth + 1);
    if (!anti) continue;
    return substitute(anti, U, g);
  }
  return null;
}

function subexpressions(n, x, out = [], seen = new Set()) {
  const push = (e) => {
    if (!containsVar(e, x)) return;
    const kk = key(e);
    if (seen.has(kk)) return;
    seen.add(kk);
    out.push(e);
  };
  switch (n.k) {
    case 'sum': case 'prod':
      n.a.forEach((c) => { push(c); subexpressions(c, x, out, seen); });
      break;
    case 'pow':
      push(n.a); push(n.b);
      subexpressions(n.a, x, out, seen);
      subexpressions(n.b, x, out, seen);
      break;
    case 'fn':
      n.args.forEach((c) => { push(c); subexpressions(c, x, out, seen); });
      break;
    default: break;
  }
  return out;
}

/** LIATE-style integration by parts, with a small recursion budget. */
function integrateByParts(e, x, depth) {
  if (depth > 4 || e.k !== 'prod') return null;
  const factors = e.a.filter((f) => containsVar(f, x));
  if (factors.length < 2) return null;

  // Try each split of the product into u and dv.
  for (const uIdx of orderByLiate(factors, x)) {
    const u = factors[uIdx];
    const dvFactors = factors.filter((_, i) => i !== uIdx);
    const dv = dvFactors.length === 1 ? dvFactors[0] : PROD(dvFactors);
    const v = integrate(dv, x, depth + 1);
    if (!v) continue;
    const du = diff(u, x);
    const remainder = simplify(PROD([v, du]));
    // Guard against parts that loops back to the original integrand.
    if (key(simplify(remainder)) === key(e)) continue;
    const rest = integrate(remainder, x, depth + 1);
    if (!rest) continue;
    return sub(mul(u, v), rest);
  }
  return null;
}

/** Preference order for u in ∫u dv: log, inverse trig, algebraic, trig, exp. */
function orderByLiate(factors, x) {
  const score = (f) => {
    if (f.k === 'fn') {
      if (['ln', 'log10'].includes(f.n)) return 0;
      if (['asin', 'acos', 'atan', 'asinh', 'acosh', 'atanh'].includes(f.n)) return 1;
      if (['sin', 'cos', 'tan', 'sinh', 'cosh', 'tanh'].includes(f.n)) return 3;
      return 2;
    }
    if (f.k === 'pow' && !containsVar(f.a, x)) return 4; // exponential
    return 2; // algebraic
  };
  return factors
    .map((f, i) => ({ i, s: score(f) }))
    .sort((a, b) => a.s - b.s)
    .map((o) => o.i);
}

// --- Rational functions: partial fractions ----------------------------------

/** Express `e` as a ratio of polynomials in x with rational coefficients. */
function asRatio(e, x) {
  const n = simplify(e);
  if (!containsVar(n, x)) return { num: [n], den: [ONE] };
  if (n.k === 'var') return { num: [ZERO, ONE], den: [ONE] };
  if (isNum(n)) return { num: [n], den: [ONE] };

  switch (n.k) {
    case 'sum': {
      let acc = { num: [ZERO], den: [ONE] };
      for (const t of n.a) {
        const r = asRatio(t, x);
        if (!r) return null;
        acc = {
          num: polyAdd(polyMul(acc.num, r.den), polyMul(r.num, acc.den)),
          den: polyMul(acc.den, r.den),
        };
      }
      return acc;
    }
    case 'prod': {
      let acc = { num: [ONE], den: [ONE] };
      for (const t of n.a) {
        const r = asRatio(t, x);
        if (!r) return null;
        acc = { num: polyMul(acc.num, r.num), den: polyMul(acc.den, r.den) };
      }
      return acc;
    }
    case 'pow': {
      if (!isNum(n.b) || !isInt(n.b) || Math.abs(n.b.p) > 12) return null;
      const base = asRatio(n.a, x);
      if (!base) return null;
      const e2 = n.b.p;
      let num = [ONE], den = [ONE];
      for (let i = 0; i < Math.abs(e2); i++) {
        num = polyMul(num, e2 > 0 ? base.num : base.den);
        den = polyMul(den, e2 > 0 ? base.den : base.num);
      }
      return { num, den };
    }
    default: return null;
  }
}

const polyTrim = (p) => { const q = p.slice(); while (q.length > 1 && isZero(q[q.length - 1])) q.pop(); return q; };
const polyDeg = (p) => polyTrim(p).length - 1;

function polyAdd(a, b) {
  const out = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) out.push(add(a[i] || ZERO, b[i] || ZERO));
  return polyTrim(out);
}
function polyMul(a, b) {
  const out = new Array(a.length + b.length - 1).fill(ZERO);
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) out[i + j] = add(out[i + j], mul(a[i], b[j]));
  }
  return polyTrim(out);
}
function polyDivMod(a, b) {
  a = polyTrim(a); b = polyTrim(b);
  const q = new Array(Math.max(1, a.length - b.length + 1)).fill(ZERO);
  let r = a.slice();
  const bd = polyDeg(b);
  const lead = b[bd];
  while (polyTrim(r).length - 1 >= bd && !(r.length === 1 && isZero(r[0]))) {
    const rd = polyTrim(r).length - 1;
    if (rd < bd) break;
    const c = div(r[rd], lead);
    q[rd - bd] = add(q[rd - bd] || ZERO, c);
    for (let i = 0; i <= bd; i++) r[rd - bd + i] = sub(r[rd - bd + i], mul(c, b[i]));
    r = polyTrim(r);
  }
  return { q: polyTrim(q), r: polyTrim(r) };
}

const polyToExpr = (p, x) => simplify(SUM(p.map((c, i) => PROD([c, POW(V(x), R(i))]))));

/** Rational roots of a polynomial with rational coefficients. */
function rationalRoots(poly) {
  const p = polyTrim(poly);
  if (p.some((c) => !isRat(c))) return [];
  // Clear denominators to get integer coefficients.
  let lcm = 1;
  for (const c of p) lcm = (lcm * c.q) / gcd(lcm, c.q);
  if (!Number.isFinite(lcm) || lcm > 1e9) return [];
  const ints = p.map((c) => (c.p * lcm) / c.q);
  const a0 = ints[0], an = ints[ints.length - 1];
  if (an === 0) return [];
  const roots = [];
  if (a0 === 0) roots.push(R(0));
  const divisors = (v) => {
    v = Math.abs(Math.round(v));
    const out = [];
    if (v === 0) return [1];
    for (let i = 1; i * i <= v && i <= 5000; i++) {
      if (v % i === 0) { out.push(i); if (i !== v / i) out.push(v / i); }
    }
    return out;
  };
  for (const pnum of divisors(a0 === 0 ? an : a0)) {
    for (const qden of divisors(an)) {
      for (const s of [1, -1]) {
        const cand = R(s * pnum, qden);
        if (roots.some((r) => equal(r, cand))) continue;
        if (isZero(polyEval(p, cand))) roots.push(cand);
      }
    }
  }
  return roots;
}

function polyEval(p, v) {
  let acc = ZERO;
  for (let i = p.length - 1; i >= 0; i--) acc = add(mul(acc, v), p[i]);
  return simplify(acc);
}

/** Factor a polynomial into (x − r)^m factors plus an unfactored remainder. */
function factorPoly(poly) {
  let p = polyTrim(poly);
  const factors = []; // { root, mult }
  let guard = 0;
  while (polyDeg(p) > 0 && guard++ < 24) {
    const roots = rationalRoots(p);
    if (roots.length === 0) break;
    const r = roots[0];
    let mult = 0;
    for (;;) {
      const { q, r: rem } = polyDivMod(p, [neg(r), ONE]);
      if (polyTrim(rem).length === 1 && isZero(rem[0])) { p = q; mult++; }
      else break;
    }
    factors.push({ root: r, mult });
  }
  return { factors, rest: p };
}

function integrateRational(e, x, depth) {
  const ratio = asRatio(e, x);
  if (!ratio) return null;
  const den = polyTrim(ratio.den);
  if (polyDeg(den) < 1) return null;
  const numr = polyTrim(ratio.num);
  if (numr.some((c) => !isNum(c)) || den.some((c) => !isNum(c))) return null;

  // Polynomial part first.
  const { q, r } = polyDivMod(numr, den);
  let result = ZERO;
  if (polyDeg(q) >= 0 && !(q.length === 1 && isZero(q[0]))) {
    const polyInt = integrate(polyToExpr(q, x), x, depth + 1);
    if (!polyInt) return null;
    result = add(result, polyInt);
  }
  if (r.length === 1 && isZero(r[0])) return result;

  const { factors, rest } = factorPoly(den);
  const restDeg = polyDeg(rest);
  if (restDeg > 2) return null;
  if (restDeg === 1 && !isZero(rest[0])) {
    // Leftover linear factor with an irrational root — normalise it away.
    const root = neg(div(rest[0], rest[1]));
    factors.push({ root, mult: 1 });
    rest.length = 1;
    rest[0] = ONE;
  }

  // Build the partial-fraction basis.
  const basis = []; // { denPoly, numPoly (unknown coefficients), kind }
  for (const f of factors) {
    for (let m = 1; m <= f.mult; m++) {
      basis.push({ kind: 'linear', root: f.root, power: m });
    }
  }
  const quad = restDeg === 2 ? rest : null;
  if (quad) { basis.push({ kind: 'quad', poly: quad, part: 'x' }); basis.push({ kind: 'quad', poly: quad, part: '1' }); }

  if (basis.length === 0) return null;

  // Solve for the unknown numerators by matching coefficients.
  const denFull = den;
  const cols = [];
  for (const b of basis) {
    let piece;
    if (b.kind === 'linear') {
      // denFull / (x - root)^power
      let acc = denFull;
      for (let i = 0; i < b.power; i++) {
        const dm = polyDivMod(acc, [neg(b.root), ONE]);
        acc = dm.q;
      }
      piece = acc;
    } else {
      let acc = polyDivMod(denFull, b.poly).q;
      piece = b.part === 'x' ? polyMul(acc, [ZERO, ONE]) : acc;
    }
    cols.push(piece);
  }

  const size = Math.max(polyDeg(denFull), ...cols.map(polyDeg)) + 1;
  const A = [];
  const bvec = [];
  for (let row = 0; row < size; row++) {
    A.push(cols.map((c) => valueOf(simplify(c[row] || ZERO))));
    bvec.push(valueOf(simplify(r[row] || ZERO)));
  }
  const sol = leastSquares(A, bvec, basis.length);
  if (!sol) return null;

  for (let i = 0; i < basis.length; i++) {
    const coeff = rationalize(sol[i]);
    if (isZero(coeff)) continue;
    const b = basis[i];
    if (b.kind === 'linear') {
      const lin = sub(V(x), b.root);
      if (b.power === 1) result = add(result, mul(coeff, FN('ln', [FN('abs', [lin])])));
      else result = add(result, mul(coeff, div(pw(lin, R(1 - b.power)), R(1 - b.power))));
    } else {
      // (Bx + C) / (a x² + b x + c) → complete the square.
      const [c0, c1, c2] = [b.poly[0], b.poly[1] || ZERO, b.poly[2]];
      const aa = c2, bb = c1, cc = c0;
      const shift = div(bb, mul(R(2), aa));               // x + shift
      const disc = sub(div(cc, aa), pw(shift, R(2)));     // (x+shift)² + disc
      if (valueOf(simplify(disc)) <= 0) return null;      // real roots — should have factored
      const rootDisc = pw(disc, HALF);
      const u = add(V(x), shift);
      if (b.part === 'x') {
        // ∫ x/(a(u²+disc)) dx = 1/(2a)·ln(u²+disc) − shift/a · atan(u/√disc)/√disc
        result = add(result, mul(coeff, div(mul(HALF, FN('ln', [add(pw(u, R(2)), disc)])), aa)));
        result = sub(result, mul(coeff, div(mul(shift, div(FN('atan', [div(u, rootDisc)]), rootDisc)), aa)));
      } else {
        result = add(result, mul(coeff, div(div(FN('atan', [div(u, rootDisc)]), rootDisc), aa)));
      }
    }
  }
  return result;
}

/** Small dense least-squares solve (the systems here are tiny and exact). */
function leastSquares(A, b, n) {
  const m = A.length;
  const M = [];
  for (let i = 0; i < n; i++) {
    const row = new Array(n + 1).fill(0);
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let k = 0; k < m; k++) s += A[k][i] * A[k][j];
      row[j] = s;
    }
    let s = 0;
    for (let k = 0; k < m; k++) s += A[k][i] * b[k];
    row[n] = s;
    M.push(row);
  }
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let rr = col + 1; rr < n; rr++) if (Math.abs(M[rr][col]) > Math.abs(M[piv][col])) piv = rr;
    if (Math.abs(M[piv][col]) < 1e-12) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let rr = 0; rr < n; rr++) {
      if (rr === col) continue;
      const f = M[rr][col] / M[col][col];
      if (!f) continue;
      for (let kk = col; kk <= n; kk++) M[rr][kk] -= f * M[col][kk];
    }
  }
  const out = [];
  for (let i = 0; i < n; i++) out.push(M[i][n] / M[i][i]);
  // Verify the solution actually reproduces b.
  for (let k = 0; k < m; k++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += A[k][j] * out[j];
    if (Math.abs(s - b[k]) > 1e-7 * Math.max(1, Math.abs(b[k]))) return null;
  }
  return out;
}

// --- Trigonometric powers ---------------------------------------------------

/** sin²(u) and cos²(u) via power reduction, so ∫sin²x dx works. */
function integrateTrigPower(e, x, depth) {
  if (depth > 4) return null;
  const reduced = reduceTrigSquares(e);
  if (!reduced || key(reduced) === key(e)) return null;
  return integrate(reduced, x, depth + 1);
}

function reduceTrigSquares(n) {
  let changed = false;
  const walk = (e) => {
    if (e.k === 'pow' && isNum(e.b) && isInt(e.b) && e.b.p >= 2 && e.b.p % 2 === 0
        && e.a.k === 'fn' && (e.a.n === 'sin' || e.a.n === 'cos')) {
      changed = true;
      const u = e.a.args[0];
      const half = e.a.n === 'sin'
        ? mul(HALF, sub(ONE, FN('cos', [mul(R(2), u)])))
        : mul(HALF, add(ONE, FN('cos', [mul(R(2), u)])));
      const times = e.b.p / 2;
      let acc = ONE;
      for (let i = 0; i < times; i++) acc = expand(PROD([acc, half]));
      return acc;
    }
    switch (e.k) {
      case 'sum': return SUM(e.a.map(walk));
      case 'prod': return PROD(e.a.map(walk));
      case 'pow': return POW(walk(e.a), walk(e.b));
      case 'fn': return FN(e.n, e.args.map(walk));
      default: return e;
    }
  };
  const out = simplify(expand(walk(n)));
  return changed ? out : null;
}

// --- Definite integrals -----------------------------------------------------

/**
 * Definite integral via the antiderivative. Returns { value, antiderivative }
 * or null when no closed form exists (caller falls back to quadrature).
 */
export function definiteIntegral(expr, x, lo, hi) {
  const F = integrate(simplify(expr), x);
  if (!F) return null;
  const at = (p) => evalNumeric(substitute(F, x, p));
  const a = at(lo), b = at(hi);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return { value: b - a, antiderivative: F };
}

/** Fast numeric evaluation of a fully-numeric internal expression. */
export function evalNumeric(n, env = {}) {
  switch (n.k) {
    case 'num': return n.p / n.q;
    case 'flt': return n.v;
    case 'var': return env[n.n] !== undefined ? env[n.n] : NaN;
    case 'const': return n.n === 'pi' ? Math.PI : n.n === 'e' ? Math.E : NaN;
    case 'sum': return n.a.reduce((s, t) => s + evalNumeric(t, env), 0);
    case 'prod': return n.a.reduce((s, t) => s * evalNumeric(t, env), 1);
    case 'pow': {
      const b = evalNumeric(n.a, env), p = evalNumeric(n.b, env);
      if (b < 0 && !Number.isInteger(p)) {
        const inv = 1 / p;
        if (Math.abs(inv - Math.round(inv)) < 1e-12 && Math.round(inv) % 2 !== 0) {
          return -Math.pow(-b, p);
        }
      }
      return Math.pow(b, p);
    }
    case 'fn': {
      const a = n.args.map((t) => evalNumeric(t, env));
      const M = {
        sin: Math.sin, cos: Math.cos, tan: Math.tan,
        asin: Math.asin, acos: Math.acos, atan: Math.atan,
        sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
        asinh: Math.asinh, acosh: Math.acosh, atanh: Math.atanh,
        ln: Math.log, log10: Math.log10, abs: Math.abs,
      };
      if (M[n.n]) return M[n.n](a[0]);
      return NaN;
    }
    default: return NaN;
  }
}

// --- Back to a display AST --------------------------------------------------

/** Internal expression → parser AST, restoring −, ÷ and √ for readability. */
export function toDisplayAst(n) {
  switch (n.k) {
    case 'num':
      return n.q === 1
        ? (n.p < 0 ? { k: 'neg', a: astNum(-n.p) } : astNum(n.p))
        : (n.p < 0
          ? { k: 'neg', a: bin('div', astNum(-n.p), astNum(n.q)) }
          : bin('div', astNum(n.p), astNum(n.q)));
    case 'flt':
      return n.v < 0 ? { k: 'neg', a: astNum(-n.v) } : astNum(n.v);
    case 'var':
      if (n.n === 'Ans') return { k: 'ans' };
      if (n.n === 'PreAns') return { k: 'preans' };
      return { k: 'var', n: n.n };
    case 'const': return cst(n.n);
    case 'sum': {
      const terms = n.a.map((t) => ({ t, neg: isNegative(t) }));
      let out = null;
      for (const { t, neg: isNeg } of terms) {
        const piece = toDisplayAst(isNeg ? stripNeg(t) : t);
        if (out === null) out = isNeg ? { k: 'neg', a: piece } : piece;
        else out = bin(isNeg ? 'sub' : 'add', out, piece);
      }
      return out ?? astNum(0);
    }
    case 'prod': {
      const numer = [];
      const denom = [];
      let sign = 1;
      for (const f of n.a) {
        if (isNum(f) && valueOf(f) === -1) { sign = -sign; continue; }
        if (f.k === 'pow' && isNum(f.b) && valueOf(f.b) < 0) {
          const e = nNeg(f.b);
          denom.push(isOne(e) ? f.a : POW(f.a, e));
        } else if (isRat(f) && f.q !== 1) {
          const p = Math.abs(f.p);
          if (f.p < 0) sign = -sign;
          if (p !== 1) numer.push(R(p)); // a bare 1 in the numerator is noise
          denom.push(R(f.q));
        } else if (isNum(f) && valueOf(f) < 0) {
          sign = -sign;
          numer.push(nNeg(f));
        } else numer.push(f);
      }
      const build = (list) => {
        if (list.length === 0) return astNum(1);
        return list.map(toDisplayAst).reduce((a, b2) => bin('mul', a, b2));
      };
      let out = denom.length === 0 ? build(numer) : bin('div', build(numer), build(denom));
      return sign < 0 ? { k: 'neg', a: out } : out;
    }
    case 'pow': {
      if (isNum(n.b) && n.b.k === 'num' && n.b.p === 1 && n.b.q === 2) {
        return astFn('sqrt', [toDisplayAst(n.a)]);
      }
      if (isNum(n.b) && n.b.k === 'num' && n.b.p === 1 && n.b.q === 3) {
        return astFn('cbrt', [toDisplayAst(n.a)]);
      }
      if (n.a.k === 'const' && n.a.n === 'e') return astFn('exp', [toDisplayAst(n.b)]);
      return bin('pow', toDisplayAst(n.a), toDisplayAst(n.b));
    }
    case 'fn': {
      if (n.n === 'log10') return astFn('log', [toDisplayAst(n.args[0])]);
      return astFn(n.n, n.args.map(toDisplayAst));
    }
    default: return astNum(0);
  }
}

function isNegative(t) {
  if (isNum(t)) return valueOf(t) < 0;
  if (t.k === 'prod') {
    const { coeff } = splitCoeff(t);
    return valueOf(coeff) < 0;
  }
  return false;
}
function stripNeg(t) {
  if (isNum(t)) return nNeg(t);
  if (t.k === 'prod') return simpProd([NEG_ONE, t]);
  return t;
}

/** Human-readable linear text, used for the small "hint" line. */
export function toText(n) {
  switch (n.k) {
    case 'num': return n.q === 1 ? String(n.p) : `${n.p}/${n.q}`;
    case 'flt': return String(Number(n.v.toPrecision(10)));
    case 'var': return n.n;
    case 'const': return n.n === 'pi' ? 'π' : n.n === 'e' ? 'ℯ' : 'ⅈ';
    case 'sum': return n.a.map(toText).join(' + ').replace(/\+ -/g, '- ');
    case 'prod': return n.a.map((f) => (f.k === 'sum' ? `(${toText(f)})` : toText(f))).join('·');
    case 'pow': return `${wrapText(n.a)}^${wrapText(n.b)}`;
    case 'fn': return `${n.n}(${n.args.map(toText).join(', ')})`;
    default: return '?';
  }
}
function wrapText(n) {
  return ['sum', 'prod', 'pow'].includes(n.k) || (isNum(n) && valueOf(n) < 0)
    ? `(${toText(n)})` : toText(n);
}
