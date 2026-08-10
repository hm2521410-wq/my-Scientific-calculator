// Keypad layout for the fx-375ES A, adapted for flick input.
//
// Every key carries up to five actions:
//   tap    → the white (primary) legend
//   flick ↑ → the yellow SHIFT legend
//   flick → → the red/pink ALPHA legend
//   flick ↓ → the blue BASE-N legend, or a closely related extra
//   flick ← → a further related function
// Some keys additionally define a long-press action (held still ~0.5 s).
//
// The physical SHIFT and ALPHA keys are kept as a fallback: pressing SHIFT then
// a key fires that key's ↑ action, ALPHA fires its → action.
//
// Positions follow the real keypad. Five rarely-used keys (CALC, RCL, ENG, M+,
// (−)) are merged onto one key at the (−) position; the cells they vacate now
// hold SOLVE, a variable/memory key, an SI-prefix key and ⅈ.

const char = (v, out) => ({ type: 'char', v, out });
const text = (v, out) => ({ type: 'text', v, out: out ?? v });
const tpl = (t, focus, extra) => ({ type: 'tpl', t, focus, extra });
const func = (name, label) => ({ type: 'fn', name, label });
const cmd = (name, arg) => ({ type: 'cmd', name, arg });
const menu = (name) => ({ type: 'menu', name });
const mode = (name) => ({ type: 'mode', name });

/**
 * k(label, action, [tone], [short], [html])
 *   label — text shown in the flick popup
 *   short — compact text for the on-key hint when `label` would overflow
 *   html  — rich markup for the main legend (sub/superscripts, boxes)
 */
const k = (label, act, tone, short, html) => (act ? { label, act, tone, short, html } : null);

// Legend fragments, so key faces read like the printed ones.
const BOX = '<i class="bx"></i>';
const SUP = (s) => `<sup>${s}</sup>`;
const ICON_FRAC = '<span class="ico-frac"><i></i><i></i></span>';

export const SHIFT_KEY = { id: 'shift', label: 'SHIFT', act: cmd('shift'), cls: 'mod shift' };
export const ALPHA_KEY = { id: 'alpha', label: 'ALPHA', act: cmd('alpha'), cls: 'mod alpha' };

export const NAV_KEYS = [
  { id: 'up', label: '▲', act: cmd('up'), cls: 'nav' },
  { id: 'left', label: '◀', act: cmd('left'), cls: 'nav' },
  { id: 'right', label: '▶', act: cmd('right'), cls: 'nav' },
  { id: 'down', label: '▼', act: cmd('down'), cls: 'nav' },
];

/** Keys in the top strip, around the replay cross. */
export const TOP_KEYS = [
  {
    id: 'mode', label: 'MODE', cls: 'sys',
    center: k('MODE', menu('mode')),
    up: k('SETUP', menu('setup'), 'shift'),
  },
  {
    id: 'ac', label: 'AC', cls: 'ctrl ac tall',
    center: k('AC', cmd('ac')),
    up: k('OFF', cmd('off'), 'shift'),
  },
  { id: 'hist', label: 'HIST', cls: 'sys', center: k('HIST', menu('history')) },
  { id: 'help', label: '?', cls: 'sys', center: k('?', menu('help')) },
];

/**
 * Function block — six columns, mirroring rows B–E of the real keypad.
 */
export const FUNCTION_ROWS = [
  [
    {
      id: 'solve', cls: 'fn',
      center: k('SOLVE', cmd('solve')),
      up: k('CALC', cmd('calc'), 'shift'),
      right: k('=', char('=', '='), 'alpha'),
      down: k('÷R', cmd('divmod'), 'extra'),
    },
    {
      id: 'integ', cls: 'fn',
      center: k('∫dx', tpl('integ', 'lo'), null, null, `∫${BOX}dx`),
      up: k('d/dx', tpl('deriv', 'f'), 'shift'),
      right: k(':', char(':', ':'), 'alpha'),
      down: k('∫ 記号積分', cmd('symint'), 'extra', '∫sym'),
    },
    {
      id: 'ddx', cls: 'fn',
      center: k('d/dx', tpl('deriv', 'f'), null, null, '<span class="ico-ddx"><i>d</i><i>dx</i></span>'),
      up: k('d/dx 記号微分', cmd('symdiff'), 'shift', 'sym'),
    },
    {
      id: 'sigma', cls: 'fn',
      center: k('Σ', tpl('sum', 'lo')),
      up: k('Π', tpl('prod', 'lo'), 'shift'),
    },
    {
      id: 'inv', cls: 'fn',
      center: k('x⁻¹', cmd('inverse'), null, null, `x${SUP('−1')}`),
      up: k('x!', char('!', '!'), 'shift'),
    },
    {
      id: 'logab', cls: 'fn',
      center: k('log□□', tpl('logb', 'b'), null, null, `log<sub class="bx-s"></sub>${BOX}`),
      up: k('Σ', tpl('sum', 'lo'), 'shift'),
    },
  ],
  [
    {
      id: 'frac', cls: 'fn',
      center: k('▤', tpl('frac', 'num'), null, null, ICON_FRAC),
      up: k('a b/c', tpl('mixed', 'w'), 'shift'),
      right: k('÷R', cmd('divmod'), 'alpha'),
    },
    {
      id: 'sqrt', cls: 'fn',
      center: k('√□', tpl('sqrt', 'a'), null, null, `<span class="ico-root">√<i class="bx"></i></span>`),
      up: k('∛□', tpl('cbrt', 'a'), 'shift', '∛'),
      right: k('ˣ√□', tpl('nroot', 'n'), 'alpha', 'ˣ√'),
    },
    {
      id: 'sq', cls: 'fn',
      center: k('x²', cmd('square'), null, null, `x${SUP('2')}`),
      up: k('x³', cmd('cube'), 'shift'),
      down: k('DEC', cmd('base', 10), 'base'),
    },
    {
      id: 'pow', cls: 'fn',
      center: k('x□', tpl('sup', 'e'), null, null, `x<sup class="bx-s"></sup>`),
      up: k('ˣ√□', tpl('nroot', 'n'), 'shift', 'ˣ√'),
      down: k('HEX', cmd('base', 16), 'base'),
    },
    {
      id: 'log', cls: 'fn',
      center: k('log', func('log', 'log')),
      up: k('10□', cmd('pow10'), 'shift', '10□'),
      down: k('BIN', cmd('base', 2), 'base'),
    },
    {
      id: 'ln', cls: 'fn',
      center: k('ln', func('ln', 'ln')),
      up: k('ℯ□', cmd('powe'), 'shift'),
      down: k('OCT', cmd('base', 8), 'base'),
    },
  ],
  [
    {
      // The five low-frequency keys, merged as requested.
      id: 'multi', cls: 'fn multi',
      center: k('(−)', char('−', '-')),
      up: k('CALC', cmd('calc'), 'shift'),
      right: k('A', char('A'), 'alpha'),
      down: k('ENG', cmd('eng'), 'extra'),
      left: k('M+', cmd('mplus'), 'extra'),
      longPress: menu('multi'),
    },
    {
      id: 'dms', cls: 'fn',
      center: k('°′″', tpl('dms', 'd')),
      up: k('◀DMS', cmd('todms'), 'shift'),
      right: k('B', char('B'), 'alpha'),
    },
    {
      id: 'hyp', cls: 'fn',
      center: k('hyp', menu('hyp')),
      up: k('Abs', tpl('abs', 'a'), 'shift'),
      right: k('C', char('C'), 'alpha'),
    },
    {
      id: 'sin', cls: 'fn',
      center: k('sin', func('sin', 'sin')),
      up: k('sin⁻¹', func('asin', 'sin⁻¹'), 'shift'),
      right: k('D', char('D'), 'alpha'),
      down: k('sinh', func('sinh', 'sinh'), 'extra'),
      left: k('sinh⁻¹', func('asinh', 'sinh⁻¹'), 'extra', '⁻¹'),
    },
    {
      id: 'cos', cls: 'fn',
      center: k('cos', func('cos', 'cos')),
      up: k('cos⁻¹', func('acos', 'cos⁻¹'), 'shift'),
      right: k('E', char('E'), 'alpha'),
      down: k('cosh', func('cosh', 'cosh'), 'extra'),
      left: k('cosh⁻¹', func('acosh', 'cosh⁻¹'), 'extra', '⁻¹'),
    },
    {
      id: 'tan', cls: 'fn',
      center: k('tan', func('tan', 'tan')),
      up: k('tan⁻¹', func('atan', 'tan⁻¹'), 'shift'),
      right: k('F', char('F'), 'alpha'),
      down: k('tanh', func('tanh', 'tanh'), 'extra'),
      left: k('tanh⁻¹', func('atanh', 'tanh⁻¹'), 'extra', '⁻¹'),
    },
  ],
  [
    {
      id: 'var', cls: 'fn',
      center: k('VAR', menu('vars')),
      up: k('STO', menu('sto'), 'shift'),
      right: k('M', char('M'), 'alpha'),
      down: k('RCL', menu('rcl'), 'extra'),
    },
    {
      id: 'si', cls: 'fn',
      // Unlike every other key this one is vertical-only: touching it opens a
      // ladder of prefixes reaching up (k, M, G, …) and down (m, µ, n, …).
      // It only ever restates the answer; the expression is never touched.
      center: k('接頭辞', menu('si'), null, null, 'SI'),
      up: k('k  キロ', cmd('si', 3), 'shift', 'k M G'),
      down: k('m  ミリ', cmd('si', -3), 'extra', 'm µ n'),
      instantPicker: true,
    },
    {
      id: 'lparen', cls: 'fn',
      center: k('(', tpl('paren', 'a')),
      up: k('%', char('%', '%'), 'shift'),
    },
    {
      id: 'rparen', cls: 'fn',
      center: k(')', cmd('closeParen')),
      up: k(',', char(',', ','), 'shift'),
      right: k('X', char('X'), 'alpha'),
    },
    {
      id: 'sd', cls: 'fn',
      center: k('S⇔D', cmd('sd')),
      up: k('a b/c⇔d/c', cmd('mixedToggle'), 'shift', 'ab/c⇔d/c'),
      right: k('Y', char('Y'), 'alpha'),
    },
    {
      id: 'imag', cls: 'fn',
      center: k('ⅈ', char('ⅈ')),
      up: k('∠', char('∠', '∠'), 'shift'),
      right: k('Conjg', func('conjg', 'Conjg'), 'alpha', 'Cnj'),
      down: k('arg', func('arg', 'arg'), 'extra'),
      left: k('Abs', tpl('abs', 'a'), 'extra'),
    },
  ],
];

/**
 * Numeric block — five columns, rows F–I of the real keypad.
 * AC has moved to the top strip so it can no longer be hit instead of DEL.
 */
export const NUMERIC_ROWS = [
  [
    { id: 'n7', cls: 'num', center: k('7', char('7')), up: k('CONST', menu('const'), 'shift') },
    { id: 'n8', cls: 'num', center: k('8', char('8')), up: k('CONV', menu('conv'), 'shift') },
    { id: 'n9', cls: 'num', center: k('9', char('9')), up: k('CLR', menu('clr'), 'shift') },
    {
      id: 'del', cls: 'ctrl del span2', span: 2,
      center: k('DEL', cmd('del')),
      up: k('INS', cmd('ins'), 'shift'),
    },
  ],
  [
    { id: 'n4', cls: 'num', center: k('4', char('4')) },
    { id: 'n5', cls: 'num', center: k('5', char('5')) },
    { id: 'n6', cls: 'num', center: k('6', char('6')) },
    {
      id: 'mul', cls: 'op',
      center: k('×', char('×', '*')),
      up: k('nPr', text('nPr'), 'shift'),
      right: k('GCD', func('GCD', 'GCD'), 'alpha'),
    },
    {
      id: 'div', cls: 'op',
      center: k('÷', char('÷', '/')),
      up: k('nCr', text('nCr'), 'shift'),
      right: k('LCM', func('LCM', 'LCM'), 'alpha'),
    },
  ],
  [
    { id: 'n1', cls: 'num', center: k('1', char('1')), up: k('STAT', mode('STAT'), 'shift') },
    { id: 'n2', cls: 'num', center: k('2', char('2')), up: k('CMPLX', mode('CMPLX'), 'shift') },
    { id: 'n3', cls: 'num', center: k('3', char('3')), up: k('BASE-N', mode('BASE'), 'shift', 'BASE') },
    {
      id: 'add', cls: 'op',
      center: k('+', char('+')),
      up: k('Pol', func('Pol', 'Pol'), 'shift'),
    },
    {
      id: 'sub', cls: 'op',
      center: k('−', char('−', '-')),
      up: k('Rec', func('Rec', 'Rec'), 'shift'),
    },
  ],
  [
    { id: 'n0', cls: 'num', center: k('0', char('0')), up: k('Rnd', func('Rnd', 'Rnd'), 'shift') },
    {
      id: 'dot', cls: 'num',
      center: k('·', char('.', '.'), null, null, '<span class="ico-dot"></span>'),
      up: k('Ran#', text('Ran#'), 'shift'),
      right: k('RanInt', func('RanInt', 'RanInt'), 'alpha', 'RanI'),
    },
    {
      id: 'e10', cls: 'num wide',
      center: k('×10□', tpl('e10', 'e'), null, null, `×10<sup class="bx-s"></sup>`),
      up: k('π', char('π'), 'shift'),
      right: k('ℯ', char('ℯ'), 'alpha'),
    },
    {
      id: 'ans', cls: 'num wide',
      center: k('Ans', text('Ans')),
      up: k('DRG▶', menu('drg'), 'shift'),
      right: k('PreAns', text('PreAns'), 'alpha', 'Pre'),
    },
    { id: 'eq', cls: 'ctrl equals', center: k('=', cmd('equals')) },
  ],
];

export const ALL_KEYS = [...FUNCTION_ROWS.flat(), ...NUMERIC_ROWS.flat()];

/** Submenus opened by keys that hold a list of choices. */
export const MENUS = {
  hyp: {
    title: 'hyp',
    items: [
      { label: 'sinh', act: func('sinh', 'sinh') },
      { label: 'cosh', act: func('cosh', 'cosh') },
      { label: 'tanh', act: func('tanh', 'tanh') },
      { label: 'sinh⁻¹', act: func('asinh', 'sinh⁻¹') },
      { label: 'cosh⁻¹', act: func('acosh', 'cosh⁻¹') },
      { label: 'tanh⁻¹', act: func('atanh', 'tanh⁻¹') },
    ],
  },
  drg: {
    title: 'DRG▶',
    items: [
      { label: '°  (度)', act: char('°', '°') },
      { label: 'ʳ  (ラジアン)', act: char('ʳ', 'ʳ') },
      { label: 'ᵍ  (グラード)', act: char('ᵍ', 'ᵍ') },
    ],
  },
  clr: {
    title: 'CLR',
    items: [
      { label: '1  Setup（設定を初期化）', act: cmd('clrSetup') },
      { label: '2  Memory（メモリーを消去）', act: cmd('clrMemory') },
      { label: '3  All（すべて初期化）', act: cmd('clrAll') },
    ],
  },
  mode: {
    title: 'MODE — 計算モード',
    items: [
      { label: '1  COMP（標準計算）', act: mode('COMP') },
      { label: '2  CMPLX（複素数計算）', act: mode('CMPLX') },
      { label: '3  STAT（統計／回帰計算）', act: mode('STAT') },
      { label: '4  BASE-N（n進計算）', act: mode('BASE') },
      { label: '5  EQN（方程式計算）', act: mode('EQN') },
      { label: '6  TABLE（テーブル計算）', act: mode('TABLE') },
    ],
  },
  /** The merged low-frequency key's long-press menu. */
  multi: {
    title: 'その他の機能',
    items: [
      { label: 'CALC（式に値を代入して計算）', act: cmd('calc') },
      { label: 'SOLVE（方程式を解く）', act: cmd('solve') },
      { label: 'RCL（変数を呼び出す）', act: menu('rcl') },
      { label: 'STO（変数に保存）', act: menu('sto') },
      { label: 'M+（独立メモリーに加算）', act: cmd('mplus') },
      { label: 'M−（独立メモリーから減算）', act: cmd('mminus') },
      { label: 'ENG（工学表記へ ▶）', act: cmd('eng') },
      { label: '◀ENG（工学表記へ ◀）', act: cmd('engBack') },
      { label: '÷R（商と余り）', act: cmd('divmod') },
      { label: '∠（複素数の偏角記号）', act: char('∠', '∠') },
    ],
  },
};

/**
 * SI prefixes. Selecting one either inserts ×10ⁿ into the expression or
 * rescales the displayed result (kPa, MPa, mV, µF …).
 */
export const SI_PREFIXES = [
  { sym: 'Y', name: 'ヨタ', exp: 24 },
  { sym: 'Z', name: 'ゼタ', exp: 21 },
  { sym: 'E', name: 'エクサ', exp: 18 },
  { sym: 'P', name: 'ペタ', exp: 15 },
  { sym: 'T', name: 'テラ', exp: 12 },
  { sym: 'G', name: 'ギガ', exp: 9 },
  { sym: 'M', name: 'メガ', exp: 6 },
  { sym: 'k', name: 'キロ', exp: 3 },
  { sym: '—', name: 'なし', exp: 0 },
  { sym: 'm', name: 'ミリ', exp: -3 },
  { sym: 'µ', name: 'マイクロ', exp: -6 },
  { sym: 'n', name: 'ナノ', exp: -9 },
  { sym: 'p', name: 'ピコ', exp: -12 },
  { sym: 'f', name: 'フェムト', exp: -15 },
  { sym: 'a', name: 'アト', exp: -18 },
  { sym: 'z', name: 'ゼプト', exp: -21 },
  { sym: 'y', name: 'ヨクト', exp: -24 },
];

/**
 * The 40 scientific constants of the fx-375ES A (CODATA 2014, per the manual's
 * reference sheet).
 */
export const CONSTANTS = [
  { id: '01', sym: 'mp', name: '陽子の静止質量', value: 1.672621898e-27, unit: 'kg' },
  { id: '02', sym: 'mn', name: '中性子の静止質量', value: 1.674927471e-27, unit: 'kg' },
  { id: '03', sym: 'me', name: '電子の静止質量', value: 9.10938356e-31, unit: 'kg' },
  { id: '04', sym: 'mμ', name: 'μ粒子の静止質量', value: 1.883531594e-28, unit: 'kg' },
  { id: '05', sym: 'a₀', name: 'ボーア半径', value: 5.2917721067e-11, unit: 'm' },
  { id: '06', sym: 'h', name: 'プランク定数', value: 6.626070040e-34, unit: 'J s' },
  { id: '07', sym: 'μN', name: '核磁気', value: 5.050783699e-27, unit: 'J T⁻¹' },
  { id: '08', sym: 'μB', name: 'ボーア磁子', value: 9.274009994e-24, unit: 'J T⁻¹' },
  { id: '09', sym: 'ħ', name: '換算プランク定数', value: 1.054571800e-34, unit: 'J s' },
  { id: '10', sym: 'α', name: '微細構造定数', value: 7.2973525664e-3, unit: '' },
  { id: '11', sym: 'rₑ', name: '電子の半径', value: 2.8179403227e-15, unit: 'm' },
  { id: '12', sym: 'λc', name: '電子のコンプトン波長', value: 2.4263102367e-12, unit: 'm' },
  { id: '13', sym: 'γp', name: '陽子の磁気回転比', value: 2.675221900e8, unit: 's⁻¹ T⁻¹' },
  { id: '14', sym: 'λcp', name: '陽子のコンプトン波長', value: 1.32140985396e-15, unit: 'm' },
  { id: '15', sym: 'λcn', name: '中性子のコンプトン波長', value: 1.31959090481e-15, unit: 'm' },
  { id: '16', sym: 'R∞', name: 'リュードベリー定数', value: 1.0973731568508e7, unit: 'm⁻¹' },
  { id: '17', sym: 'u', name: '原子質量単位', value: 1.660539040e-27, unit: 'kg' },
  { id: '18', sym: 'μp', name: '陽子の磁気モーメント', value: 1.4106067873e-26, unit: 'J T⁻¹' },
  { id: '19', sym: 'μe', name: '電子の磁気モーメント', value: -9.284764620e-24, unit: 'J T⁻¹' },
  { id: '20', sym: 'μn', name: '中性子の磁気モーメント', value: -9.6623650e-27, unit: 'J T⁻¹' },
  { id: '21', sym: 'μμ', name: 'μ粒子の磁気モーメント', value: -4.49044826e-26, unit: 'J T⁻¹' },
  { id: '22', sym: 'F', name: 'ファラデー定数', value: 96485.33289, unit: 'C mol⁻¹' },
  { id: '23', sym: 'e', name: '電気素量', value: 1.6021766208e-19, unit: 'C' },
  { id: '24', sym: 'NA', name: 'アボガドロ定数', value: 6.022140857e23, unit: 'mol⁻¹' },
  { id: '25', sym: 'k', name: 'ボルツマン定数', value: 1.38064852e-23, unit: 'J K⁻¹' },
  { id: '26', sym: 'Vm', name: '理想気体の標準体積', value: 2.2710947e-2, unit: 'm³ mol⁻¹' },
  { id: '27', sym: 'R', name: 'モル気体定数', value: 8.3144598, unit: 'J mol⁻¹ K⁻¹' },
  { id: '28', sym: 'C₀', name: '真空中の光速度', value: 299792458, unit: 'm s⁻¹' },
  { id: '29', sym: 'C₁', name: '放射第一定数', value: 3.741771790e-16, unit: 'W m²' },
  { id: '30', sym: 'C₂', name: '放射第二定数', value: 1.43877736e-2, unit: 'm K' },
  { id: '31', sym: 'σ', name: 'ステファン-ボルツマン定数', value: 5.670367e-8, unit: 'W m⁻² K⁻⁴' },
  { id: '32', sym: 'ε₀', name: '真空の誘電率', value: 8.854187817e-12, unit: 'F m⁻¹' },
  { id: '33', sym: 'μ₀', name: '真空の透磁率', value: 1.256637061e-6, unit: 'N A⁻²' },
  { id: '34', sym: 'φ₀', name: '磁束量子', value: 2.067833831e-15, unit: 'Wb' },
  { id: '35', sym: 'g', name: '重力加速度', value: 9.80665, unit: 'm s⁻²' },
  { id: '36', sym: 'G₀', name: 'コンダクタンス量子', value: 7.7480917310e-5, unit: 'S' },
  { id: '37', sym: 'Z₀', name: '真空の特性インピーダンス', value: 376.730313461, unit: 'Ω' },
  { id: '38', sym: 't', name: 'セルシウス温度', value: 273.15, unit: 'K' },
  { id: '39', sym: 'G', name: '万有引力定数', value: 6.67408e-11, unit: 'm³ kg⁻¹ s⁻²' },
  { id: '40', sym: 'atm', name: '標準大気圧', value: 101325, unit: 'Pa' },
];

/**
 * Unit conversion commands No.01–40, the range the CONV key reaches on the
 * real machine. °F ⇄ °C are affine, so they carry a function instead.
 */
export const CONVERSIONS = [
  { id: '01', from: 'in', to: 'cm', factor: 2.54 },
  { id: '02', from: 'cm', to: 'in', factor: 1 / 2.54 },
  { id: '03', from: 'ft', to: 'm', factor: 0.3048 },
  { id: '04', from: 'm', to: 'ft', factor: 1 / 0.3048 },
  { id: '05', from: 'yd', to: 'm', factor: 0.9144 },
  { id: '06', from: 'm', to: 'yd', factor: 1 / 0.9144 },
  { id: '07', from: 'mile', to: 'km', factor: 1.609344 },
  { id: '08', from: 'km', to: 'mile', factor: 1 / 1.609344 },
  { id: '09', from: 'n mile', to: 'm', factor: 1852 },
  { id: '10', from: 'm', to: 'n mile', factor: 1 / 1852 },
  { id: '11', from: 'acre', to: 'm²', factor: 4046.8564224 },
  { id: '12', from: 'm²', to: 'acre', factor: 1 / 4046.8564224 },
  { id: '13', from: 'gal(US)', to: 'ℓ', factor: 3.785411784 },
  { id: '14', from: 'ℓ', to: 'gal(US)', factor: 1 / 3.785411784 },
  { id: '15', from: 'gal(UK)', to: 'ℓ', factor: 4.54609 },
  { id: '16', from: 'ℓ', to: 'gal(UK)', factor: 1 / 4.54609 },
  { id: '17', from: 'pc', to: 'km', factor: 3.085677581e13 },
  { id: '18', from: 'km', to: 'pc', factor: 1 / 3.085677581e13 },
  { id: '19', from: 'km/h', to: 'm/s', factor: 1 / 3.6 },
  { id: '20', from: 'm/s', to: 'km/h', factor: 3.6 },
  { id: '21', from: 'oz', to: 'g', factor: 28.349523125 },
  { id: '22', from: 'g', to: 'oz', factor: 1 / 28.349523125 },
  { id: '23', from: 'lb', to: 'kg', factor: 0.45359237 },
  { id: '24', from: 'kg', to: 'lb', factor: 1 / 0.45359237 },
  { id: '25', from: 'atm', to: 'Pa', factor: 101325 },
  { id: '26', from: 'Pa', to: 'atm', factor: 1 / 101325 },
  { id: '27', from: 'mmHg', to: 'Pa', factor: 133.322368421 },
  { id: '28', from: 'Pa', to: 'mmHg', factor: 1 / 133.322368421 },
  { id: '29', from: 'hp', to: 'kW', factor: 0.7456998716, note: '(UK)' },
  { id: '30', from: 'kW', to: 'hp', factor: 1 / 0.7456998716, note: '(UK)' },
  { id: '31', from: 'kgf/cm²', to: 'Pa', factor: 98066.5 },
  { id: '32', from: 'Pa', to: 'kgf/cm²', factor: 1 / 98066.5 },
  { id: '33', from: 'kgf·m', to: 'J', factor: 9.80665 },
  { id: '34', from: 'J', to: 'kgf·m', factor: 1 / 9.80665 },
  { id: '35', from: 'lbf/in²', to: 'kPa', factor: 6.894757293 },
  { id: '36', from: 'kPa', to: 'lbf/in²', factor: 1 / 6.894757293 },
  { id: '37', from: '°F', to: '°C', convert: (v) => ((v - 32) * 5) / 9 },
  { id: '38', from: '°C', to: '°F', convert: (v) => (v * 9) / 5 + 32 },
  { id: '39', from: 'J', to: 'cal', factor: 1 / 4.1855, note: '15 °C' },
  { id: '40', from: 'cal', to: 'J', factor: 4.1855, note: '15 °C' },
];

/** STAT calculation types, matching the machine's type-selection screen. */
export const STAT_TYPES = [
  { id: 1, label: '1-VAR', name: '一変数統計', vars: 1 },
  { id: 2, label: 'A+BX', name: '一次回帰', vars: 2, model: 'linear' },
  { id: 3, label: '_+CX²', name: '二次回帰', vars: 2, model: 'quad' },
  { id: 4, label: 'ln X', name: '対数回帰', vars: 2, model: 'ln' },
  { id: 5, label: 'e^X', name: 'e指数回帰', vars: 2, model: 'exp' },
  { id: 6, label: 'A·B^X', name: 'ab指数回帰', vars: 2, model: 'ab' },
  { id: 7, label: 'A·X^B', name: 'べき乗回帰', vars: 2, model: 'pow' },
  { id: 8, label: '1/X', name: '逆数回帰', vars: 2, model: 'inv' },
];

/** EQN equation types, matching the machine's type-selection screen. */
export const EQN_TYPES = [
  { id: 1, label: 'aₙX + bₙY = cₙ', name: '2元連立1次方程式', kind: 'sim', n: 2 },
  { id: 2, label: 'aₙX + bₙY + cₙZ = dₙ', name: '3元連立1次方程式', kind: 'sim', n: 3 },
  { id: 3, label: 'aX² + bX + c = 0', name: '2次方程式', kind: 'poly', deg: 2 },
  { id: 4, label: 'aX³ + bX² + cX + d = 0', name: '3次方程式', kind: 'poly', deg: 3 },
];

export const DIRECTIONS = ['center', 'up', 'right', 'down', 'left'];
