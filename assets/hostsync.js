/* 配布ページの進行操作。送るのはフェーズ番号・カードID・タイマー・投票IDと、最後のひとこと（60字）だけ。 */
(function(){
'use strict';
const M = window.Madamis, D = window.SCENARIO, S = window.MadamisSync;
const root = document.getElementById('hostSync');
if(!root || !D || !S) return;
const esc = M.esc;
const phases = D.phases, clues = D.clues;
const options = D.characters.map(c => ({ id: c.id, name: c.name })).concat((D.vote.extra || []).map(c => ({ id: c.id, name: c.name })));
let sess = null;
let finaleWasOpen = null;

root.innerHTML = `
<div class="panel room-bar">
  <div class="eyebrow">ROOM</div>
  <h2 style="font-size:var(--t-xl)">各人のスマホで同じ進行</h2>
  <p class="small">部屋を作ると、フェーズ・タイマー・めくったカード・投票が、参加した端末に届きます。最終議論では「最後のひとこと」も送れます。公開までは人数だけです。ハンドアウトの中身は送りません。使わないときは、今まで通り画面共有でも遊べます。</p>
  <div class="room-line">
    <button class="btn primary" type="button" id="roomCreate">部屋を作る</button>
    <button class="btn ghost" type="button" id="roomLeave" hidden>部屋を閉じる</button>
  </div>
  <p class="room-code" id="roomCode" hidden></p>
  <p class="small" id="roomStatus" aria-live="polite"></p>
  <div class="btn-row" id="roomLinks" hidden>
    <button class="btn sm" type="button" id="copyPlay">共通ページのリンクをコピー</button>
  </div>
  <div id="roomCtl" hidden>
    <p class="serif" id="hostPhase" style="font-size:1.35rem;margin:12px 0 4px"></p>
    <p class="room-time" id="hostTime">--:--</p>
    <div class="btn-row">
      <button class="btn" type="button" id="hostPrev">前のフェーズ</button>
      <button class="btn warm" type="button" id="hostNext">次のフェーズへ</button>
    </div>
    <div class="btn-row" style="margin-top:8px">
      <button class="btn primary" type="button" id="hostStart">スタート</button>
      <button class="btn ghost" type="button" id="hostReset">時間を戻す</button>
      <button class="btn ghost" type="button" id="hostPlus">＋1分</button>
    </div>
    <div id="hostCards" style="margin-top:12px"></div>
    <div id="hostFinale" hidden>
      <p class="small" id="hostWordCount" aria-live="polite"></p>
      <div class="btn-row">
        <button class="btn warm" type="button" id="hostReveal">一斉に公開</button>
      </div>
      <p class="small muted">出さなくても、このまま投票・開票できます。</p>
      <div id="hostFinaleList"></div>
    </div>
    <p class="small" id="hostVotes" style="margin-top:12px"></p>
    <div class="btn-row">
      <button class="btn warm" type="button" id="hostOpen">開票する</button>
      <button class="btn ghost" type="button" id="hostClear">票を消す</button>
    </div>
  </div>
</div>`;

const $ = id => document.getElementById(id);
function playLink(){ return new URL('play.html#r=' + sess.code, location.href).href; }
function totalSec(){ return ((phases[sess.state.phase] || {}).min || 0) * 60; }
function mutate(fn){ const s = sess.state; fn(s); sess.commit(s); }

function paint(){
  const on = !!sess;
  $('roomLeave').hidden = !on;
  $('roomCode').hidden = !on;
  $('roomLinks').hidden = !on;
  $('roomCtl').hidden = !on;
  $('roomCreate').hidden = on;
  if(!on){ $('roomStatus').textContent = 'まだ部屋はありません。'; return; }
  $('roomCode').textContent = sess.code;
  const label = sess.status === 'live' ? 'つながっています' : '接続しています…';
  $('roomStatus').textContent = label + '。このコードか、下のリンクを参加者に渡してください。';
  const p = phases[sess.state.phase] || phases[0];
  $('hostPhase').textContent = (sess.state.phase + 1) + '. ' + p.name;
  const left = S.leftMs(sess.state);
  const dur = totalSec();
  $('hostTime').textContent = left == null ? '--:--' : M.fmt(Math.max(0, left / 1000));
  $('hostStart').textContent = sess.state.timer.running ? '一時停止' : 'スタート';
  const ready = clues.filter(c => {
    const pi = phases.findIndex(ph => (ph.unlock || []).indexOf(c.id) >= 0);
    return pi >= 0 && sess.state.phase >= pi;
  });
  $('hostCards').innerHTML = ready.map(c => {
    const open = sess.state.revealed.indexOf(c.id) >= 0;
    return `<button class="btn sm ${open ? 'ghost' : 'warm'}" type="button" data-card="${esc(c.id)}" ${open ? 'disabled' : ''}>${open ? '公開済み' : 'めくる'} ${esc(c.no)} ${esc(c.title)}</button>`;
  }).join(' ') || '<p class="small muted">このフェーズでめくるカードは、まだありません。</p>';
  const votes = sess.state.votes || {};
  const n = Object.keys(votes).length;
  let line = '投票 ' + n + ' / ' + D.characters.length;
  if(sess.state.voteOpen){
    const counts = {};
    options.forEach(o => counts[o.id] = 0);
    Object.keys(votes).forEach(seat => { if(counts[votes[seat]] != null) counts[votes[seat]]++; });
    line += '　' + options.map(o => o.name + ' ' + counts[o.id]).join(' / ');
  } else line += '（開票するまで、票の中身は出しません）';
  $('hostVotes').textContent = line;
  const closingAt = phases.findIndex((_, i) => S.isClosingPhase(phases, i));
  const wordsNow = !!sess.state.wordsOpen;
  const showFinale = wordsNow || (closingAt >= 0 && sess.state.phase >= closingAt);
  $('hostFinale').hidden = !showFinale;
  if(showFinale){
    const submitted = S.submitted(sess.state).length;
    $('hostWordCount').textContent = submitted + '人が提出済み';
    $('hostReveal').hidden = wordsNow;
    const list = $('hostFinaleList');
    if(wordsNow){
      const html = S.cardsInner(D, sess.state);
      if(list.dataset.html !== html){
        list.innerHTML = '<div class="finale-list" aria-live="polite">' + html + '</div>';
        list.dataset.html = html;
        if(finaleWasOpen === false) S.animateCards(list);
      }
    } else if(list.dataset.html){
      list.innerHTML = '';
      delete list.dataset.html;
    }
  }
  finaleWasOpen = wordsNow;
}

function start(code, host){
  sess = S.connect({
    sid: D.id, code: code, host: host,
    onChange: paint, onStatus: paint
  });
  paint();
}

$('roomCreate').addEventListener('click', () => start(S.makeCode(), true));
$('roomLeave').addEventListener('click', () => {
  if(!confirm('部屋を閉じます。各端末は、画面共有の進行に戻ります。')) return;
  S.leave(D.id); sess = null; paint();
});
$('copyPlay').addEventListener('click', async () => {
  const ok = await M.copy(playLink());
  M.alert(ok ? '共通ページのリンクをコピーしました' : 'コピーできませんでした', true);
});
$('hostPrev').addEventListener('click', () => { if(sess.state.phase > 0) mutate(s => { s.phase--; s.timer = { running: false, endAt: null, remain: null }; }); });
$('hostNext').addEventListener('click', () => { if(sess.state.phase < phases.length - 1) mutate(s => { s.phase++; s.timer = { running: false, endAt: null, remain: null }; }); });
$('hostStart').addEventListener('click', () => mutate(s => {
  const left = S.leftMs(s);
  const dur = totalSec();
  if(!dur) return;
  if(s.timer.running){ s.timer = { running: false, endAt: null, remain: Math.max(0, left / 1000) }; }
  else {
    const sec = left == null || left <= 0 ? dur : left / 1000;
    s.timer = { running: true, endAt: Date.now() + sec * 1000, remain: null };
  }
}));
$('hostReset').addEventListener('click', () => mutate(s => { s.timer = { running: false, endAt: null, remain: null }; }));
$('hostPlus').addEventListener('click', () => mutate(s => {
  if(s.timer.running && s.timer.endAt) s.timer = { running: true, endAt: s.timer.endAt + 60000, remain: null };
  else {
    const base = S.leftMs(s);
    const sec = (base == null ? totalSec() : base / 1000) + 60;
    s.timer = { running: false, endAt: null, remain: sec };
  }
}));
$('hostCards').addEventListener('click', e => {
  const b = e.target.closest('[data-card]'); if(!b || !sess) return;
  const id = b.getAttribute('data-card');
  if(sess.state.revealed.indexOf(id) >= 0) return;
  mutate(s => { s.revealed = s.revealed.concat([id]); s.log = s.log.concat([[Date.now(), id]]); });
});
$('hostReveal').addEventListener('click', () => {
  if(!sess) return;
  if(!S.submitted(sess.state).length){ M.alert('まだ提出がありません。このまま投票できます'); return; }
  if(sess.openWords()) M.sound.play('phase');
});
$('hostOpen').addEventListener('click', () => { if(sess) sess.openVotes(); });
$('hostClear').addEventListener('click', () => { if(sess) sess.clearVotes(); });
setInterval(() => {
  if(!sess || !sess.state.timer.running) return;
  const left = S.leftMs(sess.state);
  $('hostTime').textContent = left == null ? '--:--' : M.fmt(Math.max(0, left / 1000));
}, 500);

const remembered = S.recall(D.id);
if(remembered && remembered.host && S.valid(remembered.code)) start(remembered.code, true);
else paint();
})();
