// Equation solving: exact where possible, numeric everywhere else.
//
//   * linear and quadratic equations are solved in closed form (surds and
//     complex roots included)
//   * higher-degree polynomials get exact rational roots plus Durand–Kerner
//     for the rest
//   * anything else falls back to a sign-change scan plus Newton polishing,
//     so SOLVE reports every real root it can find rather than just one

import * as S from './symbolic.js';
import { polynomialRoots, findRealRoots, newtonSolve, solveLinearSystem } from './numeric.js';
import { bindX } from './evaluator.js';
import { VARIABLES } from './parser.js';
import * as Z from './complex.js';

/** Replace every variable except `keep` with its current value from ctx. */
export function inlineContext(expr, ctx, keep) {
  let e = expr;
  for (const v of VARIABLES) {
    if (v === keep) continue;
    if (!S.containsVar(e, v)) continue;
    const val = ctx.vars[v];
    if (!val || !Z.isReal(val)) return null;
    e = S.substitute(e, v, S.rationalize(val.re));
  }
  for (const [name, val] of [['Ans', ctx.ans], ['PreAns', ctx.preans]]) {
    if (S.containsVar(e, name)) {
      if (!Z.isReal(val)) return null;
      e = S.substitute(e, name, S.rationalize(val.re));
    }
  }
  return S.simplify(e);
}

const cx = (re, im = 0) => ({ re, im });

/**
 * Solve one equation for one unknown.
 * @returns {{ roots: Array, kind: string, note?: string }}
 *   each root is { value: {re,im}, exact: displayAst|null }
 */
export function solveEquation(ast, varName, ctx, opts = {}) {
  const diffAst = ast.k === 'eq' ? { k: 'sub', a: ast.a, b: ast.b } : ast;

  // --- symbolic route ---
  let internal = null;
  try {
    internal = inlineContext(S.simplify(S.fromAst(diffAst)), ctx, varName);
  } catch { internal = null; }

  if (internal && ctx.angle === 'rad') {
    const poly = tryPolynomial(internal, varName);
    if (poly) return poly;
  } else if (internal) {
    // Trig in Deg/Gra mode is not the same function symbolically, so only take
    // the polynomial route when the equation has no trig at all.
    if (!hasAngleSensitiveFn(internal)) {
      const poly = tryPolynomial(internal, varName);
      if (poly) return poly;
    }
  }

  // --- numeric route ---
  const f = bindX(diffAst, ctx, varName);
  const guess = opts.guess ?? (Z.isReal(ctx.vars[varName]) ? ctx.vars[varName].re : 0);
  const span = opts.span ?? 50;
  const found = findRealRoots(f, -span, span, 1600);

  let roots = found.map((r) => ({ value: cx(cleanRoot(r)), exact: null }));
  if (roots.length === 0) {
    const n = newtonSolve(f, guess);
    if (n.converged) roots.push({ value: cx(cleanRoot(n.x)), exact: null });
  }
  if (roots.length === 0) {
    return { roots: [], kind: 'numeric', note: 'Can’t Solve' };
  }

  // Periodic equations have unboundedly many roots; show the ones nearest the
  // guess rather than flooding the display.
  const MAX_SHOWN = 8;
  const total = roots.length;
  let note;
  if (total > MAX_SHOWN) {
    roots = roots
      .slice()
      .sort((p, q) => Math.abs(p.value.re - guess) - Math.abs(q.value.re - guess))
      .slice(0, MAX_SHOWN)
      .sort((p, q) => p.value.re - q.value.re);
    note = `${total} roots in [−${span}, ${span}] — nearest ${MAX_SHOWN} to the guess`;
  } else if (total > 1) {
    note = `${total} real roots in [−${span}, ${span}]`;
  }
  return { roots, kind: 'numeric', note };
}

function hasAngleSensitiveFn(e) {
  const TRIG = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan'];
  const walk = (n) => {
    if (n.k === 'fn' && TRIG.includes(n.n)) return true;
    if (n.k === 'sum' || n.k === 'prod') return n.a.some(walk);
    if (n.k === 'pow') return walk(n.a) || walk(n.b);
    if (n.k === 'fn') return n.args.some(walk);
    return false;
  };
  return walk(e);
}

function cleanRoot(x) {
  const r = Math.round(x);
  if (Math.abs(x - r) < 1e-11) return r;
  return Number(x.toPrecision(12));
}

/** Exact handling for polynomial equations. */
function tryPolynomial(internal, varName) {
  let coeffs;
  try { coeffs = S.polyCoeffs(internal, varName); } catch { return null; }
  if (!coeffs) return null;
  if (coeffs.some((c) => S.containsVar(c, varName))) return null;
  // Coefficients must be plain numbers (π and ℯ are fine — they evaluate).
  const numeric = coeffs.map((c) => S.evalNumeric(c));
  if (numeric.some((v) => !Number.isFinite(v))) return null;

  while (numeric.length > 1 && Math.abs(numeric[numeric.length - 1]) < 1e-14) {
    numeric.pop(); coeffs.pop();
  }
  const deg = numeric.length - 1;
  if (deg <= 0) {
    return Math.abs(numeric[0]) < 1e-14
      ? { roots: [], kind: 'identity', note: 'Any value satisfies this' }
      : { roots: [], kind: 'none', note: 'No solution' };
  }

  const allRational = coeffs.every((c) => c.k === 'num');

  if (deg === 1) {
    const root = S.simplify(S.neg(S.div(coeffs[0], coeffs[1])));
    return {
      roots: [{ value: cx(S.evalNumeric(root)), exact: allRational ? S.toDisplayAst(root) : null }],
      kind: 'linear',
    };
  }

  if (deg === 2) return quadratic(coeffs, numeric, allRational);

  // Degree ≥ 3: exact rational roots first, numeric for the remainder.
  const roots = polynomialRoots(numeric).map((r) => {
    const exact = allRational && Math.abs(r.im) < 1e-12 ? exactIfRational(coeffs, r.re) : null;
    return { value: cx(cleanRoot(r.re), Math.abs(r.im) < 1e-12 ? 0 : r.im), exact };
  });
  return { roots, kind: `degree ${deg}` };
}

function exactIfRational(coeffs, x) {
  const r = S.rationalize(x);
  if (r.k !== 'num') return null;
  let acc = S.R(0);
  for (let i = coeffs.length - 1; i >= 0; i--) acc = S.add(S.mul(acc, r), coeffs[i]);
  const v = S.evalNumeric(S.simplify(acc));
  return Math.abs(v) < 1e-12 ? S.toDisplayAst(r) : null;
}

function quadratic(coeffs, numeric, allRational) {
  const [c, b, a] = coeffs;
  const disc = S.simplify(S.sub(S.pw(b, S.R(2)), S.mul(S.R(4), a, c)));
  const dv = S.evalNumeric(disc);

  const mk = (sign) => {
    // (−b ± √D) / (2a)
    const root = S.simplify(S.div(S.add(S.neg(b), S.mul(S.R(sign), S.pw(disc, S.R(1, 2)))), S.mul(S.R(2), a)));
    return root;
  };

  if (dv >= 0) {
    const r1 = mk(1), r2 = mk(-1);
    const v1 = S.evalNumeric(r1), v2 = S.evalNumeric(r2);
    const ordered = v1 <= v2 ? [[r1, v1], [r2, v2]] : [[r2, v2], [r1, v1]];
    const roots = ordered.map(([r, v]) => ({
      value: cx(cleanRoot(v)),
      exact: allRational ? S.toDisplayAst(r) : null,
    }));
    if (Math.abs(dv) < 1e-14) {
      return { roots: [roots[0]], kind: 'quadratic', note: 'Double root' };
    }
    return { roots, kind: 'quadratic' };
  }

  // Complex conjugate pair.
  const av = numeric[2], bv = numeric[1];
  const re = -bv / (2 * av);
  const im = Math.sqrt(-dv) / (2 * Math.abs(av));
  const negDisc = S.simplify(S.neg(disc));
  const exactFor = (sign) => {
    if (!allRational) return null;
    const realPart = S.simplify(S.div(S.neg(b), S.mul(S.R(2), a)));
    const imagPart = S.simplify(S.div(S.pw(negDisc, S.R(1, 2)), S.mul(S.R(2), S.FN('abs', [a]))));
    const term = S.mul(S.R(sign), imagPart, S.CONST('i'));
    return S.toDisplayAst(S.simplify(S.add(realPart, term)));
  };
  return {
    roots: [
      { value: cx(cleanRoot(re), cleanRoot(im)), exact: exactFor(1) },
      { value: cx(cleanRoot(re), cleanRoot(-im)), exact: exactFor(-1) },
    ],
    kind: 'quadratic',
    note: 'Complex roots',
  };
}

/** EQN mode: a polynomial given directly by its coefficients (highest first). */
export function solvePolynomialCoeffs(highestFirst) {
  const coeffs = highestFirst.slice().reverse(); // ascending for the solver
  const roots = polynomialRoots(coeffs);
  const exactCoeffs = coeffs.map((v) => S.rationalize(v));
  const allRational = exactCoeffs.every((c) => c.k === 'num');
  if (coeffs.length === 3) {
    return quadratic(exactCoeffs, coeffs, allRational);
  }
  return {
    roots: roots.map((r) => ({
      value: cx(cleanRoot(r.re), Math.abs(r.im) < 1e-12 ? 0 : r.im),
      exact: allRational && Math.abs(r.im) < 1e-12 ? exactIfRational(exactCoeffs, r.re) : null,
    })),
    kind: `degree ${coeffs.length - 1}`,
  };
}

/** EQN mode: simultaneous linear equations, given as an augmented matrix. */
export function solveSimultaneous(rows) {
  const n = rows.length;
  const A = rows.map((r) => r.slice(0, n));
  const b = rows.map((r) => r[n]);
  const sol = solveLinearSystem(A, b);
  if (!sol) return { roots: [], kind: 'singular', note: 'No unique solution' };
  return {
    roots: sol.map((v, i) => ({
      name: ['x', 'y', 'z', 'w'][i] ?? `x${i + 1}`,
      value: cx(cleanRoot(v)),
      exact: exactOrNull(v),
    })),
    kind: 'simultaneous',
  };
}

function exactOrNull(v) {
  const r = S.rationalize(v);
  return r.k === 'num' && r.q !== 1 ? S.toDisplayAst(r) : null;
}

/**
 * Solve a system of arbitrary equations for several unknowns (multivariate
 * Newton). Used when EQN gets non-linear input.
 */
export function solveSystemNumeric(fns, varNames, ctx, guesses) {
  const n = varNames.length;
  let x = guesses.slice();
  const evalAll = (vec) => {
    const saved = varNames.map((v) => ctx.vars[v]);
    varNames.forEach((v, i) => { ctx.vars[v] = Z.C(vec[i], 0); });
    try { return fns.map((f) => f()); }
    finally { varNames.forEach((v, i) => { ctx.vars[v] = saved[i]; }); }
  };

  for (let iter = 0; iter < 100; iter++) {
    const F = evalAll(x);
    if (F.some((v) => !Number.isFinite(v))) return null;
    if (Math.max(...F.map(Math.abs)) < 1e-12) break;
    const J = [];
    for (let r = 0; r < n; r++) J.push(new Array(n).fill(0));
    for (let c = 0; c < n; c++) {
      const h = Math.max(1e-7, Math.abs(x[c]) * 1e-7);
      const xp = x.slice(); xp[c] += h;
      const xm = x.slice(); xm[c] -= h;
      const Fp = evalAll(xp), Fm = evalAll(xm);
      for (let r = 0; r < n; r++) J[r][c] = (Fp[r] - Fm[r]) / (2 * h);
    }
    const delta = solveLinearSystem(J, F.map((v) => -v));
    if (!delta) return null;
    x = x.map((v, i) => v + delta[i]);
  }
  return x.map(cleanRoot);
}
