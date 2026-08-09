// Keypad layout for the fx-375ES A, adapted for flick input.
//
// Every key carries up to five actions:
//   tap    → the white (primary) legend
//   flick ↑ → the yellow SHIFT legend
//   flick → → the red/pink ALPHA legend
//   flick ↓ → the blue BASE-N legend, or a closely related extra
//   flick ← → a further related function (mostly the hyperbolics)
//
// The physical SHIFT and ALPHA keys are kept as a fallback: pressing SHIFT then
// a key fires that key's ↑ action, ALPHA fires its → action.

const char = (v, out) => ({ type: 'char', v, out });
const text = (v, out) => ({ type: 'text', v, out: out ?? v });
const tpl = (t, focus, extra) => ({ type: 'tpl', t, focus, extra });
const func = (name, label) => ({ type: 'fn', name, label });
const cmd = (name, arg) => ({ type: 'cmd', name, arg });
const menu = (name) => ({ type: 'menu', name });
const mode = (name) => ({ type: 'mode', name });

/** k(label, action, [tone]) — tone drives the legend colour. */
const k = (label, act, tone, short) => (act ? { label, act, tone, short } : null);

export const SHIFT_KEY = { id: 'shift', label: 'SHIFT', act: cmd('shift'), cls: 'mod shift' };
export const ALPHA_KEY = { id: 'alpha', label: 'ALPHA', act: cmd('alpha'), cls: 'mod alpha' };

export const NAV_KEYS = [
  { id: 'left', label: '◀', act: cmd('left'), cls: 'nav' },
  { id: 'up', label: '▲', act: cmd('up'), cls: 'nav' },
  { id: 'down', label: '▼', act: cmd('down'), cls: 'nav' },
  { id: 'right', label: '▶', act: cmd('right'), cls: 'nav' },
];

export const TOP_KEYS = [
  { id: 'mode', label: 'MODE', act: menu('mode'), sup: 'SETUP', supAct: menu('setup'), cls: 'sys' },
  { id: 'hist', label: 'HIST', act: menu('history'), cls: 'sys' },
  { id: 'help', label: '?', act: menu('help'), cls: 'sys' },
];

/**
 * Function block — six columns, mirroring rows B–E of the real keypad.
 */
export const FUNCTION_ROWS = [
  [
    {
      id: 'calc', cls: 'fn',
      center: k('CALC', cmd('calc')),
      up: k('SOLVE', cmd('solve'), 'shift'),
      right: k('=', char('=', '='), 'alpha'),
    },
    {
      id: 'integ', cls: 'fn',
      center: k('∫dx', tpl('integ', 'lo')),
      up: k('d/dx', tpl('deriv', 'f'), 'shift'),
      right: k(':', char(':', ':'), 'alpha'),
      down: k('∫ sym', cmd('symint'), 'extra', '∫sym'),
    },
    {
      id: 'ddx', cls: 'fn',
      center: k('d/dx', tpl('deriv', 'f')),
      up: k('d/dx sym', cmd('symdiff'), 'shift', 'sym'),
    },
    {
      id: 'sigma', cls: 'fn',
      center: k('Σ', tpl('sum', 'lo')),
      up: k('Π', tpl('prod', 'lo'), 'shift'),
    },
    {
      id: 'inv', cls: 'fn',
      center: k('x⁻¹', cmd('inverse')),
      up: k('x!', char('!', '!'), 'shift'),
    },
    {
      id: 'logab', cls: 'fn',
      center: k('log□□', tpl('logb', 'b')),
      up: k('Σ', tpl('sum', 'lo'), 'shift'),
    },
  ],
  [
    {
      id: 'frac', cls: 'fn',
      center: k('▤', tpl('frac', 'num')),
      up: k('a b/c', tpl('mixed', 'w'), 'shift'),
      right: k('÷R', cmd('divmod'), 'alpha'),
    },
    {
      id: 'sqrt', cls: 'fn',
      center: k('√□', tpl('sqrt', 'a')),
      up: k('∛□', tpl('cbrt', 'a'), 'shift'),
      right: k('ˣ√□', tpl('nroot', 'n'), 'alpha', 'ˣ√'),
    },
    {
      id: 'sq', cls: 'fn',
      center: k('x²', cmd('square')),
      up: k('x³', cmd('cube'), 'shift'),
      down: k('DEC', cmd('base', 10), 'base'),
    },
    {
      id: 'pow', cls: 'fn',
      center: k('x□', tpl('sup', 'e')),
      up: k('ˣ√□', tpl('nroot', 'n'), 'shift'),
      down: k('HEX', cmd('base', 16), 'base'),
    },
    {
      id: 'log', cls: 'fn',
      center: k('log', func('log', 'log')),
      up: k('10□', cmd('pow10'), 'shift'),
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
      id: 'neg', cls: 'fn',
      center: k('(−)', char('−', '-')),
      up: k('∠', char('∠', '∠'), 'shift'),
      right: k('A', char('A'), 'alpha'),
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
      id: 'rcl', cls: 'fn',
      center: k('RCL', menu('rcl')),
      up: k('STO', menu('sto'), 'shift'),
    },
    {
      id: 'eng', cls: 'fn',
      center: k('ENG', cmd('eng')),
      up: k('◀ENG', cmd('engBack'), 'shift'),
      right: k('ⅈ', char('ⅈ'), 'alpha'),
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
      id: 'mplus', cls: 'fn',
      center: k('M+', cmd('mplus')),
      up: k('M−', cmd('mminus'), 'shift'),
      right: k('M', char('M'), 'alpha'),
    },
  ],
];

/**
 * Numeric block — five columns, rows F–I of the real keypad.
 */
export const NUMERIC_ROWS = [
  [
    { id: 'n7', cls: 'num', center: k('7', char('7')), up: k('CONST', menu('const'), 'shift') },
    { id: 'n8', cls: 'num', center: k('8', char('8')), up: k('CONV', menu('conv'), 'shift') },
    { id: 'n9', cls: 'num', center: k('9', char('9')), up: k('CLR', menu('clr'), 'shift') },
    { id: 'del', cls: 'ctrl del', center: k('DEL', cmd('del')), up: k('INS', cmd('ins'), 'shift') },
    { id: 'ac', cls: 'ctrl ac', center: k('AC', cmd('ac')), up: k('OFF', cmd('off'), 'shift') },
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
    { id: 'n3', cls: 'num', center: k('3', char('3')), up: k('BASE', mode('BASE'), 'shift') },
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
      center: k('·', char('.', '.')),
      up: k('Ran#', text('Ran#'), 'shift'),
      right: k('RanInt', func('RanInt', 'RanInt'), 'alpha', 'RanI'),
    },
    {
      id: 'e10', cls: 'num',
      center: k('×10□', tpl('e10', 'e')),
      up: k('π', char('π'), 'shift'),
      right: k('ℯ', char('ℯ'), 'alpha'),
    },
    {
      id: 'ans', cls: 'num',
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
      { label: '°  (degrees)', act: char('°', '°') },
      { label: 'ʳ  (radians)', act: char('ʳ', 'ʳ') },
      { label: 'ᵍ  (gradians)', act: char('ᵍ', 'ᵍ') },
    ],
  },
  clr: {
    title: 'CLR',
    items: [
      { label: 'Setup', act: cmd('clrSetup') },
      { label: 'Memory', act: cmd('clrMemory') },
      { label: 'All', act: cmd('clrAll') },
    ],
  },
  mode: {
    title: 'MODE',
    items: [
      { label: '1  COMP', act: mode('COMP') },
      { label: '2  CMPLX', act: mode('CMPLX') },
      { label: '3  STAT', act: mode('STAT') },
      { label: '4  BASE-N', act: mode('BASE') },
      { label: '5  EQN', act: mode('EQN') },
      { label: '6  TABLE', act: mode('TABLE') },
    ],
  },
};

/**
 * Physical constants (SHIFT + 7). A representative subset of the 40 on the
 * real machine — CODATA 2018 values.
 */
export const CONSTANTS = [
  { id: '01', sym: 'mp', name: 'proton mass', value: 1.67262192369e-27, unit: 'kg' },
  { id: '02', sym: 'mn', name: 'neutron mass', value: 1.67492749804e-27, unit: 'kg' },
  { id: '03', sym: 'me', name: 'electron mass', value: 9.1093837015e-31, unit: 'kg' },
  { id: '05', sym: 'a₀', name: 'Bohr radius', value: 5.29177210903e-11, unit: 'm' },
  { id: '06', sym: 'h', name: 'Planck constant', value: 6.62607015e-34, unit: 'J·s' },
  { id: '07', sym: 'μN', name: 'nuclear magneton', value: 5.0507837461e-27, unit: 'J/T' },
  { id: '08', sym: 'μB', name: 'Bohr magneton', value: 9.2740100783e-24, unit: 'J/T' },
  { id: '09', sym: 'ħ', name: 'reduced Planck', value: 1.054571817e-34, unit: 'J·s' },
  { id: '10', sym: 'α', name: 'fine-structure', value: 7.2973525693e-3, unit: '' },
  { id: '12', sym: 'λc', name: 'Compton wavelength', value: 2.42631023867e-12, unit: 'm' },
  { id: '17', sym: 'e', name: 'elementary charge', value: 1.602176634e-19, unit: 'C' },
  { id: '18', sym: 'NA', name: 'Avogadro constant', value: 6.02214076e23, unit: '1/mol' },
  { id: '19', sym: 'k', name: 'Boltzmann constant', value: 1.380649e-23, unit: 'J/K' },
  { id: '20', sym: 'Vm', name: 'molar volume (ideal gas)', value: 2.2413969545e-2, unit: 'm³/mol' },
  { id: '21', sym: 'R', name: 'molar gas constant', value: 8.314462618, unit: 'J/(mol·K)' },
  { id: '22', sym: 'c₀', name: 'speed of light', value: 299792458, unit: 'm/s' },
  { id: '24', sym: 'ε₀', name: 'electric constant', value: 8.8541878128e-12, unit: 'F/m' },
  { id: '25', sym: 'μ₀', name: 'magnetic constant', value: 1.25663706212e-6, unit: 'N/A²' },
  { id: '27', sym: 'g', name: 'standard gravity', value: 9.80665, unit: 'm/s²' },
  { id: '28', sym: 'G', name: 'gravitational constant', value: 6.67430e-11, unit: 'N·m²/kg²' },
  { id: '32', sym: 'σ', name: 'Stefan–Boltzmann', value: 5.670374419e-8, unit: 'W/(m²·K⁴)' },
  { id: '35', sym: 'atm', name: 'standard atmosphere', value: 101325, unit: 'Pa' },
  { id: '39', sym: 'F', name: 'Faraday constant', value: 96485.33212, unit: 'C/mol' },
  { id: '40', sym: 'R∞', name: 'Rydberg constant', value: 10973731.568160, unit: '1/m' },
];

/** Unit conversions (SHIFT + 8). A representative subset of the 40 pairs. */
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
  { id: '13', from: 'oz', to: 'g', factor: 28.349523125 },
  { id: '14', from: 'g', to: 'oz', factor: 1 / 28.349523125 },
  { id: '15', from: 'lb', to: 'kg', factor: 0.45359237 },
  { id: '16', from: 'kg', to: 'lb', factor: 1 / 0.45359237 },
  { id: '19', from: 'gal (US)', to: 'ℓ', factor: 3.785411784 },
  { id: '20', from: 'ℓ', to: 'gal (US)', factor: 1 / 3.785411784 },
  { id: '25', from: 'km/h', to: 'm/s', factor: 1 / 3.6 },
  { id: '26', from: 'm/s', to: 'km/h', factor: 3.6 },
  { id: '31', from: 'kgf', to: 'N', factor: 9.80665 },
  { id: '32', from: 'N', to: 'kgf', factor: 1 / 9.80665 },
  { id: '35', from: 'atm', to: 'Pa', factor: 101325 },
  { id: '36', from: 'Pa', to: 'atm', factor: 1 / 101325 },
  { id: '37', from: 'cal', to: 'J', factor: 4.1868 },
  { id: '38', from: 'J', to: 'cal', factor: 1 / 4.1868 },
  { id: '39', from: 'hp', to: 'kW', factor: 0.745699872 },
  { id: '40', from: 'kW', to: 'hp', factor: 1 / 0.745699872 },
];

export const DIRECTIONS = ['center', 'up', 'right', 'down', 'left'];
