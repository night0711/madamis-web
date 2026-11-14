/* 共通ページ（あらすじ・ルール・進行タイマー・手がかりカード） */
(function(){
'use strict';
const M = window.Madamis, D = window.SCENARIO, $ = M.$, $$ = M.$$, esc = M.esc;
if(!D){ document.body.innerHTML = '<p style="padding:2em">scenario.js が読み込めませんでした。</p>'; return; }
const KEY = 'madamis:' + D.id + ':state';
const st = Object.assign({ phase: 0, remain: null, endAt: null, running: false, revealed: [], log: [], marks: [] }, M.store.get(KEY, {}));
if(!Array.isArray(st.marks)) st.marks = [];
const save = () => M.store.set(KEY, st);
function markPhase(i){
  if(sync) return;
  const last = st.marks[st.marks.length - 1];
  if(!last || last[1] !== i) st.marks.push([Date.now(), i]);
}
let sync = null;
const SEATK = 'madamis:' + D.id + ':seat';
function mySeat(){ try { return localStorage.getItem(SEATK) || ''; } catch(e){ return ''; } }
function setSeat(v){ try { localStorage.setItem(SEATK, v); } catch(e){} }
const phaseOf = id => D.phases.findIndex(p => (p.unlock || []).includes(id));
const charMap = Object.fromEntries(D.characters.map(c => [c.id, c]));
document.title = D.title + '｜マダミス Web';

/* ---------- 共有リンクから状態を読み込む（#s=フェーズ番号.カードID-カードID） ---------- */
function readHash(){
  const m = location.hash.match(/s=(\d+)\.?([\w-]*)/); if(!m) return false;
  const p = Math.min(+m[1], D.phases.length - 1), ids = (m[2] || '').split('-').filter(id => D.clues.some(c => c.id === id));
  if(p !== st.phase){ st.phase = p; st.remain = null; st.endAt = null; st.running = false; markPhase(p); }
  ids.forEach(id => { if(!st.revealed.includes(id)){ st.revealed.push(id); st.log.push([Date.now(), id]); } });
  save(); history.replaceState(null, '', location.pathname + location.search + '#clues'); return true;
}
const shareURL = () => location.href.split('#')[0] + '#s=' + st.phase + '.' + st.revealed.join('-');

/* ---------- 描画 ---------- */
const kvImg = `<img src="${esc(D.kv)}" alt="${esc(D.title)} キービジュアル" width="1600" height="1000">`;
const app = $('#app');
app.innerHTML = `
<header class="topbar"><div class="wrap">
  <a class="brand" href="../../index.html">マダミス<b>Web</b></a><span class="case-no">${esc(D.caseNo)}</span><span class="spacer"></span>
  <button class="btn sm ghost toggle" id="amb" type="button" hidden></button>
  <button class="btn sm ghost toggle" id="snd" type="button"></button>
</div></header>
<main>
<section class="wrap" id="roomBar">
  <div class="panel room-bar">
    <div class="eyebrow">ROOM</div>
    <p class="small" id="roomBlurb">各端末で同じ進行を見るときは、ホストの部屋コードを入れてください。入れなければ、この端末だけの進行（画面共有）のままです。</p>
    <div class="room-line" id="roomJoinRow">
      <input id="roomInput" inputmode="latin" autocomplete="off" autocapitalize="characters" maxlength="8" placeholder="部屋コード" aria-label="部屋コード">
      <button class="btn primary" type="button" id="roomJoin">参加する</button>
      <button class="btn ghost" type="button" id="roomExit" hidden>部屋を出る</button>
    </div>
    <p class="small" id="roomStatus" aria-live="polite"></p>
    <div id="roomSeat"></div>
    <div id="roomBallot"></div>
    <div id="finaleBox"></div>
  </div>
</section>
<section class="hero wrap" id="top">
  <div class="kv">${kvImg}</div>
  <div style="padding:var(--s5) 0 0">
    <div class="eyebrow">${esc(D.subtitle)}</div>
    <h1>${D.title.split(' ').map(w => `<span class="nowrap-word">${esc(w)}</span>`).join(' ')}</h1>
    <div class="badges"><span class="badge b">👥 ${esc(D.meta.players)}</span><span class="badge b">⏱ ${esc(D.meta.time)}</span><span class="badge o">🔰 ${esc(D.meta.level)}</span><span class="badge">🎧 ${esc(D.meta.tools)}</span>${D.meta.notes.map(n => `<span class="badge">${esc(n)}</span>`).join('')}</div>
  </div>
</section>

<section class="wrap" id="story">
  <div class="panel file" data-tab="STORY">
    <div class="eyebrow">あらすじ</div><h2>事件のはじまり</h2>
    <div class="serif" style="font-size:1.05rem;line-height:2.1">${D.story.map(p => `<p>${esc(p)}</p>`).join('')}</div>
    <h3 style="margin-top:var(--s5)">わかっていること</h3>
    <div class="doc"><ul class="tl">${D.knownFacts.map(f => `<li><time>${esc(f[0])}</time>${esc(f[1])}</li>`).join('')}</ul></div>
    <h3 style="margin-top:var(--s5)">${esc(D.mapTitle || '見取り図')}</h3>
    <button class="btn sm ghost" type="button" id="mapZoom" style="margin-bottom:var(--s2)">🔍 大きく見る</button>
    <div class="mapbox" style="border-radius:var(--r);overflow:hidden">${D.map}</div>
  </div>
</section>

<section class="wrap" id="chars">
  <div class="eyebrow">登場人物</div><h2>今夜、店にいた人々</h2>
  <div class="chars">${D.characters.map(c => `<article class="char c-${c.color}">${M.emblem(c.color, c.motif, c.initial)}<h3>${esc(c.name)}</h3><div class="kana">${esc(c.kana)}・${c.age}歳</div>${c.player ? `<div class="xs muted">演じる人：${esc(c.player)}</div>` : ''}<span class="role">${esc(c.role)}</span><p>${esc(c.blurb)}</p></article>`).join('')}</div>
  <div class="panel" style="margin-top:var(--s4);display:flex;gap:var(--s4);align-items:center;flex-wrap:wrap">
    <div style="width:84px;flex:0 0 auto">${M.emblem(D.victim.color, D.victim.motif, D.victim.initial)}</div>
    <div style="flex:1;min-width:200px"><div class="eyebrow" style="color:var(--grey)">被害者</div><h3>${esc(D.victim.name)}<span class="muted small">（${esc(D.victim.kana)}・${D.victim.age}歳）</span></h3><p class="small muted" style="margin:0">${esc(D.victim.blurb)}</p></div>
  </div>
</section>

<section class="wrap" id="rules">
  <div class="panel file" data-tab="HOW TO PLAY">
    <div class="eyebrow">はじめての方へ</div><h2>3ステップで遊べます</h2>
    <div class="grid c3">
      <div class="note b"><strong>① 読む</strong><br><span class="small">DMで届いた「自分だけのページ」を読む。ほかの人のページは開かない。</span></div>
      <div class="note b"><strong>② 話す</strong><br><span class="small">タイマーに合わせて話し合う。手がかりカードは書いてあることが事実。</span></div>
      <div class="note"><strong>③ 当てる</strong><br><span class="small">最後に投票する。選択肢は投票ページに出る。真相はみんなで一緒に開こう。</span></div>
    </div>
    <h3 style="margin-top:var(--s5)">ルール</h3>
    <ol class="guide" style="list-style:none">${D.rules.map(r => `<li><strong>${esc(r[0])}</strong>　<span class="muted">${esc(r[1])}</span></li>`).join('')}</ol>
    <details style="margin-top:var(--s4)"><summary style="cursor:pointer;color:var(--orange-l)">用語ミニ辞典</summary>
      <dl class="small">${D.glossary.map(g => `<dt style="font-weight:700;margin-top:8px">${esc(g[0])}</dt><dd style="margin:0;color:var(--muted)">${esc(g[1])}</dd>`).join('')}</dl></details>
    <details style="margin-top:var(--s3)"><summary style="cursor:pointer;color:var(--orange-l)">このページの使い方（GMなし・全員プレイヤー）</summary>
      <p class="small muted" style="margin-top:8px">GMはいません。ホストが部屋を作ったときは、このページを各自のスマホで開くと、フェーズ・タイマー・カード・投票が揃います。部屋を使わないときは、今まで通り<strong>誰か1人が画面共有</strong>してボタン係をします。このページに秘密はありません。状態はこのブラウザにも残るので、再読み込みしても部屋に戻れます。</p></details>
  </div>
</section>

<section class="wrap" id="timer">
  <div class="panel file" data-tab="PROGRESS">
    <div class="eyebrow">進行</div><h2>進行表とタイマー</h2>
    <div class="timer">
      <div class="ring" id="ring"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="track" cx="60" cy="60" r="54" stroke-width="7"/><circle class="bar" id="bar" cx="60" cy="60" r="54" stroke-width="7" stroke-dasharray="339.3" stroke-dashoffset="0"/></svg>
        <div class="face"><div class="ph" id="phNo"></div><div class="time" id="time" role="timer" aria-live="off">00:00</div><div class="ph" id="phState"></div></div></div>
      <div class="phase-now" id="phaseNow"></div>
    </div>
    <div class="btn-row" style="margin-top:var(--s4);justify-content:center">
      <button class="btn icon" id="prev" type="button" aria-label="前のフェーズ">${M.icon.prev}</button>
      <button class="btn primary" id="startBtn" type="button"></button>
      <button class="btn warm" id="next" type="button">${M.icon.next}<span>次のフェーズへ</span></button>
      <button class="btn icon ghost" id="reset" type="button" aria-label="このフェーズの時間をリセット">${M.icon.reset}</button>
      <button class="btn sm ghost" id="plus" type="button">＋1分</button>
    </div>
    <ol class="steps" id="steps" aria-label="フェーズ一覧"></ol>
  </div>
</section>

<section class="wrap" id="clues">
  <div class="panel file" data-tab="EVIDENCE">
    <div class="eyebrow">手がかり</div><h2>手がかりカード</h2>
    <p class="small muted">光っているカードは今めくれます。画面共有している人が「めくる」を押して、カードに書かれた担当の人が読み上げます。タップで拡大。</p>
    <div class="filters" id="filters"></div>
    <div class="cards" id="cards"></div>
    <hr class="rule">
    <div class="grid c2">
      <div><h3>公開ログ</h3><ul class="log" id="log"></ul></div>
      <div><h3>全員の画面をそろえる</h3><p class="small muted">画面共有できない人には、このリンクをDiscordに貼ってください。開くと同じフェーズと公開済みカードになります。</p>
        <div class="btn-row"><button class="btn sm" id="share" type="button">🔗 共有リンクをコピー</button><button class="btn sm ghost" id="wipe" type="button">最初からやり直す</button></div></div>
    </div>
  </div>
</section>

<section class="wrap" id="vote">
  <div class="panel center" style="padding:var(--s7) var(--s5)">
    <div class="eyebrow">VOTE</div><h2>${esc(D.vote.question)}</h2>
    <p class="muted">${esc(D.vote.lead || '最終議論が終わったら「3、2、1」で一斉に投票。画面共有している人が投票ページに入力します。')}</p>
    <a class="btn warm" href="vote.html">🗳 投票ページへ</a>
    <p class="small muted" id="finaleNote">最後のひとこと推理は、部屋で最終議論・投票のときに使えます。画面共有のときは、声のままで大丈夫です。</p>
    <div id="recapBox" hidden></div>
  </div>
</section>
</main>
<footer class="foot"><p>© オリジナルシナリオ『${esc(D.title)}』— 個人のサークル内で自由に遊べます。ネタバレ禁止でお願いします。</p></footer>

<nav class="dock" aria-label="ページ内メニュー"><ul>
  <li><a href="#story"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h12l4 4v12H4z"/><path d="M8 10h8M8 14h8"/></svg>あらすじ</a></li>
  <li><a href="#chars"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-5 4-7 8-7s7 2 8 7"/></svg>人物</a></li>
  <li><a href="#timer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/></svg>進行</a></li>
  <li><a href="#clues"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="3" width="12" height="16" rx="2"/><path d="M8 21h11V7"/></svg>手がかり</a></li>
  <li><a href="#vote"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 11l5 5L20 5"/><path d="M4 20h16"/></svg>投票</a></li>
</ul></nav>
<dialog id="zoom"><div class="modal paper" id="zoomBody"></div></dialog>
<div class="cutin" id="cutin" aria-hidden="true"><div class="band"><small id="cutNo"></small><strong id="cutName"></strong></div></div>`;
document.body.classList.add('has-dock');
M.soundToggle($('#snd'), $('#amb'));
M.notebook('madamis:' + D.id + ':memo', '捜査メモ');

/* ---------- タイトル画面 ---------- */
const ts = $('#title');
if(ts){
  if(sessionStorage.getItem('madamis:titleSeen:' + D.id) || location.hash){ ts.remove(); }
  else {
    $('.kv', ts).innerHTML = kvImg; $('h1', ts).innerHTML = D.title.split(' ').map(w => `<span class="nowrap-word">${esc(w)}</span>`).join(' '); $('.sub', ts).textContent = D.subtitle;
    const tsSnd = $('#tsSnd'); M.soundToggle(tsSnd);
    let tw = null; setTimeout(() => { tw = M.typewrite($('.typer', ts), D.opening, 55); }, M.reduce ? 0 : 1600);
    const go = () => { if(tw) tw.skip(); sessionStorage.setItem('madamis:titleSeen:' + D.id, '1'); ts.classList.add('gone'); M.sound.play('phase'); setTimeout(() => ts.remove(), 1000);
      const s = $('#snd'); const on = M.sound.on; s.setAttribute('aria-pressed', on); s.innerHTML = (on ? M.icon.sound : M.icon.mute) + '<span>' + (on ? '効果音 ON' : '効果音 OFF') + '</span>'; $('#amb').hidden = !on; };
    $('#enter').addEventListener('click', go);
    $('#skip').addEventListener('click', () => { if(tw) tw.skip(); });
  }
}

/* ---------- タイマー ---------- */
const C = 2 * Math.PI * 54;
let warned = false, ended = false, lastTick = -1;
function total(){ return (D.phases[st.phase].min || 0) * 60; }
function remain(){ if(!total()) return null; if(st.running && st.endAt) return (st.endAt - Date.now()) / 1000; return st.remain == null ? total() : st.remain; }
function renderPhase(anim){
  const p = D.phases[st.phase], tot = total();
  $('#phNo').textContent = 'PHASE ' + String(st.phase + 1).padStart(2, '0') + ' / ' + D.phases.length;
  const nextP = D.phases[st.phase + 1];
  $('#phaseNow').innerHTML = `<div class="${anim ? 'phase-fade' : ''}"><div class="eyebrow">いまやること</div><h3>${esc(p.name)}</h3><div class="muted small">${tot ? '目安 ' + p.min + '分' : '時間制限なし'}${(p.unlock || []).length ? '　・　カード' + p.unlock.map(id => D.clues.find(c => c.id === id).no).join('・') + 'が公開に' : ''}</div><ul class="guide">${p.guide.map(g => `<li>${esc(g)}</li>`).join('')}</ul>${nextP ? `<div class="xs muted">次：${esc(nextP.name)}</div>` : ''}</div>`;
  $('#steps').innerHTML = D.phases.map((x, i) => `<li class="${i < st.phase ? 'done' : i === st.phase ? 'now' : ''}" data-i="${i}" ${i === st.phase ? 'aria-current="step"' : ''}>${i + 1}. ${esc(x.name)}</li>`).join('');
  const now = $('#steps .now'); if(now && now.scrollIntoView && anim) now.parentNode.scrollTo({ left: now.offsetLeft - 40, behavior: M.reduce ? 'auto' : 'smooth' });
  $('#prev').disabled = st.phase === 0; $('#next').disabled = st.phase === D.phases.length - 1;
  warned = false; ended = false; tick(); renderCards();
}
function tick(){
  const r = remain(), ring = $('#ring'), tot = total();
  if(r == null){ $('#time').textContent = '--:--'; $('#bar').style.strokeDashoffset = 0; ring.classList.remove('warn', 'done'); $('#phState').textContent = 'FREE'; $('#startBtn').hidden = true; $('#reset').hidden = $('#plus').hidden = true; return; }
  $('#startBtn').hidden = $('#reset').hidden = $('#plus').hidden = false;
  const rr = Math.max(0, r); $('#time').textContent = M.fmt(rr);
  $('#bar').style.strokeDashoffset = C * (1 - rr / tot);
  ring.classList.toggle('warn', rr <= 60 && rr > 0); ring.classList.toggle('done', rr <= 0);
  $('#phState').textContent = rr <= 0 ? 'TIME UP' : st.running ? 'RUNNING' : 'PAUSED';
  $('#startBtn').innerHTML = st.running ? M.icon.pause + '<span>一時停止</span>' : M.icon.play + '<span>' + (rr < tot ? '再開' : 'スタート') + '</span>';
  if(st.running){
    const sec = Math.ceil(rr);
    if(rr <= 60 && rr > 0 && !warned && tot > 60){ warned = true; M.alert('⏳ あと1分！'); M.sound.play('warn'); }
    if(sec <= 10 && sec > 0 && sec !== lastTick){ lastTick = sec; M.sound.play('tick'); }
    if(rr <= 0 && !ended){ ended = true; if(!sync){ st.running = false; st.remain = 0; st.endAt = null; save(); } M.alert('🔔 時間です！', true); M.sound.play('end'); tick(); }
  }
}
setInterval(() => { if(st.running) tick(); }, 250);
$('#startBtn').addEventListener('click', () => {
  if(sync) return;
  const r = remain(); if(r == null) return;
  if(st.running){ st.remain = Math.max(0, r); st.endAt = null; st.running = false; }
  else { if(r <= 0) st.remain = total(); st.endAt = Date.now() + (st.remain == null ? total() : st.remain) * 1000; st.running = true; ended = false; if((st.remain == null ? total() : st.remain) > 60) warned = false; }
  save(); M.sound.play('click'); tick();
});
function goPhase(i){
  if(sync) return;
  if(i < 0 || i >= D.phases.length) return; st.phase = i; st.remain = null; st.endAt = null; st.running = false; markPhase(i); save();
  cutin(); renderPhase(true); M.sound.play('phase');
}
$('#next').addEventListener('click', () => goPhase(st.phase + 1));
$('#prev').addEventListener('click', () => { if(confirm('ひとつ前のフェーズに戻りますか？')) goPhase(st.phase - 1); });
$('#reset').addEventListener('click', () => { if(sync) return; st.remain = null; st.endAt = null; st.running = false; save(); warned = ended = false; tick(); });
$('#plus').addEventListener('click', () => { if(sync) return; const r = remain(); if(r == null) return; if(st.running) st.endAt += 60000; else st.remain = Math.max(0, r) + 60; warned = false; ended = false; save(); tick(); M.alert('＋1分 延長しました', true); });
$('#steps').addEventListener('click', e => { if(sync) return; const li = e.target.closest('li'); if(!li) return; const i = +li.dataset.i; if(i !== st.phase && confirm('「' + D.phases[i].name + '」へ移動しますか？')) goPhase(i); });
function cutin(){
  const p = D.phases[st.phase], c = $('#cutin'); $('#cutNo').textContent = 'PHASE ' + String(st.phase + 1).padStart(2, '0'); $('#cutName').textContent = p.name;
  c.classList.remove('on'); void c.offsetWidth; c.classList.add('on'); setTimeout(() => c.classList.remove('on'), 2200);
}

/* ---------- 手がかりカード ---------- */
const tags = ['すべて', ...new Set(D.clues.map(c => c.tag))]; let filter = 'すべて';
$('#filters').innerHTML = tags.map(t => `<button class="chip" type="button" aria-pressed="${t === filter}" data-t="${esc(t)}">${esc(t)}</button>`).join('') + '<button class="chip" type="button" aria-pressed="false" data-t="__open">公開済みのみ</button>';
$('#filters').addEventListener('click', e => { const b = e.target.closest('.chip'); if(!b) return; filter = b.dataset.t; $$('.chip', $('#filters')).forEach(x => x.setAttribute('aria-pressed', x === b)); renderCards(); });
const seal = `<svg class="seal" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" fill="none" stroke="#e69f00" stroke-width="2"/><circle cx="50" cy="50" r="36" fill="none" stroke="#e69f00" stroke-width="1" stroke-dasharray="3 3"/><circle cx="44" cy="44" r="14" fill="none" stroke="#56b4e9" stroke-width="4"/><path d="M54 54l14 14" stroke="#56b4e9" stroke-width="6" stroke-linecap="round"/></svg>`;
function renderCards(){
  const box = $('#cards');
  box.innerHTML = D.clues.filter(c => filter === 'すべて' || (filter === '__open' ? st.revealed.includes(c.id) : c.tag === filter)).map(c => {
    const pi = phaseOf(c.id), open = st.revealed.includes(c.id), ready = !open && pi >= 0 && st.phase >= pi;
    return `<div class="card ${open ? 'open' : ''} ${ready ? 'ready' : ''}" data-id="${c.id}"><div class="inner">
      <div class="back"><span class="no">EVIDENCE ${esc(c.no)}</span>${seal}<span class="ttl">${esc(c.title)}</span>${c.reader ? `<span class="xs muted">🎙 読み上げ：${esc(c.reader)}</span>` : ''}
        ${ready ? `<button class="btn warm sm act" type="button" data-flip="${c.id}">めくる</button>` : open ? '' : `<span class="lock">🔒 「${esc(pi >= 0 ? D.phases[pi].name : '')}」で公開</span>`}</div>
      <div class="face" ${open ? '' : 'aria-hidden="true"'}><span class="stamp">証拠</span><span class="no">EVIDENCE ${esc(c.no)}</span><h4>${esc(c.title)}</h4><div class="body">${open ? c.body : ''}</div><span class="tag">${esc(c.tag)}</span>
        <button class="zoom" type="button" data-zoom="${c.id}" ${open ? '' : 'tabindex="-1"'}>🔍 拡大</button></div></div></div>`;
  }).join('') || '<p class="muted">該当するカードはありません。</p>';
  $('#log').innerHTML = st.log.length ? st.log.slice().reverse().map(([t, id]) => { const c = D.clues.find(x => x.id === id); const d = new Date(t); return `<li>${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}　カード${esc(c.no)}「${esc(c.title)}」を公開</li>`; }).join('') : '<li>まだ公開されたカードはありません</li>';
}
$('#cards').addEventListener('click', e => {
  const f = e.target.closest('[data-flip]'), z = e.target.closest('[data-zoom]'), card = e.target.closest('.card');
  if(f){ if(sync) return; const id = f.dataset.flip; if(!st.revealed.includes(id)){ st.revealed.push(id); st.log.push([Date.now(), id]); save(); }
    M.sound.play('flip'); const c = D.clues.find(x => x.id === id); const el = card; $('.body', el).innerHTML = c.body; $('.face', el).removeAttribute('aria-hidden'); el.classList.remove('ready'); requestAnimationFrame(() => el.classList.add('open'));
    $('.zoom', el).removeAttribute('tabindex'); setTimeout(renderCards, 950); return; }
  if(z || (card && card.classList.contains('open'))){ const c = D.clues.find(x => x.id === (z ? z.dataset.zoom : card.dataset.id)); openZoom(`<div class="xs" style="letter-spacing:.2em;color:#7a6a4e">EVIDENCE ${esc(c.no)}・${esc(c.tag)}</div><h3 class="serif">${esc(c.title)}</h3><div style="line-height:2">${c.body}</div>`, true); }
});
function openZoom(html, paper){ const d = $('#zoom'), b = $('#zoomBody'); b.className = 'modal' + (paper ? ' paper' : ''); b.innerHTML = html + '<div style="text-align:right;margin-top:16px"><button class="btn sm" type="button" data-close style="color:inherit">閉じる</button></div>'; d.showModal ? d.showModal() : d.setAttribute('open', ''); }
$('#zoom').addEventListener('click', e => { if(e.target.id === 'zoom' || e.target.closest('[data-close]')) $('#zoom').close(); });
$('#mapZoom').addEventListener('click', () => openZoom('<h3>' + esc(D.mapTitle || '見取り図') + '</h3>' + D.map, false));
$('#share').addEventListener('click', async () => {
  const url = sync ? (location.href.split('#')[0] + '#r=' + sync.code) : shareURL();
  const ok = await M.copy(url); M.alert(ok ? '🔗 共有リンクをコピーしました' : 'コピーできませんでした', true);
});
$('#wipe').addEventListener('click', () => { if(sync) return; if(confirm('フェーズ・公開カード・タイマーを最初の状態に戻します。よろしいですか？（メモは消えません）')){ M.store.del(KEY); M.store.del('madamis:' + D.id + ':recap'); location.href = location.pathname; } });

/* 別タブ・別端末と同じブラウザ内での同期（同じ端末で複数タブを開いた場合） */
window.addEventListener('storage', e => { if(sync) return; if(e.key === KEY){ Object.assign(st, JSON.parse(e.newValue || '{}')); if(!Array.isArray(st.marks)) st.marks = []; renderPhase(false); paintRecap(); } });

/* ---------- 下部メニューの現在地 ---------- */
const secs = ['story', 'chars', 'timer', 'clues', 'vote'].map(id => document.getElementById(id));
if('IntersectionObserver' in window){ const io = new IntersectionObserver(es => es.forEach(en => { if(en.isIntersecting) $$('.dock a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + en.target.id)); }), { rootMargin: '-45% 0px -50% 0px' }); secs.forEach(s => s && io.observe(s)); }

const loaded = readHash();
if(!st.marks.length) markPhase(st.phase);
save();
renderPhase(false);
if(loaded){ M.alert('共有された進行状態を読み込みました', true); setTimeout(() => $('#clues').scrollIntoView(), 50); }

/* ---------- 部屋（閲覧と投票。進行の操作はホストの配布ページ） ---------- */
const Sync = window.MadamisSync;
const voteOptions = D.characters.map(c => ({ id: c.id, name: c.name })).concat((D.vote.extra || []).map(c => ({ id: c.id, name: c.name })));
function applyRemote(s){
  const phaseChanged = s.phase !== st.phase;
  const prev = st.revealed.join(',');
  st.phase = s.phase;
  st.revealed = (s.revealed || []).filter(id => D.clues.some(c => c.id === id));
  st.log = (s.log || []).map(x => [x[0], x[1]]);
  st.marks = (s.marks || []).map(x => [x[0], x[1]]);
  st.voteOpen = !!s.voteOpen;
  st.voteAt = s.voteAt || 0;
  if(s.voteOpen) st.votes = Object.assign({}, s.votes || {});
  else { delete st.votes; delete st.voteCounts; }
  if(s.timer && s.timer.running && typeof s.timer.endAt === 'number'){
    st.running = true;
    st.endAt = s.timer.endAt - (s._skew || 0);
    st.remain = null;
  } else {
    st.running = false;
    st.endAt = null;
    st.remain = s.timer && typeof s.timer.remain === 'number' ? s.timer.remain : null;
  }
  const structural = phaseChanged || st.revealed.join(',') !== prev;
  if(phaseChanged){ warned = false; ended = false; }
  save();
  if(structural) renderPhase(phaseChanged);
  else tick();
  if(st.revealed.join(',') !== prev && prev) M.sound.play('flip');
  paintFinale();
  paintRecap();
}
function paintRoom(){
  const bar = $('#roomStatus'), exit = $('#roomExit'), row = $('#roomJoinRow');
  if(!sync){ bar.textContent = ''; exit.hidden = true; row.hidden = false; $('#roomSeat').hidden = true; $('#roomBallot').innerHTML = ''; document.body.classList.remove('sync-guest'); paintFinale(); paintRecap(); return; }
  document.body.classList.add('sync-guest');
  row.hidden = true; exit.hidden = false;
  $('#roomSeat').hidden = false;
  bar.textContent = sync.status === 'live' ? ('部屋 ' + sync.code + ' につながっています。進行はホストの端末です。') : ('部屋 ' + sync.code + ' に接続しています…');
  const seat = mySeat();
  if(!$('#seatPick')){
    $('#roomSeat').innerHTML = '<label class="small">あなたの役 <select id="seatPick" aria-label="あなたの役">' +
      '<option value="">選んでください</option>' +
      D.characters.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('') +
      '</select></label>';
    $('#seatPick').addEventListener('change', () => { setSeat($('#seatPick').value); paintFinale(); });
  }
  if($('#seatPick').value !== seat) $('#seatPick').value = seat;
  const votes = (sync.state && sync.state.votes) || {};
  const n = Object.keys(votes).length;
  let html = '<p class="small">投票 ' + n + ' / ' + D.characters.length + '</p>';
  if(sync.state && sync.state.voteOpen){
    const counts = Sync.tally(sync.state, voteOptions.map(o => o.id));
    html += '<ul class="guide">' + voteOptions.map(o => `<li>${esc(o.name)}　${counts[o.id]}</li>`).join('') + '</ul>';
    html += '<p><a class="btn primary" id="roomTruth" href="' + esc(atob(D.vote.endingRef) + '#accused=' + Sync.winner(sync.state, voteOptions.map(o => o.id))) + '">真相を開く</a></p>';
  } else {
    html += '<div class="btn-row">' + voteOptions.map(o => `<button class="btn sm ${votes[seat] === o.id ? 'primary' : ''}" type="button" data-choice="${esc(o.id)}">${esc(o.name)}</button>`).join('') + '</div>';
    if(votes[seat]) html += '<p class="small muted">送りました。開票まで、ほかの人の票は出ません。</p>';
  }
  $('#roomBallot').innerHTML = html;
  const truth = $('#roomTruth');
  if(truth) truth.addEventListener('click', () => { try { sessionStorage.setItem('madamis:voted:' + D.id, '1'); } catch(e){} });
  paintFinale();
  paintRecap();
}
function paintFinale(){
  const box = $('#finaleBox');
  const note = $('#finaleNote');
  if(!box || !window.MadamisSync) return;
  const active = !!(sync && sync.state && MadamisSync.isClosingPhase(D.phases, sync.state.phase));
  MadamisSync.renderStatements(box, {
    state: sync ? sync.state : {},
    active: active,
    scenario: D,
    options: voteOptions,
    draftKey: 'madamis:' + D.id + ':worddraft',
    getSeat: mySeat,
    onSubmit: (seat, pick, line) => { if(sync) sync.say(seat, pick, line); }
  });
  if(note) note.hidden = !!(sync && box._mode);
}
function paintRecap(){
  const box = $('#recapBox');
  if(!box || !window.MadamisSync) return;
  const src = sync && sync.state && sync.state.voteOpen ? sync.state : (!sync && st.voteOpen ? st : null);
  const home = (sync && $('#roomBar .room-bar')) || $('#vote .panel');
  if(home && box.parentElement !== home) home.appendChild(box);
  if(!src){ box.hidden = true; box.innerHTML = ''; box._html = ''; return; }
  const html = MadamisSync.recapHTML(D, src);
  if(!html){ box.hidden = true; box.innerHTML = ''; box._html = ''; return; }
  const opened = box.querySelector('details') && box.querySelector('details').open;
  if(box._html === html){ box.hidden = false; return; }
  box.hidden = false;
  box.innerHTML = html;
  box._html = html;
  const details = box.querySelector('details');
  if(details && opened) details.open = true;
}
$('#roomBallot').addEventListener('click', e => {
  const b = e.target.closest('[data-choice]'); if(!b || !sync) return;
  const seat = mySeat();
  if(!seat){ M.alert('先に自分の役を選んでください'); return; }
  sync.castVote(seat, b.getAttribute('data-choice'));
  M.sound.play('click');
});
function joinRoom(code){
  if(!Sync || !Sync.valid(Sync.normalize(code))){ M.alert('コードは8文字です'); return; }
  if(sync) sync.close();
  sync = Sync.connect({
    sid: D.id, code: code, host: false,
    onChange: s => { applyRemote(s); paintRoom(); },
    onTick: s => {
      if(s.timer && s.timer.running && typeof s.timer.endAt === 'number'){
        st.running = true;
        st.endAt = s.timer.endAt - (s._skew || 0);
      }
    },
    onStatus: paintRoom
  });
  const base = location.pathname + location.search;
  history.replaceState(null, '', base + '#r=' + Sync.normalize(code));
  paintRoom();
}
$('#roomJoin').addEventListener('click', () => joinRoom($('#roomInput').value));
$('#roomInput').addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); joinRoom($('#roomInput').value); } });
$('#roomExit').addEventListener('click', () => {
  Sync.leave(D.id); if(sync) sync.close(); sync = null;
  history.replaceState(null, '', location.pathname + location.search);
  paintRoom(); renderPhase(false);
});
const bootCode = (Sync && (Sync.hashCode() || ((Sync.recall(D.id) || {}).code))) || '';
if(bootCode && Sync.valid(bootCode) && !loaded) joinRoom(bootCode);
else paintRecap();
})();
