// Complex number core. Every value in the evaluator is a complex number;
// "real" is just im === 0. Keeps CMPLX mode and COMP mode on one code path.

export const C = (re = 0, im = 0) => ({ re, im });
export const ZERO = C(0, 0);
export const ONE = C(1, 0);
export const I = C(0, 1);

const TINY = 1e-13;

export function isReal(z) {
  if (z.im === 0) return true;
  return Math.abs(z.im) <= TINY * Math.abs(z.re);
}

/** Snap near-zero imaginary/real parts produced by round-off. */
export function clean(z) {
  let { re, im } = z;
  const m = Math.max(Math.abs(re), Math.abs(im));
  if (m > 0) {
    if (Math.abs(im) < 1e-14 * m) im = 0;
    if (Math.abs(re) < 1e-14 * m) re = 0;
  }
  return C(re, im);
}

export const add = (a, b) => C(a.re + b.re, a.im + b.im);
export const sub = (a, b) => C(a.re - b.re, a.im - b.im);
export const neg = (a) => C(-a.re, -a.im);
export const conj = (a) => C(a.re, -a.im);

export function mul(a, b) {
  if (a.im === 0 && b.im === 0) return C(a.re * b.re, 0);
  return C(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
}

export function div(a, b) {
  if (b.im === 0) {
    if (b.re === 0) return null; // caller raises Math ERROR
    return C(a.re / b.re, a.im / b.re);
  }
  const d = b.re * b.re + b.im * b.im;
  if (d === 0) return null;
  return C((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
}

export const abs = (a) => (a.im === 0 ? Math.abs(a.re) : Math.hypot(a.re, a.im));
export const arg = (a) => Math.atan2(a.im, a.re);
export const cabs = (a) => C(abs(a), 0);

export function exp(a) {
  const r = Math.exp(a.re);
  if (a.im === 0) return C(r, 0);
  return C(r * Math.cos(a.im), r * Math.sin(a.im));
}

export function log(a) {
  const m = abs(a);
  if (m === 0) return null;
  return C(Math.log(m), arg(a));
}

export function sqrt(a) {
  if (a.im === 0) {
    if (a.re >= 0) return C(Math.sqrt(a.re), 0);
    return C(0, Math.sqrt(-a.re));
  }
  const m = Math.sqrt(abs(a));
  const t = arg(a) / 2;
  return C(m * Math.cos(t), m * Math.sin(t));
}

export function pow(a, b) {
  if (a.im === 0 && b.im === 0) {
    // Real odd roots of negatives stay real, as on the fx-375ES.
    if (a.re < 0 && Number.isFinite(b.re) && !Number.isInteger(b.re)) {
      const inv = 1 / b.re;
      if (Math.abs(inv - Math.round(inv)) < 1e-12 && Math.round(inv) % 2 !== 0) {
        return C(-Math.pow(-a.re, b.re), 0);
      }
      // Otherwise genuinely complex: fall through.
    } else {
      return C(Math.pow(a.re, b.re), 0);
    }
  }
  if (abs(a) === 0) return abs(b) === 0 ? ONE : ZERO;
  const l = log(a);
  return exp(mul(b, l));
}

export function cbrt(a) {
  if (a.im === 0) return C(Math.cbrt(a.re), 0);
  return pow(a, C(1 / 3, 0));
}

export function nroot(n, a) {
  if (n.im === 0 && a.im === 0) {
    const k = n.re;
    if (Number.isInteger(k) && k !== 0) {
      if (a.re < 0 && Math.abs(k) % 2 === 1) return C(-Math.pow(-a.re, 1 / k), 0);
      if (a.re >= 0) return C(Math.pow(a.re, 1 / k), 0);
    }
  }
  const inv = div(ONE, n);
  if (!inv) return null;
  return pow(a, inv);
}

// --- Trigonometry (radians; angle-unit conversion happens in the evaluator) ---

export function sin(a) {
  if (a.im === 0) return C(Math.sin(a.re), 0);
  return C(Math.sin(a.re) * Math.cosh(a.im), Math.cos(a.re) * Math.sinh(a.im));
}
export function cos(a) {
  if (a.im === 0) return C(Math.cos(a.re), 0);
  return C(Math.cos(a.re) * Math.cosh(a.im), -Math.sin(a.re) * Math.sinh(a.im));
}
export function tan(a) {
  const c = cos(a);
  if (abs(c) < 1e-300) return null;
  return div(sin(a), c);
}

export function sinh(a) {
  if (a.im === 0) return C(Math.sinh(a.re), 0);
  return C(Math.sinh(a.re) * Math.cos(a.im), Math.cosh(a.re) * Math.sin(a.im));
}
export function cosh(a) {
  if (a.im === 0) return C(Math.cosh(a.re), 0);
  return C(Math.cosh(a.re) * Math.cos(a.im), Math.sinh(a.re) * Math.sin(a.im));
}
export function tanh(a) {
  const c = cosh(a);
  if (abs(c) < 1e-300) return null;
  return div(sinh(a), c);
}

export function asin(a) {
  if (a.im === 0 && Math.abs(a.re) <= 1) return C(Math.asin(a.re), 0);
  const t = sqrt(sub(ONE, mul(a, a)));      // -i ln(ia + sqrt(1 - a^2))
  const l = log(add(mul(I, a), t));
  if (!l) return null;
  return mul(C(0, -1), l);
}

export function acos(a) {
  if (a.im === 0 && Math.abs(a.re) <= 1) return C(Math.acos(a.re), 0);
  const s = asin(a);
  if (!s) return null;
  return sub(C(Math.PI / 2, 0), s);
}

export function atan(a) {
  if (a.im === 0) return C(Math.atan(a.re), 0);
  const q = div(add(I, a), sub(I, a));       // (i/2) ln((i+a)/(i-a))
  if (!q) return null;
  const l = log(q);
  if (!l) return null;
  return mul(C(0, 0.5), l);
}

export function asinh(a) {
  if (a.im === 0) return C(Math.asinh(a.re), 0);
  return log(add(a, sqrt(add(mul(a, a), ONE))));
}
export function acosh(a) {
  if (a.im === 0 && a.re >= 1) return C(Math.acosh(a.re), 0);
  return log(add(a, mul(sqrt(add(a, ONE)), sqrt(sub(a, ONE)))));
}
export function atanh(a) {
  if (a.im === 0 && Math.abs(a.re) < 1) return C(Math.atanh(a.re), 0);
  const q = div(add(ONE, a), sub(ONE, a));
  if (!q) return null;
  const l = log(q);
  if (!l) return null;
  return mul(C(0.5, 0), l);
}

export function equals(a, b, eps = 1e-12) {
  return Math.abs(a.re - b.re) <= eps && Math.abs(a.im - b.im) <= eps;
}
