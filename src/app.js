// Application controller: keypad wiring, modes, evaluation and display.

import { Editor, renderList, scaleDelimiters, caretMap, nodesFromAst, nodesFromResultText, ch, makeNode, toPlainText } from './editor.js';
import { FlickController } from './flick.js';
import {
  FUNCTION_ROWS, NUMERIC_ROWS, SHIFT_KEY, ALPHA_KEY, NAV_KEYS, TOP_KEYS,
  MENUS, CONSTANTS, CONVERSIONS, SI_PREFIXES, STAT_TYPES, EQN_TYPES,
} from './keys.js';
import { parse, CalcError, VARIABLES, stringify } from './parser.js';
import { makeContext, evaluate, roundToSig } from './evaluator.js';
import * as Z from './complex.js';
import * as F from './format.js';
import * as S from './symbolic.js';
import { solveEquation, solvePolynomialCoeffs, solveSimultaneous } from './solve.js';
import { integrate as quad, solveLinearSystem } from './numeric.js';

const $ = (sel) => document.querySelector(sel);

const state = {
  editor: new Editor(),
  ctx: makeContext(),
  mode: 'COMP',
  display: { ...F.DEFAULT_DISPLAY, fracMode: 'd/c', complexPolar: false },
  shift: false,
  alpha: false,
  result: null,
  sdIndex: 0,
  history: [],
  freshResult: false,
  carets: [],
};

// --- Persistence ------------------------------------------------------------

const STORAGE_KEY = 'fx375es-web-state-v1';

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      mode: state.mode,
      angle: state.ctx.angle,
      display: state.display,
      base: state.ctx.base,
      vars: Object.fromEntries(VARIABLES.map((v) => [v, [state.ctx.vars[v].re, state.ctx.vars[v].im]])),
      ans: [state.ctx.ans.re, state.ctx.ans.im],
      history: state.history.slice(-30).map((h) => ({ text: h.text, result: h.result, src: h.src })),
    }));
  } catch { /* storage unavailable — not fatal */ }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s.mode) state.mode = s.mode;
    if (s.angle) state.ctx.angle = s.angle;
    if (s.display) state.display = { ...state.display, ...s.display };
    if (s.base) state.ctx.base = s.base;
    if (s.vars) for (const v of VARIABLES) if (s.vars[v]) state.ctx.vars[v] = Z.C(s.vars[v][0], s.vars[v][1]);
    if (s.ans) state.ctx.ans = Z.C(s.ans[0], s.ans[1]);
    if (Array.isArray(s.history)) state.history = s.history;
  } catch { /* corrupt state — start clean */ }
}

// --- Keypad construction ----------------------------------------------------

const keyIndex = new Map();

function buildKey(def) {
  keyIndex.set(def.id, def);
  const btn = document.createElement('button');
  btn.className = `key ${def.cls || ''}`;
  btn.dataset.keyId = def.id;
  btn.type = 'button';

  if (def.span) btn.style.gridColumn = `span ${def.span}`;

  const main = document.createElement('span');
  main.className = 'legend main';
  main.innerHTML = def.center?.html ?? def.center?.label ?? def.label ?? '';
  btn.appendChild(main);

  for (const dir of ['up', 'right', 'down', 'left']) {
    const item = def[dir];
    if (!item) continue;
    const s = document.createElement('span');
    s.className = `legend hint hint-${dir} ${item.tone ? `tone-${item.tone}` : ''}`;
    s.innerHTML = item.short || item.label;
    btn.appendChild(s);
  }
  if (def.longPress) btn.classList.add('has-hold');
  return btn;
}

/**
 * Shrink any main legend that would be clipped by its key. Runs after layout,
 * so it adapts to whatever width the device actually gives us.
 */
function fitLegends() {
  for (const main of document.querySelectorAll('.key .main')) {
    main.style.fontSize = '';
    const limit = main.clientWidth;
    if (!limit) continue;
    let size = parseFloat(getComputedStyle(main).fontSize);
    let guard = 0;
    while (main.scrollWidth > limit + 1 && size > 6 && guard++ < 40) {
      size -= 0.5;
      main.style.fontSize = `${size}px`;
    }
  }
}

function buildKeypad() {
  const fnGrid = $('#fn-grid');
  for (const row of FUNCTION_ROWS) for (const key of row) fnGrid.appendChild(buildKey(key));

  const numGrid = $('#num-grid');
  for (const row of NUMERIC_ROWS) for (const key of row) numGrid.appendChild(buildKey(key));

  // DEL auto-repeats when held; the arrows are set up in the control strip.
  const del = keyIndex.get('del');
  if (del) del.repeat = true;
}

function buildControlStrip() {
  const strip = $('#control-strip');

  // SHIFT / ALPHA / MODE occupy the left column, the replay cross the middle,
  // AC / HIST / ? the right column. AC now sits far from DEL and =.
  const place = (def, cls) => {
    keyIndex.set(def.id, def);
    const btn = buildKey(def);
    btn.classList.add(cls);
    strip.appendChild(btn);
    return btn;
  };

  place({ ...SHIFT_KEY, center: { label: SHIFT_KEY.label, act: SHIFT_KEY.act } }, 'pos-shift');
  place({ ...ALPHA_KEY, center: { label: ALPHA_KEY.label, act: ALPHA_KEY.act } }, 'pos-alpha');

  for (const def of NAV_KEYS) {
    place({ ...def, center: { label: def.label, act: def.act }, repeat: true }, `pos-${def.id}`);
  }

  const byId = Object.fromEntries(TOP_KEYS.map((d) => [d.id, d]));
  place(byId.mode, 'pos-mode');
  place(byId.ac, 'pos-ac');
  place(byId.hist, 'pos-hist');
  place(byId.help, 'pos-help');
}

// --- Action dispatch --------------------------------------------------------

function fireKey(def, dir) {
  if (dir === 'longPress') {
    if (!def.longPress) return;
    state.shift = false; state.alpha = false;
    dispatch(def.longPress);
    render();
    return;
  }
  // The physical modifiers redirect a tap to the flick legends.
  let direction = dir;
  if (dir === 'center') {
    if (state.shift && def.up) direction = 'up';
    else if (state.alpha && def.right) direction = 'right';
  }
  const item = def[direction] || def.center;
  if (!item || !item.act) return;

  const wasModifier = item.act.type === 'cmd' && (item.act.name === 'shift' || item.act.name === 'alpha');
  if (!wasModifier) { state.shift = false; state.alpha = false; }

  dispatch(item.act);
  render();
}

function dispatch(act) {
  switch (act.type) {
    case 'char': insertChar(act.v, act.out); break;
    case 'text': insertText(act.v, act.out); break;
    case 'tpl': beginEdit(); state.editor.insertTemplate(act.t, act.extra || {}, act.focus); break;
    case 'fn': {
      beginEdit();
      state.editor.insertTemplate('fn', { name: act.name, label: act.label }, 'a');
      break;
    }
    case 'cmd': command(act.name, act.arg); break;
    case 'menu': openMenu(act.name); break;
    case 'mode': setMode(act.name); break;
    default: break;
  }
}

function beginEdit() {
  if (state.freshResult) {
    state.freshResult = false;
    state.result = null;
  }
}

function insertChar(v, out) {
  beginEdit();
  state.editor.insertChar(v, out);
}

function insertText(v, out) {
  beginEdit();
  state.editor.insert(ch(v, out ?? v));
}

function command(name, arg) {
  const ed = state.editor;
  switch (name) {
    case 'shift': state.shift = !state.shift; state.alpha = false; return;
    case 'alpha': state.alpha = !state.alpha; state.shift = false; return;

    case 'ac':
      ed.clear();
      state.result = null;
      state.freshResult = false;
      return;
    case 'del':
      beginEdit();
      ed.backspace();
      return;
    case 'ins': ed.insertMode = !ed.insertMode; return;
    case 'off': ed.clear(); state.result = null; return;

    case 'left': ed.moveLeft(); return;
    case 'right': ed.moveRight(); return;
    case 'up':
      if (!ed.moveVertical(-1, caretMap(state.carets))) recallHistory(-1);
      return;
    case 'down':
      if (!ed.moveVertical(1, caretMap(state.carets))) recallHistory(1);
      return;

    case 'square': beginEdit(); ed.insertTemplate('sup', { e: [ch('2')] }); return;
    case 'cube': beginEdit(); ed.insertTemplate('sup', { e: [ch('3')] }); return;
    case 'inverse': beginEdit(); ed.insertTemplate('sup', { e: [ch('−', '-'), ch('1')] }); return;
    case 'pow10': beginEdit(); ed.insertChar('1'); ed.insertChar('0'); ed.insertTemplate('sup', {}, 'e'); return;
    case 'powe': beginEdit(); ed.insertChar('ℯ'); ed.insertTemplate('sup', {}, 'e'); return;
    case 'closeParen': closeParen(); return;

    case 'equals': runEquals(); return;
    case 'solve': runSolve(); return;
    case 'symint': runSymbolicIntegral(); return;
    case 'symdiff': runSymbolicDerivative(); return;
    case 'calc': runCalc(); return;
    case 'divmod': runDivMod(); return;

    case 'sd': toggleSD(); return;
    case 'mixedToggle': toggleMixed(); return;
    case 'eng': engShift(1); return;
    case 'engBack': engShift(-1); return;
    case 'todms': showAsDMS(); return;

    case 'si': applyPrefixByExp(arg); return;
    case 'base': setBase(arg); return;
    case 'mplus': memoryAdd(1); return;
    case 'mminus': memoryAdd(-1); return;

    case 'clrSetup': resetSetup(); return;
    case 'clrMemory': clearMemory(); return;
    case 'clrAll': resetSetup(); clearMemory(); state.history = []; ed.clear(); state.result = null; return;
    default: return;
  }
}

function closeParen() {
  const ed = state.editor;
  let list = ed.cursor.list;
  for (let guard = 0; guard < 40; guard++) {
    const loc = ed.locate(list);
    if (!loc) return;
    if (loc.node.t === 'paren') {
      ed.cursor = { list: loc.parentList, index: loc.parentIndex + 1 };
      return;
    }
    list = loc.parentList;
  }
}

// --- Evaluation -------------------------------------------------------------

function currentSource() {
  return state.editor.serialize();
}

function parseCurrent() {
  const src = currentSource();
  if (!src.trim()) throw new CalcError('Syntax ERROR', -1, 'nothing to evaluate');
  return parse(src, state.mode === 'BASE' ? { base: state.ctx.base || 10 } : {});
}

function runEquals() {
  try {
    const ast = parseCurrent();
    if (ast.k === 'eq') { solveFromAst(ast); return; }

    state.ctx.lastPair = null;
    state.ctx.sigDigits = state.display.mode === 'fix' ? state.display.digits : 10;
    const value = evaluate(ast, state.ctx);

    if (!Z.isReal(value) && state.mode !== 'CMPLX') {
      throw new CalcError('Math ERROR', -1, 'complex result — switch to CMPLX mode');
    }

    state.ctx.preans = state.ctx.ans;
    state.ctx.ans = Z.clean(value);
    pushHistory();
    showValue(state.ctx.ans);
    state.freshResult = true;
  } catch (e) {
    showError(e);
  }
  saveState();
}

function showValue(z) {
  const forms = [];

  if (state.mode === 'BASE') {
    const v = Math.trunc(z.re);
    forms.push({
      label: `base ${state.ctx.base}`,
      nodes: F.formatBaseN(v, state.ctx.base, state.ctx.wordBits).split('').map((c) => ch(c)),
      text: F.formatBaseN(v, state.ctx.base, state.ctx.wordBits),
    });
    state.result = { kind: 'value', forms, index: 0 };
    return;
  }

  if (!Z.isReal(z)) {
    const rect = { label: 'a+bⅈ', text: F.formatComplex(z, state.display, false) };
    const polar = { label: 'r∠θ', text: F.formatComplex(z, state.display, true) };
    const ordered = state.display.complexPolar ? [polar, rect] : [rect, polar];
    for (const f of ordered) forms.push({ ...f, nodes: nodesFromResultText(f.text) });
    state.result = { kind: 'value', forms, index: 0, value: z };
    return;
  }

  const x = z.re;
  const dec = F.formatReal(x, state.display);
  const exact = state.display.mode === 'norm' ? F.exactForm(x) : null;
  if (exact) {
    forms.push({ label: 'exact', nodes: nodesFromAst(exact), text: stringify(exact) });
  }
  forms.push({ label: 'decimal', nodes: nodesFromResultText(dec.text), text: dec.text });

  const mixed = exact ? F.toMixed(exact) : null;
  if (mixed) {
    const entry = { label: 'a b/c', nodes: nodesFromAst(mixed), text: stringify(mixed) };
    // "ab/c" in SETUP means the mixed form leads.
    if (state.display.fracMode === 'ab/c') forms.unshift(entry);
    else forms.push(entry);
  }

  state.result = { kind: 'value', forms, index: 0, value: z };

  // Pol / Rec produce a pair of values.
  if (state.ctx.lastPair) {
    const p = state.ctx.lastPair;
    state.result.pair = `${p.labels[0]}=${F.formatReal(p.a.re, state.display).text}   ` +
      `${p.labels[1]}=${F.formatReal(p.b.re, state.display).text}`;
  }
}

function showError(e) {
  const kind = e instanceof CalcError ? e.kind : 'Math ERROR';
  const detail = e instanceof CalcError ? e.detail : String(e.message || e);
  state.result = { kind: 'error', message: kind, detail };
  state.freshResult = false;
}

function toggleSD() {
  const r = state.result;
  if (!r || r.kind !== 'value' || !r.forms || r.forms.length < 2) return;
  r.index = (r.index + 1) % r.forms.length;
}

function toggleMixed() {
  const r = state.result;
  if (!r || !r.forms) return;
  const i = r.forms.findIndex((f) => f.label === 'mixed');
  if (i >= 0) r.index = i;
  else toggleSD();
}

function engShift(dir) {
  const r = state.result;
  if (!r || r.kind !== 'value' || !r.value || !Z.isReal(r.value)) return;
  r.engExp = (r.engExp || 0) + dir * 3;
  const scaled = r.value.re / Math.pow(10, r.engExp);
  const mant = F.formatReal(scaled, { ...state.display, mode: 'norm' }).text;
  const text = r.engExp === 0 ? mant : `${mant}×10^${r.engExp}`;
  r.forms = [{ label: 'eng', nodes: nodesFromResultText(text), text }];
  r.index = 0;
}

function showAsDMS() {
  const r = state.result;
  if (!r || !r.value || !Z.isReal(r.value)) return;
  const text = F.toDMS(r.value.re);
  r.forms = [{ label: 'dms', nodes: text.split('').map((c) => ch(c)), text }];
  r.index = 0;
}

function runDivMod() {
  try {
    const ast = parseCurrent();
    if (ast.k !== 'div') throw new CalcError('Syntax ERROR', -1, '÷R needs a ÷ b');
    const a = evaluate(ast.a, state.ctx);
    const b = evaluate(ast.b, state.ctx);
    if (!Z.isReal(a) || !Z.isReal(b) || b.re === 0) throw new CalcError('Math ERROR', -1, 'need real a ÷ b');
    const q = Math.trunc(a.re / b.re);
    const r = a.re - q * b.re;
    state.ctx.preans = state.ctx.ans;
    state.ctx.ans = Z.C(q, 0);
    state.result = {
      kind: 'value',
      forms: [{ label: 'quotient', nodes: nodesFromResultText(String(q)), text: String(q) }],
      index: 0,
      pair: `Q=${q}   R=${F.formatReal(r, state.display).text}`,
      value: Z.C(q, 0),
    };
    state.freshResult = true;
  } catch (e) { showError(e); }
}

// --- Equation solving -------------------------------------------------------

function pickSolveVariable(ast) {
  const used = new Set();
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (n.k === 'var') used.add(n.n);
    for (const key2 of ['a', 'b']) if (n[key2]) walk(n[key2]);
    if (n.args) n.args.forEach(walk);
  };
  walk(ast);
  if (used.has('X')) return 'X';
  for (const v of VARIABLES) if (used.has(v)) return v;
  return 'X';
}

function runSolve() {
  try {
    const ast = parseCurrent();
    solveFromAst(ast);
  } catch (e) { showError(e); }
}

function solveFromAst(ast) {
  const varName = pickSolveVariable(ast);
  const res = solveEquation(ast, varName, state.ctx, {});
  if (!res.roots.length) {
    state.result = { kind: 'error', message: res.note || 'Can’t Solve', detail: `solving for ${varName}` };
    return;
  }
  state.ctx.vars[varName] = Z.C(res.roots[0].value.re, res.roots[0].value.im);
  state.ctx.preans = state.ctx.ans;
  state.ctx.ans = Z.C(res.roots[0].value.re, res.roots[0].value.im);

  const lines = res.roots.map((r, i) => {
    const label = res.roots.length > 1 ? `${varName}${subscript(i + 1)}` : varName;
    const nodes = r.exact
      ? nodesFromAst(r.exact)
      : nodesFromResultText(F.formatComplex(r.value, state.display));
    const approx = r.exact ? F.formatComplex(r.value, state.display) : null;
    return { label, nodes, approx };
  });
  state.result = {
    kind: 'roots',
    title: `SOLVE  (${res.kind})`,
    lines,
    note: res.note,
  };
  state.freshResult = true;
  pushHistory();
  saveState();
}

const subscript = (n) => String(n).replace(/\d/g, (d) => '₀₁₂₃₄₅₆₇₈₉'[+d]);

// --- Symbolic calculus ------------------------------------------------------

function runSymbolicIntegral() {
  try {
    const ast = parseCurrent();
    let integrand = ast, lo = null, hi = null;
    if (ast.k === 'fn' && ast.n === 'integ') {
      integrand = ast.args[0];
      lo = ast.args[1];
      hi = ast.args[2];
    }
    const internal = S.simplify(S.fromAst(integrand));
    const F0 = S.integrate(internal, 'X');

    if (!F0) {
      if (lo && hi) { numericFallback(integrand, lo, hi); return; }
      state.result = {
        kind: 'error',
        message: 'No closed form',
        detail: 'この積分は初等関数で表せません。定積分なら数値積分で計算できます。',
      };
      return;
    }

    const antiNodes = nodesFromAst(S.toDisplayAst(F0));
    const lines = [{ label: '∫f dx', nodes: [...antiNodes, ch(' '), ch('+'), ch(' '), ch('C')] }];

    if (lo && hi) {
      const loV = evaluate(lo, state.ctx);
      const hiV = evaluate(hi, state.ctx);
      if (Z.isReal(loV) && Z.isReal(hiV)) {
        const at = (p) => S.evalNumeric(S.substitute(F0, 'X', S.rationalize(p)));
        const val = at(hiV.re) - at(loV.re);
        if (Number.isFinite(val)) {
          const exact = tryExactDefinite(F0, loV.re, hiV.re, val);
          state.ctx.preans = state.ctx.ans;
          state.ctx.ans = Z.C(val, 0);
          lines.push({
            label: 'value',
            nodes: exact ? nodesFromAst(exact) : nodesFromResultText(F.formatReal(val, state.display).text),
            approx: exact ? F.formatReal(val, state.display).text : null,
          });
        }
      }
    }
    state.result = { kind: 'roots', title: '∫ symbolic', lines };
    state.freshResult = true;
    saveState();
  } catch (e) { showError(e); }
}

function tryExactDefinite(F0, lo, hi, approx) {
  try {
    const diff = S.simplify(S.sub(
      S.substitute(F0, 'X', S.rationalize(hi)),
      S.substitute(F0, 'X', S.rationalize(lo)),
    ));
    const v = S.evalNumeric(diff);
    if (Math.abs(v - approx) > 1e-9 * Math.max(1, Math.abs(approx))) return null;
    const ast = S.toDisplayAst(diff);
    // Only worth showing when it is genuinely more informative than a decimal.
    const txt = stringify(ast);
    if (/^-?\d+(\.\d+)?$/.test(txt)) return null;
    if (txt.length > 40) return null;
    return ast;
  } catch { return null; }
}

function numericFallback(integrand, lo, hi) {
  const loV = evaluate(lo, state.ctx).re;
  const hiV = evaluate(hi, state.ctx).re;
  const f = makeRealFn(integrand);
  const r = quad(f, loV, hiV, 1e-11);
  state.ctx.preans = state.ctx.ans;
  state.ctx.ans = Z.C(r.value, 0);
  state.result = {
    kind: 'roots',
    title: '∫ numeric (no closed form)',
    lines: [{ label: 'value', nodes: nodesFromResultText(F.formatReal(r.value, state.display).text) }],
    note: `estimated error ≈ ${r.err.toExponential(1)}`,
  };
  state.freshResult = true;
}

function makeRealFn(ast) {
  const saved = state.ctx.vars.X;
  return (x) => {
    state.ctx.vars.X = Z.C(x, 0);
    try {
      const v = evaluate(ast, state.ctx);
      return Z.isReal(v) ? v.re : NaN;
    } catch { return NaN; }
    finally { state.ctx.vars.X = saved; }
  };
}

function runSymbolicDerivative() {
  try {
    const ast = parseCurrent();
    let body = ast;
    if (ast.k === 'fn' && ast.n === 'deriv') body = ast.args[0];
    const dfn = S.diff(S.simplify(S.fromAst(body)), 'X');
    state.result = {
      kind: 'roots',
      title: 'd/dx symbolic',
      lines: [{ label: 'f′(x)', nodes: nodesFromAst(S.toDisplayAst(dfn)) }],
    };
    state.freshResult = true;
  } catch (e) { showError(e); }
}

// --- CALC -------------------------------------------------------------------

function runCalc() {
  let ast;
  try { ast = parseCurrent(); } catch (e) { showError(e); return; }
  const used = [];
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (n.k === 'var' && !used.includes(n.n)) used.push(n.n);
    for (const key2 of ['a', 'b']) if (n[key2]) walk(n[key2]);
    if (n.args) n.args.forEach(walk);
  };
  walk(ast);
  if (!used.length) { runEquals(); return; }

  openPanel('CALC', (body, close) => {
    const form = document.createElement('div');
    form.className = 'panel-form';
    const inputs = {};
    for (const v of used) {
      const row = document.createElement('label');
      row.className = 'panel-row';
      row.innerHTML = `<span class="panel-key">${v}</span>`;
      const input = document.createElement('input');
      input.type = 'text';
      input.inputMode = 'decimal';
      input.value = String(roundToSig(state.ctx.vars[v].re, 10));
      row.appendChild(input);
      inputs[v] = input;
      form.appendChild(row);
    }
    const out = document.createElement('div');
    out.className = 'panel-output';
    const go = document.createElement('button');
    go.className = 'panel-btn primary';
    go.textContent = '計算する';
    go.onclick = () => {
      try {
        for (const v of used) {
          const val = evaluate(parse(inputs[v].value || '0'), state.ctx);
          state.ctx.vars[v] = val;
        }
        const value = evaluate(ast, state.ctx);
        state.ctx.preans = state.ctx.ans;
        state.ctx.ans = Z.clean(value);
        out.textContent = F.formatComplex(state.ctx.ans, state.display);
        showValue(state.ctx.ans);
        state.freshResult = true;
        render();
      } catch (e) {
        out.textContent = e instanceof CalcError ? `${e.kind}: ${e.detail}` : String(e);
      }
    };
    body.append(form, go, out);
  });
}

// --- SI prefixes ------------------------------------------------------------
//
// These never touch the expression. They restate the answer that is already on
// screen: with the result 1000, choosing "k" shows "1 k".

const SI_NONE = SI_PREFIXES.findIndex((p) => p.exp === 0);

/** The answer as a plain real number, or null when a prefix cannot apply. */
function prefixableValue() {
  const r = state.result;
  if (!r || r.kind !== 'value' || !r.value || !Z.isReal(r.value)) return null;
  return r.value.re;
}

function prefixText(value, prefix) {
  const scaled = value / Math.pow(10, prefix.exp);
  const mant = F.formatReal(scaled, { ...state.display, mode: 'norm', norm: 2 }).text;
  return prefix.exp === 0 ? mant : `${mant} ${prefix.sym}`;
}

/** Restate the displayed answer with the chosen prefix. */
function applyPrefix(prefix) {
  const value = prefixableValue();
  if (value === null) return false;
  const text = prefixText(value, prefix);
  state.result.forms = [{ label: prefix.sym === '—' ? '—' : `${prefix.sym} (10^${prefix.exp})`,
    nodes: text.split('').map((c) => ch(c)), text }];
  state.result.index = 0;
  return true;
}

function applyPrefixByExp(exp) {
  const prefix = SI_PREFIXES.find((p) => p.exp === exp);
  if (prefix) applyPrefix(prefix);
}

/**
 * Hold the SI key and slide without lifting: a column of prefixes appears with
 * "なし" under the finger, larger units upwards and smaller ones downwards.
 */
function createSiPicker(_key, rect) {
  const value = prefixableValue();
  if (value === null) return null;

  const ITEM = 30;
  const el = document.createElement('div');
  el.className = 'si-picker';

  const head = document.createElement('div');
  head.className = 'si-head';
  el.appendChild(head);

  const list = document.createElement('div');
  list.className = 'si-list';
  const rows = SI_PREFIXES.map((p) => {
    const row = document.createElement('div');
    row.className = 'si-row';
    row.innerHTML = `<b>${p.sym === '—' ? 'なし' : p.sym}</b>` +
      `<i>${p.name}</i><span>${p.exp === 0 ? '' : `10<sup>${p.exp}</sup>`}</span>`;
    list.appendChild(row);
    return row;
  });
  el.appendChild(list);
  document.body.appendChild(el);

  const width = el.offsetWidth;
  const height = el.offsetHeight;
  const left = Math.max(6, Math.min(window.innerWidth - width - 6,
    rect.left + rect.width / 2 - width / 2));
  el.style.left = `${left}px`;

  let sel = SI_NONE;
  const headH = head.offsetHeight;

  const place = () => {
    // Keep the highlighted row beside the finger, but never off screen.
    const wanted = rect.top + rect.height / 2 - headH - sel * ITEM - ITEM / 2;
    const top = Math.max(6, Math.min(window.innerHeight - height - 6, wanted));
    el.style.top = `${top}px`;
  };

  const paint = () => {
    rows.forEach((r, i) => r.classList.toggle('on', i === sel));
    head.textContent = `${F.formatReal(value, state.display).text}  →  ${prefixText(value, SI_PREFIXES[sel])}`;
    place();
  };

  el.classList.add('visible');
  paint();

  return {
    update(_dx, dy) {
      // Up is the positive direction, so dragging up walks towards P.
      const next = Math.max(0, Math.min(SI_PREFIXES.length - 1, SI_NONE + Math.round(dy / ITEM)));
      if (next !== sel) {
        sel = next;
        paint();
        if (navigator.vibrate) { try { navigator.vibrate(4); } catch { /* unsupported */ } }
      }
    },
    commit() {
      applyPrefix(SI_PREFIXES[sel]);
      el.remove();
      render();
    },
    cancel() { el.remove(); },
  };
}

function openSiPanel() {
  const value = prefixableValue();
  if (value === null) {
    openPanel('SI 接頭辞', (body) => {
      body.innerHTML = '<p class="setup-note">計算結果の表示を kPa・MPa・mV のように言い換える機能です。'
        + 'まず = で答えを出してから、このキーを長押ししたまま上下になぞってください。</p>';
    });
    return;
  }
  openList('SI 接頭辞 — 結果の表示を変える', SI_PREFIXES.map((p) => ({
    html: `<b>${p.sym === '—' ? 'なし' : p.sym}</b> <small>${p.name}</small>` +
      `<span class="panel-val">${prefixText(value, p)}</span>`,
    p,
  })), (item) => { applyPrefix(item.p); });
}

// --- Memory / variables -----------------------------------------------------

function memoryAdd(sign) {
  try {
    const ast = state.editor.isEmpty() ? null : parseCurrent();
    const v = ast ? evaluate(ast, state.ctx) : state.ctx.ans;
    state.ctx.vars.M = Z.add(state.ctx.vars.M, sign > 0 ? v : Z.neg(v));
    showValue(state.ctx.vars.M);
    state.freshResult = true;
    saveState();
  } catch (e) { showError(e); }
}

function clearMemory() {
  for (const v of VARIABLES) state.ctx.vars[v] = Z.C(0, 0);
  state.ctx.ans = Z.C(0, 0);
  state.ctx.preans = Z.C(0, 0);
  saveState();
}

function resetSetup() {
  state.ctx.angle = 'deg';
  state.display = { ...F.DEFAULT_DISPLAY };
  state.ctx.base = 0;
  state.mode = 'COMP';
  saveState();
}

// --- Modes ------------------------------------------------------------------

function setMode(name) {
  state.mode = name;
  state.ctx.complexMode = name === 'CMPLX';
  state.ctx.base = name === 'BASE' ? (state.ctx.base || 10) : 0;
  state.editor.clear();
  state.result = null;
  if (name === 'EQN') openEqnPanel();
  if (name === 'TABLE') openTablePanel();
  if (name === 'STAT') openStatPanel();
  saveState();
}

function setBase(b) {
  state.mode = 'BASE';
  state.ctx.base = b;
  saveState();
}

// --- History ----------------------------------------------------------------

function pushHistory() {
  const text = state.editor.plainText();
  if (!text) return;
  const resultText = state.result?.forms?.[0]?.text
    ?? state.result?.lines?.[0]?.nodes?.map((n) => n.v).join('')
    ?? '';
  state.history.push({ text, result: resultText, src: currentSource() });
  if (state.history.length > 60) state.history.shift();
}

let historyCursor = -1;
function recallHistory(dir) {
  if (!state.history.length) return;
  if (historyCursor === -1) historyCursor = state.history.length;
  historyCursor = Math.max(0, Math.min(state.history.length - 1, historyCursor + (dir < 0 ? -1 : 1)));
  const entry = state.history[historyCursor];
  if (!entry) return;
  loadSource(entry.src);
}

function loadSource(src) {
  // Re-enter a stored expression by replaying it through the parser and the
  // AST → editor-node converter.
  try {
    const ast = parse(src);
    state.editor.setNodes(nodesFromAst(ast));
  } catch {
    state.editor.setNodes(src.split('').map((c) => ch(c)));
  }
  state.result = null;
  state.freshResult = false;
}

// --- Overlays ---------------------------------------------------------------

function openPanel(title, build) {
  const overlay = $('#overlay');
  overlay.innerHTML = '';
  const panel = document.createElement('div');
  panel.className = 'panel';
  const head = document.createElement('div');
  head.className = 'panel-head';
  head.innerHTML = `<span>${title}</span>`;
  const close = document.createElement('button');
  close.className = 'panel-close';
  close.textContent = '✕';
  close.onclick = () => { overlay.classList.remove('open'); overlay.innerHTML = ''; };
  head.appendChild(close);
  const body = document.createElement('div');
  body.className = 'panel-body';
  panel.append(head, body);
  overlay.appendChild(panel);
  overlay.classList.add('open');
  overlay.onclick = (e) => { if (e.target === overlay) close.onclick(); };
  build(body, close.onclick);
}

function openList(title, items, onPick) {
  openPanel(title, (body, close) => {
    const list = document.createElement('div');
    list.className = 'panel-list';
    for (const item of items) {
      const b = document.createElement('button');
      b.className = 'panel-item';
      b.innerHTML = item.html || item.label;
      b.onclick = () => { close(); onPick(item); render(); };
      list.appendChild(b);
    }
    body.appendChild(list);
  });
}

function openMenu(name) {
  switch (name) {
    case 'mode':
      openList('MODE', MENUS.mode.items, (i) => dispatch(i.act));
      return;
    case 'hyp':
      openList('hyp', MENUS.hyp.items, (i) => dispatch(i.act));
      return;
    case 'drg':
      openList('DRG▶', MENUS.drg.items, (i) => dispatch(i.act));
      return;
    case 'clr':
      openList('CLR', MENUS.clr.items, (i) => dispatch(i.act));
      return;
    case 'setup': openSetup(); return;
    case 'si': openSiPanel(); return;
    case 'vars': openVarPanel('変数を入力', false); return;
    case 'multi':
      openList(MENUS.multi.title, MENUS.multi.items, (i) => dispatch(i.act));
      return;
    case 'const':
      openList('CONST — 科学定数（40種）', CONSTANTS.map((c) => ({
        html: `<b>${c.id} ${c.sym}</b> <small>${c.name}</small>` +
          `<span class="panel-val">${c.value}${c.unit ? ' ' + c.unit : ''}</span>`,
        c,
      })), (i) => {
        beginEdit();
        insertNumberLiteral(i.c.value);
      });
      return;
    case 'conv':
      openList('CONV — 単位換算', CONVERSIONS.map((c) => ({
        html: `<b>${c.id}</b> ${c.from} ▸ ${c.to}` +
          `<span class="panel-val">${c.factor ? `×${Number(c.factor.toPrecision(10))}` : '(温度)'}` +
          `${c.note ? ` ${c.note}` : ''}</span>`,
        c,
      })), (i) => applyConversion(i.c));
      return;
    case 'sto': openVarPanel('STO — 変数に保存', true); return;
    case 'rcl': openVarPanel('RCL — 変数を呼び出す', false); return;
    case 'history': openHistory(); return;
    case 'help': openHelp(); return;
    default: return;
  }
}

/** Type a numeric literal, routing the exponent through the ×10ⁿ template. */
function insertNumberLiteral(value) {
  const [mantissa, exponent] = String(value).split('e');
  for (const d of mantissa) state.editor.insertChar(d === '-' ? '−' : d, d);
  if (exponent !== undefined) {
    const digits = exponent.replace('+', '');
    const nodes = digits.split('').map((c) => ch(c === '-' ? '−' : c, c === '-' ? '-' : c));
    state.editor.insertTemplate('e10', { e: nodes });
  }
}

function applyConversion(c) {
  try {
    const ast = state.editor.isEmpty() ? null : parseCurrent();
    const v = ast ? evaluate(ast, state.ctx) : state.ctx.ans;
    const out = c.convert
      ? Z.C(c.convert(Z.isReal(v) ? v.re : NaN), 0)
      : Z.mul(v, Z.C(c.factor, 0));
    state.ctx.preans = state.ctx.ans;
    state.ctx.ans = out;
    showValue(out);
    state.result.pair = `${F.formatReal(v.re, state.display).text} ${c.from} = ${F.formatReal(out.re, state.display).text} ${c.to}`;
    state.freshResult = true;
  } catch (e) { showError(e); }
}

function openVarPanel(title, storing) {
  const items = VARIABLES.map((v) => ({
    label: `<b>${v}</b><span class="panel-val">${F.formatComplex(state.ctx.vars[v], state.display)}</span>`,
    html: `<b>${v}</b><span class="panel-val">${F.formatComplex(state.ctx.vars[v], state.display)}</span>`,
    v,
  }));
  openList(title, items, (item) => {
    if (storing) {
      try {
        const ast = state.editor.isEmpty() ? null : parseCurrent();
        const value = ast ? evaluate(ast, state.ctx) : state.ctx.ans;
        state.ctx.vars[item.v] = Z.clean(value);
        showValue(state.ctx.vars[item.v]);
        state.freshResult = true;
        saveState();
      } catch (e) { showError(e); }
    } else {
      beginEdit();
      state.editor.insertChar(item.v);
    }
  });
}

function openSetup() {
  openPanel('SETUP', (body) => {
    const group = (label, options, get, set) => {
      const wrap = document.createElement('div');
      wrap.className = 'setup-group';
      wrap.innerHTML = `<div class="setup-label">${label}</div>`;
      const row = document.createElement('div');
      row.className = 'setup-options';
      for (const o of options) {
        const b = document.createElement('button');
        b.className = 'setup-opt' + (get() === o.value ? ' on' : '');
        b.innerHTML = o.label;
        b.onclick = () => { set(o.value); saveState(); openSetup(); render(); };
        row.appendChild(b);
      }
      wrap.appendChild(row);
      body.appendChild(wrap);
    };

    group('角度設定', [
      { label: 'Deg（度）', value: 'deg' },
      { label: 'Rad（ラジアン）', value: 'rad' },
      { label: 'Gra（グラード）', value: 'gra' },
    ], () => state.ctx.angle, (v) => { state.ctx.angle = v; });

    group('表示桁数設定', [
      { label: 'Norm 1', value: 'norm1' },
      { label: 'Norm 2', value: 'norm2' },
      { label: 'Fix', value: 'fix' },
      { label: 'Sci', value: 'sci' },
    ], () => {
      const d = state.display;
      return d.mode === 'norm' ? `norm${d.norm}` : d.mode;
    }, (v) => {
      if (v === 'norm1') state.display = { ...state.display, mode: 'norm', norm: 1, digits: 10 };
      else if (v === 'norm2') state.display = { ...state.display, mode: 'norm', norm: 2, digits: 10 };
      else if (v === 'fix') state.display = { ...state.display, mode: 'fix', digits: 3 };
      else state.display = { ...state.display, mode: 'sci', digits: 5 };
    });

    if (state.display.mode === 'fix' || state.display.mode === 'sci') {
      const isFix = state.display.mode === 'fix';
      const digits = isFix ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      group(isFix ? '小数点以下桁数（Fix 0〜9）' : '有効桁数（Sci 1〜10）',
        digits.map((n) => ({ label: String(n), value: n })),
        () => state.display.digits,
        (v) => { state.display = { ...state.display, digits: v }; });
    }

    group('分数表示設定', [
      { label: 'ab/c（帯分数）', value: 'ab/c' },
      { label: 'd/c（仮分数）', value: 'd/c' },
    ], () => state.display.fracMode, (v) => { state.display = { ...state.display, fracMode: v }; });

    group('複素数表示設定', [
      { label: 'a+bⅈ（直交座標）', value: false },
      { label: 'r∠θ（極座標）', value: true },
    ], () => state.display.complexPolar, (v) => { state.display = { ...state.display, complexPolar: v }; });

    group('BASE-N の基数', [
      { label: 'Dec', value: 10 }, { label: 'Hex', value: 16 },
      { label: 'Bin', value: 2 }, { label: 'Oct', value: 8 },
    ], () => state.ctx.base, (v) => { state.ctx.base = v; state.mode = 'BASE'; });

    const note = document.createElement('p');
    note.className = 'setup-note';
    note.textContent = 'フリック入力：キーを押したまま上下左右へなぞると、黄色（SHIFT）や赤（ALPHA）の機能が直接入力できます。'
      + '「接頭辞」キーは長押しで k / M / m / µ などの一覧が開きます。';
    body.appendChild(note);
  });
}

function openHistory() {
  const items = state.history.slice().reverse().map((h, i) => ({
    html: `<span class="hist-expr">${escapeHtml(h.text)}</span><span class="panel-val">${escapeHtml(h.result)}</span>`,
    h,
  }));
  if (!items.length) items.push({ html: '<small>まだ履歴がありません</small>', h: null });
  openList('計算履歴', items, (item) => { if (item.h) loadSource(item.h.src); });
}

const escapeHtml = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function openHelp() {
  openPanel('使い方', (body) => {
    body.innerHTML = `
      <div class="help">
        <h3>フリック入力</h3>
        <p>キーを押したまま指を動かすと、周囲に候補が表示されます。
           <b>上＝SHIFT（黄）</b>、<b>右＝ALPHA（赤）</b>、<b>下・左＝関連機能</b>です。
           指を離すとその機能が入力されます。SHIFT／ALPHA キーも従来どおり使えます。</p>
        <h3>追加機能</h3>
        <ul>
          <li><b>方程式を解く</b>：式に <code>=</code> を入れて <code>=</code> キー、または CALC を上フリック（SOLVE）。
              1次・2次は厳密解（√や複素数）で、それ以外は実数解を数値的に探します。</li>
          <li><b>記号積分</b>：∫ キーを下フリック。原始関数を数式のまま返します。
              上下限を入れれば定積分の値も出ます。閉じた式が無い場合は数値積分に切り替わります。</li>
          <li><b>複素数</b>：MODE ▸ CMPLX。虚数単位 ⅈ は ENG キーの右フリック。
              S⇔D で <i>a+bⅈ</i> と <i>r∠θ</i> を切り替えられます。</li>
        </ul>
        <h3>その他</h3>
        <ul>
          <li><b>S⇔D</b>：分数・√・π の厳密表示と小数表示を切り替えます。</li>
          <li><b>▲▼</b>：数式内の上下移動。移動先が無いときは計算履歴を辿ります。</li>
          <li>結果と設定は端末内に自動保存されます。</li>
        </ul>
      </div>`;
  });
}

// --- EQN / TABLE / STAT panels ---------------------------------------------

function openEqnPanel() {
  openPanel('EQN — 方程式計算', (body) => {
    const choose = document.createElement('div');
    choose.className = 'panel-list';
    for (const type of EQN_TYPES) {
      const b = document.createElement('button');
      b.className = 'panel-item';
      b.innerHTML = `<b>${type.id}</b> ${type.label}<span class="panel-val">${type.name}</span>`;
      b.onclick = () => {
        body.innerHTML = '';
        body.appendChild(type.kind === 'sim' ? simultaneousForm(type.n) : polyForm(type.deg));
      };
      choose.appendChild(b);
    }
    body.appendChild(choose);
  });
}

function numberGrid(labels, cols) {
  const grid = document.createElement('div');
  grid.className = 'coef-grid';
  grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  const inputs = [];
  for (const label of labels) {
    const cell = document.createElement('label');
    cell.className = 'coef-cell';
    cell.innerHTML = `<span>${label}</span>`;
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.value = '0';
    cell.appendChild(input);
    inputs.push(input);
    grid.appendChild(cell);
  }
  return { grid, inputs };
}

function readNumbers(inputs) {
  return inputs.map((i) => {
    try { return evaluate(parse(i.value || '0'), state.ctx).re; }
    catch { return NaN; }
  });
}

function simultaneousForm(n) {
  const wrap = document.createElement('div');
  const names = ['x', 'y', 'z'].slice(0, n);
  const labels = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) labels.push(`${names[c]}${subscript(r + 1)}`);
    labels.push(`=${subscript(r + 1)}`);
  }
  const { grid, inputs } = numberGrid(labels, n + 1);
  const out = document.createElement('div');
  out.className = 'panel-output';
  const go = document.createElement('button');
  go.className = 'panel-btn primary';
  go.textContent = '解く';
  go.onclick = () => {
    const nums = readNumbers(inputs);
    if (nums.some(Number.isNaN)) { out.textContent = 'Syntax ERROR'; return; }
    const rows = [];
    for (let r = 0; r < n; r++) rows.push(nums.slice(r * (n + 1), (r + 1) * (n + 1)));
    const res = solveSimultaneous(rows);
    out.textContent = res.roots.length
      ? res.roots.map((x) => `${x.name} = ${F.formatReal(x.value.re, state.display).text}`).join('\n')
      : res.note;
  };
  wrap.append(grid, go, out);
  return wrap;
}

function polyForm(deg) {
  const wrap = document.createElement('div');
  const names = deg === 2 ? ['a', 'b', 'c'] : ['a', 'b', 'c', 'd'];
  const { grid, inputs } = numberGrid(names, names.length);
  inputs[0].value = '1';
  const out = document.createElement('div');
  out.className = 'panel-output';
  const go = document.createElement('button');
  go.className = 'panel-btn primary';
  go.textContent = '解く';
  go.onclick = () => {
    const nums = readNumbers(inputs);
    if (nums.some(Number.isNaN)) { out.textContent = 'Syntax ERROR'; return; }
    const res = solvePolynomialCoeffs(nums);
    out.textContent = res.roots.map((r, i) =>
      `x${subscript(i + 1)} = ${F.formatComplex(r.value, state.display)}` +
      (r.exact ? `   (= ${stringify(r.exact)})` : '')).join('\n') + (res.note ? `\n${res.note}` : '');
  };
  wrap.append(grid, go, out);
  return wrap;
}

function openTablePanel() {
  openPanel('TABLE — 数値テーブル', (body) => {
    const form = document.createElement('div');
    form.className = 'panel-form';
    const mk = (label, value, placeholder) => {
      const row = document.createElement('label');
      row.className = 'panel-row';
      row.innerHTML = `<span class="panel-key">${label}</span>`;
      const i = document.createElement('input');
      i.type = 'text';
      i.value = value;
      if (placeholder) i.placeholder = placeholder;
      row.appendChild(i);
      form.appendChild(row);
      return i;
    };
    const fInput = mk('f(x)', state.editor.isEmpty() ? 'X^2' : currentSource());
    const gInput = mk('g(x)', '', '（任意）');
    const startInput = mk('Start', '1');
    const endInput = mk('End', '5');
    const stepInput = mk('Step', '1');
    const out = document.createElement('div');
    out.className = 'panel-output table-out';
    const go = document.createElement('button');
    go.className = 'panel-btn primary';
    go.textContent = '表を作る';
    go.onclick = () => {
      try {
        const f = makeRealFn(parse(fInput.value));
        const g = gInput.value.trim() ? makeRealFn(parse(gInput.value)) : null;
        const [a, b, st] = [startInput, endInput, stepInput]
          .map((i) => evaluate(parse(i.value), state.ctx).re);
        if (!(st > 0) || b < a) { out.textContent = 'Range ERROR'; return; }
        if ((b - a) / st > 200) { out.textContent = 'Range ERROR（行数が多すぎます）'; return; }
        const fmt = (v) => F.formatReal(v, state.display).text;
        const rows = [];
        for (let x = a; x <= b + 1e-12; x += st) {
          rows.push(`${fmt(x)}\t${fmt(f(x))}${g ? `\t${fmt(g(x))}` : ''}`);
        }
        out.textContent = `x\tf(x)${g ? '\tg(x)' : ''}\n${rows.join('\n')}`;
      } catch (e) {
        out.textContent = e instanceof CalcError ? `${e.kind}: ${e.detail}` : String(e);
      }
    };
    body.append(form, go, out);
  });
}

function openStatPanel() {
  let type = STAT_TYPES[0];
  const build = (body) => {
    body.innerHTML = '';
    const picker = document.createElement('div');
    picker.className = 'setup-options';
    for (const t of STAT_TYPES) {
      const b = document.createElement('button');
      b.className = 'setup-opt' + (t.id === type.id ? ' on' : '');
      b.innerHTML = `${t.id} ${t.label}`;
      b.title = t.name;
      b.onclick = () => { type = t; build(body); };
      picker.appendChild(b);
    }

    const info = document.createElement('p');
    info.className = 'setup-note';
    info.textContent = type.vars === 1
      ? `${type.name}：1行に1つの標本データ x を入力してください。`
      : `${type.name}：1行に「x, y」の形式で入力してください。`;

    const ta = document.createElement('textarea');
    ta.className = 'stat-input';
    ta.rows = 6;
    ta.placeholder = type.vars === 1 ? '55\n54\n51\n55' : '1, 2\n2, 4.1\n3, 5.9';
    const out = document.createElement('div');
    out.className = 'panel-output';
    const go = document.createElement('button');
    go.className = 'panel-btn primary';
    go.textContent = '計算する';
    go.onclick = () => { out.textContent = computeStats(ta.value, type); };
    body.append(picker, info, ta, go, out);
  };
  openPanel('STAT — 統計／回帰計算', build);
}

const sum = (a) => a.reduce((s2, v) => s2 + v, 0);

/** Least squares through a variable transform, as the machine's models do. */
function regress(xs, ys, model) {
  const n = xs.length;
  const fmtModel = {
    linear: 'y = A + Bx', quad: 'y = A + Bx + Cx²', ln: 'y = A + B·ln x',
    exp: 'y = A·e^(Bx)', ab: 'y = A·B^x', pow: 'y = A·x^B', inv: 'y = A + B/x',
  }[model];

  if (model === 'quad') {
    // Normal equations for a quadratic fit.
    const p = (k) => sum(xs.map((x) => Math.pow(x, k)));
    const q = (k) => sum(xs.map((x, i) => Math.pow(x, k) * ys[i]));
    const sol = solveLinearSystem(
      [[n, p(1), p(2)], [p(1), p(2), p(3)], [p(2), p(3), p(4)]],
      [sum(ys), q(1), q(2)],
    );
    if (!sol) return null;
    return { model: fmtModel, coeffs: { A: sol[0], B: sol[1], C: sol[2] } };
  }

  const tx = { ln: Math.log, pow: Math.log, inv: (v) => 1 / v }[model] || ((v) => v);
  const ty = { exp: Math.log, ab: Math.log, pow: Math.log }[model] || ((v) => v);
  const X = xs.map(tx);
  const Y = ys.map(ty);
  if (X.some((v) => !Number.isFinite(v)) || Y.some((v) => !Number.isFinite(v))) return null;

  const mx = sum(X) / n, my = sum(Y) / n;
  const sxx = sum(X.map((v) => (v - mx) ** 2));
  const sxy = sum(X.map((v, i) => (v - mx) * (Y[i] - my)));
  const syy = sum(Y.map((v) => (v - my) ** 2));
  if (sxx === 0) return null;
  const b = sxy / sxx;
  const a = my - b * mx;
  const r = sxy / Math.sqrt(sxx * syy);

  const coeffs = model === 'exp' ? { A: Math.exp(a), B: b }
    : model === 'ab' ? { A: Math.exp(a), B: Math.exp(b) }
      : model === 'pow' ? { A: Math.exp(a), B: b }
        : { A: a, B: b };
  return { model: fmtModel, coeffs, r };
}

function computeStats(text, type = STAT_TYPES[0]) {
  const xs = [], ys = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const parts = t.split(/[,\s]+/).map(Number);
    if (!Number.isFinite(parts[0])) return 'Syntax ERROR';
    xs.push(parts[0]);
    if (type.vars === 2) {
      if (!Number.isFinite(parts[1])) return 'Syntax ERROR（x, y の形式で入力してください）';
      ys.push(parts[1]);
    }
  }
  const n = xs.length;
  if (!n) return 'データがありません';

  const fmt = (v) => (Number.isFinite(v) ? F.formatReal(v, state.display).text : '—');
  const sx = sum(xs), sx2 = sum(xs.map((v) => v * v));
  const mx = sx / n;
  const popSd = Math.sqrt(Math.max(0, sx2 / n - mx * mx));
  const sampSd = n > 1 ? Math.sqrt(Math.max(0, (sx2 - n * mx * mx) / (n - 1))) : NaN;
  const lines = [
    `n = ${n}`,
    `Σx = ${fmt(sx)}`,
    `Σx² = ${fmt(sx2)}`,
    `x̄ = ${fmt(mx)}`,
    `σx = ${fmt(popSd)}   (母標準偏差)`,
    `sx = ${fmt(sampSd)}   (標本標準偏差)`,
  ];

  if (type.vars === 2) {
    const sy = sum(ys), sy2 = sum(ys.map((v) => v * v));
    const my = sy / n;
    lines.push('',
      `Σy = ${fmt(sy)}`, `Σy² = ${fmt(sy2)}`,
      `Σxy = ${fmt(sum(xs.map((v, i) => v * ys[i])))}`,
      `ȳ = ${fmt(my)}`,
      `σy = ${fmt(Math.sqrt(Math.max(0, sy2 / n - my * my)))}`);

    const fit = n > 1 ? regress(xs, ys, type.model) : null;
    if (!fit) {
      lines.push('', `${type.name}：このデータでは計算できません`);
    } else {
      lines.push('', `${type.name}   ${fit.model}`,
        `A = ${fmt(fit.coeffs.A)}`, `B = ${fmt(fit.coeffs.B)}`);
      if (fit.coeffs.C !== undefined) lines.push(`C = ${fmt(fit.coeffs.C)}`);
      if (fit.r !== undefined) lines.push(`r = ${fmt(fit.r)}   (相関係数)`);
    }
  }
  return lines.join('\n');
}

// --- Rendering --------------------------------------------------------------

function render() {
  renderExpression();
  renderResult();
  renderStatus();
}

function renderExpression() {
  const host = $('#expr');
  host.innerHTML = '';
  state.carets = [];
  const frag = renderList(state.editor.root, { cursor: state.editor.cursor, carets: state.carets });
  host.appendChild(frag);
  scaleDelimiters(host);
  // Keep the cursor in view on long expressions.
  const active = host.querySelector('.nd-caret.on');
  if (active) {
    const hostRect = host.getBoundingClientRect();
    const r = active.getBoundingClientRect();
    if (r.right > hostRect.right - 8) host.scrollLeft += r.right - hostRect.right + 24;
    else if (r.left < hostRect.left + 8) host.scrollLeft -= hostRect.left - r.left + 24;
  }
}

function renderResult() {
  const host = $('#result');
  host.innerHTML = '';
  host.className = 'result';
  const r = state.result;
  if (!r) return;

  if (r.kind === 'error') {
    host.classList.add('error');
    const box = document.createElement('div');
    box.innerHTML = `<div class="err-title">${escapeHtml(r.message)}</div>` +
      (r.detail ? `<div class="err-detail">${escapeHtml(r.detail)}</div>` : '');
    host.appendChild(box);
    return;
  }

  if (r.kind === 'value') {
    const form = r.forms[r.index];
    const line = document.createElement('div');
    line.className = 'result-main';
    line.appendChild(renderList(form.nodes, {}));
    host.appendChild(line);
    if (r.forms.length > 1) {
      const alt = document.createElement('div');
      alt.className = 'result-alt';
      alt.textContent = r.forms.map((f, i) => (i === r.index ? `[${f.label}]` : f.label)).join('  ·  ') + '   (S⇔D)';
      host.appendChild(alt);
    }
    if (r.pair) {
      const p = document.createElement('div');
      p.className = 'result-alt';
      p.textContent = r.pair;
      host.appendChild(p);
    }
    scaleDelimiters(host);
    return;
  }

  if (r.kind === 'roots') {
    const title = document.createElement('div');
    title.className = 'result-title';
    title.textContent = r.title;
    host.appendChild(title);
    for (const line of r.lines) {
      const row = document.createElement('div');
      row.className = 'result-row';
      const lab = document.createElement('span');
      lab.className = 'result-label';
      lab.textContent = `${line.label} =`;
      const val = document.createElement('span');
      val.className = 'result-value';
      val.appendChild(renderList(line.nodes, {}));
      row.append(lab, val);
      if (line.approx) {
        const ap = document.createElement('span');
        ap.className = 'result-approx';
        ap.textContent = `≈ ${line.approx}`;
        row.appendChild(ap);
      }
      host.appendChild(row);
    }
    if (r.note) {
      const note = document.createElement('div');
      note.className = 'result-alt';
      note.textContent = r.note;
      host.appendChild(note);
    }
    scaleDelimiters(host);
  }
}

function renderStatus() {
  const bits = [];
  if (state.shift) bits.push('<b class="ind shift">SHIFT</b>');
  if (state.alpha) bits.push('<b class="ind alpha">ALPHA</b>');
  bits.push(`<span class="ind">${state.mode}</span>`);
  bits.push(`<span class="ind">${{ deg: 'D', rad: 'R', gra: 'G' }[state.ctx.angle]}</span>`);
  if (state.display.mode === 'fix') bits.push(`<span class="ind">FIX${state.display.digits}</span>`);
  if (state.display.mode === 'sci') bits.push(`<span class="ind">SCI${state.display.digits}</span>`);
  if (state.mode === 'BASE') bits.push(`<span class="ind">b${state.ctx.base}</span>`);
  if (Z.abs(state.ctx.vars.M) !== 0) bits.push('<span class="ind">M</span>');
  $('#status').innerHTML = bits.join('');

  $('.key.shift')?.classList.toggle('on', state.shift);
  $('.key.alpha')?.classList.toggle('on', state.alpha);
}

// --- Boot -------------------------------------------------------------------

function init() {
  loadState();
  buildControlStrip();
  buildKeypad();

  new FlickController($('#calculator'), fireKey, (id) => keyIndex.get(id),
    (key, rect, origin) => (key.holdPicker ? createSiPicker(key, rect, origin) : null));

  // Tapping the expression area moves the cursor there.
  $('#expr').addEventListener('pointerdown', (e) => {
    const map = caretMap(state.carets);
    if (!map.length) return;
    state.editor.moveToPoint(e.clientX, e.clientY, map);
    render();
  });

  window.addEventListener('keydown', handlePhysicalKeyboard);
  window.addEventListener('resize', () => { fitLegends(); render(); });

  state.ctx.complexMode = state.mode === 'CMPLX';
  render();
  fitLegends();
  // Re-fit once layout has settled and again after web fonts land, since both
  // change the metrics the measurement depends on.
  requestAnimationFrame(fitLegends);
  if (document.fonts?.ready) document.fonts.ready.then(fitLegends);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* offline support optional */ });
  }
}

/** Convenience mapping so the app is usable on a desktop browser too. */
const KEYBOARD_MAP = {
  Enter: 'eq', '=': 'eq', Backspace: 'del', Escape: 'ac', Delete: 'ac',
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  '+': 'add', '-': 'sub', '*': 'mul', '/': 'div', '.': 'dot',
  '(': 'lparen', ')': 'rparen', '^': 'pow', '!': null,
};

function handlePhysicalKeyboard(e) {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  const k2 = e.key;
  if (/^[0-9]$/.test(k2)) { fireKey(keyIndex.get(`n${k2}`), 'center'); e.preventDefault(); return; }
  const id = KEYBOARD_MAP[k2];
  if (id && keyIndex.has(id)) { fireKey(keyIndex.get(id), 'center'); e.preventDefault(); return; }
  if (/^[A-FXYM]$/.test(k2)) { insertChar(k2); render(); e.preventDefault(); }
}

document.addEventListener('DOMContentLoaded', init);
