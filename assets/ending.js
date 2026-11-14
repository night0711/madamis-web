/* 真相ページ：投票結果→真相→仕掛け→エピローグ→得点 を1段ずつ開く */
(function(){
'use strict';
const M = window.Madamis, E = window.ENDING, $ = M.$, $$ = M.$$, esc = M.esc;
document.title = '真相｜' + E.scenario;
const m = location.hash.match(/accused=(\w+)/); let accused = m ? m[1] : null;
$('#app').innerHTML = `
<header class="topbar"><div class="wrap"><span class="brand">マダミス<b>Web</b></span><span class="case-no">TRUTH · ${esc(E.scenario)}</span><span class="spacer"></span><button class="btn sm ghost toggle" id="snd" type="button"></button></div></header>
<main class="wrap narrow" style="padding:var(--s6) var(--s4) var(--s8)">
  <div class="center"><div class="eyebrow">THE TRUTH</div><h1 style="font-size:var(--t-2xl)">${esc(E.scenario)}<br><span class="muted" style="font-size:.6em">― 真相 ―</span></h1></div>
  <div class="panel center" id="gate" hidden><div class="eyebrow">STOP</div><h2>投票が終わってから開くページです</h2><p class="muted">ここから先は事件の真相（ネタバレ）です。<br>まだ遊んでいる途中なら、このページを閉じて共通ページに戻ってください。</p><div class="btn-row" style="justify-content:center"><a class="btn" href="play.html">共通ページへ戻る</a><button class="btn ghost sm" type="button" id="gateOk">投票は終わった。真相を開く</button></div></div>
  <div class="panel center" id="pick" ${accused ? 'hidden' : ''}><p>投票で指名されたのは？</p><div class="btn-row" style="justify-content:center">${E.choices.map(c => `<button class="btn" type="button" data-a="${c[0]}">${esc(c[1])}</button>`).join('')}</div></div>
  <div id="stages"></div>
  <div class="center" style="margin-top:var(--s5)"><button class="btn primary" id="nextStage" type="button" hidden>▼ 続きを開く</button></div>
</main>`;
M.soundToggle($('#snd'));
const stages = () => {
  const b = E.branches[accused] || E.branches.none;
  const head = Object.assign({}, b, {
    html: (b.html || '') + (E.punch || ''),
    cls: ((b.cls || '') + ' reveal').trim()
  });
  return [head, ...E.stages];
};
let shown = 0;
function build(){
  $('#stages').innerHTML = stages().map((s, i) => `<section class="stage panel ${s.cls || ''}" data-i="${i}"><div class="eyebrow">${esc(s.eyebrow || 'CHAPTER ' + (i + 1))}</div><h2>${esc(s.h)}</h2>${s.html}</section>`).join('');
  shown = 0; reveal();
}
function reveal(){
  const all = $$('.stage'); const el = all[shown]; if(!el) return;
  el.classList.add('on'); requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('shown')));
  M.sound.play(shown === 0 ? 'hit' : 'flip');
  if(shown > 0) el.scrollIntoView({ behavior: M.reduce ? 'auto' : 'smooth', block: 'start' });
  shown++;
  const nb = $('#nextStage'); nb.hidden = shown >= all.length;
  if(!nb.hidden) nb.textContent = '▼ ' + (stages()[shown].teaser || '続きを開く');
  if(nb.hidden){ showRecap(); watchRoom(); }
}
let chaptersDone = false;
function showRecap(){
  chaptersDone = true;
  const data = M.store.get('madamis:' + E.sid + ':recap', null);
  const box0 = $('#tonight');
  if(!data || !data.items || !data.items.length){ if(box0) box0.remove(); return; }
  let box = box0;
  if(!box){
    box = document.createElement('details');
    box.id = 'tonight';
    box.className = 'recap panel';
    const host = $('#nextStage') && $('#nextStage').parentElement;
    (host || $('#stages')).insertAdjacentElement('afterend', box);
  }
  const was = box.open;
  box.innerHTML = '<summary>今夜の振り返り</summary><ol class="timeline">' +
    data.items.map(it => '<li><time>' + esc(it.min) + '</time><span>' + esc(it.text) + '</span></li>').join('') +
    '</ol><p class="xs muted">この欄は、今夜の進行の記録だけです。</p>';
  box.open = was;
}
let watching = false;
function watchRoom(){
  if(watching) return;
  watching = true;
  const saved = M.store.get('madamis:' + E.sid + ':room', null);
  if(!saved || !saved.code) return;
  function load(src){
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.onload = () => resolve(); s.onerror = () => reject(new Error(src));
      document.body.appendChild(s);
    });
  }
  load(new URL('scenario.js', location.href).href).then(() => load(new URL('../../assets/sync.js', location.href).href)).then(() => {
    const Sync = window.MadamisSync, D = window.SCENARIO;
    if(!Sync || !D || D.id !== E.sid || !Sync.valid(saved.code)) return;
    Sync.connect({
      sid: D.id, code: saved.code, host: false,
      onChange: st => {
        Sync.syncRecap(D, st);
        if(chaptersDone) showRecap();
      }
    });
  }).catch(() => {});
}
$('#nextStage').addEventListener('click', reveal);
$('#pick').addEventListener('click', e => { const b = e.target.closest('[data-a]'); if(!b) return; accused = b.dataset.a; $('#pick').hidden = true; build(); });
let voted = false; try{ voted = !!sessionStorage.getItem('madamis:voted:' + E.sid); }catch(e){}
if(!voted){ $('#gate').hidden = false; $('#pick').hidden = true;
  $('#gateOk').addEventListener('click', () => { if(!confirm('全員の投票は終わりましたか？\nこの先はネタバレです。')) return; try{ sessionStorage.setItem('madamis:voted:' + E.sid, '1'); }catch(e){} $('#gate').hidden = true; if(accused) build(); else $('#pick').hidden = false; }); }
else if(accused) build();
})();
