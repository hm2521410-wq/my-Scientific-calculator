// In-app help: searchable topics plus a generated reference for every key.
//
// The key reference is built from the same tables that build the keypad, so it
// cannot drift out of step with what the keys actually do. Each action gets a
// plain-language description from ACTION_DOCS below.

import { FUNCTION_ROWS, NUMERIC_ROWS, TOP_KEYS, SHIFT_KEY, ALPHA_KEY, NAV_KEYS } from './keys.js';

/** A stable name for an action, used to look its description up. */
function actionKey(act) {
  if (!act) return '';
  switch (act.type) {
    case 'cmd': return `cmd:${act.name}${act.arg !== undefined ? `:${act.arg}` : ''}`;
    case 'fn': return `fn:${act.name}`;
    case 'tpl': return `tpl:${act.t}`;
    case 'menu': return `menu:${act.name}`;
    case 'mode': return `mode:${act.name}`;
    case 'char': return `char:${act.v}`;
    case 'text': return `text:${act.v}`;
    default: return act.type;
  }
}

const ACTION_DOCS = {
  // --- calculation ---
  'cmd:equals': '計算を実行します。式に「=」が入っているときは方程式として解きます。',
  'cmd:solve': '方程式を解きます。式に「=」を入れて押すと、その解を求めます。1次・2次は √ や複素数のままの厳密解、それ以外は実数解を数値的に探します。',
  'cmd:calc': '式に変数（A〜F, X, Y, M）を入れておき、後から値を代入して計算します。値を変えて何度も試せます。',
  'cmd:divmod': '割り算の「商」と「余り」を同時に出します。例：17÷5 → 商 3、余り 2。',
  'cmd:ac': 'すべて消去します。式も答えも消えます。',
  'cmd:del': 'カーソルの左を 1 つ消します。押しっぱなしで連続削除。',
  'cmd:ins': '挿入モードと上書きモードを切り替えます。',
  'cmd:off': '画面を消去します（電源オフ相当）。',
  'cmd:left': 'カーソルを左へ。押しっぱなしで連続移動。',
  'cmd:right': 'カーソルを右へ。',
  'cmd:up': '分数の分母から分子へ、∫ や Σ の下端から上端へ移動します。移動先が無いときは 1 つ前の計算履歴を呼び出します。',
  'cmd:down': '分子から分母へ、上端から下端へ移動します。移動先が無いときは次の計算履歴を呼び出します。',
  'cmd:shift': '押した次のキーで、黄色（上フリック）の機能を入力します。フリックを使うなら不要です。',
  'cmd:alpha': '押した次のキーで、赤色（右フリック）の機能を入力します。フリックを使うなら不要です。',
  'cmd:square': '直前の値を 2 乗します。',
  'cmd:cube': '直前の値を 3 乗します。',
  'cmd:inverse': '逆数（−1 乗）にします。',
  'cmd:pow10': '10 の累乗を入力します。',
  'cmd:powe': '自然対数の底 ℯ の累乗を入力します。',
  'cmd:closeParen': '開いているカッコを閉じて、カッコの外へ出ます。',
  'cmd:sd': '答えの表示を切り替えます。分数・√・π のままの厳密表示 ⇔ 小数表示。複素数のときは a+bⅈ ⇔ r∠θ。',
  'cmd:mixedToggle': '帯分数（1 2/3）と仮分数（5/3）を切り替えます。',
  'cmd:eng': '答えを工学表記にします。1234 → 1.234×10³ のように、指数が 3 の倍数になります。',
  'cmd:engBack': '工学表記を逆方向へ戻します。',
  'cmd:todms': '答えを度・分・秒の表示に変換します。1.5 → 1°30′0″。',
  'cmd:mplus': '独立メモリー M に、いまの答えを足し込みます。合計を出しながら計算するときに使います。',
  'cmd:mminus': '独立メモリー M から、いまの答えを引きます。',
  'cmd:symint': 'いま入力している式の原始関数（不定積分）を数式のまま返します。∫ に上端下端を入れてあれば定積分の値も出ます。閉じた式が無いときは数値積分に切り替わります。',
  'cmd:symdiff': 'いま入力している式の導関数を数式のまま返します。',
  'cmd:si:3': '答えの表示を「キロ」にします（1000 → 1 k）。',
  'cmd:si:-3': '答えの表示を「ミリ」にします。',
  'cmd:base:2': 'BASE-N モード中に、2 進数へ切り替えます。',
  'cmd:base:8': 'BASE-N モード中に、8 進数へ切り替えます。',
  'cmd:base:10': 'BASE-N モード中に、10 進数へ切り替えます。',
  'cmd:base:16': 'BASE-N モード中に、16 進数へ切り替えます。',
  'cmd:clrSetup': '設定を初期状態に戻します。',
  'cmd:clrMemory': '変数と独立メモリーをすべて消します。',
  'cmd:clrAll': '設定・メモリー・履歴をすべて初期化します。',

  // --- templates ---
  'tpl:frac': '分数を入力します。分子を入れて ▼ で分母へ、▶ で分数の外に出ます。',
  'tpl:mixed': '帯分数（整数部＋分数）を入力します。',
  'tpl:sqrt': '平方根 √ を入力します。',
  'tpl:cbrt': '立方根 ∛ を入力します。',
  'tpl:nroot': 'n 乗根を入力します。先に n（根指数）、▶ で中身へ。',
  'tpl:sup': '累乗（指数）を入力します。',
  'tpl:logb': '底を指定した対数 logₐb を入力します。',
  'tpl:abs': '絶対値 |x| を入力します。',
  'tpl:paren': 'カッコを開きます。閉じカッコは ) キーで、カッコの外に出ます。',
  'tpl:e10': '×10ⁿ（指数入力）です。2 ×10ˣ 3 で 2000。',
  'tpl:dms': '度・分・秒を入力します。',
  'tpl:integ': '定積分を数値計算します。下端 → ▶ → 上端 → ▶ → 被積分関数の順に入力します。変数は X です。',
  'tpl:deriv': '微分係数を数値計算します。関数 → ▶ → 微分する点、の順です。変数は X です。',
  'tpl:sum': '総和 Σ です。下端 → ▶ → 上端 → ▶ → 式。変数は X です。',
  'tpl:prod': '総乗 Π です。入力は Σ と同じです。',
  'tpl:fn': '関数を入力します。',

  // --- functions ---
  'fn:sin': '正弦。角度の単位は画面上部の D（度）/ R（ラジアン）/ G（グラード）に従います。',
  'fn:cos': '余弦。',
  'fn:tan': '正接。',
  'fn:asin': '逆正弦 sin⁻¹。',
  'fn:acos': '逆余弦 cos⁻¹。',
  'fn:atan': '逆正接 tan⁻¹。',
  'fn:sinh': '双曲線正弦。', 'fn:cosh': '双曲線余弦。', 'fn:tanh': '双曲線正接。',
  'fn:asinh': '逆双曲線正弦。', 'fn:acosh': '逆双曲線余弦。', 'fn:atanh': '逆双曲線正接。',
  'fn:log': '常用対数（底 10）。',
  'fn:ln': '自然対数（底 ℯ）。',
  'fn:GCD': '最大公約数。GCD(12,18)=6。',
  'fn:LCM': '最小公倍数。LCM(4,6)=12。',
  'fn:Pol': '直交座標 (x,y) を極座標 (r,θ) に変換します。結果は変数 X, Y にも入ります。',
  'fn:Rec': '極座標 (r,θ) を直交座標 (x,y) に変換します。',
  'fn:Rnd': '現在の表示桁数で丸めます。',
  'fn:RanInt': '指定した範囲の整数乱数。RanInt(1,6) でサイコロ。',
  'fn:conjg': '複素数の共役（a+bⅈ → a−bⅈ）。',
  'fn:arg': '複素数の偏角。',

  // --- characters and text ---
  'char:π': '円周率 π。',
  'char:ℯ': '自然対数の底 ℯ。',
  'char:ⅈ': '虚数単位。CMPLX モードで使います。',
  'char:∠': '複素数を r∠θ（極形式）で入力する記号。',
  'char:=': '方程式の「＝」です。式に入れて = キーを押すと解きます。',
  'char:!': '階乗。5! = 120。',
  'char:%': 'パーセント（100 で割ります）。',
  'char:−': '負の符号。通常の − キーでも同じように使えます。',
  'char:,': '引数の区切り。Pol や GCD などで使います。',
  'char:°': '度で入力した角度を、現在の角度単位に換算します。',
  'text:Ans': '直前の答え。',
  'text:PreAns': '1 つ前の答え。',
  'text:nPr': '順列。5 nPr 2 = 20。',
  'text:nCr': '組合せ。5 nCr 2 = 10。',
  'text:Ran#': '0 以上 1 未満の乱数（小数第 3 位）。',

  // --- menus and modes ---
  'menu:mode': '計算モードを選びます（COMP / CMPLX / STAT / BASE-N / EQN / TABLE）。',
  'menu:setup': '角度単位・表示桁数・分数表示・複素数表示などの設定。',
  'menu:const': '科学定数 40 種から選んで入力します。',
  'menu:conv': '単位換算。答えを別の単位に換算します。',
  'menu:clr': '設定・メモリー・全体の初期化。',
  'menu:sto': 'いまの答えを変数 A〜F, X, Y, M に保存します。',
  'menu:rcl': '変数に保存した値を呼び出します。',
  'menu:vars': '変数の一覧です。選ぶと式に入ります。',
  'menu:si': 'SI 接頭辞。答えの表示を k・M・m・µ などで言い換えます。',
  'menu:hyp': '双曲線関数の一覧。',
  'menu:drg': '角度単位の記号（°・ラジアン・グラード）を入力します。',
  'menu:history': '計算履歴。選ぶとその式を呼び戻して編集できます。',
  'menu:help': 'この使い方の画面です。',
  'menu:multi': 'まとめてあるキーの一覧（RCL / STO / M− / ◀ENG / ∠ / ÷R など）。',
  'mode:COMP': '標準計算モード。ふだんはこれを使います。',
  'mode:CMPLX': '複素数計算モード。',
  'mode:STAT': '統計・回帰計算モード。',
  'mode:BASE': 'n 進計算モード。2 進・8 進・10 進・16 進の計算をします。',
  'mode:EQN': '方程式モード。連立 1 次方程式や 2 次・3 次方程式を係数から解きます。',
  'mode:TABLE': '数値テーブルモード。f(x) の表を作ります。',
};

const DIR_LABEL = {
  center: 'タップ',
  up: '上フリック',
  right: '右フリック',
  down: '下フリック',
  left: '左フリック',
  longPress: '長押し',
};

/** Strip markup so a legend can be shown as plain text in the help list. */
const plain = (html) => String(html || '').replace(/<[^>]*>/g, '').trim();

/** Build the reference entry for one key. */
function keyEntry(def, group) {
  const actions = [];
  for (const dir of ['center', 'up', 'right', 'down', 'left']) {
    const item = def[dir];
    if (!item?.act) continue;
    actions.push({
      dir: DIR_LABEL[dir],
      label: plain(item.label),
      desc: ACTION_DOCS[actionKey(item.act)] || '',
    });
  }
  if (def.longPress) {
    actions.push({
      dir: DIR_LABEL.longPress,
      label: plain(def.longPress.name || ''),
      desc: ACTION_DOCS[actionKey(def.longPress)] || '',
    });
  }
  if (def.instantPicker) {
    actions.push({
      dir: '押したまま上下',
      label: 'SI 接頭辞',
      desc: '押した指を離さず上へなぞると k → M → G …、下へなぞると m → µ → n …。指を離すとその表示になります。',
    });
  }
  const name = plain(def.center?.html) || plain(def.center?.label) || plain(def.label) || def.id;
  return { id: def.id, name, group, actions };
}

export function keyReference() {
  const out = [];
  const strip = [
    { ...SHIFT_KEY, center: { label: SHIFT_KEY.label, act: SHIFT_KEY.act } },
    { ...ALPHA_KEY, center: { label: ALPHA_KEY.label, act: ALPHA_KEY.act } },
    ...NAV_KEYS.map((d) => ({ ...d, center: { label: d.label, act: d.act } })),
    ...TOP_KEYS,
  ];
  for (const def of strip) out.push(keyEntry(def, '上部'));
  for (const row of FUNCTION_ROWS) for (const def of row) out.push(keyEntry(def, '関数キー'));
  for (const row of NUMERIC_ROWS) for (const def of row) out.push(keyEntry(def, '数字・演算キー'));
  return out;
}

/** Hand-written topics, for the things that are not tied to one key. */
export const HELP_TOPICS = [
  {
    title: 'フリック入力の使い方',
    words: ['フリック', 'flick', 'シフト', 'shift', 'アルファ', 'alpha', '裏', '入力', '操作'],
    body: `<p>キーを押したまま指を動かすと、周りに候補が出ます。指を離すとその機能が入ります。</p>
      <ul><li><b>上</b>＝黄色の刻印（SHIFT の機能）</li>
      <li><b>右</b>＝赤色の刻印（ALPHA の機能。変数 A〜F など）</li>
      <li><b>下・左</b>＝関連する機能（sinh、DEC/HEX など）</li></ul>
      <p>SHIFT / ALPHA キーも残してあります。押してからキーをタップすると、それぞれ上・右の機能が入ります。</p>`,
  },
  {
    title: '16進数（BASE-N）になってしまった／元に戻したい',
    words: ['16進', '16進数', 'hex', '2進', 'bin', '8進', 'oct', 'dec', 'base', 'n進', '戻す', '戻り方', 'モード', '直す'],
    body: `<p>画面左上に <b>BASE</b> と <b>b16</b>（または b2 / b8 / b10）が出ていたら、n 進計算モードです。
      この状態では答えが 16 進数などで表示され、小数・関数・SI 接頭辞は使えません。</p>
      <p><b>戻し方：</b>MODE キー ▸ <b>1 COMP</b> を選びます。</p>
      <p><b>入り方：</b>MODE ▸ 4 BASE-N、または <b>3</b> キーの上フリック（BASE）です。
      モードに入ったあとで log / ln / x² / x■ キーを下フリックすると、
      BIN / OCT / DEC / HEX の基数を切り替えられます。
      （COMP モードでは、これらの下フリックは何も起きないようにしてあります）</p>`,
  },
  {
    title: 'SI 接頭辞（1000 を 1 k と表示する）',
    words: ['si', '接頭辞', 'キロ', 'k', 'メガ', 'M', 'ミリ', 'm', 'マイクロ', 'µ', 'kpa', 'mpa', '単位', '表示'],
    body: `<p>答えの<b>表示のしかたを変えるだけ</b>のキーです。式には何も入りません。</p>
      <p>答えを出したあと <b>SI</b> キーを押すと、その場に接頭辞のはしごが出ます。
      指を置いた位置が「なし」で、<b>上へなぞると大きい方</b>（k → M → G → T …）、
      <b>下へなぞると小さい方</b>（m → µ → n → p …）。
      上部に「1000 → 1 k」と変換後が出るので、見ながら選んで指を離すと確定します。</p>
      <p>このキーだけは上下 2 方向専用で、左右のフリックはありません。</p>`,
  },
  {
    title: '方程式を解く',
    words: ['方程式', 'solve', '解', '解く', '二次', '2次', '連立', 'eqn', '根'],
    body: `<p>式に「＝」を入れて <b>=</b> キーを押すだけです（「＝」は SOLVE キーの右フリック）。
      SOLVE キーをタップしても同じです。</p>
      <p>例：X²−5X+6=0 → X₁=2, X₂=3 ／ X²−2=0 → ±√2 ／ X²+X+1=0 → 複素数解</p>
      <p>連立方程式や、係数を直接入れたいときは MODE ▸ EQN を使います。</p>`,
  },
  {
    title: '積分・微分',
    words: ['積分', '微分', 'integral', '∫', 'd/dx', '原始関数', '不定積分', '定積分', 'シグマ', 'σ', 'Σ'],
    body: `<p><b>∫dx</b> キーをタップすると数値積分、<b>下フリック</b>で記号積分（原始関数を数式で返す）です。</p>
      <p><b>d/dx</b> キーはタップで数値微分、上フリックで記号微分です。</p>
      <p>いずれも変数は <b>X</b> を使います。X は ) キーの右フリックで入力できます。</p>`,
  },
  {
    title: '複素数',
    words: ['複素数', 'cmplx', '虚数', 'i', 'ⅈ', '極形式', '偏角', 'arg', 'conjg'],
    body: `<p>MODE ▸ CMPLX（または <b>2</b> キーの上フリック）で複素数モードになります。</p>
      <p>虚数単位 ⅈ は専用キー（実機の M+ の位置）です。そのキーの上フリックが ∠、
      右が Conjg、下が arg、左が Abs です。</p>
      <p>答えの表示で <b>S⇔D</b> を押すと a+bⅈ と r∠θ が切り替わります。</p>`,
  },
  {
    title: '答えの表示を変える（分数・小数・工学表記）',
    words: ['s⇔d', 'sd', '分数', '小数', '厳密', '√', 'π', '帯分数', 'eng', '工学'],
    body: `<p><b>S⇔D</b>：√2 や π/4、3/8 のような厳密表示と小数表示を切り替えます。</p>
      <p><b>ENG</b>（まとめキーの下フリック）：1234 → 1.234×10³ のように 3 桁ごとの指数にします。</p>
      <p>小数点以下の桁数などは MODE キーの上フリック（SETUP）で設定します。</p>`,
  },
  {
    title: 'メモリー・変数',
    words: ['メモリー', '変数', 'sto', 'rcl', 'm+', 'm-', 'ans', '保存', '呼び出し'],
    body: `<p>変数は A〜F, X, Y, M の 9 個です。<b>VAR</b> キーで一覧から入力、
      上フリックで <b>STO</b>（保存）、下フリックで <b>RCL</b>（呼び出し）。</p>
      <p><b>M+</b>（まとめキーの左フリック）は独立メモリー M への足し込みです。
      画面上部に <b>M</b> が出ていれば、M に値が入っています。</p>
      <p><b>Ans</b> は直前の答え、右フリックの <b>PreAns</b> は 1 つ前の答えです。</p>`,
  },
  {
    title: '計算履歴',
    words: ['履歴', 'hist', '前の計算', '呼び戻す', 'リプレイ'],
    body: `<p><b>HIST</b> キーで過去の計算を一覧から選べます。選ぶとその式が戻り、編集して再計算できます。</p>
      <p>式の外側で ▲ / ▼ を押しても履歴をたどれます。</p>`,
  },
  {
    title: '計算の優先順位',
    words: ['優先順位', '順序', 'かっこ', '×', '÷', '暗黙', '省略'],
    body: `<p>実機と同じ順序です。掛け算記号の省略は ÷ より強く結びつきます。</p>
      <p>6÷2(1+2) = 1 ／ 6÷2π = 6÷(2π) ／ −2² = −4 ／ (−2)² = 4</p>`,
  },
];

const norm = (s) => String(s).toLowerCase().replace(/\s+/g, '');

/**
 * Search topics and keys. A hit in the title or keyword list outranks one that
 * only appears somewhere in the body, so "接頭辞" leads with the SI topic
 * rather than with whatever else happens to mention it.
 */
export function searchHelp(query, keys) {
  const q = norm(query);
  if (!q) return { topics: HELP_TOPICS, keys };

  const rank = (item, fields) => {
    let best = 0;
    for (const [weight, value] of fields) {
      if (!value) continue;
      if (norm(value).includes(q)) best = Math.max(best, weight);
    }
    return best;
  };

  const topics = HELP_TOPICS
    .map((t) => ({
      t,
      score: Math.max(
        rank(t, [[3, t.title]]),
        // The query may be longer than the keyword ("16進数" vs "16進"), but
        // only for keywords long enough that the match means something.
        t.words.some((w) => norm(w).includes(q)
          || (norm(w).length >= 3 && q.includes(norm(w)))) ? 2 : 0,
        norm(plain(t.body)).includes(q) ? 1 : 0,
      ),
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.t);

  const matchedKeys = keys
    .map((k) => ({
      k,
      score: Math.max(
        norm(k.name).includes(q) ? 3 : 0,
        k.actions.some((a) => norm(a.label).includes(q)) ? 2 : 0,
        k.actions.some((a) => norm(a.desc).includes(q)) ? 1 : 0,
      ),
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.k);

  return { topics, keys: matchedKeys };
}
