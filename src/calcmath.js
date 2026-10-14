/* =====================================================================
   CALCULATOR MATHS (no eval): the keys you press become a list of tokens,
   which is read with the usual rules (brackets, powers, × ÷ before + −).
   Telecom extras: dB keys (10·log, 20·log), prefixes k M G m µ n p, 10ˣ.
   Pure functions only, so it can be tested on its own.
   ===================================================================== */
const CalcMath = (() => {
  const PREFIX = { G: 1e9, M: 1e6, k: 1e3, m: 1e-3, 'µ': 1e-6, n: 1e-9, p: 1e-12 };
  const FN = {
    sqrt: { label: '√(', f: x => x < 0 ? err('A square root needs 0 or more') : Math.sqrt(x) },
    log: { label: 'log(', f: x => x <= 0 ? err('log needs a number above 0') : Math.log10(x) },
    ln: { label: 'ln(', f: x => x <= 0 ? err('ln needs a number above 0') : Math.log(x) },
    pow10: { label: '10^(', f: x => Math.pow(10, x) },
    db10: { label: '10·log(', f: x => x <= 0 ? err('dB needs a number above 0') : 10 * Math.log10(x) },
    db20: { label: '20·log(', f: x => x <= 0 ? err('dB needs a number above 0') : 20 * Math.log10(x) },
    sin: { label: 'sin(', trig: 1, f: (x, d) => Math.sin(d ? x * Math.PI / 180 : x) },
    cos: { label: 'cos(', trig: 1, f: (x, d) => Math.cos(d ? x * Math.PI / 180 : x) },
    tan: { label: 'tan(', trig: 1, f: (x, d) => { if (d && Math.abs(((x % 180) + 180) % 180 - 90) < 1e-9) err('tan of 90° has no value'); return Math.tan(d ? x * Math.PI / 180 : x); } },
  };
  const CONST = { 'π': Math.PI, e: Math.E };
  function err(m) { throw Object.assign(new Error(m), { calc: true }); }

  // ---- editing the token list (what each key does) ----
  // token: { t: 'num', v: '12.5' } | { t: 'op', v: '+−×÷^' } | { t: 'fn', v: 'log' } | { t: 'lp' } | { t: 'rp' }
  //        | { t: 'const', v: 'π' | 'e' } | { t: 'ans' } | { t: 'pre', v: 'k' } | { t: 'post', v: '²' | '%' }
  const last = T => T[T.length - 1];
  const endsValue = T => { const l = last(T); return !!l && ['num', 'val', 'rp', 'const', 'ans', 'pre', 'post'].includes(l.t); };
  function press(T, key) {
    T = T.map(x => ({ ...x }));
    const l = last(T);
    if (/^[0-9]$/.test(key)) {
      if (l && l.t === 'num') { if (l.v === '0') l.v = key; else if (l.v.replace(/[^0-9]/g, '').length < 15) l.v += key; }
      else T.push({ t: 'num', v: key });
    } else if (key === '.') {
      if (l && l.t === 'num') { if (!l.v.includes('.')) l.v += '.'; }
      else T.push({ t: 'num', v: '0.' });
    } else if ('+−×÷^'.includes(key) && key.length === 1) {
      if (!l) { if (key === '−') T.push({ t: 'op', v: '−' }); else return T; }                 // a minus can start a number
      else if (l.t === 'op') { if (key === '−' && l.v !== '−' && l.v !== '+') T.push({ t: 'op', v: '−' }); else { if (T.length > 1 && last(T.slice(0, -1)).t === 'op') T.pop(); last(T).v = key; } }   // change the sign you just typed
      else if (l.t === 'lp' || l.t === 'fn') { if (key === '−') T.push({ t: 'op', v: '−' }); }
      else T.push({ t: 'op', v: key });
    } else if (key === '(') T.push({ t: 'lp' });
    else if (key === ')') { if (open(T) > 0 && endsValue(T)) T.push({ t: 'rp' }); }
    else if (FN[key]) T.push({ t: 'fn', v: key });
    else if (key in CONST) T.push({ t: 'const', v: key });
    else if (key === 'ans') T.push({ t: 'ans' });
    else if (key in PREFIX) { if (l && (l.t === 'num' || l.t === 'val')) T.push({ t: 'pre', v: key }); }               // 5k, 20µ: only right after a number
    else if (key === '²' || key === '%') { if (endsValue(T)) T.push({ t: 'post', v: key }); }
    return T;
  }
  function back(T) {
    T = T.map(x => ({ ...x }));
    const l = last(T); if (!l) return T;
    if (l.t === 'num' && l.v.length > 1) l.v = l.v.slice(0, -1); else T.pop();
    return T;
  }
  const open = T => T.reduce((n, x) => n + (x.t === 'lp' || x.t === 'fn' ? 1 : x.t === 'rp' ? -1 : 0), 0);

  // ---- reading the tokens: + − , × ÷ (and 2π, 3(4) without a sign), ^ , then ² % prefixes ----
  function evaluate(T, opt = {}) {
    if (!T.length) return null;
    let i = 0;
    const peek = () => T[i], next = () => T[i++];
    const startsValue = x => !!x && ['num', 'val', 'const', 'ans', 'fn', 'lp'].includes(x.t);
    function expr() {
      let a = term();
      while (peek() && peek().t === 'op' && (peek().v === '+' || peek().v === '−')) {
        const op = next().v, b = term();
        const bv = b.pct ? a.v * b.v : b.v;                          // 200 + 10% = 220, like a phone calculator
        a = { v: op === '+' ? a.v + bv : a.v - bv };
      }
      return a;
    }
    function term() {
      let a = unary();
      for (;;) {
        const p = peek();
        if (p && p.t === 'op' && (p.v === '×' || p.v === '÷')) {
          next(); const b = unary();
          if (p.v === '÷' && b.v === 0) err('You can’t divide by 0');
          a = { v: p.v === '×' ? a.v * b.v : a.v / b.v };
        } else if (startsValue(p)) { const b = unary(); a = { v: a.v * b.v }; }       // 2π, 3(4+1), 2√(9)
        else return a;
      }
    }
    function unary() {
      const p = peek();
      if (p && p.t === 'op' && (p.v === '−' || p.v === '+')) { next(); const a = unary(); return { v: p.v === '−' ? -a.v : a.v, pct: a.pct }; }
      return power();
    }
    function power() {
      const a = postfix();
      if (peek() && peek().t === 'op' && peek().v === '^') {
        next(); const b = unary();
        const v = Math.pow(a.v, b.v);
        if (Number.isNaN(v)) err('That power has no real answer');
        return { v };
      }
      return a;
    }
    function postfix() {
      let a = primary();
      while (peek() && (peek().t === 'post' || peek().t === 'pre')) {
        const p = next();
        if (p.t === 'pre') a = { v: a.v * PREFIX[p.v] };
        else if (p.v === '²') a = { v: a.v * a.v };
        else a = { v: a.v / 100, pct: true };
      }
      return a;
    }
    function primary() {
      const p = next();
      if (!p) err('incomplete');
      if (p.t === 'num') { const v = parseFloat(p.v); if (Number.isNaN(v)) err('incomplete'); return { v }; }
      if (p.t === 'val') return { v: p.v };                         // an earlier answer
      if (p.t === 'const') return { v: CONST[p.v] };
      if (p.t === 'ans') return { v: opt.ans || 0 };
      if (p.t === 'lp' || p.t === 'fn') {
        const inner = peek() && peek().t !== 'rp' ? expr() : err('incomplete');
        if (peek() && peek().t === 'rp') next();                      // a bracket you did not close is closed for you
        if (p.t === 'lp') return { v: inner.v };
        return { v: FN[p.v].f(inner.v, opt.deg) };
      }
      err('incomplete');
    }
    const out = expr();
    if (i < T.length) err('incomplete');
    if (!Number.isFinite(out.v)) err('That number is too big');
    return out.v;
  }
  // try to work it out: { ok: true, v } or { ok: false, msg, incomplete }
  function tryEval(T, opt) {
    try { const v = evaluate(T, opt); return v === null ? { ok: false, incomplete: true } : { ok: true, v: clean(v) }; }
    catch (e) { if (!e.calc) throw e; return { ok: false, msg: e.message, incomplete: e.message === 'incomplete' }; }
  }
  // floating-point dust: 0.1 + 0.2 = 0.3, sin(180°) = 0
  function clean(v) { if (Math.abs(v) < 1e-13) return 0; return Number(v.toPrecision(12)); }

  // ---- showing numbers ----
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  const sup = s => String(s).split('').map(c => SUP[c] || c).join('');
  const group = s => { const [i, d] = s.split('.'); const neg = i.startsWith('-'); const g = (neg ? i.slice(1) : i).replace(/\B(?=(\d{3})+(?!\d))/g, ','); return (neg ? '−' : '') + g + (d !== undefined ? '.' + d : ''); };
  // 1234.5 → "1,234.5"; 0.0000123 → "1.23 × 10⁻⁵"
  function fmt(v) {
    if (v === 0) return '0';
    const a = Math.abs(v);
    if (a >= 1e12 || a < 1e-4) {
      const [m, ex] = v.toExponential(8).split('e');
      return `${group(String(Number(m)))} × 10${sup(Number(ex))}`;
    }
    return group(String(Number(v.toPrecision(10))));
  }
  // the same number with an engineering prefix, for reading telecom answers: 0.0628 → "62.8 m"
  function eng(v) {
    if (!v || !Number.isFinite(v)) return '';
    const a = Math.abs(v);
    if (a >= 1 && a < 1000) return '';
    const steps = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];
    const s = steps.find(([f]) => a >= f) || (a < 1e-12 ? null : steps[steps.length - 1]);
    if (!s) return '';
    return `${group(String(Number((v / s[0]).toPrecision(6))))} ${s[1]}`;
  }
  // the expression as you see it: 2 × π × 50k
  function show(T) {
    return T.map((x, k) => {
      if (x.t === 'num') return group(x.v.replace(/\.$/, '§')).replace('§', '.');
      if (x.t === 'op') return x.v === '^' ? '^' : (k === 0 || ['op', 'lp', 'fn'].includes((T[k - 1] || {}).t)) && x.v === '−' ? '−' : ` ${x.v} `;
      if (x.t === 'fn') return FN[x.v].label;
      if (x.t === 'lp') return '(';
      if (x.t === 'rp') return ')';
      if (x.t === 'const') return x.v;
      if (x.t === 'ans') return 'Ans';
      if (x.t === 'val') return fmt(x.v);
      if (x.t === 'pre') return x.v;
      return x.v;
    }).join('').replace(/\s+/g, ' ').trim();
  }
  const ghost = T => ')'.repeat(Math.max(0, open(T)));
  const fromNumber = v => [{ t: 'num', v: String(clean(v)) }];
  return { press, back, evaluate, tryEval, fmt, eng, show, ghost, fromNumber, open, PREFIX, FN };
})();
if (typeof module !== 'undefined') module.exports = CalcMath;
