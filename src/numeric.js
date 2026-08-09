// Numerical analysis helpers: quadrature, differentiation, root finding.
// All of these work on plain real-valued JS functions.

// --- Gauss–Kronrod 15 point rule (QUADPACK tables) --------------------------

const XGK = [
  0.991455371120813, 0.949107912342759, 0.864864423359769, 0.741531185599394,
  0.586087235467691, 0.405845151377397, 0.207784955007898, 0.000000000000000,
];
const WGK = [
  0.022935322010529, 0.063092092629979, 0.104790010322250, 0.140653259715525,
  0.169004726639267, 0.190350578064785, 0.204432940075298, 0.209482141084728,
];
const WG = [
  0.129484966168870, 0.279705391489277, 0.381830050505119, 0.417959183673469,
];

function qk15(f, a, b) {
  const centre = 0.5 * (a + b);
  const half = 0.5 * (b - a);
  const fc = f(centre);
  let resK = fc * WGK[7];
  let resG = fc * WG[3];
  let resAbs = Math.abs(resK);

  for (let j = 0; j < 7; j++) {
    const dx = half * XGK[j];
    const f1 = f(centre - dx);
    const f2 = f(centre + dx);
    const fsum = f1 + f2;
    resK += WGK[j] * fsum;
    resAbs += WGK[j] * (Math.abs(f1) + Math.abs(f2));
    if (j % 2 === 1) resG += WG[(j - 1) / 2] * fsum;
  }

  const result = resK * half;
  const err = Math.abs((resK - resG) * half);
  return { result, err, resAbs: resAbs * Math.abs(half) };
}

/**
 * Adaptive Gauss–Kronrod integration on [a, b].
 * Returns { value, err, ok }.
 */
export function integrate(f, a, b, tol = 1e-10, maxDepth = 60) {
  if (a === b) return { value: 0, err: 0, ok: true };
  const sign = b < a ? -1 : 1;
  if (b < a) [a, b] = [b, a];

  const safe = makeSafe(f);
  // Endpoint singularities defeat Gauss–Kronrod's error estimate; the
  // double-exponential rule handles them gracefully instead.
  if (!Number.isFinite(f(a)) || !Number.isFinite(f(b))) {
    const r = tanhSinh(safe, a, b, tol);
    return { value: sign * r.value, err: r.err, ok: r.ok };
  }

  const heap = [];
  const first = qk15(safe, a, b);
  heap.push({ a, b, ...first });
  let total = first.result;
  let totalErr = first.err;

  for (let iter = 0; iter < maxDepth * 20; iter++) {
    const limit = Math.max(tol * Math.abs(total), tol);
    if (totalErr <= limit) break;
    // Split the worst interval.
    let worst = 0;
    for (let k = 1; k < heap.length; k++) if (heap[k].err > heap[worst].err) worst = k;
    const seg = heap[worst];
    if (!(seg.b - seg.a > Number.EPSILON * 8 * Math.max(1, Math.abs(seg.a)))) break;
    const m = 0.5 * (seg.a + seg.b);
    const left = qk15(safe, seg.a, m);
    const right = qk15(safe, m, seg.b);
    total += left.result + right.result - seg.result;
    totalErr += left.err + right.err - seg.err;
    heap[worst] = { a: seg.a, b: m, ...left };
    heap.push({ a: m, b: seg.b, ...right });
    if (heap.length > 2000) break;
  }

  if (!Number.isFinite(total)) {
    const r = tanhSinh(safe, a, b, tol);
    return { value: sign * r.value, err: r.err, ok: r.ok };
  }
  return { value: sign * total, err: totalErr, ok: totalErr <= Math.max(1e-6 * Math.abs(total), 1e-8) };
}

function makeSafe(f) {
  return (x) => {
    const v = f(x);
    return Number.isFinite(v) ? v : 0;
  };
}

/** Double-exponential (tanh-sinh) quadrature — robust against endpoint blow-ups. */
export function tanhSinh(f, a, b, tol = 1e-10) {
  const c = 0.5 * (b + a);
  const d = 0.5 * (b - a);
  const TMAX = 3.2; // beyond this the abscissae are numerically indistinguishable from ±1

  // Weighted value of the node pair at parameter t (t = 0 is the midpoint).
  const node = (t) => {
    const u = (Math.PI / 2) * Math.sinh(t);
    const ch = Math.cosh(u);
    const w = (Math.PI / 2) * Math.cosh(t) / (ch * ch);
    const x = Math.tanh(u);
    if (!Number.isFinite(w) || 1 - Math.abs(x) < 1e-16) return 0;
    const fl = f(c - d * x);
    const fr = f(c + d * x);
    return w * ((Number.isFinite(fl) ? fl : 0) + (Number.isFinite(fr) ? fr : 0));
  };

  let h = 1;
  let total = (Math.PI / 2) * (Number.isFinite(f(c)) ? f(c) : 0);
  for (let k = 1; k * h <= TMAX; k++) total += node(k * h);

  let value = total * h * d;
  let prev = Infinity;

  for (let level = 1; level <= 10; level++) {
    h /= 2;
    let added = 0;
    for (let k = 1; k * h <= TMAX; k += 2) added += node(k * h);
    total += added;
    prev = value;
    value = total * h * d;
    if (level >= 3 && Math.abs(value - prev) < tol * Math.max(1, Math.abs(value))) {
      return { value, err: Math.abs(value - prev), ok: true };
    }
  }
  return { value, err: Math.abs(value - prev), ok: false };
}

/** Ridders' method: high accuracy numerical derivative. */
export function derivative(f, x, h0 = 0) {
  const scale = Math.max(1e-4, Math.abs(x) * 1e-2);
  let h = h0 || scale;
  const NTAB = 12;
  const CON = 1.4, CON2 = CON * CON, BIG = 1e30, SAFE = 2;
  const tab = [[]];
  tab[0][0] = (f(x + h) - f(x - h)) / (2 * h);
  let err = BIG;
  let ans = tab[0][0];

  for (let i = 1; i < NTAB; i++) {
    h /= CON;
    tab[i] = [];
    tab[i][0] = (f(x + h) - f(x - h)) / (2 * h);
    let fac = CON2;
    for (let j = 1; j <= i; j++) {
      tab[i][j] = (tab[i][j - 1] * fac - tab[i - 1][j - 1]) / (fac - 1);
      fac *= CON2;
      const errt = Math.max(
        Math.abs(tab[i][j] - tab[i][j - 1]),
        Math.abs(tab[i][j] - tab[i - 1][j - 1]),
      );
      if (errt <= err) { err = errt; ans = tab[i][j]; }
    }
    if (Math.abs(tab[i][i] - tab[i - 1][i - 1]) >= SAFE * err) break;
  }
  return { value: ans, err };
}

/** Newton–Raphson with a numerical derivative and bisection safeguards. */
export function newtonSolve(f, guess, opts = {}) {
  const tol = opts.tol ?? 1e-12;
  const maxIter = opts.maxIter ?? 200;
  let x = guess;
  let fx = f(x);
  if (!Number.isFinite(fx)) {
    // Nudge off a singular starting point.
    for (const d of [1e-3, -1e-3, 0.1, -0.1, 1, -1]) {
      x = guess + d; fx = f(x);
      if (Number.isFinite(fx)) break;
    }
  }
  for (let i = 0; i < maxIter; i++) {
    if (Math.abs(fx) < tol) return { x, fx, converged: true };
    const h = Math.max(1e-7, Math.abs(x) * 1e-7);
    const d = (f(x + h) - f(x - h)) / (2 * h);
    if (!Number.isFinite(d) || d === 0) break;
    let step = fx / d;
    // Damp wild steps.
    const cap = Math.max(1, Math.abs(x)) * 10;
    if (Math.abs(step) > cap) step = Math.sign(step) * cap;
    let nx = x - step;
    let nfx = f(nx);
    let damp = 1;
    while ((!Number.isFinite(nfx) || Math.abs(nfx) > Math.abs(fx)) && damp > 1e-4) {
      damp /= 2;
      nx = x - step * damp;
      nfx = f(nx);
    }
    if (!Number.isFinite(nfx)) break;
    if (Math.abs(nx - x) < 1e-15 * Math.max(1, Math.abs(x)) && Math.abs(nfx) < 1e-8) {
      return { x: nx, fx: nfx, converged: true };
    }
    x = nx; fx = nfx;
  }
  return { x, fx, converged: Math.abs(fx) < 1e-8 };
}

/** Bisection refinement on a sign-changing bracket. */
export function bisect(f, lo, hi, tol = 1e-14) {
  let flo = f(lo), fhi = f(hi);
  if (flo === 0) return lo;
  if (fhi === 0) return hi;
  if (flo * fhi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    const fm = f(mid);
    if (fm === 0 || (hi - lo) < tol * Math.max(1, Math.abs(mid))) return mid;
    if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
  }
  return 0.5 * (lo + hi);
}

/**
 * Scan a range for sign changes and polish every root found.
 * Used by SOLVE to report *all* real roots, not just the one nearest a guess.
 */
export function findRealRoots(f, lo = -50, hi = 50, samples = 1600) {
  const roots = [];
  const step = (hi - lo) / samples;
  const xs = new Float64Array(samples + 1);
  const ys = new Float64Array(samples + 1);
  for (let i = 0; i <= samples; i++) {
    xs[i] = lo + i * step;
    ys[i] = f(xs[i]);
  }

  for (let i = 1; i <= samples; i++) {
    const y0 = ys[i - 1], y1 = ys[i];
    if (!Number.isFinite(y0) || !Number.isFinite(y1)) continue;
    if (y0 === 0) { pushRoot(roots, xs[i - 1]); continue; }
    if (y0 * y1 < 0) {
      const r = bisect(f, xs[i - 1], xs[i]);
      if (r !== null) {
        const polished = newtonSolve(f, r);
        pushRoot(roots, polished.converged ? polished.x : r);
      }
    }
  }

  // Touching roots (even multiplicity) never change sign — look for minima of |f|.
  for (let i = 1; i < samples; i++) {
    const a0 = Math.abs(ys[i - 1]), a1 = Math.abs(ys[i]), a2 = Math.abs(ys[i + 1]);
    if (!Number.isFinite(a0) || !Number.isFinite(a1) || !Number.isFinite(a2)) continue;
    if (a1 < a0 && a1 <= a2) {
      const r = newtonSolve(f, xs[i], { tol: 1e-13 });
      if (r.converged && Math.abs(r.fx) < 1e-9) pushRoot(roots, r.x);
    }
  }
  return roots.sort((a, b) => a - b);
}

function pushRoot(list, x) {
  const snapped = Math.abs(x - Math.round(x)) < 1e-11 ? Math.round(x) : x;
  if (!list.some((r) => Math.abs(r - snapped) < 1e-8 * Math.max(1, Math.abs(snapped)))) {
    list.push(snapped);
  }
}

/**
 * Durand–Kerner: all complex roots of a polynomial.
 * coeffs are ordered [a0, a1, ...] for a0 + a1 x + a2 x^2 + …
 */
export function polynomialRoots(coeffs) {
  const c = coeffs.slice();
  while (c.length > 1 && Math.abs(c[c.length - 1]) < 1e-14) c.pop();
  const n = c.length - 1;
  if (n < 1) return [];
  const lead = c[n];
  const a = c.map((v) => v / lead);

  if (n === 1) return [{ re: -a[0], im: 0 }];
  if (n === 2) {
    const [c0, c1] = [a[0], a[1]];
    const disc = c1 * c1 - 4 * c0;
    if (disc >= 0) {
      const s = Math.sqrt(disc);
      // Numerically stable quadratic formula.
      const q = -0.5 * (c1 + Math.sign(c1 || 1) * s);
      const r1 = q;
      const r2 = c0 / (q || 1e-300);
      return [{ re: r1, im: 0 }, { re: r2, im: 0 }].sort((p, q2) => p.re - q2.re);
    }
    const s = Math.sqrt(-disc) / 2;
    return [{ re: -c1 / 2, im: s }, { re: -c1 / 2, im: -s }];
  }

  let z = [];
  for (let k = 0; k < n; k++) {
    const ang = (2 * Math.PI * k) / n + 0.4;
    z.push({ re: 0.9 * Math.cos(ang), im: 0.9 * Math.sin(ang) });
  }
  const evalPoly = (x) => {
    let re = 0, im = 0;
    for (let k = n; k >= 0; k--) {
      const nre = re * x.re - im * x.im + a[k];
      const nim = re * x.im + im * x.re;
      re = nre; im = nim;
    }
    return { re, im };
  };
  for (let iter = 0; iter < 500; iter++) {
    let maxDelta = 0;
    for (let k = 0; k < n; k++) {
      let dre = 1, dim = 0;
      for (let j = 0; j < n; j++) {
        if (j === k) continue;
        const rre = z[k].re - z[j].re;
        const rim = z[k].im - z[j].im;
        const nre = dre * rre - dim * rim;
        const nim = dre * rim + dim * rre;
        dre = nre; dim = nim;
      }
      const p = evalPoly(z[k]);
      const den = dre * dre + dim * dim;
      if (den === 0) continue;
      const qre = (p.re * dre + p.im * dim) / den;
      const qim = (p.im * dre - p.re * dim) / den;
      z[k] = { re: z[k].re - qre, im: z[k].im - qim };
      maxDelta = Math.max(maxDelta, Math.hypot(qre, qim));
    }
    if (maxDelta < 1e-15) break;
  }
  return z
    .map((r) => {
      const re = Math.abs(r.re) < 1e-11 ? 0 : r.re;
      const im = Math.abs(r.im) < 1e-10 * Math.max(1, Math.abs(r.re)) ? 0 : r.im;
      return { re: snap(re), im: snap(im) };
    })
    .sort((p, q) => (p.im === 0) === (q.im === 0) ? (p.re - q.re || p.im - q.im) : (p.im === 0 ? -1 : 1));
}

function snap(v) {
  const r = Math.round(v);
  return Math.abs(v - r) < 1e-11 ? r : v;
}

/** Gaussian elimination with partial pivoting. Returns null when singular. */
export function solveLinearSystem(A, b) {
  const n = b.length;
  const m = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[piv][col])) piv = r;
    if (Math.abs(m[piv][col]) < 1e-14) return null;
    [m[col], m[piv]] = [m[piv], m[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r][col] / m[col][col];
      if (f === 0) continue;
      for (let k = col; k <= n; k++) m[r][k] -= f * m[col][k];
    }
  }
  return m.map((row, i) => snap(row[n] / row[i]));
}
