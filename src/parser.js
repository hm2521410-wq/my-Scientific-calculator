// Tokenizer + parser for the calculator's internal linear expression language.
//
// The natural-display editor serializes its node tree into this language, so
// everything downstream (numeric evaluation, symbolic algebra, solving) works
// on one AST shape.
//
// Notable Casio behaviours reproduced here:
//   * implicit multiplication binds tighter than explicit x / ÷,
//     so 6/2(1+2) = 1 and 1/2π = 1/(2π)
//   * unary minus binds looser than ^, so -2^2 = -4
//   * ^ is right associative, so 2^3^2 = 512

export class CalcError extends Error {
  constructor(kind, pos = -1, detail = '') {
    super(detail || kind);
    this.kind = kind; // 'Syntax ERROR' | 'Math ERROR' | ...
    this.pos = pos;
    this.detail = detail;
  }
}

// Sorted longest-first below, so `Rec` wins over `Re` and `exp10` over `exp`.
const KEYWORDS = ([
  'PreAns', 'RanInt', 'Ran#', 'Ans',
  'asinh', 'acosh', 'atanh', 'sinh', 'cosh', 'tanh',
  'asin', 'acos', 'atan', 'sin', 'cos', 'tan',
  'logb', 'log', 'ln', 'exp10', 'exp',
  'sqrt', 'cbrt', 'nroot',
  'abs', 'arg', 'conjg', 'Re', 'Im',
  'Rnd', 'Intg', 'Int', 'Frac',
  'Pol', 'Rec', 'GCD', 'LCM',
  'nPr', 'nCr',
  'integ', 'deriv', 'sumf', 'prodf', 'dms',
  'and', 'or', 'xor', 'xnor', 'not', 'negb',
  'min', 'max', 'mod',
]).sort((a, b) => b.length - a.length);

// Functions taking a parenthesised argument list.
export const FUNCTIONS = new Set([
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
  'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
  'log', 'ln', 'logb', 'exp', 'exp10',
  'sqrt', 'cbrt', 'nroot',
  'abs', 'arg', 'conjg', 'Re', 'Im',
  'Rnd', 'Int', 'Intg', 'Frac',
  'Pol', 'Rec', 'GCD', 'LCM', 'RanInt',
  'integ', 'deriv', 'sumf', 'prodf', 'dms',
  'not', 'negb', 'min', 'max', 'mod',
]);

// Arguments that must NOT be evaluated eagerly (they are function bodies).
export const LAZY_FIRST_ARG = new Set(['integ', 'deriv', 'sumf', 'prodf']);

export const VARIABLES = ['A', 'B', 'C', 'D', 'E', 'F', 'X', 'Y', 'M'];
const VARSET = new Set(VARIABLES);

const DIGITS = '0123456789';

const BASE_DIGITS = '0123456789ABCDEF';

export function tokenize(src, opts = {}) {
  const toks = [];
  const base = opts.base || 0; // 0 = ordinary decimal mode
  let i = 0;
  const push = (type, value) => toks.push({ type, value, pos: i });

  while (i < src.length) {
    const ch = src[i];
    if (ch === ' ' || ch === '\t') { i++; continue; }

    // BASE-N literal: a run of digits valid in the active base (A–F are hex
    // digits there, not variables).
    if (base) {
      const idx = BASE_DIGITS.indexOf(ch);
      if (idx >= 0 && idx < base) {
        let j = i;
        let val = 0;
        while (j < src.length) {
          const d = BASE_DIGITS.indexOf(src[j]);
          if (d < 0 || d >= base) break;
          val = val * base + d;
          j++;
        }
        toks.push({ type: 'num', value: val, text: src.slice(i, j), pos: i });
        i = j;
        continue;
      }
    }

    // Number literal
    if (DIGITS.includes(ch) || (ch === '.' && DIGITS.includes(src[i + 1] || ''))) {
      let j = i;
      while (j < src.length && DIGITS.includes(src[j])) j++;
      if (src[j] === '.') { j++; while (j < src.length && DIGITS.includes(src[j])) j++; }
      const text = src.slice(i, j);
      toks.push({ type: 'num', value: parseFloat(text), text, pos: i });
      i = j;
      continue;
    }

    // Hex digits for BASE-N (A-F are also variable names; the BASE-N evaluator
    // sets a flag that reinterprets them, see evaluator).
    let matched = null;
    for (const kw of KEYWORDS) {
      if (src.startsWith(kw, i)) { matched = kw; break; }
    }
    if (matched) {
      toks.push({ type: 'kw', value: matched, pos: i });
      i += matched.length;
      continue;
    }

    if (VARSET.has(ch)) { push('var', ch); i++; continue; }

    switch (ch) {
      case 'π': push('const', 'pi'); i++; continue;
      case 'ℯ': push('const', 'e'); i++; continue;
      case 'ⅈ': push('const', 'i'); i++; continue;
      case '⏨': push('exp10', '⏨'); i++; continue;
      case '+': case '-': case '*': case '/': case '^':
      case '(': case ')': case ',': case '=':
        push('op', ch); i++; continue;
      case '!': push('post', '!'); i++; continue;
      case '%': push('post', '%'); i++; continue;
      case '°': push('post', '°'); i++; continue;
      case 'ʳ': push('post', 'ʳ'); i++; continue;
      case 'ᵍ': push('post', 'ᵍ'); i++; continue;
      case '∠': push('op', '∠'); i++; continue;
      default:
        throw new CalcError('Syntax ERROR', i, `unexpected character ${JSON.stringify(ch)}`);
    }
  }
  toks.push({ type: 'end', value: null, pos: src.length });
  return toks;
}

// --- AST constructors -------------------------------------------------------

export const num = (v) => ({ k: 'num', v });
export const cst = (n) => ({ k: 'const', n });
export const vr = (n) => ({ k: 'var', n });
export const bin = (k, a, b) => ({ k, a, b });
export const fn = (n, args) => ({ k: 'fn', n, args });

class Parser {
  constructor(toks) { this.toks = toks; this.i = 0; }
  peek(o = 0) { return this.toks[this.i + o]; }
  next() { return this.toks[this.i++]; }
  at(type, value) {
    const t = this.peek();
    return t.type === type && (value === undefined || t.value === value);
  }
  expect(type, value) {
    if (!this.at(type, value)) {
      throw new CalcError('Syntax ERROR', this.peek().pos, `expected ${value ?? type}`);
    }
    return this.next();
  }

  parseTop() {
    const e = this.parseEquation();
    if (!this.at('end')) throw new CalcError('Syntax ERROR', this.peek().pos, 'trailing input');
    return e;
  }

  parseEquation() {
    const a = this.parseExpr();
    if (this.at('op', '=')) {
      this.next();
      const b = this.parseExpr();
      return { k: 'eq', a, b };
    }
    return a;
  }

  parseExpr() { return this.parseOr(); }

  // BASE-N logical operators are the loosest binding operators on the machine.
  parseOr() {
    let a = this.parseAnd();
    for (;;) {
      const t = this.peek();
      if (t.type === 'kw' && ['or', 'xor', 'xnor'].includes(t.value)) {
        this.next();
        a = fn(t.value, [a, this.parseAnd()]);
      } else return a;
    }
  }

  parseAnd() {
    let a = this.parseAddSub();
    while (this.at('kw', 'and')) {
      this.next();
      a = fn('and', [a, this.parseAddSub()]);
    }
    return a;
  }

  parseAddSub() {
    let a = this.parseMulDiv();
    for (;;) {
      if (this.at('op', '+')) { this.next(); a = bin('add', a, this.parseMulDiv()); }
      else if (this.at('op', '-')) { this.next(); a = bin('sub', a, this.parseMulDiv()); }
      else return a;
    }
  }

  parseMulDiv() {
    let a = this.parsePermComb();
    for (;;) {
      if (this.at('op', '*')) { this.next(); a = bin('mul', a, this.parsePermComb()); }
      else if (this.at('op', '/')) { this.next(); a = bin('div', a, this.parsePermComb()); }
      else return a;
    }
  }

  parsePermComb() {
    let a = this.parseImplicit();
    for (;;) {
      const t = this.peek();
      if (t.type === 'kw' && (t.value === 'nPr' || t.value === 'nCr')) {
        this.next();
        a = fn(t.value, [a, this.parseImplicit()]);
      } else return a;
    }
  }

  /** True when the upcoming token may begin an operand (implicit ×). */
  startsAtom() {
    const t = this.peek();
    if (t.type === 'num' || t.type === 'var' || t.type === 'const') return true;
    if (t.type === 'op' && t.value === '(') return true;
    if (t.type === 'kw') {
      if (['nPr', 'nCr', 'and', 'or', 'xor', 'xnor'].includes(t.value)) return false;
      return true;
    }
    return false;
  }

  parseImplicit() {
    let a = this.parseUnary();
    while (this.startsAtom()) {
      // A bare number never *follows* an operand implicitly ("2 3" is invalid),
      // but "2π", "2A", "2sin(…)", "(1)(2)" and "2(3)" are all fine.
      const t = this.peek();
      if (t.type === 'num') break;
      a = bin('mul', a, this.parsePower());
    }
    return a;
  }

  parseUnary() {
    if (this.at('op', '-')) { this.next(); return { k: 'neg', a: this.parseUnary() }; }
    if (this.at('op', '+')) { this.next(); return this.parseUnary(); }
    return this.parsePower();
  }

  parsePower() {
    const base = this.parsePostfix();
    if (this.at('op', '^')) {
      this.next();
      const exp = this.parseUnary(); // right associative, allows 2^-3
      return this.applyPostfixLoop(bin('pow', base, exp));
    }
    return base;
  }

  applyPostfixLoop(node) {
    let a = node;
    for (;;) {
      const t = this.peek();
      if (t.type === 'post') {
        this.next();
        if (t.value === '!') a = { k: 'fact', a };
        else if (t.value === '%') a = { k: 'pct', a };
        else if (t.value === '°') a = fn('todeg', [a]);
        else if (t.value === 'ʳ') a = fn('torad', [a]);
        else if (t.value === 'ᵍ') a = fn('tograd', [a]);
      } else if (t.type === 'exp10') {
        this.next();
        const e = this.parseExponentOperand();
        a = bin('mul', a, bin('pow', num(10), e));
      } else if (t.type === 'op' && t.value === '∠') {
        this.next();
        a = fn('polar', [a, this.parsePostfix()]);
      } else return a;
    }
  }

  parseExponentOperand() {
    if (this.at('op', '-')) { this.next(); return { k: 'neg', a: this.parseExponentOperand() }; }
    if (this.at('op', '+')) { this.next(); return this.parseExponentOperand(); }
    return this.parsePostfix();
  }

  parsePostfix() {
    return this.applyPostfixLoop(this.parseAtom());
  }

  parseArgs() {
    this.expect('op', '(');
    const args = [];
    if (!this.at('op', ')')) {
      args.push(this.parseExpr());
      while (this.at('op', ',')) { this.next(); args.push(this.parseExpr()); }
    }
    this.expect('op', ')');
    return args;
  }

  parseAtom() {
    const t = this.peek();
    switch (t.type) {
      case 'num': this.next(); return num(t.value);
      case 'var': this.next(); return vr(t.value);
      case 'const': this.next(); return cst(t.value);
      case 'kw': {
        if (t.value === 'Ans') { this.next(); return { k: 'ans' }; }
        if (t.value === 'PreAns') { this.next(); return { k: 'preans' }; }
        if (t.value === 'Ran#') { this.next(); return fn('Ran#', []); }
        if (FUNCTIONS.has(t.value)) {
          this.next();
          const args = this.parseArgs();
          return fn(t.value, args);
        }
        throw new CalcError('Syntax ERROR', t.pos, `unexpected ${t.value}`);
      }
      case 'op':
        if (t.value === '(') {
          this.next();
          const e = this.parseExpr();
          this.expect('op', ')');
          return { k: 'paren', a: e };
        }
        break;
      default:
        break;
    }
    throw new CalcError('Syntax ERROR', t.pos, 'unexpected token');
  }
}

export function parse(src, opts = {}) {
  return new Parser(tokenize(src, opts)).parseTop();
}

/** Parse but report the failure instead of throwing (used for live preview). */
export function tryParse(src, opts = {}) {
  try { return { ast: parse(src, opts), error: null }; }
  catch (e) { return { ast: null, error: e }; }
}

// --- Serialisation back to the linear language ------------------------------

const PREC = { eq: 0, add: 1, sub: 1, mul: 2, div: 2, neg: 3, pow: 4 };

export function stringify(node) {
  if (!node) return '';
  switch (node.k) {
    case 'num': return formatLiteral(node.v);
    case 'const': return node.n === 'pi' ? 'π' : node.n === 'e' ? 'ℯ' : 'ⅈ';
    case 'var': return node.n;
    case 'ans': return 'Ans';
    case 'preans': return 'PreAns';
    case 'paren': return '(' + stringify(node.a) + ')';
    case 'eq': return stringify(node.a) + '=' + stringify(node.b);
    case 'neg': return '-' + wrap(node.a, PREC.neg);
    case 'fact': return wrap(node.a, 5) + '!';
    case 'pct': return wrap(node.a, 5) + '%';
    case 'add': return stringify(node.a) + '+' + wrap(node.b, PREC.add + 1);
    case 'sub': return stringify(node.a) + '-' + wrap(node.b, PREC.add + 1);
    case 'mul': return wrap(node.a, PREC.mul) + '*' + wrap(node.b, PREC.mul + 1);
    case 'div': return wrap(node.a, PREC.div) + '/' + wrap(node.b, PREC.div + 1);
    case 'pow': return wrap(node.a, PREC.pow + 1) + '^' + wrap(node.b, PREC.pow);
    case 'fn': return node.n + '(' + node.args.map(stringify).join(',') + ')';
    default: return '?';
  }
}

function precOf(node) {
  if (!node) return 99;
  if (node.k in PREC) return PREC[node.k];
  return 9;
}

function wrap(node, minPrec) {
  const s = stringify(node);
  return precOf(node) < minPrec ? '(' + s + ')' : s;
}

function formatLiteral(v) {
  if (!Number.isFinite(v)) return 'ERR';
  if (Number.isInteger(v) && Math.abs(v) < 1e15) return String(v);
  const s = String(v);
  return s.includes('e') ? `(${s.replace('e', '⏨')})` : s;
}
