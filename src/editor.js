// Natural-display ("textbook") expression editor.
//
// The document is a tree of nodes. Plain characters are leaves; templates such
// as fractions, radicals, powers and integrals own one or more *slots*, each of
// which is itself a list of nodes. The cursor is a { list, index } pair, which
// makes insertion, deletion and arrow navigation straightforward, and
// guarantees the serialised expression is always structurally balanced.

// --- Node model -------------------------------------------------------------

/** Slot names per template type, in cursor-traversal order. */
const SLOTS = {
  frac: ['num', 'den'],
  mixed: ['w', 'num', 'den'],
  sqrt: ['a'],
  cbrt: ['a'],
  nroot: ['n', 'a'],
  sup: ['e'],
  logb: ['b', 'a'],
  fn: ['a'],
  abs: ['a'],
  paren: ['a'],
  e10: ['e'],
  dms: ['d', 'm', 's'],
  integ: ['lo', 'hi', 'f'],
  deriv: ['f', 'at'],
  sum: ['lo', 'hi', 'f'],
  prod: ['lo', 'hi', 'f'],
};

const EXIT = Symbol('exit');

/** Which slot ▲ / ▼ should reach from each slot of a stacked template. */
const VERTICAL_SLOTS = {
  frac: { down: { num: 'den' }, up: { den: 'num' } },
  mixed: { down: { num: 'den', w: 'den' }, up: { den: 'num' } },
  nroot: { down: { n: 'a' }, up: { a: 'n' } },
  integ: { down: { hi: 'lo', f: 'lo' }, up: { lo: 'hi', f: 'hi' } },
  sum: { down: { hi: 'lo', f: 'lo' }, up: { lo: 'hi', f: 'hi' } },
  prod: { down: { hi: 'lo', f: 'lo' }, up: { lo: 'hi', f: 'hi' } },
  sup: { down: { e: EXIT } },
  logb: { up: { b: 'a' } },
};

export const isChar = (n) => n.t === 'c';
export const slotNames = (n) => (isChar(n) ? [] : SLOTS[n.t] || []);

export function makeNode(t, extra = {}) {
  const node = { t, ...extra };
  for (const s of SLOTS[t] || []) if (!node[s]) node[s] = [];
  return node;
}

export const ch = (v, out = v) => ({ t: 'c', v, out });

// Display character → serialised text.
const CHAR_OUT = {
  '−': '-', '×': '*', '÷': '/', '·': '*',
};

function charOut(node) {
  if (node.out !== undefined && node.out !== node.v) return node.out;
  return CHAR_OUT[node.v] ?? node.v;
}

// --- Serialisation to the linear language ----------------------------------

export function serializeList(list) {
  return list.map(serializeNode).join('');
}

const slot = (l) => (l.length ? serializeList(l) : '');
const grp = (l) => `(${slot(l) || '0'})`;

function serializeNode(n) {
  if (isChar(n)) return charOut(n);
  switch (n.t) {
    case 'frac': return `(${slot(n.num) || '0'}/${slot(n.den) || '1'})`;
    case 'mixed': return `(${slot(n.w) || '0'}+(${slot(n.num) || '0'})/(${slot(n.den) || '1'}))`;
    case 'sqrt': return `sqrt${grp(n.a)}`;
    case 'cbrt': return `cbrt${grp(n.a)}`;
    case 'nroot': return `nroot(${slot(n.n) || '2'},${slot(n.a) || '0'})`;
    case 'sup': return `^${grp(n.e)}`;
    case 'logb': return `logb(${slot(n.b) || '10'},${slot(n.a) || '0'})`;
    case 'fn': return `${n.name}${grp(n.a)}`;
    case 'abs': return `abs${grp(n.a)}`;
    case 'paren': return `(${slot(n.a)})`;
    case 'e10': return `⏨${grp(n.e)}`;
    case 'dms': return `dms(${slot(n.d) || '0'},${slot(n.m) || '0'},${slot(n.s) || '0'})`;
    case 'integ': return `integ(${slot(n.f) || '0'},${slot(n.lo) || '0'},${slot(n.hi) || '0'})`;
    case 'deriv': return `deriv(${slot(n.f) || '0'},${slot(n.at) || '0'})`;
    case 'sum': return `sumf(${slot(n.f) || '0'},${slot(n.lo) || '0'},${slot(n.hi) || '0'})`;
    case 'prod': return `prodf(${slot(n.f) || '0'},${slot(n.lo) || '0'},${slot(n.hi) || '0'})`;
    default: return '';
  }
}

/** Plain-text version of the tree, for history entries and copy/paste. */
export function toPlainText(list) {
  return list.map((n) => {
    if (isChar(n)) return n.v;
    switch (n.t) {
      case 'frac': return `(${toPlainText(n.num)})/(${toPlainText(n.den)})`;
      case 'mixed': return `${toPlainText(n.w)} ${toPlainText(n.num)}/${toPlainText(n.den)}`;
      case 'sqrt': return `√(${toPlainText(n.a)})`;
      case 'cbrt': return `∛(${toPlainText(n.a)})`;
      case 'nroot': return `${toPlainText(n.n)}√(${toPlainText(n.a)})`;
      case 'sup': return `^(${toPlainText(n.e)})`;
      case 'logb': return `log_${toPlainText(n.b)}(${toPlainText(n.a)})`;
      case 'fn': return `${n.label || n.name}(${toPlainText(n.a)})`;
      case 'abs': return `|${toPlainText(n.a)}|`;
      case 'paren': return `(${toPlainText(n.a)})`;
      case 'e10': return `×10^(${toPlainText(n.e)})`;
      case 'dms': return `${toPlainText(n.d)}°${toPlainText(n.m)}′${toPlainText(n.s)}″`;
      case 'integ': return `∫[${toPlainText(n.lo)},${toPlainText(n.hi)}](${toPlainText(n.f)})dx`;
      case 'deriv': return `d/dx(${toPlainText(n.f)})|x=${toPlainText(n.at)}`;
      case 'sum': return `Σ[${toPlainText(n.lo)}..${toPlainText(n.hi)}](${toPlainText(n.f)})`;
      case 'prod': return `Π[${toPlainText(n.lo)}..${toPlainText(n.hi)}](${toPlainText(n.f)})`;
      default: return '';
    }
  }).join('');
}

// --- Editor -----------------------------------------------------------------

export class Editor {
  constructor() {
    this.root = [];
    this.cursor = { list: this.root, index: 0 };
    this.insertMode = false; // SHIFT+DEL toggles overwrite vs insert
  }

  clear() {
    this.root = [];
    this.cursor = { list: this.root, index: 0 };
  }

  isEmpty() { return this.root.length === 0; }

  serialize() { return serializeList(this.root); }
  plainText() { return toPlainText(this.root); }

  /** Replace the whole document (used by history recall and by ANS insertion). */
  setNodes(list) {
    this.root = list;
    this.cursor = { list: this.root, index: this.root.length };
  }

  insert(node) {
    const { list, index } = this.cursor;
    list.splice(index, 0, node);
    this.cursor = { list, index: index + 1 };
    return node;
  }

  insertChar(v, out) {
    return this.insert(ch(v, out ?? v));
  }

  insertText(text) {
    for (const c of text) this.insertChar(c);
  }

  /**
   * Insert a template. `focus` names the slot the cursor should land in;
   * when omitted the cursor is placed after the node.
   */
  insertTemplate(t, extra = {}, focus = null) {
    const node = makeNode(t, extra);
    this.insert(node);
    if (focus && node[focus]) this.cursor = { list: node[focus], index: 0 };
    return node;
  }

  /** Delete backwards (DEL). */
  backspace() {
    const { list, index } = this.cursor;
    if (index > 0) {
      const target = list[index - 1];
      if (isChar(target)) {
        list.splice(index - 1, 1);
        this.cursor = { list, index: index - 1 };
        return;
      }
      // Deleting a template keeps its contents, as the fx-375ES does.
      const contents = [];
      for (const s of slotNames(target)) contents.push(...target[s]);
      list.splice(index - 1, 1, ...contents);
      this.cursor = { list, index: index - 1 + contents.length };
      return;
    }
    // At the start of a slot: step out to just before the owning template,
    // and drop the template outright when nothing is left inside it.
    const loc = this.locate(list);
    if (!loc) return;
    this.cursor = { list: loc.parentList, index: loc.parentIndex };
    const empty = slotNames(loc.node).every((s) => loc.node[s].length === 0);
    if (empty) loc.parentList.splice(loc.parentIndex, 1);
  }

  /** Find which template owns a slot list. */
  locate(list, search = this.root, parentList = null, parentIndex = -1) {
    if (list === this.root) return null;
    for (let i = 0; i < search.length; i++) {
      const n = search[i];
      if (isChar(n)) continue;
      for (const s of slotNames(n)) {
        if (n[s] === list) return { node: n, slot: s, parentList: search, parentIndex: i };
        const deep = this.locate(list, n[s], search, i);
        if (deep) return deep;
      }
    }
    return null;
  }

  // --- Navigation -----------------------------------------------------------

  /** Every cursor position, in reading order. */
  positions(list = this.root, out = []) {
    for (let i = 0; i < list.length; i++) {
      out.push({ list, index: i });
      const n = list[i];
      if (!isChar(n)) for (const s of slotNames(n)) this.positions(n[s], out);
    }
    out.push({ list, index: list.length });
    return out;
  }

  posIndex(positions) {
    return positions.findIndex((p) => p.list === this.cursor.list && p.index === this.cursor.index);
  }

  moveLeft() {
    const ps = this.orderedPositions();
    const i = ps.findIndex((p) => p.list === this.cursor.list && p.index === this.cursor.index);
    if (i > 0) this.cursor = ps[i - 1];
  }

  moveRight() {
    const ps = this.orderedPositions();
    const i = ps.findIndex((p) => p.list === this.cursor.list && p.index === this.cursor.index);
    if (i >= 0 && i < ps.length - 1) this.cursor = ps[i + 1];
  }

  /** Reading-order positions with duplicates (same list+index) removed. */
  orderedPositions() {
    const raw = this.positions();
    const seen = new Set();
    const out = [];
    for (const p of raw) {
      const k = `${listId(p.list)}:${p.index}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(p);
    }
    return out;
  }

  /** Move the cursor to the position whose caret is nearest (dx, dy). */
  moveToPoint(x, y, caretMap) {
    let best = null, bestD = Infinity;
    for (const { pos, rect } of caretMap) {
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const d = (cx - x) ** 2 + (cy - y) ** 2;
      if (d < bestD) { bestD = d; best = pos; }
    }
    if (best) this.cursor = best;
  }

  /**
   * Vertical movement between slots (▲ / ▼ on the replay pad).
   * Templates that stack their slots are handled structurally — geometry alone
   * is ambiguous, because a fraction's neighbouring carets sit at its midline.
   * Anything else falls back to "nearest caret above/below".
   */
  moveVertical(dir, caretMap) {
    const loc = this.locate(this.cursor.list);
    if (loc) {
      const table = VERTICAL_SLOTS[loc.node.t];
      const target = table?.[dir > 0 ? 'down' : 'up']?.[loc.slot];
      if (target === EXIT) {
        this.cursor = { list: loc.parentList, index: loc.parentIndex + 1 };
        return true;
      }
      if (target) {
        const list = loc.node[target];
        this.cursor = { list, index: Math.min(this.cursor.index, list.length) };
        return true;
      }
    }

    const cur = caretMap.find((c) => c.pos.list === this.cursor.list && c.pos.index === this.cursor.index);
    if (!cur) return false;
    const cx = cur.rect.left + cur.rect.width / 2;
    const cy = cur.rect.top + cur.rect.height / 2;
    let best = null, bestScore = Infinity;
    for (const { pos, rect } of caretMap) {
      const ox = rect.left + rect.width / 2;
      const oy = rect.top + rect.height / 2;
      const dy = oy - cy;
      if (dir < 0 ? dy > -4 : dy < 4) continue;
      const score = Math.abs(dy) * 2 + Math.abs(ox - cx);
      if (score < bestScore) { bestScore = score; best = pos; }
    }
    if (!best) return false;
    this.cursor = best;
    return true;
  }
}

let listIds = new WeakMap();
let listCounter = 0;
function listId(l) {
  if (!listIds.has(l)) listIds.set(l, ++listCounter);
  return listIds.get(l);
}

// --- Rendering --------------------------------------------------------------

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/**
 * Render a node list into DOM.
 * When `cursor` is given, caret anchors are emitted and collected in `carets`.
 */
export function renderList(list, opts = {}) {
  const { cursor = null, carets = null } = opts;
  const box = el('span', 'nd-list');
  const caret = (index) => {
    const c = el('span', 'nd-caret');
    if (cursor && cursor.list === list && cursor.index === index) c.classList.add('on');
    box.appendChild(c);
    if (carets) carets.push({ pos: { list, index }, el: c });
  };

  if (list.length === 0) {
    if (cursor) caret(0);
    else box.appendChild(el('span', 'nd-empty', ''));
    if (!cursor) return box;
    box.classList.add('nd-empty-slot');
    return box;
  }

  for (let i = 0; i < list.length; i++) {
    if (cursor) caret(i);
    box.appendChild(renderNode(list[i], opts));
  }
  if (cursor) caret(list.length);
  return box;
}

function sub(node, name, opts) {
  return renderList(node[name], opts);
}

function renderNode(n, opts) {
  if (isChar(n)) {
    const cls = /[0-9.]/.test(n.v) ? 'nd-num' : /[+−×÷=]/.test(n.v) ? 'nd-op' : 'nd-sym';
    return el('span', `nd-ch ${cls}`, n.v);
  }
  switch (n.t) {
    case 'frac': {
      const box = el('span', 'nd-frac');
      const num = el('span', 'nd-frac-num'); num.appendChild(sub(n, 'num', opts));
      const den = el('span', 'nd-frac-den'); den.appendChild(sub(n, 'den', opts));
      box.append(num, den);
      return box;
    }
    case 'mixed': {
      const box = el('span', 'nd-mixed');
      box.appendChild(sub(n, 'w', opts));
      const f = el('span', 'nd-frac');
      const num = el('span', 'nd-frac-num'); num.appendChild(sub(n, 'num', opts));
      const den = el('span', 'nd-frac-den'); den.appendChild(sub(n, 'den', opts));
      f.append(num, den);
      box.appendChild(f);
      return box;
    }
    case 'sqrt': case 'cbrt': case 'nroot': {
      const box = el('span', 'nd-root');
      if (n.t === 'cbrt') box.appendChild(el('span', 'nd-root-index', '3'));
      if (n.t === 'nroot') {
        const idx = el('span', 'nd-root-index');
        idx.appendChild(sub(n, 'n', opts));
        box.appendChild(idx);
      }
      box.appendChild(el('span', 'nd-radical delim', '√'));
      const rad = el('span', 'nd-radicand');
      rad.appendChild(sub(n, 'a', opts));
      box.appendChild(rad);
      return box;
    }
    case 'sup': {
      const box = el('span', 'nd-sup');
      box.appendChild(sub(n, 'e', opts));
      return box;
    }
    case 'logb': {
      const box = el('span', 'nd-fn');
      box.appendChild(el('span', 'nd-fname', 'log'));
      const b = el('span', 'nd-subscript');
      b.appendChild(sub(n, 'b', opts));
      box.appendChild(b);
      box.appendChild(el('span', 'nd-paren delim', '('));
      box.appendChild(sub(n, 'a', opts));
      box.appendChild(el('span', 'nd-paren delim', ')'));
      return box;
    }
    case 'fn': {
      const box = el('span', 'nd-fn');
      box.appendChild(el('span', 'nd-fname', n.label || n.name));
      box.appendChild(el('span', 'nd-paren delim', '('));
      box.appendChild(sub(n, 'a', opts));
      box.appendChild(el('span', 'nd-paren delim', ')'));
      return box;
    }
    case 'abs': {
      const box = el('span', 'nd-abs');
      box.appendChild(el('span', 'nd-bar delim', '|'));
      box.appendChild(sub(n, 'a', opts));
      box.appendChild(el('span', 'nd-bar delim', '|'));
      return box;
    }
    case 'paren': {
      const box = el('span', 'nd-parens');
      box.appendChild(el('span', 'nd-paren delim', '('));
      box.appendChild(sub(n, 'a', opts));
      box.appendChild(el('span', 'nd-paren delim', ')'));
      return box;
    }
    case 'e10': {
      const box = el('span', 'nd-e10');
      box.appendChild(el('span', 'nd-ch nd-sym', '×10'));
      const s = el('span', 'nd-sup');
      s.appendChild(sub(n, 'e', opts));
      box.appendChild(s);
      return box;
    }
    case 'dms': {
      const box = el('span', 'nd-dms');
      box.appendChild(sub(n, 'd', opts));
      box.appendChild(el('span', 'nd-ch nd-sym', '°'));
      box.appendChild(sub(n, 'm', opts));
      box.appendChild(el('span', 'nd-ch nd-sym', '′'));
      box.appendChild(sub(n, 's', opts));
      box.appendChild(el('span', 'nd-ch nd-sym', '″'));
      return box;
    }
    case 'integ': {
      const box = el('span', 'nd-bigop');
      const lim = el('span', 'nd-limits');
      const hi = el('span', 'nd-lim-hi'); hi.appendChild(sub(n, 'hi', opts));
      const lo = el('span', 'nd-lim-lo'); lo.appendChild(sub(n, 'lo', opts));
      lim.append(hi, lo);
      box.appendChild(el('span', 'nd-opsym delim', '∫'));
      box.appendChild(lim);
      box.appendChild(sub(n, 'f', opts));
      box.appendChild(el('span', 'nd-ch nd-sym', 'dx'));
      return box;
    }
    case 'sum': case 'prod': {
      const box = el('span', 'nd-bigop');
      const hi = el('span', 'nd-lim-hi'); hi.appendChild(sub(n, 'hi', opts));
      const lo = el('span', 'nd-lim-lo');
      lo.appendChild(el('span', 'nd-ch nd-sym', 'x='));
      lo.appendChild(sub(n, 'lo', opts));
      const symBox = el('span', 'nd-bigop-sym', n.t === 'sum' ? 'Σ' : 'Π');
      const stack = el('span', 'nd-stack');
      stack.append(hi, symBox, lo);
      box.append(stack, sub(n, 'f', opts));
      return box;
    }
    case 'deriv': {
      const box = el('span', 'nd-deriv');
      const f = el('span', 'nd-frac');
      const num = el('span', 'nd-frac-num'); num.appendChild(el('span', 'nd-ch nd-sym', 'd'));
      const den = el('span', 'nd-frac-den'); den.appendChild(el('span', 'nd-ch nd-sym', 'dx'));
      f.append(num, den);
      box.appendChild(f);
      box.appendChild(el('span', 'nd-paren delim', '('));
      box.appendChild(sub(n, 'f', opts));
      box.appendChild(el('span', 'nd-paren delim', ')'));
      box.appendChild(el('span', 'nd-ch nd-sym', '|x='));
      box.appendChild(sub(n, 'at', opts));
      return box;
    }
    default:
      return el('span', 'nd-ch', '?');
  }
}

/**
 * Grow delimiters (parentheses, radicals, Σ, ∫, |…|) to match the height of
 * what they enclose. Must run after the DOM is laid out.
 */
export function scaleDelimiters(container) {
  const delims = container.querySelectorAll('.delim');
  for (const d of delims) {
    d.style.transform = '';
    const parent = d.parentElement;
    if (!parent) continue;
    const ph = parent.getBoundingClientRect().height;
    const dh = d.getBoundingClientRect().height;
    if (!ph || !dh) continue;
    const scale = Math.min(3.2, Math.max(1, (ph * 0.92) / dh));
    if (scale > 1.04) d.style.transform = `scaleY(${scale.toFixed(3)})`;
  }
}

/** Collect caret rectangles after layout, for pointer and ▲▼ navigation. */
export function caretMap(carets) {
  return carets.map((c) => ({ pos: c.pos, rect: c.el.getBoundingClientRect() }));
}

// --- Display AST → editor nodes --------------------------------------------

const PREC = { add: 1, sub: 1, mul: 2, div: 2, neg: 1, pow: 4 };
const precOf = (n) => PREC[n?.k] ?? 9;

/** Convert a parser/display AST into editor nodes, for natural result output. */
export function nodesFromAst(ast, parentPrec = 0) {
  const out = [];
  if (!ast) return out;
  const wrap = (nodes, myPrec) => {
    if (myPrec >= parentPrec) return nodes;
    const p = makeNode('paren');
    p.a = nodes;
    return [p];
  };

  switch (ast.k) {
    case 'num': {
      const s = formatNumberForDisplay(ast.v);
      return s.split('').map((c) => ch(c));
    }
    case 'var': return [ch(ast.n)];
    case 'ans': return [ch('Ans')];
    case 'preans': return [ch('PreAns')];
    case 'const':
      return [ch(ast.n === 'pi' ? 'π' : ast.n === 'e' ? 'ℯ' : 'ⅈ')];
    case 'paren': {
      const p = makeNode('paren');
      p.a = nodesFromAst(ast.a, 0);
      return [p];
    }
    case 'neg':
      return wrap([ch('−'), ...nodesFromAst(ast.a, PREC.neg + 1)], PREC.neg);
    case 'add':
      return wrap([...nodesFromAst(ast.a, PREC.add), ch('+'), ...nodesFromAst(ast.b, PREC.add + 1)], PREC.add);
    case 'sub':
      return wrap([...nodesFromAst(ast.a, PREC.sub), ch('−'), ...nodesFromAst(ast.b, PREC.sub + 1)], PREC.sub);
    case 'mul': {
      const left = nodesFromAst(ast.a, PREC.mul);
      const right = nodesFromAst(ast.b, PREC.mul + 1);
      // Show 2x rather than 2×x; keep × only where juxtaposition would read
      // as a single number (e.g. 2×3).
      const mid = isDigitStart(right) ? [ch('×')] : [];
      return wrap([...left, ...mid, ...right], PREC.mul);
    }
    case 'div': {
      const f = makeNode('frac');
      f.num = nodesFromAst(ast.a, 0);
      f.den = nodesFromAst(ast.b, 0);
      return [f];
    }
    case 'mixed': {
      const m = makeNode('mixed');
      m.w = nodesFromAst(ast.w, 0);
      m.num = nodesFromAst(ast.n, 0);
      m.den = nodesFromAst(ast.d, 0);
      return [m];
    }
    case 'pow': {
      const base = nodesFromAst(ast.a, PREC.pow + 1);
      const s = makeNode('sup');
      s.e = nodesFromAst(ast.b, 0);
      return wrap([...base, s], PREC.pow);
    }
    case 'fact':
      return wrap([...nodesFromAst(ast.a, 5), ch('!')], 5);
    case 'pct':
      return wrap([...nodesFromAst(ast.a, 5), ch('%')], 5);
    case 'fn': {
      const name = ast.n;
      if (name === 'sqrt') {
        const r = makeNode('sqrt');
        r.a = nodesFromAst(ast.args[0], 0);
        return [r];
      }
      if (name === 'cbrt') {
        const r = makeNode('cbrt');
        r.a = nodesFromAst(ast.args[0], 0);
        return [r];
      }
      if (name === 'nroot') {
        const r = makeNode('nroot');
        r.n = nodesFromAst(ast.args[0], 0);
        r.a = nodesFromAst(ast.args[1], 0);
        return [r];
      }
      if (name === 'abs') {
        const r = makeNode('abs');
        r.a = nodesFromAst(ast.args[0], 0);
        return [r];
      }
      if (name === 'exp') {
        const s = makeNode('sup');
        s.e = nodesFromAst(ast.args[0], 0);
        return [ch('ℯ'), s];
      }
      if (name === 'logb') {
        const r = makeNode('logb');
        r.b = nodesFromAst(ast.args[0], 0);
        r.a = nodesFromAst(ast.args[1], 0);
        return [r];
      }
      const label = FN_LABELS[name] || name;
      const r = makeNode('fn', { name, label });
      r.a = ast.args.length
        ? ast.args.map((a, i) => (i ? [ch(','), ...nodesFromAst(a, 0)] : nodesFromAst(a, 0))).flat()
        : [];
      return [r];
    }
    case 'eq':
      return [...nodesFromAst(ast.a, 0), ch('='), ...nodesFromAst(ast.b, 0)];
    default:
      return [ch('?')];
  }
}

const FN_LABELS = {
  asin: 'sin⁻¹', acos: 'cos⁻¹', atan: 'tan⁻¹',
  asinh: 'sinh⁻¹', acosh: 'cosh⁻¹', atanh: 'tanh⁻¹',
  conjg: 'Conjg', log10: 'log',
};

function isDigitStart(nodes) {
  const first = nodes[0];
  return first && isChar(first) && /[0-9.]/.test(first.v);
}

function formatNumberForDisplay(v) {
  if (Number.isInteger(v)) return String(v);
  const s = String(Number(v.toPrecision(12)));
  return s.replace('-', '−');
}

/** Parse a plain result string such as "1.234×10^5" into editor nodes. */
export function nodesFromResultText(text) {
  const m = /^(.*?)×10\^(−?-?\d+)$/.exec(text);
  if (!m) return text.split('').map((c) => ch(c));
  const out = m[1].split('').map((c) => ch(c));
  out.push(ch('×'), ch('1'), ch('0'));
  const s = makeNode('sup');
  s.e = m[2].replace('-', '−').split('').map((c) => ch(c));
  out.push(s);
  return out;
}
