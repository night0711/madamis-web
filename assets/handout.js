/* 個別ハンドアウトページ（秘匿）。内容は各HTML内の window.HANDOUT に直接書く */
(function(){
'use strict';
const M = window.Madamis, H = window.HANDOUT, $ = M.$, esc = M.esc;
const col = { blue: 'var(--blue)', orange: 'var(--orange)', grey: 'var(--grey)' }[H.color];
document.title = H.name + ' のハンドアウト｜' + H.scenario;
$('#app').innerHTML = `
<header class="topbar"><div class="wrap"><span class="brand">マダミス<b>Web</b></span><span class="case-no">HANDOUT · ${esc(H.scenario)}</span><span class="spacer"></span></div></header>
<main class="wrap narrow" style="padding-top:var(--s5)">
  <div class="note" role="note"><strong>🔒 このページは ${H.player ? esc(H.player) + '（' + esc(H.name) + ' 役）' : esc(H.name) + ' を担当する人'}だけのものです。</strong><br><span class="small">画面共有中なら今すぐ止めてください。URLは他の人に教えないでね。</span></div>
  <div class="panel" style="text-align:center;--c:${col}">
    <div style="width:132px;margin:0 auto">${M.emblem(H.color, H.motif, H.initial)}</div>
    <div class="eyebrow" style="margin-top:var(--s3)">${H.player ? esc(H.player) + ' の役' : 'あなたの役'}</div>
    <h1 style="font-size:var(--t-2xl);margin-bottom:0">${esc(H.name)}</h1>
    <div class="muted small">${esc(H.kana)}・${H.age}歳・${esc(H.role)}</div>
  </div>
  <div class="summary" style="--c:${col}"><div class="eyebrow">まず、これだけ読めばOK（3行まとめ）</div><ol>${H.summary.map(s => `<li>${s}</li>`).join('')}</ol></div>
  <article class="doc" style="--c:${col}">
    ${H.sections.map(s => `<h2>${esc(s.h)}</h2>${s.html}`).join('')}
    <h2>今夜のあなたの行動</h2><ul class="tl">${H.timeline.map(t => `<li><time>${esc(t[0])}</time>${t[1]}</li>`).join('')}</ul>
    <h2>秘密</h2>
    <div class="veil closed" id="veil"><div class="veil-body secret">${H.secret}</div><div class="veil-btn"><button class="btn warm" type="button" id="unveil">👁 周りに人がいないのを確認して表示</button></div></div>
    <h2>あなたの目標</h2><ul class="goals">${H.goals.map(g => `<li><span class="pt">${esc(g[0])}</span><span>${g[1]}</span></li>`).join('')}</ul>
    ${H.qa ? `<h2>聞かれたら（答え方の目安）</h2><dl class="qa">${H.qa.map(q => `<dt>Q. ${esc(q[0])}</dt><dd>${q[1]}</dd>`).join('')}</dl>` : ''}
    ${H.tips ? `<h2>立ち回りのヒント</h2><ul class="guide">${H.tips.map(t => `<li>${t}</li>`).join('')}</ul>` : ''}
    <div class="note b small">このページに書いてあることは、あなたの事実です。書いていない細かいことは、事件の事実と矛盾しない範囲で自由に決めてOK。</div>
  </article>
</main><footer class="foot">${esc(H.scenario)} — ネタバレ禁止</footer>`;
$('#unveil').addEventListener('click', () => $('#veil').classList.remove('closed'));
M.notebook('madamis:' + H.sid + ':memo:' + H.id, H.name + 'のメモ');

const Sync = window.MadamisSync, D = window.SCENARIO;
if(Sync && D && D.id === H.sid){
  const bar = document.createElement('section');
  bar.className = 'panel room-bar';
  bar.innerHTML = `<div class="eyebrow">ROOM</div><p class="small">ホストの部屋に入ると、この端末にも進行・タイマー・公開カード・投票が届きます。このページの秘密は送りません。</p><div class="room-line" id="hoJoin"><input id="hoCode" inputmode="latin" autocomplete="off" autocapitalize="characters" maxlength="8" placeholder="部屋コード" aria-label="部屋コード"><button class="btn primary" type="button" id="hoGo">参加する</button></div><p class="small" id="hoStat" aria-live="polite"></p><div id="hoLive" hidden><p class="serif" id="hoPhase" style="font-size:1.35rem"></p><p class="room-time" id="hoTime">--:--</p><div id="hoCards"></div><div id="hoBallot" class="btn-row" style="margin-top:8px"></div><p class="small" id="hoVote"></p></div>`;
  $('#app').querySelector('main').insertBefore(bar, $('#app').querySelector('.summary'));
  const options = D.characters.map(c => ({ id: c.id, name: c.name })).concat((D.vote.extra || []).map(c => ({ id: c.id, name: c.name })));
  let sess = null;
  function paint(){
    if(!sess){ $('#hoStat').textContent = ''; return; }
    $('#hoJoin').hidden = true;
    $('#hoLive').hidden = false;
    $('#hoStat').textContent = sess.status === 'live' ? ('部屋 ' + sess.code + ' につながっています') : '接続しています…';
    const p = D.phases[sess.state.phase] || D.phases[0];
    $('#hoPhase').textContent = (sess.state.phase + 1) + '. ' + (p ? p.name : '');
    const left = Sync.leftMs(sess.state);
    $('#hoTime').textContent = left == null ? '--:--' : M.fmt(Math.max(0, left / 1000));
    const open = sess.state.revealed || [];
    $('#hoCards').innerHTML = open.map(id => {
      const c = D.clues.find(x => x.id === id); if(!c) return '';
      return `<details class="more"><summary>${esc(c.no)} ${esc(c.title)}</summary><div class="inner">${c.body}</div></details>`;
    }).join('') || '<p class="small muted">まだ開いたカードはありません。</p>';
    const mine = (sess.state.votes || {})[H.id];
    if(sess.state.voteOpen){
      const counts = Sync.tally(sess.state, options.map(o => o.id));
      $('#hoBallot').innerHTML = '';
      $('#hoVote').textContent = options.map(o => o.name + ' ' + counts[o.id]).join('　');
    } else {
      $('#hoBallot').innerHTML = options.map(o => `<button class="btn sm ${mine === o.id ? 'primary' : ''}" type="button" data-choice="${esc(o.id)}">${esc(o.name)}</button>`).join('');
      $('#hoVote').textContent = mine ? '送りました。開票まで、ほかの票は出ません。' : 'あなたの票を選べます。';
    }
  }
  function join(code){
    if(!Sync.valid(Sync.normalize(code))){ M.alert('コードは8文字です'); return; }
    if(sess) sess.close();
    sess = Sync.connect({ sid: H.sid, code: code, host: false, seat: H.id, onChange: paint, onStatus: paint });
    paint();
  }
  $('#hoGo').addEventListener('click', () => join($('#hoCode').value));
  $('#hoBallot').addEventListener('click', e => {
    const b = e.target.closest('[data-choice]'); if(!b || !sess) return;
    sess.castVote(H.id, b.getAttribute('data-choice'));
  });
  setInterval(() => { if(sess && sess.state.timer && sess.state.timer.running){ const left = Sync.leftMs(sess.state); $('#hoTime').textContent = left == null ? '--:--' : M.fmt(Math.max(0, left / 1000)); } }, 500);
  const boot = Sync.hashCode() || ((Sync.recall(H.sid) || {}).code || '');
  if(boot && Sync.valid(boot)) join(boot);
}
})();
