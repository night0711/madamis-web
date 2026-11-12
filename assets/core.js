/* マダミス Web — 共通スクリプト（外部依存なし）
   ・効果音/環境音（WebAudioで生成、初期OFF）
   ・キャラクター紋章（SVG）・メモ帳（localStorage）・タイプライター 等 */
(function(){
'use strict';
const M = window.Madamis = window.Madamis || {};
const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
M.reduce = reduce;
M.$ = (s, r) => (r || document).querySelector(s);
M.$$ = (s, r) => Array.from((r || document).querySelectorAll(s));
M.esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
M.store = {
  get(k, d){ try{ const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} },
  del(k){ try{ localStorage.removeItem(k); }catch(e){} }
};

/* ---------- サウンド（すべてJSで合成。初期はOFF） ---------- */
const S = M.sound = { on: M.store.get('madamis:sound', false), ctx: null, amb: null };
function ctx(){
  if(!S.ctx){ const C = window.AudioContext || window.webkitAudioContext; if(!C) return null; S.ctx = new C(); S.master = S.ctx.createGain(); S.master.gain.value = .55; S.master.connect(S.ctx.destination); }
  if(S.ctx.state === 'suspended') S.ctx.resume();
  return S.ctx;
}
function tone(f, d, type, vol, when, slide){
  const c = ctx(); if(!c) return; const t = c.currentTime + (when || 0);
  const o = c.createOscillator(), g = c.createGain(); o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
  if(slide) o.frequency.exponentialRampToValueAtTime(slide, t + d);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || .2, t + .015); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g); g.connect(S.master); o.start(t); o.stop(t + d + .05);
}
function noise(d, vol, fq, when, q){
  const c = ctx(); if(!c) return; const t = c.currentTime + (when || 0);
  const b = c.createBuffer(1, Math.max(1, c.sampleRate * d), c.sampleRate), a = b.getChannelData(0);
  for(let i = 0; i < a.length; i++) a[i] = (Math.random() * 2 - 1) * (1 - i / a.length);
  const s = c.createBufferSource(); s.buffer = b; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = fq || 1200; f.Q.value = q || .8;
  const g = c.createGain(); g.gain.value = vol || .2; s.connect(f); f.connect(g); g.connect(S.master); s.start(t);
}
const SFX = {
  flip(){ noise(.28, .35, 2400, 0, .6); tone(520, .12, 'triangle', .06, .05, 880); },
  click(){ tone(880, .05, 'square', .04); },
  tick(){ tone(1320, .04, 'square', .05); },
  warn(){ tone(660, .16, 'square', .12); tone(660, .16, 'square', .12, .22); tone(880, .3, 'square', .12, .44); },
  end(){ [523, 659, 784, 1047].forEach((f, i) => tone(f, .7, 'triangle', .12, i * .14)); },
  phase(){ tone(392, .5, 'sine', .14); tone(587, .7, 'sine', .1, .12); },
  drum(){ for(let i = 0; i < 28; i++) noise(.05, .25 + i * .01, 180, i * .07, 1.5); },
  hit(){ tone(110, 1.2, 'sawtooth', .22, 0, 55); noise(.6, .5, 300, 0, .7); tone(1046, 1, 'triangle', .1, .05); },
  count(){ tone(988, .06, 'square', .06); },
  type(){ tone(1800 + Math.random() * 400, .02, 'square', .015); }
};
S.play = name => { if(S.on && SFX[name]) try{ SFX[name](); }catch(e){} };
/* 環境音: 低いドローン + 雨のノイズ + たまに遠いアーケード音 */
S.startAmb = () => {
  const c = ctx(); if(!c || S.amb) return; const out = c.createGain(); out.gain.value = 0; out.connect(S.master);
  out.gain.linearRampToValueAtTime(.5, c.currentTime + 3);
  const o1 = c.createOscillator(), o2 = c.createOscillator(), lp = c.createBiquadFilter(), dg = c.createGain();
  o1.type = 'sawtooth'; o1.frequency.value = 55; o2.type = 'sawtooth'; o2.frequency.value = 55.4; lp.type = 'lowpass'; lp.frequency.value = 220; dg.gain.value = .06;
  o1.connect(lp); o2.connect(lp); lp.connect(dg); dg.connect(out); o1.start(); o2.start();
  const len = c.sampleRate * 3, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0); let last = 0;
  for(let i = 0; i < len; i++){ last = (last + .02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.2; }
  const rn = c.createBufferSource(); rn.buffer = buf; rn.loop = true; const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 500; const rg = c.createGain(); rg.gain.value = .12;
  rn.connect(hp); hp.connect(rg); rg.connect(out); rn.start();
  const iv = setInterval(() => { if(Math.random() < .5){ const f = [523, 659, 784, 988][Math.floor(Math.random() * 4)]; tone(f, .08, 'square', .015); tone(f * 1.5, .08, 'square', .012, .1); } }, 5200);
  S.amb = { out, stop(){ out.gain.linearRampToValueAtTime(0, c.currentTime + 1); setTimeout(() => { try{ o1.stop(); o2.stop(); rn.stop(); }catch(e){} }, 1200); clearInterval(iv); } };
};
S.stopAmb = () => { if(S.amb){ S.amb.stop(); S.amb = null; } };
S.ambOn = false;
M.soundToggle = (btn, ambBtn) => {
  const sync = () => { btn.setAttribute('aria-pressed', S.on); btn.innerHTML = (S.on ? ICON.sound : ICON.mute) + '<span>' + (S.on ? '効果音 ON' : '効果音 OFF') + '</span>';
    if(ambBtn){ ambBtn.hidden = !S.on; ambBtn.setAttribute('aria-pressed', S.ambOn); ambBtn.innerHTML = ICON.rain + '<span>' + (S.ambOn ? '環境音 ON' : '環境音 OFF') + '</span>'; } };
  btn.addEventListener('click', () => { S.on = !S.on; M.store.set('madamis:sound', S.on); if(S.on){ ctx(); S.play('click'); } else { S.stopAmb(); S.ambOn = false; } sync(); });
  if(ambBtn) ambBtn.addEventListener('click', () => { S.ambOn = !S.ambOn; S.ambOn ? S.startAmb() : S.stopAmb(); sync(); });
  sync();
};

/* ---------- アイコン ---------- */
const ICON = M.icon = {
  sound:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 8a5 5 0 010 8M19 5a9 9 0 010 14"/></svg>',
  mute:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>',
  rain:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M7 15a5 5 0 1110-6 4 4 0 01-1 8H8"/><path d="M8 20l-1 2M12 20l-1 2M16 20l-1 2"/></svg>',
  note:'<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 3h11l3 3v15H5z"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>',
  play:'<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M7 5l12 7-12 7z"/></svg>',
  pause:'<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
  next:'<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M5 5l9 7-9 7zM16 5h3v14h-3z"/></svg>',
  prev:'<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M19 5l-9 7 9 7zM5 5h3v14H5z"/></svg>',
  reset:'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 12a8 8 0 108-8H7"/><path d="M8 1L5 4l3 3"/></svg>'
};

/* ---------- キャラクター紋章（著作物を使わないSVGシルエット） ---------- */
const MOTIF = {
  store:'<g transform="translate(76 76)"><circle r="17" fill="#0b111b" stroke="currentColor" stroke-width="2"/><path d="M-10 -2h20v11h-20z" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M-12 -2l3-6h18l3 6" fill="currentColor" opacity=".85"/><path d="M-3 9v-6h6v6" stroke="currentColor" stroke-width="2" fill="none"/></g>',
  film:'<g transform="translate(76 76)"><circle r="17" fill="#0b111b" stroke="currentColor" stroke-width="2"/><rect x="-10" y="-8" width="20" height="16" rx="1.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M-6 -8v16M6 -8v16" stroke="currentColor" stroke-width="1.6"/><path d="M-1.5 -3l4 3-4 3z" fill="currentColor"/></g>',
  pen:'<g transform="translate(76 76)"><circle r="17" fill="#0b111b" stroke="currentColor" stroke-width="2"/><path d="M-10 -8h20v12h-11l-5 5v-5h-4z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M-6 -3h12M-6 1h8" stroke="currentColor" stroke-width="1.8"/></g>',
  snow:'<g transform="translate(76 76)"><circle r="17" fill="#0b111b" stroke="currentColor" stroke-width="2"/><path d="M0-10v20M-8.7-5l17.4 10M-8.7 5l17.4-10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></g>',
  stick:'<g transform="translate(76 76)"><circle r="17" fill="#0b111b" stroke="currentColor" stroke-width="2"/><rect x="-9" y="2" width="18" height="7" rx="2" fill="currentColor" opacity=".8"/><path d="M0 2V-7" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cy="-9" r="4.5" fill="currentColor"/></g>',
  key:'<g transform="translate(76 76)"><circle r="17" fill="#0b111b" stroke="currentColor" stroke-width="2"/><circle cx="-5" cy="-3" r="5.5" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M-1 1l11 9M6 7l-3 4M9 9.5l-2.5 3" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></g>',
  wrench:'<g transform="translate(76 76)"><circle r="17" fill="#0b111b" stroke="currentColor" stroke-width="2"/><path d="M-9 9l10-10a6 6 0 108-8l-4 4-3-1-1-3 4-4a6 6 0 00-8 8l-10 10z" fill="currentColor" transform="scale(.82)"/></g>',
  coin:'<g transform="translate(76 76)"><circle r="17" fill="#0b111b" stroke="currentColor" stroke-width="2"/><circle r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M0-5v10" stroke="currentColor" stroke-width="2"/></g>'
};
let emId = 0;
M.emblem = (color, motif, initial) => {
  const id = 'em' + (++emId); const c = { blue:'#56b4e9', orange:'#e69f00', grey:'#a3adbb' }[color] || color;
  return `<svg class="emblem" viewBox="0 0 100 100" role="img" aria-hidden="true" style="color:${c}">
  <defs><radialGradient id="${id}g" cx="50%" cy="35%" r="70%"><stop offset="0" stop-color="${c}" stop-opacity=".55"/><stop offset=".6" stop-color="#121a28"/><stop offset="1" stop-color="#070a10"/></radialGradient>
  <clipPath id="${id}c"><circle cx="50" cy="50" r="44"/></clipPath></defs>
  <circle cx="50" cy="50" r="48" fill="none" stroke="${c}" stroke-opacity=".35" stroke-dasharray="2 4"/>
  <circle cx="50" cy="50" r="44" fill="url(#${id}g)" stroke="${c}" stroke-width="1.5"/>
  <g clip-path="url(#${id}c)" fill="#04060a"><circle cx="50" cy="40" r="15"/><path d="M18 100c2-22 15-34 32-34s30 12 32 34z"/></g>
  <text x="50" y="45" text-anchor="middle" font-size="13" font-family="serif" fill="${c}" opacity=".9">${initial || ''}</text>
  ${MOTIF[motif] || ''}</svg>`;
};

/* ---------- タイプライター ---------- */
M.typewrite = (el, text, speed, done) => {
  if(reduce){ el.textContent = text; done && done(); return { skip(){} }; }
  let i = 0, stop = false; el.textContent = ''; const caret = document.createElement('span'); caret.className = 'caret';
  const node = document.createTextNode(''); el.append(node, caret);
  const step = () => { if(stop) return; if(i >= text.length){ done && done(); return; } node.data += text[i]; if(text[i].trim() && i % 2 === 0) S.play('type'); i++;
    setTimeout(step, /[。、…！？\n]/.test(text[i - 1]) ? speed * 7 : speed); };
  step();
  return { skip(){ stop = true; node.data = text; done && done(); } };
};

/* ---------- メモ帳（端末内のみ保存） ---------- */
M.notebook = (key, title) => {
  const nb = document.createElement('div'); nb.className = 'notebook';
  nb.innerHTML = `<button class="fab" type="button" aria-label="メモ帳を開く">${ICON.note}</button>
   <div class="sheet" role="dialog" aria-label="メモ帳"><div class="bar"><strong>📓 ${M.esc(title || '捜査メモ')}</strong><span class="xs" data-saved>自動保存</span><button class="btn sm ghost" type="button" data-close>閉じる</button></div>
   <textarea aria-label="メモ" placeholder="気づいたこと、怪しい点、時刻のメモ…&#10;（この端末のこのブラウザだけに保存されます）"></textarea></div>`;
  document.body.appendChild(nb);
  const ta = nb.querySelector('textarea'), saved = nb.querySelector('[data-saved]'); ta.value = M.store.get(key, '');
  let t; ta.addEventListener('input', () => { clearTimeout(t); saved.textContent = '…'; t = setTimeout(() => { M.store.set(key, ta.value); saved.textContent = '保存しました'; }, 400); });
  nb.querySelector('.fab').addEventListener('click', () => { nb.classList.toggle('open'); if(nb.classList.contains('open')) setTimeout(() => ta.focus(), 300); S.play('click'); });
  nb.querySelector('[data-close]').addEventListener('click', () => nb.classList.remove('open'));
  document.addEventListener('keydown', e => { if(e.key === 'Escape') nb.classList.remove('open'); });
};

/* ---------- 通知（あと1分! など） ---------- */
M.alert = (msg, blue) => {
  let a = M.$('.alert'); if(!a){ a = document.createElement('div'); a.className = 'alert'; a.setAttribute('role', 'status'); a.setAttribute('aria-live', 'assertive'); document.body.appendChild(a); }
  a.textContent = msg; a.classList.toggle('b', !!blue); a.classList.add('show'); clearTimeout(a._t); a._t = setTimeout(() => a.classList.remove('show'), 3200);
};
M.fmt = s => { s = Math.max(0, Math.ceil(s)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
M.copy = async (text) => { try{ await navigator.clipboard.writeText(text); return true; }catch(e){ const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); let ok = false; try{ ok = document.execCommand('copy'); }catch(_){} ta.remove(); return ok; } };
})();
