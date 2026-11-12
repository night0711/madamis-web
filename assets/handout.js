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
    <div class="note b small">このページの内容は事実です（犯人役は「何をしたか」も事実として書かれています）。HOに書かれていない細かいことは、事件の事実と矛盾しない範囲で自由に決めてOK。</div>
  </article>
</main><footer class="foot">${esc(H.scenario)} — ネタバレ禁止</footer>`;
$('#unveil').addEventListener('click', () => $('#veil').classList.remove('closed'));
M.notebook('madamis:' + H.sid + ':memo:' + H.id, H.name + 'のメモ');
})();
