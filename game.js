'use strict';
/* =====================================================================
   Nhãn Lực — 5 bài test cảm quan + chế độ đấu 2 người cùng đề
   ===================================================================== */

/* ---------- utils ---------- */
const $ = (s, r = document) => r.querySelector(s);
function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) {
    if (k == null || k === false) continue;
    e.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return e;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r1 = v => Math.round(v * 10) / 10;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const D = Math.PI / 180;
const norm360 = a => ((a % 360) + 360) % 360;
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const C = () => ({
  ink: cssVar('--ink'), dim: cssVar('--dim'), faint: cssVar('--faint'), truth: cssVar('--truth'),
  accent: cssVar('--accent'), panel: cssVar('--panel'), p1: cssVar('--p1'), p2: cssVar('--p2'),
  p3: cssVar('--p3'), p4: cssVar('--p4'), danger: cssVar('--danger'),
});
const KEYS = ['p1', 'p2', 'p3', 'p4'];
const MONO = "ui-monospace,'SF Mono',Menlo,Consolas,monospace";
const app = $('#app');
function show(...nodes) { app.replaceChildren(...nodes); window.scrollTo(0, 0); }
const fmtSec = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const fmtMs = ms => `${(ms / 1000).toFixed(1)}s`;

function toast(msg, ms = 1800) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._id);
  toast._id = setTimeout(() => { t.hidden = true; }, ms);
}
async function copy(textValue, okMsg = 'Đã copy') {
  try { await navigator.clipboard.writeText(textValue); toast(okMsg); }
  catch {
    const ta = el('textarea', { style: 'position:fixed;opacity:0' }); ta.value = textValue;
    document.body.append(ta); ta.select();
    try { document.execCommand('copy'); toast(okMsg); } catch { toast('Không copy được, hãy copy thủ công'); }
    ta.remove();
  }
}
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

/* ---------- seeded RNG (cùng seed => cùng đề) ---------- */
function seedHash(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 ^ h1) >>> 0;
}
class RNG {
  constructor(seed) { this.a = seedHash(String(seed)); }
  next() {
    let t = (this.a = (this.a + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) { return a + (b - a) * this.next(); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  pick(arr) { return arr[this.int(0, arr.length - 1)]; }
  bool() { return this.next() < 0.5; }
}
function randCode(n = 5) {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const buf = new Uint32Array(n); crypto.getRandomValues(buf);
  let s = ''; for (const x of buf) s += A[x % A.length];
  return s;
}

/* ---------- audio ---------- */
let AC = null;
function ensureAudio() {
  const A = window.AudioContext || window.webkitAudioContext;
  if (!A) return null;
  try { if (!AC) AC = new A(); if (AC.state === 'suspended') AC.resume(); } catch { AC = null; }
  return AC;
}
function beep(ac, when, freq = 1000, vol = 0.25) {
  const o = ac.createOscillator(); o.type = 'square'; o.frequency.value = freq;
  const g = ac.createGain();
  g.gain.setValueAtTime(1e-4, when);
  g.gain.exponentialRampToValueAtTime(vol, when + 0.003);
  g.gain.exponentialRampToValueAtTime(1e-4, when + 0.04);
  o.connect(g).connect(ac.destination);
  o.start(when); o.stop(when + 0.06);
  return o;
}

/* ---------- canvas stage (toạ độ logic 800x500) ---------- */
const W = 800, H = 500;
function makeStage() {
  const c = el('canvas', { class: 'stage' });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = W * dpr; c.height = H * dpr;
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return {
    c, g,
    toLogical(e) { const r = c.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; },
    clear() { g.clearRect(0, 0, W, H); },
  };
}
function text(g, s, x, y, { size = 16, color, align = 'center', weight = 600, base = 'middle' } = {}) {
  g.font = `${weight} ${size}px ${MONO}`; g.fillStyle = color || C().ink;
  g.textAlign = align; g.textBaseline = base; g.fillText(s, x, y);
}
function seg(g, x1, y1, x2, y2, color, w = 2, dash = null) {
  g.save(); g.strokeStyle = color; g.lineWidth = w; g.lineCap = 'round';
  if (dash) g.setLineDash(dash);
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.restore();
}
const tick = (g, x, y, h, color, w = 2) => seg(g, x, y - h / 2, x, y + h / 2, color, w);
function dot(g, x, y, r, color) { g.fillStyle = color; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
function legend(g, rows) { rows.forEach((r, i) => text(g, r.s, 16, 24 + i * 24, { size: 15, color: r.color, align: 'left', weight: 700 })); }

/* ---------- task: 1 thử thách có thể bị huỷ khi hết giờ ----------
   body(t) gọi t.finish(answer) để chốt. Nếu signal abort: chốt bằng t.partial
   (thao tác dang dở) kèm cờ timeout, hoặc null nếu chưa có gì. */
function task(signal, body) {
  return new Promise(resolve => {
    const cleanups = new Set();
    const t = {
      done: false, partial: null,
      finish(a) {
        if (t.done) return; t.done = true;
        for (const f of [...cleanups]) { try { f(); } catch { /* ignore */ } }
        cleanups.clear(); resolve(a);
      },
      on(target, type, fn, opts) { target.addEventListener(type, fn, opts); cleanups.add(() => target.removeEventListener(type, fn, opts)); },
      defer(fn) { cleanups.add(fn); },
      wait(ms) {
        return new Promise(r => {
          const cancel = () => { clearTimeout(id); r(); };
          const id = setTimeout(() => { cleanups.delete(cancel); r(); }, ms);
          cleanups.add(cancel);
        });
      },
      frame() {
        return new Promise(r => {
          const cancel = () => { cancelAnimationFrame(id); r(); };
          const id = requestAnimationFrame(() => { cleanups.delete(cancel); r(); });
          cleanups.add(cancel);
        });
      },
    };
    if (signal) {
      if (signal.aborted) { resolve(null); return; }
      const onAbort = () => t.finish(t.partial != null ? { ...t.partial, timeout: true } : null);
      signal.addEventListener('abort', onAbort, { once: true });
      cleanups.add(() => signal.removeEventListener('abort', onAbort));
    }
    Promise.resolve().then(() => body(t)).catch(err => { console.error(err); t.finish(t.partial); });
  });
}
async function countdown(st, t) {
  for (const s of ['3', '2', '1']) {
    const t0 = performance.now();
    while (performance.now() - t0 < 450) {
      if (t.done) return;
      const k = (performance.now() - t0) / 450;
      st.clear(); text(st.g, s, 400, 250, { size: 120 - k * 36, color: C().dim, weight: 800 });
      await t.frame();
    }
  }
  st.clear();
}

/* =====================================================================
   5 THỬ THÁCH
   Mỗi event: generate(rng) -> đề; play() -> answer; error() -> sai số;
   sigma -> độ khó; draw() -> vẽ đáp án đúng + câu trả lời của 1..n người
   ===================================================================== */

/* 1. Đếm chấm */
const COUNT = {
  id: 'count', emoji: '🔢', name: 'Đếm chấm', sigma: 0.2,
  instruction: () => 'Các chấm sẽ hiện trong 2 giây. Có bao nhiêu chấm?',
  target: p => `Có ${p.n} chấm`,
  generate(r) {
    const want = r.int(14, 58), dots = [];
    for (let i = 0; i < 30000 && dots.length < want; i++) {
      const x = Math.round(r.range(50, 750)), y = Math.round(r.range(40, 460));
      if (dots.every(d => (d.x - x) ** 2 + (d.y - y) ** 2 >= 400)) dots.push({ x, y });
    }
    return { n: dots.length, dots };
  },
  play(st, p, hud, signal) {
    return task(signal, async t => {
      await countdown(st, t); if (t.done) return;
      const c = C();
      st.clear(); for (const d of p.dots) dot(st.g, d.x, d.y, 7, c.ink);
      await t.wait(2000); if (t.done) return;
      st.clear(); text(st.g, 'Có bao nhiêu chấm?', 400, 250, { size: 28, color: c.dim });
      const inp = el('input', { type: 'number', inputmode: 'numeric', min: '0', max: '999', placeholder: 'Số chấm', autocomplete: 'off' });
      const form = el('form', { class: 'answer' }, inp, el('button', { class: 'btn primary', type: 'submit' }, 'Chốt'));
      t.on(inp, 'input', () => { const v = parseInt(inp.value, 10); t.partial = Number.isFinite(v) && v >= 0 ? { g: v } : null; });
      t.on(form, 'submit', e => {
        e.preventDefault();
        const v = parseInt(inp.value, 10);
        if (!Number.isFinite(v) || v < 0) { inp.focus(); return; }
        t.finish({ g: v });
      });
      t.defer(() => form.remove());
      hud.replaceChildren(form); inp.focus();
    });
  },
  error: (p, a) => Math.abs(Math.log(Math.max(a.g, 0.5) / p.n)),
  human(p, a) { const d = a.g - p.n; return d === 0 ? `đoán ${a.g} · chính xác!` : `đoán ${a.g} · ${d > 0 ? 'thừa' : 'thiếu'} ${Math.abs(d)}`; },
  draw(g, p, entries) {
    const c = C();
    for (const d of p.dots) dot(g, d.x, d.y, 7, c.faint);
    g.fillStyle = c.panel; g.globalAlpha = 0.85; g.fillRect(250, 120, 300, 150 + entries.length * 34); g.globalAlpha = 1;
    text(g, String(p.n), 400, 190, { size: 100, color: c.truth, weight: 800 });
    entries.forEach((e, i) => text(g, e.answer ? `${e.label}: ${e.answer.g}` : `${e.label}: —`, 400, 280 + i * 34, { size: 22, color: e.color, weight: 700 }));
  },
};

/* 2. Dự đoán điểm rơi */
const GROUND = 440;
const ppos = (p, t) => ({ x: p.x0 + p.vx * t, y: GROUND - (p.h0 + p.vy * t - 0.5 * p.g * t * t) });
const PREDICT = {
  id: 'predict', emoji: '🎯', name: 'Điểm rơi', sigma: 60,
  instruction: () => 'Quan sát quả bóng. Khi nó biến mất, click/chạm vào mặt đất nơi bóng sẽ rơi xuống.',
  target: p => `Bóng rơi tại x = ${Math.round(p.land)}`,
  generate(r) {
    for (let i = 0; i < 2000; i++) {
      const dir = r.bool() ? 1 : -1;
      const x0 = dir > 0 ? r.range(60, 230) : r.range(570, 740);
      const h0 = r.range(0, 160), g = r.range(450, 900), vy = r.range(300, 560), vx = dir * r.range(110, 300);
      if (h0 + vy * vy / (2 * g) > 390) continue;
      const T = (vy + Math.sqrt(vy * vy + 2 * g * h0)) / g;
      const land = x0 + vx * T;
      if (land < 50 || land > 750 || Math.abs(land - x0) < 160) continue;
      return { x0, h0, g, vx, vy, T, land, vis: r.range(0.38, 0.55) };
    }
    const x0 = 120, h0 = 40, g = 600, vy = 450, vx = 220, T = (vy + Math.sqrt(vy * vy + 2 * g * h0)) / g;
    return { x0, h0, g, vx, vy, T, land: x0 + vx * T, vis: 0.45 };
  },
  scene(g, p) {
    const c = C();
    seg(g, 30, GROUND, 770, GROUND, c.ink, 2);
    if (p.h0 > 4) seg(g, p.x0, GROUND, p.x0, GROUND - p.h0, c.dim, 3);
    seg(g, p.x0 - 14, GROUND - p.h0, p.x0 + 14, GROUND - p.h0, c.dim, 4);
  },
  play(st, p, hud, signal) {
    return task(signal, async t => {
      await countdown(st, t); if (t.done) return;
      const c = C(), visMs = p.vis * p.T * 1000, t0 = performance.now();
      for (;;) {
        const ms = performance.now() - t0;
        st.clear(); this.scene(st.g, p);
        if (ms > visMs + 90) break;
        const q = ppos(p, ms / 1000);
        st.g.globalAlpha = ms < visMs ? 1 : 1 - (ms - visMs) / 90;
        dot(st.g, q.x, q.y, 8, c.ink); st.g.globalAlpha = 1;
        await t.frame(); if (t.done) return;
      }
      const paint = x => {
        st.clear(); this.scene(st.g, p);
        text(st.g, 'Click/chạm vào mặt đất nơi bóng sẽ rơi', 400, 36, { size: 17, color: c.dim });
        if (x != null) tick(st.g, x, GROUND, 30, c.accent, 3);
      };
      paint(null);
      t.on(st.c, 'pointermove', e => paint(clamp(st.toLogical(e).x, 30, 770)));
      t.on(st.c, 'pointerdown', e => { e.preventDefault(); t.finish({ x: r1(clamp(st.toLogical(e).x, 30, 770)) }); });
    });
  },
  error: (p, a) => Math.abs(a.x - p.land),
  human: (p, a) => `lệch ${Math.round(Math.abs(a.x - p.land))} px`,
  draw(g, p, entries) {
    const c = C();
    this.scene(g, p);
    g.save(); g.setLineDash([3, 7]); g.strokeStyle = c.truth; g.lineWidth = 2; g.beginPath();
    for (let i = 0; i <= 60; i++) { const q = ppos(p, p.T * i / 60); i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y); }
    g.stroke(); g.restore();
    g.save(); g.strokeStyle = c.dim; g.lineWidth = 3; g.beginPath();
    for (let i = 0; i <= 30; i++) { const q = ppos(p, p.T * p.vis * i / 30); i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y); }
    g.stroke(); g.restore();
    tick(g, p.land, GROUND, 40, c.truth, 3);
    text(g, 'điểm rơi', p.land, GROUND + 34, { size: 13, color: c.truth });
    entries.forEach((e, i) => {
      if (!e.answer) return;
      const x = e.answer.x, y = GROUND - 14 - i * 20;
      g.fillStyle = e.color; g.beginPath(); g.moveTo(x, y + 12); g.lineTo(x - 8, y - 4); g.lineTo(x + 8, y - 4); g.closePath(); g.fill();
    });
    legend(g, entries.map(e => ({ s: e.answer ? `▼ ${e.label}` : `${e.label}: —`, color: e.color })));
  },
};

/* 3. Góc */
const ACX = 400, ACY = 270, AR = 180;
const polar = (a, r) => [ACX + r * Math.cos(a * D), ACY - r * Math.sin(a * D)];
/* Chuột/bút: con trỏ đi theo chuột không cần giữ nút, click (nhấn + thả trên canvas) để chốt.
   Cảm ứng không có hover: chạm, kéo, thả để chốt. */
function hoverPick(st, t, update, commit) {
  let pressed = false;
  t.on(st.c, 'pointermove', e => { if (e.pointerType === 'mouse' || e.pointerType === 'pen' || pressed) update(e); });
  t.on(st.c, 'pointerdown', e => {
    e.preventDefault(); pressed = true;
    try { st.c.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    update(e);
  });
  t.on(st.c, 'pointerup', e => { if (!pressed) return; pressed = false; update(e); commit(); });
  t.on(st.c, 'pointercancel', () => { pressed = false; });
}

const ANGLE = {
  id: 'angle', emoji: '📐', name: 'Góc', sigma: 8,
  instruction: p => `Di chuột để xoay kim tới đúng ${p.target}°, ngược chiều kim đồng hồ tính từ vạch ngang nét đứt. Click để chốt (cảm ứng: chạm, kéo, thả).`,
  target: p => `Mục tiêu ${p.target}°`,
  generate(r) {
    let a = r.int(8, 352);
    if (a % 45 < 4 || a % 45 > 41) a = norm360(a + 9);
    return { target: a };
  },
  base(g) {
    const c = C();
    g.save(); g.strokeStyle = c.faint; g.lineWidth = 2; g.beginPath(); g.arc(ACX, ACY, AR, 0, Math.PI * 2); g.stroke(); g.restore();
    seg(g, ACX, ACY, ACX + AR + 30, ACY, c.dim, 2, [6, 6]);
    text(g, '0°', ACX + AR + 48, ACY, { size: 14, color: c.dim });
  },
  needle(g, a, color, w, len) {
    const [x, y] = polar(a, len);
    seg(g, ACX, ACY, x, y, color, w); dot(g, x, y, 8, color); dot(g, ACX, ACY, 5, color);
  },
  play(st, p, hud, signal) {
    return task(signal, async t => {
      const c = C();
      let ang = 0, moved = false;
      const paint = () => {
        st.clear(); this.base(st.g);
        this.needle(st.g, ang, moved ? c.accent : c.ink, 4, AR);
        text(st.g, `Mục tiêu: ${p.target}°`, 20, 32, { size: 20, align: 'left', weight: 800 });
        text(st.g, 'di chuột để xoay · click để chốt', 780, 32, { size: 13, align: 'right', color: c.dim });
      };
      const fromEvt = e => { const q = st.toLogical(e); return norm360(Math.atan2(-(q.y - ACY), q.x - ACX) / D); };
      paint();
      hoverPick(st, t, e => { ang = fromEvt(e); moved = true; t.partial = { a: r1(ang) }; paint(); }, () => t.finish({ a: r1(ang) }));
    });
  },
  error(p, a) { const d = Math.abs(norm360(a.a) - p.target) % 360; return Math.min(d, 360 - d); },
  human(p, a) { return `${Math.round(a.a)}° · lệch ${this.error(p, a).toFixed(1)}°`; },
  draw(g, p, entries) {
    const c = C();
    this.base(g);
    g.save(); g.strokeStyle = c.truth; g.lineWidth = 2; g.beginPath(); g.arc(ACX, ACY, 46, 0, -p.target * D, true); g.stroke(); g.restore();
    this.needle(g, p.target, c.truth, 3, AR + 8);
    const [tx, ty] = polar(p.target, AR + 34);
    text(g, `${p.target}°`, clamp(tx, 40, 760), clamp(ty, 18, 482), { size: 16, color: c.truth, weight: 800 });
    entries.forEach((e, i) => { if (e.answer) this.needle(g, e.answer.a, e.color, 4, AR - 18 - i * 18); });
    legend(g, entries.map(e => ({ s: e.answer ? `${e.label}: ${Math.round(e.answer.a)}°` : `${e.label}: —`, color: e.color })));
  },
};

/* 4. Giữ nhịp */
const N_CLICK = 8, N_TAP = 8;
function tempoStats(p, a) {
  let prev = 0;
  const iv = a.t.map(x => { const d = x - prev; prev = x; return d; });
  const mean = iv.reduce((s, v) => s + v, 0) / iv.length;
  const sd = Math.sqrt(iv.reduce((s, v) => s + (v - mean) ** 2, 0) / iv.length);
  return { drift: mean - p.T, sd };
}
const TEMPO = {
  id: 'tempo', emoji: '🥁', name: 'Giữ nhịp', sigma: 60,
  instruction: () => `Gõ theo tiếng nhịp (phím Space, hoặc chạm nút GÕ / khung hình). Sau ${N_CLICK} tiếng, nhịp tắt — tiếp tục gõ đều thêm ${N_TAP} lần.`,
  target: p => `${p.bpm} BPM · ${p.T} ms/nhịp`,
  generate(r) { const T = r.int(400, 750); return { T, bpm: Math.round(60000 / T) }; },
  play(st, p, hud, signal) {
    return task(signal, async t => {
      const c = C(), ac = ensureAudio();
      st.clear(); text(st.g, 'Chuẩn bị nghe nhịp…', 400, 250, { size: 26, color: c.dim });
      await t.wait(700); if (t.done) return;
      const base = performance.now() + 500;
      const clicks = Array.from({ length: N_CLICK }, (_, i) => base + i * p.T);
      if (ac) {
        const now = performance.now();
        const oscs = clicks.map((k, i) => beep(ac, ac.currentTime + (k - now) / 1000, i % 4 === 0 ? 1320 : 990));
        t.defer(() => oscs.forEach(o => { try { o.stop(); } catch { /* ignore */ } }));
      }
      const last = clicks[N_CLICK - 1], cutoff = last + p.T * 0.4, taps = [];
      let flash = 0;
      const onTap = () => {
        const now = performance.now(); flash = now + 100;
        if (now <= cutoff) return;
        taps.push(r1(now - last));
        t.partial = taps.length >= 3 ? { t: taps.slice() } : null;
        if (taps.length >= N_TAP) t.finish({ t: taps.slice() });
      };
      t.on(window, 'keydown', e => { if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) { e.preventDefault(); onTap(); } });
      t.on(st.c, 'pointerdown', e => { e.preventDefault(); onTap(); });
      const tapBtn = el('button', { class: 'btn tap', type: 'button', tabindex: '-1' }, 'GÕ');
      t.on(tapBtn, 'pointerdown', e => { e.preventDefault(); onTap(); });
      hud.replaceChildren(tapBtn); t.defer(() => tapBtn.remove());
      for (;;) {
        if (t.done) return;
        const now = performance.now();
        st.clear();
        const lit = clicks.some(k => now >= k && now < k + 110);
        const cont = now > cutoff;
        st.g.save(); st.g.lineWidth = 4; st.g.strokeStyle = cont ? c.accent : c.ink;
        st.g.beginPath(); st.g.arc(400, 200, 74, 0, Math.PI * 2); st.g.stroke(); st.g.restore();
        if (lit) dot(st.g, 400, 200, 74, c.ink);
        if (now < flash) dot(st.g, 400, 200, 30, c.accent);
        text(st.g, cont ? `Giữ nhịp! còn ${N_TAP - taps.length} lần` : 'Gõ theo tiếng nhịp', 400, 320, { size: 24, weight: 800, color: cont ? c.accent : c.ink });
        for (let i = 0; i < N_CLICK; i++) {
          const x = 400 - (N_CLICK - 1) * 18 + i * 36;
          now >= clicks[i] ? dot(st.g, x, 380, 7, c.ink) : dot(st.g, x, 380, 3, c.faint);
        }
        for (let i = 0; i < N_TAP; i++) {
          const x = 400 - (N_TAP - 1) * 18 + i * 36;
          i < taps.length ? dot(st.g, x, 420, 7, c.accent) : dot(st.g, x, 420, 3, c.faint);
        }
        text(st.g, 'nhịp mẫu', 400 - (N_CLICK - 1) * 18 - 26, 380, { size: 12, color: c.dim, align: 'right' });
        text(st.g, 'bạn gõ', 400 - (N_TAP - 1) * 18 - 26, 420, { size: 12, color: c.dim, align: 'right' });
        await t.frame();
      }
    });
  },
  error(p, a) { const s = tempoStats(p, a); return Math.sqrt(s.drift ** 2 + s.sd ** 2); },
  human(p, a) {
    const s = tempoStats(p, a);
    const n = a.t.length < N_TAP ? ` · ${a.t.length}/${N_TAP} lần gõ` : '';
    return `${s.drift > 0 ? 'chậm' : 'nhanh'} ${Math.abs(s.drift).toFixed(0)} ms/nhịp · dao động ±${s.sd.toFixed(0)} ms${n}`;
  },
  draw(g, p, entries) {
    const c = C(), x0 = 140, step = 80;
    text(g, `${p.bpm} BPM · ${p.T} ms/nhịp`, 400, 40, { size: 18, color: c.truth, weight: 800 });
    const n = Math.max(1, entries.length), gap = 370 / n, fs = n > 2 ? 12 : 14;
    entries.forEach((e, i) => {
      const y = n === 1 ? 250 : 75 + gap * (i + 0.5);
      text(g, e.label, 20, y - Math.min(50, gap * 0.34), { size: 15, color: e.color, align: 'left', weight: 800 });
      seg(g, x0 - 40, y, x0 + (N_TAP - 1) * step + 40, y, c.faint, 2);
      for (let k = 0; k < N_TAP; k++) tick(g, x0 + k * step, y, Math.min(30, gap * 0.3), c.truth, 2);
      const ty = y + Math.min(42, gap * 0.34);
      if (!e.answer) { text(g, 'hết giờ — không có dữ liệu', 400, ty, { size: fs, color: c.dim }); return; }
      e.answer.t.forEach((tm, k) => {
        const dev = tm - (k + 1) * p.T;
        const off = clamp(dev / p.T * step, -step * 0.55, step * 0.55);
        dot(g, x0 + k * step + off, y, 7, e.color);
      });
      text(g, this.human(p, e.answer), 400, ty, { size: fs, color: c.dim });
    });
    text(g, '← sớm   |   muộn →', 400, 486, { size: 12, color: c.dim });
  },
};

/* 5. Chia đoạn */
const SY = 270;
const FRACS = [[1, 3], [2, 3], [1, 4], [3, 4], [2, 5], [3, 5], [4, 5], [1, 6], [5, 6], [2, 7], [3, 7], [4, 7], [5, 7], [3, 8], [5, 8], [7, 8], [2, 9], [4, 9], [5, 9], [7, 9]];
const splitLabel = p => (p.pct ? `${p.num}%` : `${p.num}/${p.den}`);
const SPLIT = {
  id: 'split', emoji: '✂️', name: 'Chia đoạn', sigma: 0.05,
  instruction: p => `Đánh dấu điểm ở ${splitLabel(p)} chiều dài đoạn thẳng, tính từ đầu ${p.fromLeft ? 'TRÁI' : 'PHẢI'} (đầu có chấm cam). Di chuột để đặt vạch, click để chốt (cảm ứng: chạm, kéo, thả).`,
  target: p => `${splitLabel(p)} từ đầu ${p.fromLeft ? 'trái' : 'phải'}`,
  generate(r) {
    const pct = r.bool();
    let num, den;
    if (pct) { den = 100; num = r.int(11, 89); if (num % 10 === 0 || num === 25 || num === 75) num += 3; }
    else [num, den] = r.pick(FRACS);
    const len = r.int(440, 700), x1 = Math.round(r.range(50, 750 - len)), x2 = x1 + len, fromLeft = r.bool();
    const f = num / den;
    return { pct, num, den, x1, x2, fromLeft, target: fromLeft ? x1 + f * len : x2 - f * len };
  },
  scene(g, p) {
    const c = C(), sx = p.fromLeft ? p.x1 : p.x2, ex = p.fromLeft ? p.x2 : p.x1;
    seg(g, p.x1, SY, p.x2, SY, c.ink, 4);
    tick(g, p.x1, SY, 26, c.ink, 3); tick(g, p.x2, SY, 26, c.ink, 3);
    dot(g, sx, SY, 9, c.accent);
    text(g, p.pct ? '0%' : '0', sx, SY + 36, { size: 15, color: c.accent, weight: 800 });
    text(g, p.pct ? '100%' : '1', ex, SY + 36, { size: 15, color: c.dim });
  },
  play(st, p, hud, signal) {
    return task(signal, async t => {
      const c = C();
      let x = null;
      const paint = () => {
        st.clear(); this.scene(st.g, p);
        text(st.g, `Đánh dấu ${splitLabel(p)} từ đầu chấm cam`, 400, 60, { size: 22, weight: 800 });
        text(st.g, 'di chuột để đặt vạch · click để chốt', 400, 92, { size: 13, color: c.dim });
        if (x != null) { tick(st.g, x, SY, 56, c.accent, 3); dot(st.g, x, SY - 32, 7, c.accent); }
      };
      const fromEvt = e => clamp(st.toLogical(e).x, p.x1, p.x2);
      paint();
      hoverPick(st, t, e => { x = fromEvt(e); t.partial = { x: r1(x) }; paint(); }, () => t.finish({ x: r1(x) }));
    });
  },
  error: (p, a) => Math.abs(a.x - p.target) / (p.x2 - p.x1),
  human(p, a) { return `lệch ${(this.error(p, a) * 100).toFixed(1)}% chiều dài`; },
  draw(g, p, entries) {
    const c = C();
    this.scene(g, p);
    tick(g, p.target, SY, 70, c.truth, 3);
    text(g, splitLabel(p), p.target, SY - 50, { size: 16, color: c.truth, weight: 800 });
    entries.forEach((e, i) => {
      if (!e.answer) return;
      tick(g, e.answer.x, SY, 44, e.color, 3);
      dot(g, e.answer.x, SY + 30 + i * 16, 6, e.color);
    });
    legend(g, entries.map(e => ({ s: e.answer ? `● ${e.label}` : `${e.label}: —`, color: e.color })));
  },
};

const EVENTS = [COUNT, PREDICT, ANGLE, TEMPO, SPLIT];

/* Đáp án đến từ link/server: kiểm tra đúng dạng, sai thì coi như không trả lời */
const fin = v => typeof v === 'number' && Number.isFinite(v);
const VALID = {
  count: a => fin(a.g) && a.g >= 0,
  predict: a => fin(a.x),
  angle: a => fin(a.a),
  tempo: a => Array.isArray(a.t) && a.t.length >= 1 && a.t.length <= N_TAP && a.t.every(fin),
  split: a => fin(a.x),
};
function normAnswers(arr) {
  return EVENTS.map((ev, i) => {
    const a = Array.isArray(arr) ? arr[i] : null;
    return a && typeof a === 'object' && !Array.isArray(a) && VALID[ev.id](a) ? a : null;
  });
}

/* ---------- chấm điểm ---------- */
const makePuzzle = seed => EVENTS.map(ev => ev.generate(new RNG(`${seed}|${ev.id}`)));
function scoreOf(ev, p, a) {
  if (!a) return 0;
  const e = ev.error(p, a);
  if (!Number.isFinite(e)) return 0;
  return Math.round(100 * Math.exp(-0.5 * (e / ev.sigma) ** 2));
}
function humanOf(ev, p, a) {
  if (!a) return '⏰ hết giờ — chưa trả lời';
  return (a.timeout ? '⏰ tự chốt khi hết giờ · ' : '') + ev.human(p, a);
}
function grade(s) {
  if (s >= 95) return 'THẦN SẦU'; if (s >= 80) return 'XUẤT SẮC'; if (s >= 60) return 'TỐT';
  if (s >= 40) return 'TẠM ỔN'; if (s >= 20) return 'HỤT'; return 'TRƯỢT';
}
function evaluate(seed, rawAnswers) {
  const puzzle = makePuzzle(seed), answers = normAnswers(rawAnswers);
  const scores = EVENTS.map((ev, i) => scoreOf(ev, puzzle[i], answers[i]));
  const sum = scores.reduce((s, v) => s + v, 0);
  return { puzzle, answers, scores, sum, total: Math.round(sum / 5) };
}

/* ---------- đề / ngày ---------- */
const EPOCH = Date.UTC(2026, 10, 1);
function todayStr(d = new Date()) { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
function dayNo(s) { const [y, m, d] = s.split('-').map(Number); return Math.round((Date.UTC(y, m - 1, d) - EPOCH) / 864e5) + 1; }
function seedLabel(seed) {
  if (seed.startsWith('duel-')) return `Đề ${seed.slice(5)}`;
  if (seed.startsWith('daily-')) return `Đề ngày #${dayNo(seed.slice(6))}`;
  return 'Đề luyện tập';
}

/* ---------- link chia sẻ (mã hoá nhẹ để khỏi lộ đáp án khi nhìn lướt) ---------- */
const XK = 0x5a;
function enc(o) {
  const b = new TextEncoder().encode(JSON.stringify(o));
  let s = ''; for (const x of b) s += String.fromCharCode(x ^ XK);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function dec(str) {
  try {
    let s = str.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
    const bin = atob(s), b = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i) ^ XK;
    return JSON.parse(new TextDecoder().decode(b));
  } catch { return null; }
}
const baseUrl = () => location.href.split('#')[0];
const validAnswers = a => Array.isArray(a) && a.length === 5 && a.every(x => x === null || (typeof x === 'object' && !Array.isArray(x)));
function validTimer(tc) {
  if (!tc) return null;
  const sec = parseInt(tc.sec, 10);
  if (!['turn', 'event'].includes(tc.scope) || !Number.isFinite(sec) || sec < 5 || sec > 3600) return null;
  return { scope: tc.scope, sec };
}
const timerText = tc => !tc ? 'Không giới hạn thời gian' : tc.scope === 'turn' ? `⏱ ${tc.sec} giây cho cả lượt` : `⏱ ${tc.sec} giây mỗi thử thách`;
const cleanName = (s, d) => (String(s || '').trim().slice(0, 20) || d);

/* =====================================================================
   ĐỒNG HỒ ĐẾM NGƯỢC
   ===================================================================== */
function startTimer(ms, label, onExpire, total = ms) {
  const bar = $('#timerBar'), num = $('#timerNum'), fill = $('#timerFill');
  $('#timerLabel').textContent = label;
  bar.hidden = false;
  const start = performance.now(), end = start + ms;
  let stopped = false;
  const render = () => {
    const left = Math.max(0, end - performance.now());
    num.textContent = fmtSec(Math.ceil(left / 1000));
    fill.style.width = `${left / total * 100}%`;
    bar.classList.toggle('low', left <= Math.min(10000, total * 0.25));
    if (left <= 0 && !stopped) { stopped = true; clearInterval(id); onExpire(); }
  };
  const id = setInterval(render, 100);
  render();
  return {
    stop() {
      stopped = true; clearInterval(id);
      bar.hidden = true; bar.classList.remove('low');
      return Math.min(ms, performance.now() - start);
    },
  };
}

/* =====================================================================
   CHẠY 1 THỬ THÁCH / 1 LƯỢT
   ===================================================================== */
function runEvent(ev, p, { idx, who, key, reveal, signal, cancel }) {
  return new Promise(resolve => {
    let settled = false, playing = false;
    const done = a => { if (!settled) { settled = true; resolve(a); } };
    // Huỷ cả lượt (vd: trưởng phòng kết thúc trận) => thoát ngay, không vẽ gì thêm
    if (cancel) cancel.addEventListener('abort', () => done(null), { once: true });
    const stageWrap = el('div', { class: 'stage-wrap' });
    const hud = el('div', { class: 'hud' });
    const readyBtn = el('button', { class: 'btn primary big', type: 'button' }, 'Sẵn sàng');
    const readyBox = el('div', { class: 'center' }, readyBtn);
    show(el('section', { class: 'event' },
      el('div', { class: 'event-head' },
        who ? el('span', { class: 'chip', style: `--c:var(--${key})` }, who) : null,
        el('span', { class: 'kicker' }, `THỬ THÁCH ${idx + 1}/5`)),
      el('h2', {}, `${ev.emoji} ${ev.name}`),
      el('p', { class: 'instr' }, ev.instruction(p)),
      readyBox, stageWrap, hud));
    readyBtn.focus();

    // Hết giờ khi còn đang ở màn "Sẵn sàng" => 0 điểm cho thử thách này
    if (signal) signal.addEventListener('abort', () => { if (!playing) done(null); }, { once: true });

    readyBtn.addEventListener('click', async () => {
      if (settled || playing) return;
      playing = true;
      ensureAudio();
      readyBox.remove();
      const st = makeStage();
      stageWrap.append(st.c);
      st.c.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const ans = await ev.play(st, p, hud, signal);
      if (cancel && cancel.aborted) return;
      hud.replaceChildren();
      const c = C();
      if (signal && signal.aborted) {
        st.clear();
        text(st.g, '⏰ HẾT GIỜ', 400, 220, { size: 48, weight: 800, color: c.danger });
        text(st.g, ans ? 'Đã tự chốt theo thao tác hiện tại' : 'Chưa có câu trả lời → 0 điểm', 400, 280, { size: 17, color: c.dim });
        await sleep(1000);
        done(ans);
        return;
      }
      if (reveal) {
        st.clear();
        ev.draw(st.g, p, [{ answer: ans, color: c[key], label: who || 'Bạn' }]);
        const s = scoreOf(ev, p, ans);
        const next = el('button', { class: 'btn primary', type: 'button' }, idx < 4 ? 'Tiếp →' : 'Xem kết quả');
        next.addEventListener('click', () => done(ans));
        hud.append(el('div', { class: 'reveal' },
          el('div', { class: 'big-score' }, s),
          el('div', {}, el('div', { class: 'grade' }, grade(s)), el('div', { class: 'human' }, humanOf(ev, p, ans)))), next);
        next.focus();
      } else {
        st.clear();
        text(st.g, 'Đã chốt ✓', 400, 230, { size: 40, weight: 800, color: c.dim });
        text(st.g, 'Kết quả sẽ hiện khi cả hai hoàn thành', 400, 285, { size: 16, color: c.dim });
        await sleep(650);
        done(ans);
      }
    });
  });
}

/* Chơi 1 lượt 5 thử thách.
   startIdx/prior/remainingMs: chơi tiếp sau khi reload (phòng online).
   cancel: AbortSignal huỷ cả lượt. onAnswer(i, a): gọi ngay khi chốt từng bài. */
async function playRound(seed, {
  who = null, key = 'p1', reveal = true, timer = null,
  startIdx = 0, prior = [], remainingMs = null, cancel = null, onAnswer = null,
} = {}) {
  const puzzle = makePuzzle(seed);
  const answers = prior.slice(0, startIdx);
  while (answers.length < startIdx) answers.push(null);
  const record = (i, a) => { answers.push(a); if (onAnswer) onAnswer(i, a); };
  const total = timer ? timer.sec * 1000 : 0;
  const t0 = performance.now();
  let used = 0, turnTm = null, turnCtl = null, startLeft = total;

  if (timer && timer.scope === 'turn') {
    turnCtl = new AbortController();
    startLeft = remainingMs == null ? total : Math.min(total, remainingMs);
    if (startLeft <= 0) turnCtl.abort();
    else turnTm = startTimer(startLeft, `${who || ''} · thời gian cả lượt`, () => { turnCtl.abort(); toast('⏰ Hết giờ! Lượt kết thúc, đang tính điểm…', 2200); }, total);
  }
  for (let i = startIdx; i < 5; i++) {
    if (cancel && cancel.aborted) break;
    if (turnCtl && turnCtl.signal.aborted) { record(i, null); continue; }
    const sources = [turnCtl && turnCtl.signal, cancel].filter(Boolean);
    let evTm = null;
    if (timer && timer.scope === 'event') {
      const evCtl = new AbortController();
      sources.push(evCtl.signal);
      evTm = startTimer(total, `${who || ''} · thử thách ${i + 1}/5`, () => { evCtl.abort(); toast('⏰ Hết giờ thử thách này!'); });
    }
    const ctl = new AbortController(), fwd = () => ctl.abort();
    sources.forEach(s => (s.aborted ? fwd() : s.addEventListener('abort', fwd, { once: true })));
    const a = await runEvent(EVENTS[i], puzzle[i], { idx: i, who, key, reveal, signal: sources.length ? ctl.signal : null, cancel });
    sources.forEach(s => s.removeEventListener('abort', fwd));
    if (evTm) used += evTm.stop();
    if (cancel && cancel.aborted) break;
    record(i, a);
  }
  if (turnTm) turnTm.stop();
  if (timer && timer.scope === 'turn') used = Math.min(total, (total - startLeft) + (performance.now() - t0));
  else if (!timer) used = performance.now() - t0;
  return { answers, timeMs: Math.round(used), cancelled: !!(cancel && cancel.aborted) };
}

/* =====================================================================
   UI CHUNG
   ===================================================================== */
function radarSvg(series) {
  const cx = 160, cy = 150, R = 105;
  const pt = (i, r) => { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
  const poly = f => [0, 1, 2, 3, 4].map(i => pt(i, f(i)).map(n => n.toFixed(1)).join(',')).join(' ');
  let s = '<svg viewBox="0 0 320 300" class="radar" role="img" aria-label="Biểu đồ radar điểm 5 thử thách">';
  for (const k of [0.25, 0.5, 0.75, 1]) s += `<polygon points="${poly(() => R * k)}" fill="none" stroke="var(--faint)" stroke-width="1.5"/>`;
  for (let i = 0; i < 5; i++) { const [x, y] = pt(i, R); s += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--faint)" stroke-width="1.5"/>`; }
  for (const se of series) s += `<polygon points="${poly(i => Math.max(3, R * se.scores[i] / 100))}" fill="var(--${se.key})" fill-opacity=".2" stroke="var(--${se.key})" stroke-width="2.5" stroke-linejoin="round"/>`;
  EVENTS.forEach((e, i) => { const [x, y] = pt(i, R + 24); s += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="20">${e.emoji}</text>`; });
  const wrap = el('div');
  wrap.innerHTML = s + '</svg>';
  return wrap;
}
function evRows(puzzle, answers, scores, key) {
  return el('div', { class: 'ev-rows' }, EVENTS.map((ev, i) => el('div', { class: 'ev-row' },
    el('span', { style: 'font-size:22px' }, ev.emoji),
    el('div', {},
      el('div', { class: 'name' }, ev.name, ' ', el('span', { class: 'human' }, `· ${humanOf(ev, puzzle[i], answers[i])}`)),
      el('div', { class: 'bar', style: `--c:var(--${key})` }, el('i', { style: `width:${scores[i]}%` }))),
    el('span', { class: 'score' }, scores[i]))));
}
function gate({ kicker, name, key, msg, rule, btn }) {
  return new Promise(resolve => {
    const b = el('button', { class: 'btn primary big', type: 'button' }, btn);
    b.addEventListener('click', () => resolve(), { once: true });
    show(el('section', { class: 'gate', style: `--c:var(--${key})` },
      el('div', { class: 'kicker' }, kicker),
      el('div', { class: 'who' }, name),
      el('p', {}, msg),
      rule ? el('div', { class: 'rule' }, rule) : null,
      b));
    b.focus();
  });
}
function linkBox(url) {
  const inp = el('input', { type: 'text', readonly: true, value: url });
  inp.addEventListener('focus', () => inp.select());
  const btns = [el('button', { class: 'btn small', type: 'button', onclick: () => copy(url, 'Đã copy link') }, 'Copy')];
  if (navigator.share) btns.push(el('button', { class: 'btn small', type: 'button', onclick: () => navigator.share({ url }).catch(() => {}) }, 'Chia sẻ'));
  return el('div', { class: 'linkbox' }, inp, ...btns);
}
const goHome = () => location.assign(location.pathname + location.search);
const homeBtn = () => el('button', { class: 'btn', type: 'button', onclick: goHome }, 'Trang chủ');

/* =====================================================================
   MÀN HÌNH
   ===================================================================== */
function home() {
  $('#topSub').textContent = '';
  const date = todayStr(), saved = store.get(`nl:daily:${date}`);
  show(el('section', { class: 'hero' },
    el('h1', {}, 'NHÃN LỰC'),
    el('div', { class: 'kicker' }, `#${dayNo(date)} · ${new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'numeric' })}`),
    el('div', { class: 'emojis' }, EVENTS.map(e => el('span', { title: e.name }, e.emoji))),
    el('p', { class: 'lead' }, '5 bài test cảm quan siêu nhỏ. 2 phút. 1 điểm số.'),
    el('div', { class: 'actions' },
      el('button', { class: 'btn primary big', type: 'button', onclick: startDaily }, saved ? `Kết quả hôm nay: ${saved.total} điểm` : 'Chơi đề hôm nay'),
      el('button', { class: 'btn big duel', type: 'button', onclick: () => onlineHome() }, '🌐 Phòng online (2–4 máy)'),
      el('button', { class: 'btn big', type: 'button', onclick: () => duelSetup() }, '⚔️ Đấu 2 người (1 máy / gửi link)'),
      el('button', { class: 'btn', type: 'button', onclick: practice }, 'Luyện tập (đề ngẫu nhiên)'))));
}

async function startDaily() {
  const date = todayStr(), seed = `daily-${date}`, key = `nl:daily:${date}`;
  const saved = store.get(key);
  if (saved && validAnswers(saved.answers)) { soloResults(seed, saved.answers, saved.timeMs, { daily: true }); return; }
  $('#topSub').textContent = `#${dayNo(date)}`;
  const { answers, timeMs } = await playRound(seed, { reveal: true });
  store.set(key, { seed, answers, timeMs, total: evaluate(seed, answers).total });
  soloResults(seed, answers, timeMs, { daily: true });
}
async function practice() {
  const seed = `practice-${randCode(8)}`;
  $('#topSub').textContent = 'luyện tập';
  const { answers, timeMs } = await playRound(seed, { reveal: true });
  soloResults(seed, answers, timeMs, {});
}

function soloResults(seed, answers, timeMs, { daily }) {
  const { puzzle, scores, total } = evaluate(seed, answers);
  const shareText = `Nhãn Lực · ${seedLabel(seed)} — ${total}/100\n` + EVENTS.map((e, i) => `${e.emoji} ${scores[i]}`).join('  ');
  const nameInp = el('input', { type: 'text', maxlength: '20', value: (store.get('nl:names') || [])[0] || '', placeholder: 'Tên của bạn' });
  const linkSlot = el('div');
  const mk = el('button', { class: 'btn small', type: 'button' }, 'Tạo link');
  mk.addEventListener('click', () => {
    const n = cleanName(nameInp.value, 'Ẩn danh');
    store.set('nl:names', [n, (store.get('nl:names') || [])[1] || '']);
    linkSlot.replaceChildren(linkBox(`${baseUrl()}#c=${enc({ s: seed, n, a: answers, tm: timeMs, tc: null })}`));
  });
  show(el('section', { class: 'results' },
    el('div', { class: 'total' },
      el('div', { class: 'kicker' }, seedLabel(seed)),
      el('div', { class: 'num' }, total),
      el('div', { class: 'grade' }, grade(total))),
    radarSvg([{ key: 'p1', scores }]),
    evRows(puzzle, answers, scores, 'p1'),
    el('div', { class: 'btns' },
      el('button', { class: 'btn primary', type: 'button', onclick: () => copy(shareText, 'Đã copy kết quả') }, 'Copy kết quả'),
      homeBtn()),
    el('div', { class: 'panel setup', style: 'margin:0 auto;width:100%' },
      el('h2', { style: 'font-size:18px' }, '⚔️ Thách đấu bạn bè bằng đúng đề này'),
      el('p', { class: 'hint' }, 'Bạn bè mở link sẽ chơi cùng đề, xong sẽ thấy bảng so sánh với kết quả của bạn.'),
      el('div', { class: 'row' }, nameInp, mk), linkSlot),
    daily ? el('p', { class: 'hint center' }, 'Đề mới mỗi ngày lúc 0h.') : null));
}

/* ---------- Đấu: cài đặt ---------- */
function duelSetup(prev = {}) {
  $('#topSub').textContent = 'đấu 2 người';
  const names = store.get('nl:names') || [];
  const saved = store.get('nl:duelcfg') || {};
  let mode = prev.mode || saved.mode || 'local';
  const timer = prev.timer !== undefined ? prev.timer : ('timer' in saved ? validTimer(saved.timer) : { scope: 'turn', sec: 90 });
  const editor = configEditor({ cfg: { code: randCode(), timer }, editable: true });

  const n1 = el('input', { type: 'text', maxlength: '20', value: prev.n1 || names[0] || 'Người chơi 1' });
  const n2 = el('input', { type: 'text', maxlength: '20', value: prev.n2 || names[1] || 'Người chơi 2' });
  const n2Field = el('div', { class: 'field' }, el('label', {}, 'Người chơi 2'), n2);
  const mLocal = segBtn('Cùng một máy', 'Lần lượt từng người');
  const mRemote = segBtn('Gửi link', 'Chơi xong gửi link thách đấu');
  const setMode = m => {
    mode = m;
    mLocal.setAttribute('aria-pressed', String(m === 'local'));
    mRemote.setAttribute('aria-pressed', String(m === 'remote'));
    n2Field.hidden = m === 'remote';
  };
  mLocal.onclick = () => setMode('local'); mRemote.onclick = () => setMode('remote');

  const start = el('button', { class: 'btn primary big', type: 'button' }, 'Bắt đầu đấu');
  start.addEventListener('click', () => {
    const v = editor.get();
    if (v.error) { toast(v.error); return; }
    const a = cleanName(n1.value, 'Người chơi 1'), b = cleanName(n2.value, 'Người chơi 2');
    store.set('nl:names', [a, b]);
    store.set('nl:duelcfg', { mode, timer: v.cfg.timer });
    const seed = `duel-${v.cfg.code}`;
    if (mode === 'local') duelLocal(seed, [a, b], v.cfg.timer);
    else duelRemoteHost(seed, a, v.cfg.timer);
  });

  show(el('section', { class: 'panel setup' },
    el('h2', {}, '⚔️ Đấu 2 người'),
    el('p', { class: 'hint' }, 'Hai người chơi đúng cùng một đề (cùng số chấm, cùng quỹ đạo, cùng góc, cùng nhịp, cùng đoạn thẳng) và cùng giới hạn thời gian — so sánh công bằng tuyệt đối. Muốn 2–4 máy chơi cùng lúc: dùng "Phòng online".'),
    el('div', { class: 'field' }, el('span', { class: 'lbl' }, 'Hình thức'), el('div', { class: 'seg' }, mLocal, mRemote)),
    el('div', { class: 'field' }, el('label', {}, 'Người chơi 1'), n1),
    n2Field,
    editor.node,
    el('div', { class: 'btns' }, start, homeBtn())));
  setMode(mode);
}

/* ---------- Bộ chỉnh cấu hình trận (mã đề + đếm ngược), dùng chung ---------- */
const TPRESETS = { turn: [45, 60, 90, 120, 180], event: [10, 15, 20, 30] };
const TDEF = { turn: 90, event: 15 };
const TRULES = {
  none: 'Không đếm giờ. Thời gian chơi vẫn được ghi lại để phân định khi hoà điểm.',
  turn: 'Đồng hồ chạy ngay khi lượt bắt đầu. Hết giờ: lượt tự dừng, thử thách đang làm được chấm theo thao tác hiện tại (nếu có), các thử thách chưa làm = 0 điểm.',
  event: 'Mỗi thử thách đếm ngược riêng, tính từ lúc thử thách hiện ra. Hết giờ: tự chốt theo thao tác hiện tại (chưa làm gì = 0 điểm) rồi chuyển bài tiếp.',
};
function segBtn(label, sub) { return el('button', { type: 'button', 'aria-pressed': 'false' }, label, el('small', {}, sub)); }

const RPRESETS = [0, 1, 3, 5, 7, 10];
function configEditor({ cfg, editable = true, onChange = null, withRounds = false }) {
  let scope = cfg.timer ? cfg.timer.scope : 'none';
  let rounds = Number(cfg.rounds) || 0;
  const code = el('input', { type: 'text', class: 'code', maxlength: '12', value: cfg.code || randCode() });
  const reroll = el('button', { class: 'btn small', type: 'button', title: 'Đề khác' }, '🎲');
  const tNone = segBtn('Không giới hạn', 'Chơi thoải mái');
  const tTurn = segBtn('Cả lượt', 'Tổng thời gian cho 5 thử thách');
  const tEvent = segBtn('Mỗi thử thách', 'Đếm ngược riêng từng bài');
  const secInp = el('input', { type: 'number', min: '5', max: '3600', step: '1', inputmode: 'numeric', value: String(cfg.timer ? cfg.timer.sec : TDEF.turn) });
  const presets = el('div', { class: 'presets' });
  const secBox = el('div', { class: 'field' },
    el('span', { class: 'lbl' }, 'Số giây đếm ngược'), presets,
    el('div', { class: 'sec-input' }, secInp, el('span', { class: 'dim' }, 'giây (tự nhập 5–3600)')));
  const ruleHint = el('p', { class: 'hint' });
  const emit = () => { if (editable && onChange) onChange(); };
  const rPresets = el('div', { class: 'presets' });
  const rInp = el('input', { type: 'number', min: '1', max: '20', step: '1', inputmode: 'numeric', value: rounds ? String(rounds) : '' , placeholder: '–' });
  const rHint = el('p', { class: 'hint' });
  const renderRounds = () => {
    rPresets.replaceChildren(...RPRESETS.map(n => {
      const b = el('button', { type: 'button', 'aria-pressed': String(rounds === n), disabled: !editable }, n ? `${n} ván` : 'Tự do');
      b.onclick = () => { rounds = n; rInp.value = n ? String(n) : ''; renderRounds(); emit(); };
      return b;
    }));
    rHint.textContent = rounds ? `Chơi ${rounds} ván liên tiếp (mỗi ván một đề mới). Hết ${rounds} ván, xếp hạng theo điểm trung bình. Đổi số ván sẽ bắt đầu trận mới.`
      : 'Không giới hạn số ván — bảng lịch sử cộng dồn mọi ván trong phòng.';
  };
  rInp.addEventListener('input', () => {
    const n = parseInt(rInp.value, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 20) { rounds = n; renderRounds(); emit(); }
  });
  const roundsBox = withRounds ? el('div', { class: 'field' }, el('span', { class: 'lbl' }, 'Số ván của trận'), rPresets,
    el('div', { class: 'sec-input' }, rInp, el('span', { class: 'dim' }, 'ván (tự nhập 1–20)')), rHint) : null;
  renderRounds();

  const renderPresets = () => presets.replaceChildren(...(TPRESETS[scope] || []).map(s => {
    const b = el('button', { type: 'button', 'aria-pressed': String(Number(secInp.value) === s), disabled: !editable }, `${s}s`);
    b.onclick = () => { secInp.value = String(s); renderPresets(); emit(); };
    return b;
  }));
  const setScope = (s, byUser) => {
    if (byUser && s !== scope && s !== 'none' && !TPRESETS[s].includes(Number(secInp.value))) secInp.value = String(TDEF[s]);
    scope = s;
    [[tNone, 'none'], [tTurn, 'turn'], [tEvent, 'event']].forEach(([b, v]) => b.setAttribute('aria-pressed', String(v === s)));
    secBox.hidden = s === 'none';
    ruleHint.textContent = TRULES[s];
    renderPresets();
  };
  tNone.onclick = () => { setScope('none', true); emit(); };
  tTurn.onclick = () => { setScope('turn', true); emit(); };
  tEvent.onclick = () => { setScope('event', true); emit(); };
  reroll.onclick = () => { code.value = randCode(); emit(); };
  code.addEventListener('input', emit);
  secInp.addEventListener('input', () => { renderPresets(); emit(); });
  if (!editable) [code, reroll, tNone, tTurn, tEvent, secInp, rInp].forEach(x => { x.disabled = true; });
  setScope(scope, false);

  return {
    node: el('div', { class: 'cfg' },
      el('div', { class: 'field' }, el('label', {}, 'Mã đề'), el('div', { class: 'row' }, code, reroll),
        el('p', { class: 'hint' }, 'Cùng mã = cùng đề. Nhập lại mã cũ để đấu lại đúng đề đó.')),
      el('div', { class: 'field' }, el('span', { class: 'lbl' }, 'Giới hạn thời gian'), el('div', { class: 'seg three' }, tNone, tTurn, tEvent)),
      secBox, ruleHint, roundsBox),
    get() {
      const c = code.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
      if (!c) return { error: 'Nhập mã đề' };
      const extra = withRounds ? { rounds } : {};
      if (scope === 'none') return { cfg: { code: c, timer: null, ...extra } };
      const sec = parseInt(secInp.value, 10);
      if (!Number.isFinite(sec) || sec < 5 || sec > 3600) return { error: 'Số giây phải từ 5 đến 3600' };
      return { cfg: { code: c, timer: { scope, sec }, ...extra } };
    },
    set(c) {
      code.value = c.code || '';
      if (c.timer) secInp.value = String(c.timer.sec);
      setScope(c.timer ? c.timer.scope : 'none', false);
      rounds = Number(c.rounds) || 0;
      if (document.activeElement !== rInp) rInp.value = rounds ? String(rounds) : '';
      renderRounds();
    },
  };
}

/* ---------- Đấu cùng máy ---------- */
async function duelLocal(seed, names, timer) {
  const [a, b] = names;
  $('#topSub').textContent = seedLabel(seed);
  await gate({
    kicker: 'Lượt 1/2', name: a, key: 'p1', rule: timerText(timer),
    msg: `${b} vui lòng quay mặt đi 🙈 — không nhìn màn hình khi ${a} đang chơi.`, btn: `Bắt đầu — ${a}`,
  });
  const ra = await playRound(seed, { who: a, key: 'p1', reveal: false, timer });
  await gate({
    kicker: 'Lượt 2/2', name: b, key: 'p2', rule: timerText(timer),
    msg: `${a} đã xong. Đưa máy cho ${b}. Kết quả của ${a} được giấu đến cuối.`, btn: `Bắt đầu — ${b}`,
  });
  const rb = await playRound(seed, { who: b, key: 'p2', reveal: false, timer });
  compareScreen(seed, timer, [{ name: a, ...ra }, { name: b, ...rb }], { rematch: { names, timer } });
}

/* ---------- Đấu khác máy ---------- */
async function duelRemoteHost(seed, name, timer) {
  $('#topSub').textContent = seedLabel(seed);
  await gate({ kicker: 'Người thách đấu', name, key: 'p1', rule: timerText(timer), msg: 'Bạn chơi trước. Xong sẽ có link gửi cho đối thủ — họ chơi đúng đề này với cùng giới hạn thời gian.', btn: 'Bắt đầu' });
  const { answers, timeMs } = await playRound(seed, { who: name, key: 'p1', reveal: false, timer });
  const { puzzle, scores, total } = evaluate(seed, answers);
  const url = `${baseUrl()}#c=${enc({ s: seed, n: name, a: answers, tm: timeMs, tc: timer })}`;
  show(el('section', { class: 'results' },
    el('div', { class: 'total' }, el('div', { class: 'kicker' }, `${seedLabel(seed)} · ${name}`), el('div', { class: 'num' }, total), el('div', { class: 'grade' }, `${grade(total)} · ⏱ ${fmtMs(timeMs)}`)),
    el('div', { class: 'panel setup', style: 'margin:0 auto;width:100%' },
      el('h2', { style: 'font-size:18px' }, '📨 Gửi link này cho đối thủ'),
      el('p', { class: 'hint' }, `${timerText(timer)}. Khi đối thủ chơi xong, họ thấy bảng so sánh và có link kết quả để gửi lại cho bạn.`),
      linkBox(url)),
    radarSvg([{ key: 'p1', scores }]),
    evRows(puzzle, answers, scores, 'p1'),
    el('div', { class: 'btns' }, homeBtn())));
}

function challengeLanding(d) {
  const seed = d.s, timer = validTimer(d.tc), rival = cleanName(d.n, 'Đối thủ');
  $('#topSub').textContent = seedLabel(seed);
  const nameInp = el('input', { type: 'text', maxlength: '20', value: (store.get('nl:names') || [])[0] || '', placeholder: 'Tên của bạn' });
  const go = el('button', { class: 'btn primary big', type: 'button' }, 'Nhận lời thách đấu');
  go.addEventListener('click', async () => {
    const me = cleanName(nameInp.value, 'Người chơi 2');
    store.set('nl:names', [me, rival]);
    const r = await playRound(seed, { who: me, key: 'p2', reveal: false, timer });
    const players = [{ name: rival, answers: d.a, timeMs: Number(d.tm) || 0 }, { name: me, ...r }];
    history.replaceState(null, '', `#r=${enc({ s: seed, tc: timer, p: players.map(x => ({ n: x.name, a: x.answers, tm: x.timeMs })) })}`);
    compareScreen(seed, timer, players, { remote: true });
  }, { once: true });
  show(el('section', { class: 'gate', style: '--c:var(--p1)' },
    el('div', { class: 'kicker' }, `${seedLabel(seed)} · lời thách đấu`),
    el('div', { class: 'who' }, `${rival} ⚔️ bạn`),
    el('p', {}, `${rival} đã chơi xong đề này. Bạn sẽ chơi đúng đề đó; kết quả của ${rival} được giấu đến khi bạn xong.`),
    el('div', { class: 'rule' }, timerText(timer)),
    el('div', { class: 'field', style: 'width:100%;max-width:320px' }, el('label', {}, 'Tên của bạn'), nameInp),
    go));
}

/* ---------- Bảng so sánh ---------- */
function rankPlayers(seed, players) {
  const res = players.map((pl, i) => ({
    name: pl.name, timeMs: pl.timeMs || 0, key: KEYS.includes(pl.key) ? pl.key : KEYS[i],
    ...evaluate(seed, pl.answers), wins: 0,
  }));
  EVENTS.forEach((_, i) => {
    const best = Math.max(...res.map(r => r.scores[i]));
    const top = res.filter(r => r.scores[i] === best);
    if (best > 0 && top.length === 1) top[0].wins++;
  });
  // Xếp hạng: tổng điểm > số bài thắng > thời gian (lệch < 0.1s coi như bằng)
  const cmp = (a, b) => {
    if (a.sum !== b.sum) return b.sum - a.sum;
    if (a.wins !== b.wins) return b.wins - a.wins;
    if (a.timeMs && b.timeMs && Math.abs(a.timeMs - b.timeMs) >= 100) return a.timeMs - b.timeMs;
    return 0;
  };
  const sorted = [...res].sort(cmp);
  sorted.forEach((r, i) => { r.rank = i > 0 && cmp(sorted[i - 1], r) === 0 ? sorted[i - 1].rank : i + 1; });
  return { res, sorted };
}

function compareScreen(seed, timer, players, opts = {}) {
  $('#topSub').textContent = opts.sub || seedLabel(seed);
  const { res, sorted } = rankPlayers(seed, players);
  const puzzle = res[0].puzzle, c = C();
  const firsts = sorted.filter(r => r.rank === 1);
  let verdict;
  if (firsts.length > 1) verdict = `🤝 Hoà: ${firsts.map(r => r.name).join(', ')}`;
  else {
    const w = firsts[0], s = sorted[1];
    const how = w.sum !== s.sum ? `hơn ${s.name} ${r1((w.sum - s.sum) / 5)} điểm`
      : w.wins !== s.wins ? `bằng điểm ${s.name}, thắng nhiều thử thách hơn` : `bằng điểm ${s.name}, hoàn thành nhanh hơn`;
    verdict = `🏆 ${w.name} thắng — ${how}`;
  }
  const MEDAL = ['🥇', '🥈', '🥉', '4️⃣'];

  const card = pl => {
    const timedOut = pl.answers.filter(a => !a || a.timeout).length;
    return el('div', { class: `vs-card${pl.rank === 1 ? ' win' : ''}`, style: `--c:var(--${pl.key})` },
      pl.rank === 1 ? el('span', { class: 'crown' }, '👑') : null,
      el('div', { class: 'rank' }, `${MEDAL[pl.rank - 1]} HẠNG ${pl.rank}`),
      el('div', { class: 'nm' }, pl.name),
      el('div', { class: 'num' }, pl.total),
      el('div', { class: 'meta' }, `${grade(pl.total)} · thắng ${pl.wins} bài`),
      el('div', { class: 'meta' }, `⏱ ${pl.timeMs ? fmtMs(pl.timeMs) : '—'}${timer && timer.scope === 'turn' ? ` / ${timer.sec}s` : ''}`),
      timedOut ? el('div', { class: 'meta' }, `⏰ ${timedOut} bài không kịp nộp`) : null);
  };

  const cards = EVENTS.map((ev, i) => {
    const p = puzzle[i], st = makeStage();
    ev.draw(st.g, p, res.map(pl => ({ answer: pl.answers[i], color: c[pl.key], label: pl.name })));
    const sc = res.map(r => r.scores[i]), best = Math.max(...sc);
    const top = res.filter(r => r.scores[i] === best);
    const rest = sc.filter(v => v !== best);
    const tag = top.length > 1 || best === 0
      ? el('span', { class: 'tag tie' }, 'Hoà')
      : el('span', { class: 'tag', style: `--c:var(--${top[0].key})` }, `${top[0].name} +${best - (rest.length ? Math.max(...rest) : 0)}`);
    return el('div', { class: 'panel cmp-card' },
      el('h3', {}, el('span', {}, `${ev.emoji} ${ev.name}`), tag),
      el('p', { class: 'target' }, `Đáp án: ${ev.target(p)}`),
      st.c,
      ...res.map(pl => el('div', { class: 'cmp-row', style: `--c:var(--${pl.key})` },
        el('span', { class: 'chip' }, pl.name),
        el('div', {}, el('div', { class: 'human' }, humanOf(ev, p, pl.answers[i])), el('div', { class: 'bar' }, el('i', { style: `width:${pl.scores[i]}%` }))),
        el('span', { class: 'score' }, pl.scores[i]))));
  });

  const summary = `Nhãn Lực ⚔️ ${seedLabel(seed)} · ${timerText(timer)}\n`
    + sorted.map(r => `${MEDAL[r.rank - 1]} ${r.name} ${r.total}`).join('  ') + '\n'
    + EVENTS.map((e, i) => `${e.emoji} ${res.map(r => r.scores[i]).join('–')}`).join('  ') + `\n${verdict}`;
  const resultUrl = `${baseUrl()}#r=${enc({ s: seed, tc: timer, p: res.map(x => ({ n: x.name, a: x.answers, tm: x.timeMs, k: x.key })) })}`;

  const btns = [...(opts.extra || []),
    el('button', { class: 'btn', type: 'button', onclick: () => copy(summary, 'Đã copy tóm tắt') }, 'Copy tóm tắt'),
    el('button', { class: 'btn', type: 'button', onclick: () => copy(resultUrl, 'Đã copy link kết quả') }, 'Copy link kết quả'),
  ];
  if (opts.rematch) {
    btns.push(el('button', {
      class: 'btn', type: 'button',
      onclick: () => { const [n1, n2] = opts.rematch.names; duelSetup({ n1, n2, timer: opts.rematch.timer, mode: 'local' }); },
    }, 'Đấu lại (đề mới)'));
  }
  if (!opts.noHome) btns.push(homeBtn());

  show(el('section', { class: 'results' },
    el('div', { class: 'center' }, el('div', { class: 'kicker' }, `KẾT QUẢ ĐỐI ĐẦU · ${seedLabel(seed)}`), el('div', { class: 'hint' }, timerText(timer))),
    el('div', { class: 'podium' }, sorted.map(card)),
    el('p', { class: 'verdict' }, verdict),
    el('div', { class: 'legend' }, res.map(pl => el('span', { style: `--c:var(--${pl.key})` }, pl.name)), el('span', { style: '--c:var(--truth)' }, 'Đáp án đúng')),
    radarSvg(res.map(pl => ({ key: pl.key, scores: pl.scores }))),
    el('div', { class: 'cmp-grid' }, cards),
    opts.remote ? el('p', { class: 'hint center' }, 'Gửi "link kết quả" cho đối thủ để họ xem bảng so sánh này.') : null,
    el('div', { class: 'btns' }, btns)));
}

/* =====================================================================
   PHÒNG ONLINE — 2–4 máy, cần chạy server.py
   Server giữ trạng thái phòng và đẩy xuống mọi máy qua Server-Sent Events.
   Chỉ trưởng phòng sửa được cài đặt (server kiểm tra token).
   ===================================================================== */
const ON = { es: null, id: null, creds: null, phase: 'idle', round: 0, doneRound: 0, doneHost: null, offset: 0, ctl: null, view: null };
const isServed = () => location.protocol === 'http:' || location.protocol === 'https:';
const credKey = id => `nl:room:${id}`;
const serverNow = () => Date.now() + ON.offset;

async function api(path, body) {
  let r;
  try {
    r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  } catch { throw new Error('Không kết nối được server'); }
  let j = {};
  try { j = await r.json(); } catch { /* ignore */ }
  if (r.status === 501 || r.status === 405) throw new Error('Server đang chạy không hỗ trợ phòng online. Hãy tắt nó và chạy: python3 server.py');
  if (!r.ok) throw new Error(j.error || `Lỗi ${r.status}`);
  return j;
}
/* Có đúng server.py không? (python3 -m http.server chỉ phục vụ file tĩnh) */
async function hasRoomServer() {
  if (!isServed()) return false;
  try {
    const r = await fetch('/api/ping', { cache: 'no-store' });
    return r.ok && (await r.json()).app === 'nhanluc';
  } catch { return false; }
}
const roomApi = (action, extra = {}) => api(`/api/rooms/${ON.id}/${action}`, { token: ON.creds.token, ...extra });
async function retry(fn, n = 3) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) { if (i >= n - 1) throw e; await sleep(600 * (i + 1)); }
  }
}

async function onlineHome(prefill = '') {
  $('#topSub').textContent = 'phòng online';
  if (!(await hasRoomServer())) {
    show(el('section', { class: 'panel setup' },
      el('h2', {}, '🌐 Phòng online'),
      el('p', {}, isServed()
        ? 'Trang đang được mở bằng server tĩnh (vd: python3 -m http.server) nên không tạo được phòng. Tắt server đó (Ctrl+C) rồi chạy trong thư mục game:'
        : 'Chế độ này cần server đồng bộ. Trong thư mục game, chạy:'),
      el('pre', { class: 'cmd' }, 'python3 server.py'),
      el('p', { class: 'hint' }, 'Sau đó mở http://localhost:8000 — máy khác cùng mạng mở http://<IP-máy-chạy-server>:8000 (server in sẵn địa chỉ này).'),
      el('div', { class: 'btns' }, homeBtn())));
    return;
  }
  const nameInp = el('input', { type: 'text', maxlength: '20', value: (store.get('nl:names') || [])[0] || '', placeholder: 'Tên của bạn' });
  const idInp = el('input', { type: 'text', class: 'code', maxlength: '5', value: prefill, placeholder: 'VD: K7Q2M' });
  const getName = () => {
    const n = nameInp.value.trim().slice(0, 20);
    if (!n) { nameInp.focus(); throw new Error('Nhập tên của bạn'); }
    store.set('nl:names', [n, (store.get('nl:names') || [])[1] || '']);
    return n;
  };
  const busy = async (btn, fn) => {
    btn.disabled = true;
    try { await fn(); } catch (e) { toast(e.message, 2600); } finally { btn.disabled = false; }
  };
  const createBtn = el('button', { class: 'btn primary', type: 'button' }, '＋ Tạo phòng mới');
  createBtn.onclick = () => busy(createBtn, async () => {
    const r = await api('/api/rooms', { name: getName() });
    store.set(credKey(r.roomId), { playerId: r.playerId, token: r.token });
    enterRoom(r.roomId);
  });
  const joinBtn = el('button', { class: 'btn', type: 'button' }, 'Vào phòng');
  joinBtn.onclick = () => busy(joinBtn, async () => {
    const id = idInp.value.trim().toUpperCase();
    if (!/^[A-Z0-9]{5}$/.test(id)) { idInp.focus(); throw new Error('ID phòng gồm 5 ký tự'); }
    const saved = store.get(credKey(id));
    const r = await api(`/api/rooms/${id}/join`, { name: getName(), token: saved ? saved.token : undefined });
    store.set(credKey(id), { playerId: r.playerId, token: r.token });
    enterRoom(id);
  });
  show(el('section', { class: 'panel setup' },
    el('h2', {}, '🌐 Phòng online'),
    el('p', { class: 'hint' }, 'Tối đa 4 máy chơi cùng một phòng, cùng đề, cùng lúc. Người tạo phòng là trưởng phòng: chỉnh cài đặt (tự đồng bộ tới mọi máy) và bấm bắt đầu.'),
    el('div', { class: 'field' }, el('label', {}, 'Tên của bạn'), nameInp),
    el('div', { class: 'btns', style: 'justify-content:flex-start' }, createBtn),
    el('div', { class: 'field' }, el('label', {}, 'Hoặc vào phòng có sẵn'), el('div', { class: 'row' }, idInp, joinBtn)),
    el('div', { class: 'btns' }, homeBtn())));
  (prefill ? nameInp.value ? joinBtn : nameInp : nameInp).focus();
}

function enterRoom(id) {
  ON.id = id; ON.creds = store.get(credKey(id)); ON.phase = 'idle';
  history.replaceState(null, '', `#room=${id}`);
  const slowHint = el('div', { class: 'panel', style: 'text-align:left', hidden: true },
    el('strong', {}, 'Kết nối lâu bất thường?'),
    el('p', { class: 'hint' }, `Kiểm tra máy chạy server còn bật và cửa sổ server không bị treo (Windows: click vào cửa sổ console sẽ làm server dừng — bấm Esc). Nếu mở bằng địa chỉ IP (vd ${location.host}), firewall của máy chạy server có thể đang chặn Python.`));
  show(el('section', { class: 'gate' }, el('div', { class: 'kicker' }, 'Đang kết nối phòng…'), el('div', { class: 'room-id' }, id), slowHint));
  clearTimeout(ON.slowTimer);
  ON.slowTimer = setTimeout(() => { if (ON.phase === 'idle') slowHint.hidden = false; }, 4000);
  if (ON.es) ON.es.close();
  // Cloudflare Quick Tunnel (và vài proxy/antivirus) không chuyển Server-Sent Events
  // => dùng long-poll. Còn lại thử SSE trước, 3s không có dữ liệu thì tự chuyển sang long-poll.
  if (ON.usePoll || /\.trycloudflare\.com$/i.test(location.hostname)) { ON.es = pollRoom(id, ON.creds.token); return; }
  const es = new EventSource(`/api/rooms/${id}/events?token=${encodeURIComponent(ON.creds.token)}`);
  let got = false;
  const handle = { close() { clearTimeout(fallback); es.close(); } };
  const fallback = setTimeout(() => {
    if (got || ON.es !== handle || ON.phase === 'gone') return;
    ON.usePoll = true;
    es.close();
    ON.es = pollRoom(id, ON.creds.token);
  }, 3000);
  ON.es = handle;
  es.onmessage = e => { got = true; let s; try { s = JSON.parse(e.data); } catch { return; } onSnapshot(s); };
  es.onerror = () => {
    if (ON.phase === 'gone' || ON.unloading) return;
    // Server trả 403/404 => EventSource đóng hẳn; lỗi mạng => tự kết nối lại.
    // Giữ token: có thể chỉ là server khởi động lại, người chơi bấm "Thử lại".
    if (es.readyState === EventSource.CLOSED) roomGone('Không vào được phòng — phòng đã đóng, server đã khởi động lại, hoặc bạn không còn trong phòng.', false);
    else setConn(false);
  };
}
// Long-poll: mỗi request chờ server tới khi phòng đổi (version khác v) hoặc ~20s.
function pollRoom(id, token) {
  const ctl = new AbortController();
  let v = -1, stopped = false;
  (async () => {
    while (!stopped) {
      try {
        const r = await fetch(`/api/rooms/${id}/poll?token=${encodeURIComponent(token)}&v=${v}`, { cache: 'no-store', signal: ctl.signal });
        if (stopped) return;
        if (r.status === 403 || r.status === 404) {
          const j = await r.json().catch(() => ({}));
          if (!stopped && !ON.unloading) roomGone(j.error || 'Không vào được phòng.', r.status === 403);
          return;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const s = await r.json();
        if (stopped) return;
        if (s.v !== v) { v = s.v; onSnapshot(s); } else setConn(true);
      } catch {
        if (stopped || ON.unloading) return;
        setConn(false);
        await new Promise(res => setTimeout(res, 1500));
      }
    }
  })();
  return { close() { stopped = true; ctl.abort(); } };
}
// Reload/đóng tab làm EventSource báo lỗi — không được coi là bị mời ra
window.addEventListener('pagehide', () => { ON.unloading = true; });
function setConn(ok) { $('#topSub').textContent = `Phòng ${ON.id} · ${ok ? '● đã kết nối' : '○ mất kết nối, đang thử lại…'}`; }

function roomGone(msg, forget = true) {
  const id = ON.id;
  ON.phase = 'gone';
  if (ON.es) ON.es.close();
  if (ON.ctl) ON.ctl.abort();
  if (id && forget) store.del(credKey(id));
  $('#topSub').textContent = '';
  const retryBtn = !forget && id ? el('button', { class: 'btn primary', type: 'button', onclick: () => location.reload() }, 'Thử lại') : null;
  if (forget) history.replaceState(null, '', location.pathname + location.search);
  show(el('section', { class: 'gate' }, el('div', { class: 'kicker' }, 'Phòng online'), el('p', {}, msg),
    el('div', { class: 'btns' }, retryBtn,
      el('button', { class: retryBtn ? 'btn' : 'btn primary', type: 'button', onclick: () => { if (id) store.del(credKey(id)); history.replaceState(null, '', location.pathname); onlineHome(); } }, 'Vào / tạo phòng khác'),
      homeBtn())));
}
async function leaveRoom() {
  ON.phase = 'gone';
  if (ON.es) ON.es.close();
  if (ON.ctl) ON.ctl.abort();
  try { await roomApi('leave'); } catch { /* phòng có thể đã đóng */ }
  store.del(credKey(ON.id));
  goHome();
}
const leaveBtn = () => el('button', { class: 'btn', type: 'button', onclick: () => { if (confirm('Rời phòng?')) leaveRoom(); } }, 'Rời phòng');

function onSnapshot(s) {
  if (ON.phase === 'gone') return;
  if (s.gone) { roomGone(s.reason === 'kicked' ? 'Bạn đã bị trưởng phòng mời ra khỏi phòng.' : 'Phòng đã đóng.'); return; }
  const me = s.players.find(p => p.id === s.you);
  if (!me) { roomGone('Bạn không còn trong phòng.'); return; }
  ON.offset = s.serverNow - Date.now();
  setConn(true);
  if (s.state === 'lobby') {
    if (ON.phase !== 'lobby') { if (ON.ctl) ON.ctl.abort(); ON.phase = 'lobby'; renderLobby(s, me); }
    else updateLobby(s, me);
  } else if (s.state === 'playing') {
    if (me.done) {
      if (ON.phase !== 'waiting') { ON.phase = 'waiting'; renderWaiting(s, me); } else updateWaiting(s, me);
    } else if (ON.phase !== 'playing' || ON.round !== s.round) {
      ON.phase = 'playing'; ON.round = s.round;
      startOnlinePlay(s, me);
    }
  } else if (s.state === 'done') {
    if (ON.phase !== 'done' || ON.doneRound !== s.round || ON.doneHost !== s.hostId) {
      if (ON.ctl) ON.ctl.abort();
      ON.phase = 'done'; ON.doneRound = s.round; ON.doneHost = s.hostId;
      renderOnlineResults(s, me);
    }
  }
}

function playerRows(s, me, { kick = false, progress = false } = {}) {
  const rows = s.players.map(p => el('div', { class: 'prow', style: `--c:var(--${p.color})` },
    el('span', { class: `cdot${p.online ? ' on' : ''}`, title: p.online ? 'Đang kết nối' : 'Mất kết nối' }),
    el('span', { class: 'chip' }, p.name),
    el('span', { class: 'who-tag' }, [p.id === s.hostId ? '👑 trưởng phòng' : '', p.id === me.id ? '(bạn)' : ''].filter(Boolean).join(' ')),
    progress ? el('span', { class: 'prog' }, p.done ? '✓ xong' : `${p.progress}/5`) : null,
    kick && p.id !== me.id ? el('button', {
      class: 'btn small', type: 'button',
      onclick: () => { if (confirm(`Mời ${p.name} ra khỏi phòng?`)) roomApi('kick', { playerId: p.id }).catch(e => toast(e.message)); },
    }, 'Mời ra') : null));
  if (!progress) for (let i = s.players.length; i < 4; i++) rows.push(el('div', { class: 'prow empty' }, 'Chỗ trống — gửi ID phòng cho bạn bè'));
  return rows;
}

function renderLobby(s, me) {
  const isHost = s.hostId === me.id;
  const plist = el('div', { class: 'plist' });
  const count = el('span', { class: 'kicker' });
  let pushTimer = null;
  const pushConfig = () => {
    const v = editor.get();
    if (v.error) { toast(v.error); return Promise.resolve(false); }
    return roomApi('config', { config: v.cfg }).then(() => true, e => { toast(e.message); return false; });
  };
  const editor = configEditor({
    cfg: s.config, editable: isHost, withRounds: true,
    onChange: () => { clearTimeout(pushTimer); pushTimer = setTimeout(pushConfig, 350); },
  });
  const startBtn = el('button', { class: 'btn primary big', type: 'button' }, 'Bắt đầu');
  startBtn.addEventListener('click', async () => {
    clearTimeout(pushTimer);
    startBtn.disabled = true;
    try {
      if (await pushConfig()) await roomApi('start');
    } catch (e) { toast(e.message); } finally { startBtn.disabled = false; }
  });
  const histBox = el('div', { class: 'hist-box' });
  const seriesNote = el('div', { class: 'series-note' });
  ON.view = { isHost, plist, count, editor, startBtn, histBox, seriesNote, histKey: null };
  show(el('section', { class: 'lobby' }, seriesNote,
    el('div', { class: 'center' }, el('div', { class: 'kicker' }, 'ID PHÒNG'), el('div', { class: 'room-id' }, s.id)),
    linkBox(`${baseUrl()}#room=${s.id}`),
    el('div', { class: 'panel' }, el('div', { class: 'row', style: 'justify-content:space-between;margin-bottom:10px' }, el('strong', {}, 'Người chơi'), count), plist),
    el('div', { class: 'panel cfg' },
      el('strong', {}, 'Cài đặt trận'),
      el('div', { class: 'lock-note' }, isHost ? '👑 Bạn là trưởng phòng — mọi thay đổi tự đồng bộ tới các máy khác.' : '🔒 Chỉ trưởng phòng được chỉnh. Cài đặt tự cập nhật theo trưởng phòng.'),
      editor.node),
    el('div', { class: 'btns' }, isHost ? startBtn : el('p', { class: 'hint' }, '⏳ Chờ trưởng phòng bắt đầu…'), leaveBtn()),
    histBox));
  updateLobby(s, me);
}
function updateLobby(s, me) {
  const v = ON.view, isHost = s.hostId === me.id;
  if (!v || isHost !== v.isHost) { renderLobby(s, me); return; } // đổi trưởng phòng => dựng lại
  v.plist.replaceChildren(...playerRows(s, me, { kick: isHost }));
  v.count.textContent = `${s.players.length}/4 người`;
  if (!isHost) v.editor.set(s.config); // máy khách luôn hiển thị đúng cài đặt của trưởng phòng
  const sr = seriesInfo(s);
  v.seriesNote.textContent = sr.total ? `⚔️ Trận ${sr.total} ván · sắp chơi ván ${sr.played + 1}/${sr.total}` : '';
  v.seriesNote.hidden = !sr.total;
  const hk = `${(s.history || []).length}:${s.config.rounds}`;
  if (v.histKey !== hk) { v.histKey = hk; v.histBox.replaceChildren(...[historyPanel(s)].filter(Boolean)); }
  if (isHost) {
    const ok = s.players.length >= 2;
    v.startBtn.disabled = !ok;
    const label = sr.total ? `▶ Bắt đầu ván ${sr.played + 1}/${sr.total}` : '▶ Bắt đầu';
    v.startBtn.textContent = ok ? `${label} (${s.players.length} người)` : 'Cần ít nhất 2 người';
  }
}

function syncCountdown(s, signal) {
  return new Promise(resolve => {
    const num = el('div', { class: 'big-count' });
    show(el('section', { class: 'gate' },
      el('div', { class: 'kicker' }, `Phòng ${s.id} · ${seedLabel(`duel-${s.config.code}`)}`),
      el('p', {}, 'Cả phòng bắt đầu sau'), num,
      el('div', { class: 'rule' }, timerText(validTimer(s.config.timer))),
      el('div', { class: 'plist', style: 'width:100%' }, playerRows(s, s.players.find(p => p.id === s.you), { progress: true }))));
    const id = setInterval(tick, 100);
    function tick() {
      const left = s.startAt - serverNow();
      if (signal.aborted || left <= 0) { clearInterval(id); resolve(); return; }
      num.textContent = String(Math.ceil(left / 1000));
    }
    tick();
  });
}

async function startOnlinePlay(s, me) {
  if (ON.ctl) ON.ctl.abort();
  const ctl = new AbortController();
  ON.ctl = ctl;
  const seed = `duel-${s.config.code}`, timer = validTimer(s.config.timer);
  const prior = Array.isArray(me.answers) ? me.answers : [];
  const startIdx = Math.min(5, prior.length);
  if (s.startAt - serverNow() > 0) await syncCountdown(s, ctl.signal);
  else if (startIdx > 0) toast(`Chơi tiếp từ thử thách ${startIdx + 1}/5`);
  if (ctl.signal.aborted) return;

  const remainingMs = timer && timer.scope === 'turn' ? timer.sec * 1000 - (serverNow() - s.startAt) : null;
  let chain = Promise.resolve();
  const send = (i, a) => { chain = chain.then(() => retry(() => roomApi('answer', { idx: i, answer: a }))).catch(e => console.warn(e)); };
  const r = await playRound(seed, {
    who: me.name, key: me.color, reveal: false, timer,
    startIdx, prior, remainingMs, cancel: ctl.signal, onAnswer: send,
  });
  if (r.cancelled || ctl.signal.aborted) return;
  show(el('section', { class: 'gate' }, el('div', { class: 'kicker' }, 'Đang nộp bài…')));
  await chain;
  // Mọi máy bắt đầu cùng lúc (startAt) => thời gian tính từ mốc chung, công bằng
  let timeMs = Math.max(0, serverNow() - s.startAt);
  if (timer && timer.scope === 'turn') timeMs = Math.min(timeMs, timer.sec * 1000);
  try { await retry(() => roomApi('finish', { timeMs: Math.round(timeMs) })); } catch (e) { toast(e.message); }
}

function renderWaiting(s, me) {
  const isHost = s.hostId === me.id, plist = el('div', { class: 'plist', style: 'width:100%' });
  ON.view = { isHost, plist };
  const force = el('button', { class: 'btn', type: 'button' }, '⏹ Kết thúc ngay');
  force.onclick = () => {
    if (confirm('Kết thúc trận ngay? Các bài chưa nộp của người chơi chưa xong sẽ = 0 điểm.')) roomApi('force').catch(e => toast(e.message));
  };
  show(el('section', { class: 'gate' },
    el('div', { class: 'kicker' }, `Phòng ${s.id}`),
    el('div', { class: 'who', style: `--c:var(--${me.color})` }, 'Đã nộp bài ✓'),
    el('p', {}, 'Đang chờ các người chơi khác… Kết quả hiện khi tất cả xong.'),
    plist,
    el('div', { class: 'btns' }, isHost ? force : null, isHost ? restartBtn() : null, leaveBtn())));
  updateWaiting(s, me);
}
function updateWaiting(s, me) {
  if (!ON.view || (s.hostId === me.id) !== ON.view.isHost) { renderWaiting(s, me); return; }
  ON.view.plist.replaceChildren(...playerRows(s, me, { progress: true }));
}

function renderOnlineResults(s, me) {
  ON.view = null;
  const isHost = s.hostId === me.id;
  const players = s.players.map(p => ({ name: p.name, key: p.color, answers: p.answers, timeMs: p.timeMs || 0 }));
  const sr = seriesInfo(s);
  const again = el('button', { class: 'btn primary', type: 'button' },
    !sr.total ? '▶ Ván mới (đề mới)' : sr.over ? '▶ Trận mới' : `▶ Ván tiếp theo (${sr.played + 1}/${sr.total})`);
  again.onclick = () => roomApi('reset').catch(e => toast(e.message));
  const waitTxt = !sr.total ? '⏳ Chờ trưởng phòng mở ván mới…' : sr.over ? '⏳ Chờ trưởng phòng mở trận mới…' : `⏳ Chờ trưởng phòng mở ván ${sr.played + 1}/${sr.total}…`;
  compareScreen(`duel-${s.config.code}`, validTimer(s.config.timer), players, {
    noHome: true, sub: `Phòng ${s.id} · ● đã kết nối`,
    extra: [isHost ? again : el('span', { class: 'hint', style: 'align-self:center' }, waitTxt), leaveBtn()],
  });
  if (sr.total) {
    const top = roomStats(s.history || [])[0];
    app.prepend(el('div', { class: `series-note${sr.over ? ' final' : ''}` }, sr.over
      ? `🏆 Kết thúc trận ${sr.total} ván — vô địch: ${top ? `${top.name} (TB ${top.avg.toFixed(1)})` : '—'}`
      : `⚔️ Trận ${sr.total} ván · xong ván ${sr.played}/${sr.total}`));
  }
  const hp = historyPanel(s);
  if (hp) app.append(hp);
}

/* Trưởng phòng: xoá lịch sử + huỷ ván đang chơi, cả phòng về phòng chờ để đấu lại từ đầu */
function restartBtn() {
  const b = el('button', { class: 'btn', type: 'button' }, '↺ Đấu lại từ đầu');
  b.onclick = () => {
    if (!confirm('Xoá toàn bộ lịch sử và điểm trung bình của phòng, đưa mọi người về phòng chờ để đấu lại từ đầu?')) return;
    b.disabled = true;
    roomApi('restart').then(() => toast('Đã xoá lịch sử — đấu lại từ đầu'), e => { toast(e.message); b.disabled = false; });
  };
  return b;
}

/* ---------- lịch sử phòng: điểm từng ván + điểm trung bình mỗi người ---------- */
function seriesInfo(s) {
  const total = Number(s.config && s.config.rounds) || 0, played = (s.history || []).length;
  return { total, played, over: total > 0 && played >= total };
}
const SHAPES = { p1: 'circle', p2: 'square', p3: 'triangle', p4: 'diamond' };
const escXml = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function markerSvg(shape, x, y, r, color) {
  const ring = 'stroke="var(--panel)" stroke-width="2"';
  if (shape === 'square') return `<rect x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" rx="1.5" fill="${color}" ${ring}/>`;
  if (shape === 'triangle') return `<path d="M${x} ${y - r * 1.2}L${x + r * 1.15} ${y + r * .85}L${x - r * 1.15} ${y + r * .85}Z" fill="${color}" ${ring}/>`;
  if (shape === 'diamond') return `<path d="M${x} ${y - r * 1.3}L${x + r * 1.3} ${y}L${x} ${y + r * 1.3}L${x - r * 1.3} ${y}Z" fill="${color}" ${ring}/>`;
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" ${ring}/>`;
}
function roomStats(history) {
  const byId = new Map();
  history.forEach((h, ri) => h.players.forEach(p => {
    const total = evaluate(`duel-${h.code}`, p.answers).total;
    if (!byId.has(p.id)) byId.set(p.id, { id: p.id, name: p.name, color: p.color, pts: [] });
    const st = byId.get(p.id);
    st.name = p.name; st.color = p.color;
    st.pts.push({ ri, n: h.n, code: h.code, total });
  }));
  const rows = [...byId.values()].map(r => ({
    ...r, rounds: r.pts.length,
    avg: r.pts.reduce((a, b) => a + b.total, 0) / r.pts.length,
    best: Math.max(...r.pts.map(x => x.total)),
    last: r.pts[r.pts.length - 1].total,
  }));
  rows.sort((a, b) => b.avg - a.avg || b.rounds - a.rounds);
  return rows;
}
function historyChart(history, rows, inRoom) {
  const W = 640, H = 270, L = 40, R = 120, T = 16, B = 34, pw = W - L - R, ph = H - T - B;
  const n = history.length;
  const xOf = ri => L + (n === 1 ? pw / 2 : ri / (n - 1) * pw);
  const yOf = v => T + (1 - v / 100) * ph;
  let g = '';
  for (const v of [0, 25, 50, 75, 100]) {
    g += `<line x1="${L}" x2="${L + pw}" y1="${yOf(v)}" y2="${yOf(v)}" stroke="var(--faint)" stroke-width="1" ${v ? 'stroke-dasharray="2 4"' : ''}/>`;
    g += `<text x="${L - 8}" y="${yOf(v) + 4}" text-anchor="end" class="ax">${v}</text>`;
  }
  const step = Math.ceil(n / 10);
  history.forEach((h, ri) => { if (ri % step === 0 || ri === n - 1) g += `<text x="${xOf(ri)}" y="${H - 12}" text-anchor="middle" class="ax">V${h.n}</text>`; });
  const ends = [];
  const order = [...rows].sort((a, b) => KEYS.indexOf(a.color) - KEYS.indexOf(b.color));
  for (const r of order) {
    const col = `var(--${r.color})`;
    // nối các ván liên tiếp; vắng ván nào thì đứt nét ở đó
    let path = '', prev = null;
    for (const pt of r.pts) {
      path += `${prev !== null && pt.ri === prev + 1 ? 'L' : 'M'}${xOf(pt.ri).toFixed(1)} ${yOf(pt.total).toFixed(1)}`;
      prev = pt.ri;
    }
    g += `<path d="${path}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    for (const pt of r.pts) {
      g += markerSvg(SHAPES[r.color], xOf(pt.ri), yOf(pt.total), 4.5, col);
      g += `<circle cx="${xOf(pt.ri)}" cy="${yOf(pt.total)}" r="12" fill="transparent"><title>${escXml(r.name)} · Ván ${pt.n} (đề ${escXml(pt.code)}): ${pt.total} điểm</title></circle>`;
    }
    const lp = r.pts[r.pts.length - 1];
    if (lp.ri === n - 1) ends.push({ r, x: xOf(lp.ri), y: yOf(lp.total) });  // người vắng ván cuối: xem bảng/tooltip
  }
  // nhãn tên cuối mỗi đường, đẩy ra cho khỏi chồng nhau
  ends.sort((a, b) => a.y - b.y);
  let lastY = -Infinity;
  for (const e of ends) {
    const y = Math.max(e.y, lastY + 15); lastY = y;
    const name = e.r.name.length > 12 ? e.r.name.slice(0, 11) + '…' : e.r.name;
    g += markerSvg(SHAPES[e.r.color], L + pw + 18, y, 4, `var(--${e.r.color})`);
    g += `<text x="${L + pw + 28}" y="${y + 4}" class="lbl${inRoom.has(e.r.id) ? '' : ' gone'}">${escXml(name)}</text>`;
  }
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'hist-chart');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Điểm tổng từng ván của ${rows.length} người chơi qua ${n} ván`);
  svg.innerHTML = g;
  return svg;
}
function historyPanel(s) {
  const history = Array.isArray(s.history) ? s.history : [];
  if (!history.length) return null;
  const rows = roomStats(history);
  const inRoom = new Set(s.players.map(p => p.id));
  const swatch = r => {
    const sv = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    sv.setAttribute('viewBox', '0 0 16 16'); sv.setAttribute('class', 'swatch');
    sv.innerHTML = markerSvg(SHAPES[r.color], 8, 8, 5, `var(--${r.color})`);
    return sv;
  };
  const medal = i => ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
  const table = el('table', { class: 'hist-tab' },
    el('thead', {}, el('tr', {}, el('th', {}, ''), el('th', {}, 'Người chơi'), el('th', {}, 'Số ván'), el('th', {}, 'Điểm TB'), el('th', {}, 'Cao nhất'), el('th', {}, 'Ván gần nhất'))),
    el('tbody', {}, ...rows.map((r, i) => el('tr', {},
      el('td', {}, history.length > 1 ? medal(i) : ''),
      el('td', {}, el('span', { class: 'who' }, swatch(r), r.name, inRoom.has(r.id) ? null : el('span', { class: 'hint' }, ' (đã rời)'))),
      el('td', {}, String(r.rounds)),
      el('td', { class: 'avg' }, r.avg.toFixed(1)),
      el('td', {}, String(r.best)),
      el('td', {}, String(r.last))))));
  return el('section', { class: 'panel hist' },
    el('div', { class: 'row', style: 'justify-content:space-between;align-items:baseline' },
      el('strong', {}, seriesInfo(s).total ? `📈 Trận ${seriesInfo(s).total} ván · phòng ${s.id}` : `📈 Lịch sử phòng ${s.id}`),
      el('span', { class: 'hint' }, `${seriesInfo(s).total ? `đã chơi ${history.length}/${seriesInfo(s).total} ván` : `${history.length} ván`} · điểm tổng 0–100 mỗi ván`)),
    table,
    historyChart(history, rows, inRoom),
    s.hostId === s.you ? el('div', { class: 'btns', style: 'justify-content:flex-start' }, restartBtn()) : null,
    el('p', { class: 'hint' }, 'Điểm TB = trung bình điểm tổng các ván người đó đã chơi trong phòng. Rê chuột lên từng điểm để xem chi tiết.'));
}

/* ---------- router ---------- */
function route() {
  const h = location.hash;
  if (h.startsWith('#c=')) {
    const d = dec(h.slice(3));
    if (d && typeof d.s === 'string' && validAnswers(d.a)) { challengeLanding(d); return; }
    toast('Link thách đấu không hợp lệ');
  } else if (h.startsWith('#r=')) {
    const d = dec(h.slice(3));
    if (d && typeof d.s === 'string' && Array.isArray(d.p) && d.p.length >= 2 && d.p.length <= 4 && d.p.every(x => x && Array.isArray(x.a))) {
      compareScreen(d.s, validTimer(d.tc), d.p.map((x, i) => ({ name: cleanName(x.n, `Người chơi ${i + 1}`), answers: x.a, timeMs: Number(x.tm) || 0, key: x.k })), {});
      return;
    }
    toast('Link kết quả không hợp lệ');
  } else if (h.startsWith('#room=')) {
    const id = h.slice(6).toUpperCase();
    if (/^[A-Z0-9]{5}$/.test(id)) {
      if (isServed() && store.get(credKey(id))) enterRoom(id);
      else onlineHome(id);
      return;
    }
  }
  home();
}
$('#brand').addEventListener('click', e => { e.preventDefault(); goHome(); });
// Dán link thách đấu/kết quả vào tab đang mở: chỉ hash đổi => nạp lại trang sạch
window.addEventListener('hashchange', () => location.reload());
route();
