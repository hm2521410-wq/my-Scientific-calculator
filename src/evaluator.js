// Numeric evaluation of the AST. Everything is complex-valued internally;
// COMP mode simply rejects a non-real final answer.

import * as Z from './complex.js';
import { CalcError, VARIABLES } from './parser.js';
import { integrate, derivative } from './numeric.js';

export function makeContext(overrides = {}) {
  const vars = {};
  for (const v of VARIABLES) vars[v] = Z.C(0, 0);
  return {
    angle: 'deg',          // 'deg' | 'rad' | 'gra'
    vars,
    ans: Z.C(0, 0),
    preans: Z.C(0, 0),
    complexMode: false,
    base: 0,               // 0 = normal, otherwise 2 / 8 / 10 / 16
    wordBits: 32,
    sigDigits: 10,
    lastPair: null,        // Pol / Rec results
    ...overrides,
  };
}

const DEG = Math.PI / 180;
const GRA = Math.PI / 200;

export function angleFactor(ctx) {
  return ctx.angle === 'deg' ? DEG : ctx.angle === 'gra' ? GRA : 1;
}

const mathErr = (detail) => new CalcError('Math ERROR', -1, detail);

function req(z) {
  if (z === null || z === undefined) throw mathErr('undefined result');
  return z;
}

function realOf(z, what = 'value') {
  if (!Z.isReal(z)) throw mathErr(`${what} must be real`);
  return z.re;
}

// --- BASE-N helpers ---------------------------------------------------------

function toWord(v, ctx) {
  const bits = ctx.wordBits;
  let n = Math.trunc(v);
  const mod = Math.pow(2, bits);
  n = ((n % mod) + mod) % mod;
  if (n >= mod / 2) n -= mod;
  return n;
}

const bitOp = (op) => (a, b, ctx) => {
  const x = toWord(realOf(a), ctx) | 0;
  const y = toWord(realOf(b), ctx) | 0;
  let r;
  switch (op) {
    case 'and': r = x & y; break;
    case 'or': r = x | y; break;
    case 'xor': r = x ^ y; break;
    case 'xnor': r = ~(x ^ y); break;
    default: r = 0;
  }
  return Z.C(toWord(r, ctx), 0);
};

// --- Combinatorics ----------------------------------------------------------

function factorial(z) {
  const n = realOf(z, 'x!');
  if (!Number.isInteger(n) || n < 0) throw mathErr('x! needs a non-negative integer');
  if (n > 170) throw mathErr('x! overflow');
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return Z.C(r, 0);
}

function nPr(a, b) {
  const n = realOf(a), r = realOf(b);
  if (!Number.isInteger(n) || !Number.isInteger(r) || n < 0 || r < 0 || r > n) {
    throw mathErr('nPr needs integers with 0 ≤ r ≤ n');
  }
  let acc = 1;
  for (let i = 0; i < r; i++) acc *= n - i;
  return Z.C(acc, 0);
}

function nCr(a, b) {
  const n = realOf(a), r0 = realOf(b);
  if (!Number.isInteger(n) || !Number.isInteger(r0) || n < 0 || r0 < 0 || r0 > n) {
    throw mathErr('nCr needs integers with 0 ≤ r ≤ n');
  }
  const r = Math.min(r0, n - r0);
  let acc = 1;
  for (let i = 1; i <= r; i++) acc = (acc * (n - r + i)) / i;
  return Z.C(Math.round(acc), 0);
}

function gcd2(a, b) {
  a = Math.abs(Math.trunc(a)); b = Math.abs(Math.trunc(b));
  while (b) { [a, b] = [b, a % b]; }
  return a;
}

// --- Rounding / display-linked helpers --------------------------------------

export function roundToSig(x, digits) {
  if (x === 0 || !Number.isFinite(x)) return x;
  const d = Math.ceil(Math.log10(Math.abs(x)));
  const power = digits - d;
  const mag = Math.pow(10, power);
  return Math.round(x * mag) / mag;
}

// --- Main evaluator ---------------------------------------------------------

export function evaluate(node, ctx) {
  const v = ev(node, ctx);
  return ctx.base ? Z.C(toWord(realOf(v), ctx), 0) : v;
}

function ev(n, ctx) {
  if (!n) throw new CalcError('Syntax ERROR', -1, 'empty expression');
  switch (n.k) {
    case 'num': return Z.C(n.v, 0);
    case 'const':
      if (n.n === 'pi') return Z.C(Math.PI, 0);
      if (n.n === 'e') return Z.C(Math.E, 0);
      return Z.C(0, 1);
    case 'var': return ctx.vars[n.n] ?? Z.C(0, 0);
    case 'ans': return ctx.ans;
    case 'preans': return ctx.preans;
    case 'paren': return ev(n.a, ctx);
    case 'neg': return Z.neg(ev(n.a, ctx));
    case 'add': return applyBase(Z.add(ev(n.a, ctx), ev(n.b, ctx)), ctx);
    case 'sub': return applyBase(Z.sub(ev(n.a, ctx), ev(n.b, ctx)), ctx);
    case 'mul': return applyBase(Z.mul(ev(n.a, ctx), ev(n.b, ctx)), ctx);
    case 'div': {
      const b = ev(n.b, ctx);
      if (ctx.base) {
        const d = realOf(b);
        if (d === 0) throw mathErr('division by zero');
        return Z.C(Math.trunc(realOf(ev(n.a, ctx)) / d), 0);
      }
      const r = Z.div(ev(n.a, ctx), b);
      if (r === null) throw mathErr('division by zero');
      return r;
    }
    case 'pow': return req(Z.pow(ev(n.a, ctx), ev(n.b, ctx)));
    case 'fact': return factorial(ev(n.a, ctx));
    case 'pct': return Z.div(ev(n.a, ctx), Z.C(100, 0));
    case 'eq': throw new CalcError('Syntax ERROR', -1, '= is only valid in SOLVE / EQN');
    case 'fn': return callFn(n, ctx);
    default: throw new CalcError('Syntax ERROR', -1, `unknown node ${n.k}`);
  }
}

function applyBase(z, ctx) {
  return ctx.base ? Z.C(toWord(realOf(z), ctx), 0) : z;
}

function trigIn(z, ctx) {
  const f = angleFactor(ctx);
  return f === 1 ? z : Z.mul(z, Z.C(f, 0));
}
function trigOut(z, ctx) {
  const f = angleFactor(ctx);
  return f === 1 ? z : Z.div(z, Z.C(f, 0));
}

function callFn(n, ctx) {
  const name = n.n;
  const A = (i) => ev(n.args[i], ctx);
  const arity = (k) => {
    if (n.args.length !== k) throw new CalcError('Syntax ERROR', -1, `${name} takes ${k} argument(s)`);
  };

  switch (name) {
    // --- trigonometry ---
    case 'sin': arity(1); return req(Z.sin(trigIn(A(0), ctx)));
    case 'cos': arity(1); return req(Z.cos(trigIn(A(0), ctx)));
    case 'tan': arity(1); return req(Z.tan(trigIn(A(0), ctx)));
    case 'asin': arity(1); return trigOut(req(Z.asin(A(0))), ctx);
    case 'acos': arity(1); return trigOut(req(Z.acos(A(0))), ctx);
    case 'atan': arity(1); return trigOut(req(Z.atan(A(0))), ctx);
    case 'sinh': arity(1); return req(Z.sinh(A(0)));
    case 'cosh': arity(1); return req(Z.cosh(A(0)));
    case 'tanh': arity(1); return req(Z.tanh(A(0)));
    case 'asinh': arity(1); return req(Z.asinh(A(0)));
    case 'acosh': arity(1); return req(Z.acosh(A(0)));
    case 'atanh': arity(1); return req(Z.atanh(A(0)));

    // --- exponentials & logs ---
    case 'ln': arity(1); return req(Z.log(A(0)));
    case 'log': {
      if (n.args.length === 2) return logBase(A(0), A(1));
      arity(1);
      return req(Z.div(req(Z.log(A(0))), Z.C(Math.LN10, 0)));
    }
    case 'logb': arity(2); return logBase(A(0), A(1));
    case 'exp': arity(1); return Z.exp(A(0));
    case 'exp10': arity(1); return req(Z.pow(Z.C(10, 0), A(0)));
    case 'sqrt': arity(1); return Z.sqrt(A(0));
    case 'cbrt': arity(1); return Z.cbrt(A(0));
    case 'nroot': arity(2); return req(Z.nroot(A(0), A(1)));

    // --- complex helpers ---
    case 'abs': arity(1); return Z.cabs(A(0));
    case 'arg': arity(1); return trigOut(Z.C(Z.arg(A(0)), 0), ctx);
    case 'conjg': arity(1); return Z.conj(A(0));
    case 'Re': arity(1); return Z.C(A(0).re, 0);
    case 'Im': arity(1); return Z.C(A(0).im, 0);
    case 'polar': {
      arity(2);
      const r = A(0), th = trigIn(A(1), ctx);
      return Z.mul(r, Z.exp(Z.C(0, realOf(th, 'θ'))));
    }

    // --- angle-unit conversions (DRG▶) ---
    case 'todeg': arity(1); return Z.mul(A(0), Z.C(DEG / angleFactor(ctx), 0));
    case 'torad': arity(1); return Z.mul(A(0), Z.C(1 / angleFactor(ctx), 0));
    case 'tograd': arity(1); return Z.mul(A(0), Z.C(GRA / angleFactor(ctx), 0));
    case 'dms': {
      const d = realOf(A(0)), m = n.args.length > 1 ? realOf(A(1)) : 0,
        s = n.args.length > 2 ? realOf(A(2)) : 0;
      const sign = d < 0 ? -1 : 1;
      return Z.C(sign * (Math.abs(d) + m / 60 + s / 3600), 0);
    }

    // --- rounding / integer parts ---
    case 'Rnd': arity(1); {
      const z = A(0);
      return Z.C(roundToSig(z.re, ctx.sigDigits), roundToSig(z.im, ctx.sigDigits));
    }
    case 'Int': arity(1); return Z.C(Math.trunc(realOf(A(0))), 0);
    case 'Intg': arity(1); return Z.C(Math.floor(realOf(A(0))), 0);
    case 'Frac': arity(1); { const x = realOf(A(0)); return Z.C(x - Math.trunc(x), 0); }

    // --- combinatorics & number theory ---
    case 'nPr': arity(2); return nPr(A(0), A(1));
    case 'nCr': arity(2); return nCr(A(0), A(1));
    case 'GCD': arity(2); return Z.C(gcd2(realOf(A(0)), realOf(A(1))), 0);
    case 'LCM': arity(2); {
      const a = Math.trunc(realOf(A(0))), b = Math.trunc(realOf(A(1)));
      const g = gcd2(a, b);
      return Z.C(g === 0 ? 0 : Math.abs(a * b) / g, 0);
    }
    case 'mod': arity(2); {
      const a = realOf(A(0)), b = realOf(A(1));
      if (b === 0) throw mathErr('mod by zero');
      return Z.C(a - b * Math.trunc(a / b), 0);
    }
    case 'min': return Z.C(Math.min(...n.args.map((_, i) => realOf(A(i)))), 0);
    case 'max': return Z.C(Math.max(...n.args.map((_, i) => realOf(A(i)))), 0);

    // --- coordinate conversion ---
    case 'Pol': {
      arity(2);
      const x = realOf(A(0)), y = realOf(A(1));
      const r = Math.hypot(x, y);
      const th = Math.atan2(y, x) / angleFactor(ctx);
      ctx.vars.X = Z.C(r, 0);
      ctx.vars.Y = Z.C(th, 0);
      ctx.lastPair = { labels: ['r', 'θ'], a: Z.C(r, 0), b: Z.C(th, 0) };
      return Z.C(r, 0);
    }
    case 'Rec': {
      arity(2);
      const r = realOf(A(0)), th = realOf(A(1)) * angleFactor(ctx);
      const x = r * Math.cos(th), y = r * Math.sin(th);
      ctx.vars.X = Z.C(x, 0);
      ctx.vars.Y = Z.C(y, 0);
      ctx.lastPair = { labels: ['X', 'Y'], a: Z.C(x, 0), b: Z.C(y, 0) };
      return Z.C(x, 0);
    }

    // --- randomness ---
    case 'Ran#': return Z.C(Math.floor(Math.random() * 1000) / 1000, 0);
    case 'RanInt': {
      arity(2);
      const a = Math.trunc(realOf(A(0))), b = Math.trunc(realOf(A(1)));
      if (b < a) throw mathErr('RanInt needs a ≤ b');
      return Z.C(a + Math.floor(Math.random() * (b - a + 1)), 0);
    }

    // --- bitwise (BASE-N) ---
    case 'and': case 'or': case 'xor': case 'xnor':
      arity(2); return bitOp(name)(A(0), A(1), ctx);
    case 'not': arity(1); return Z.C(toWord(~(toWord(realOf(A(0)), ctx) | 0), ctx), 0);
    case 'negb': arity(1); return Z.C(toWord(-toWord(realOf(A(0)), ctx), ctx), 0);

    // --- calculus (numeric) ---
    case 'integ': {
      if (n.args.length < 3) throw new CalcError('Syntax ERROR', -1, '∫ needs f, lower and upper');
      const lo = realOf(ev(n.args[1], ctx), 'lower limit');
      const hi = realOf(ev(n.args[2], ctx), 'upper limit');
      const f = bindX(n.args[0], ctx);
      const r = integrate(f, lo, hi, 1e-11);
      if (!Number.isFinite(r.value)) throw mathErr('∫ did not converge');
      return Z.C(r.value, 0);
    }
    case 'deriv': {
      if (n.args.length < 2) throw new CalcError('Syntax ERROR', -1, 'd/dx needs f and a point');
      const at = realOf(ev(n.args[1], ctx), 'point');
      const f = bindX(n.args[0], ctx);
      const r = derivative(f, at);
      if (!Number.isFinite(r.value)) throw mathErr('d/dx did not converge');
      return Z.C(roundToSig(r.value, 11), 0);
    }
    case 'sumf': case 'prodf': {
      if (n.args.length < 3) throw new CalcError('Syntax ERROR', -1, 'Σ needs f, from and to');
      const lo = realOf(ev(n.args[1], ctx), 'lower limit');
      const hi = realOf(ev(n.args[2], ctx), 'upper limit');
      if (!Number.isInteger(lo) || !Number.isInteger(hi)) throw mathErr('Σ limits must be integers');
      if (hi < lo) throw mathErr('Σ needs from ≤ to');
      if (hi - lo > 100000) throw mathErr('Σ range too large');
      const saved = ctx.vars.X;
      let acc = name === 'sumf' ? Z.C(0, 0) : Z.C(1, 0);
      try {
        for (let k = lo; k <= hi; k++) {
          ctx.vars.X = Z.C(k, 0);
          const t = ev(n.args[0], ctx);
          acc = name === 'sumf' ? Z.add(acc, t) : Z.mul(acc, t);
        }
      } finally { ctx.vars.X = saved; }
      return acc;
    }

    default:
      throw new CalcError('Syntax ERROR', -1, `unknown function ${name}`);
  }
}

function logBase(b, x) {
  const lb = req(Z.log(b));
  const lx = req(Z.log(x));
  const r = Z.div(lx, lb);
  if (r === null) throw mathErr('log base 1 is undefined');
  return r;
}

/** Turn an AST into a real function of X, reusing the surrounding context. */
export function bindX(ast, ctx, varName = 'X') {
  const saved = ctx.vars[varName];
  return (x) => {
    ctx.vars[varName] = Z.C(x, 0);
    try {
      const v = ev(ast, ctx);
      return Z.isReal(v) ? v.re : NaN;
    } catch {
      return NaN;
    } finally {
      ctx.vars[varName] = saved;
    }
  };
}

/** Complex-valued binding, used by the complex root polisher. */
export function bindComplex(ast, ctx, varName = 'X') {
  const saved = ctx.vars[varName];
  return (z) => {
    ctx.vars[varName] = z;
    try { return ev(ast, ctx); }
    catch { return null; }
    finally { ctx.vars[varName] = saved; }
  };
}
