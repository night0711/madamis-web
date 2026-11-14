/* 投票ページ：画面共有している人が票数を入力 → カウントダウン → 開票演出 → 確認ののち真相ページへ */
(function(){
'use strict';
const M = window.Madamis, D = window.SCENARIO, $ = M.$, $$ = M.$$, esc = M.esc;
const KEY = 'madamis:' + D.id + ':votes';
const options = D.characters.map(c => ({ id: c.id, name: c.name, color: c.color, motif: c.motif, initial: c.initial })).concat(Array.isArray(D.vote.extra) ? D.vote.extra : []);
const votes = Object.assign(Object.fromEntries(options.map(c => [c.id, 0])), M.store.get(KEY, {}));
document.title = '投票｜' + D.title;
$('#app').innerHTML = `
<header class="topbar"><div class="wrap"><a class="brand" href="play.html">← 共通ページ</a><span class="case-no">${esc(D.caseNo)}</span><span class="spacer"></span>
<button class="btn sm ghost toggle" id="snd" type="button"></button></div></header>
<main class="wrap narrow" style="padding-top:var(--s6)">
  <div class="center"><div class="eyebrow">FINAL VOTE</div><h1 style="font-size:var(--t-2xl)">${esc(D.vote.question)}</h1></div>
  <div class="panel file" data-tab="HOW TO VOTE" id="how">
    <ol class="guide" style="list-style:none">${(D.vote.how || ['「3、2、1、どうぞ！」で全員が同時に、犯人だと思う人の名前を言う（またはDiscordのチャットに一斉に書く）。', '画面共有している人が、聞こえたとおりに下の票数を入れる。', '全員そろったら「開票する」で発表！']).map(x => `<li>${x}</li>`).join('')}</ol>
  </div>
  <div class="vote-grid" id="grid">${options.map(c => `
    <div class="vcard c-${c.color}" data-id="${c.id}" style="--c:var(--${c.color})">${M.emblem(c.color, c.motif, c.initial)}
      <h3 style="margin:var(--s2) 0 0">${esc(c.name)}</h3><div class="count" aria-live="polite">?</div>
      <div class="stepper" data-ctl><button class="btn icon sm" type="button" data-d="-1" aria-label="${esc(c.name)}の票を1減らす">−</button><output>${votes[c.id] || 0}</output><button class="btn icon sm" type="button" data-d="1" aria-label="${esc(c.name)}の票を1増やす">＋</button></div>
    </div>`).join('')}</div>
  <div class="btn-row" style="justify-content:center;margin:var(--s5) 0" id="ctl">
    <button class="btn warm" id="open" type="button" style="min-width:200px">🗳 開票する</button>
    <button class="btn sm ghost" id="clear" type="button">票をリセット</button>
  </div>
  <div class="panel center" id="result" hidden style="padding:var(--s6) var(--s5)"></div>
</main>
<div class="countdown" id="cd" aria-live="assertive"></div>
<footer class="foot"></footer>`;
M.soundToggle($('#snd'));
const out = id => $(`.vcard[data-id="${id}"] output`);
$('#grid').addEventListener('click', e => { const b = e.target.closest('[data-d]'); if(!b) return; const id = b.closest('.vcard').dataset.id; votes[id] = Math.max(0, Math.min(9, votes[id] + +b.dataset.d)); out(id).textContent = votes[id]; M.store.set(KEY, votes); M.sound.play('click'); });
$('#clear').addEventListener('click', () => { options.forEach(c => { votes[c.id] = 0; out(c.id).textContent = 0; }); M.store.set(KEY, votes); });
const wait = ms => new Promise(r => setTimeout(r, M.reduce ? Math.min(ms, 200) : ms));
$('#open').addEventListener('click', async () => {
  const sum = Object.values(votes).reduce((a, b) => a + b, 0);
  if(!sum){ M.alert('票数が入力されていません'); return; }
  if(sum !== D.characters.length && !window.__voteAuto && !confirm(`入力された票は${sum}票です（参加者は${D.characters.length}人）。このまま開票しますか？`)) return;
  if(!window.__roomVote){
    const playKey = 'madamis:' + D.id + ':state';
    const cur = Object.assign({}, M.store.get(playKey, {}));
    cur.voteOpen = true;
    cur.voteAt = cur.voteAt || Date.now();
    cur.voteCounts = {};
    options.forEach(c => { cur.voteCounts[c.id] = votes[c.id] || 0; });
    M.store.set(playKey, cur);
    if(window.MadamisSync) MadamisSync.syncRecap(D, cur);
  }
  $('#ctl').hidden = true; $('#how').hidden = true; $$('[data-ctl]').forEach(x => x.hidden = true);
  $$('.count').forEach(x => x.textContent = '0');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const cd = $('#cd'); cd.classList.add('on');
  for(const n of ['3', '2', '1']){ cd.innerHTML = `<span>${n}</span>`; M.sound.play('count'); await wait(900); }
  cd.classList.remove('on'); M.sound.play('drum');
  // 1票ずつカウントアップ
  const max = Math.max(...options.map(c => votes[c.id] || 0));
  for(let k = 1; k <= max; k++){ for(const c of options){ if((votes[c.id] || 0) >= k){ $(`.vcard[data-id="${c.id}"] .count`).textContent = k; M.sound.play('count'); await wait(420); } } }
  await wait(900);
  const top = options.filter(c => (votes[c.id] || 0) === max && max > 0);
  $$('.vcard').forEach(v => { const win = top.some(c => c.id === v.dataset.id); v.classList.toggle('win', win && top.length === 1); v.classList.toggle('dim', !win || top.length > 1); });
  M.sound.play('hit');
  const r = $('#result'); r.hidden = false;
  const accused = top.length === 1 ? top[0] : null;
  const tone = accused ? (accused.color === 'grey' ? 'grey' : accused.color) : 'grey';
  r.innerHTML = accused
    ? `<div class="eyebrow">RESULT</div><h2>開票は――<br><span style="color:var(--${tone})">${esc(accused.name)}</span></h2><p class="muted">このまま、みんなで真相を開こう。</p>`
    : `<div class="eyebrow">RESULT</div><h2>票が割れた……</h2><p class="muted">同票のため、一つには決まりませんでした。<br>（決選投票をするなら「やり直す」、しないならこのまま真相へ）</p><button class="btn sm ghost" type="button" id="again">やり直す</button>`;
  r.insertAdjacentHTML('beforeend', `<div style="margin-top:var(--s5)"><button class="btn primary" id="truth" type="button">📂 真相を開く</button></div>`);
  r.scrollIntoView({ behavior: M.reduce ? 'auto' : 'smooth', block: 'center' });
  const again = $('#again'); if(again) again.addEventListener('click', () => location.reload());
  $('#truth').addEventListener('click', () => {
    if(!confirm('本当に全員が投票しましたか？\n\nこの先は事件の真相（ネタバレ）です。画面共有のまま、みんなで一緒に開きましょう。')) return;
    try{ sessionStorage.setItem('madamis:voted:' + D.id, '1'); }catch(e){}
    const slug = atob(D.vote.endingRef);
    location.href = slug + '#accused=' + (accused ? accused.id : 'none');
  });
});

const Sync = window.MadamisSync;
const boot = Sync && (Sync.hashCode() || ((Sync.recall(D.id) || {}).code));
if(boot && Sync.valid(boot)){
  window.__roomVote = true;
  const seatKey = 'madamis:' + D.id + ':seat';
  const seatNow = () => { try { return localStorage.getItem(seatKey) || ''; } catch(e){ return ''; } };
  $('#how').insertAdjacentHTML('afterend', `<div class="panel" id="liveVote"><p class="small" id="liveStat"></p><label class="small">あなたの役 <select id="seatPick" aria-label="あなたの役"><option value="">選ぶ</option>${D.characters.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label><div class="btn-row" id="liveBallot" style="margin-top:8px"></div><div id="finaleBox"></div></div>`);
  $('#seatPick').value = seatNow();
  $('#seatPick').addEventListener('change', () => { try { localStorage.setItem(seatKey, $('#seatPick').value); } catch(e){} });
  $$('[data-ctl]').forEach(x => x.hidden = true);
  let opened = false;
  const sync = Sync.connect({
    sid: D.id, code: boot, host: false,
    onChange: s => {
      const seat = seatNow();
      $('#liveStat').textContent = (sync.status === 'live' ? '部屋につながっています。' : '接続しています…') + '投票 ' + Object.keys(s.votes || {}).length + ' / ' + D.characters.length;
      $('#liveBallot').innerHTML = options.map(o => `<button class="btn sm ${s.votes && s.votes[seat] === o.id ? 'primary' : ''}" type="button" data-choice="${esc(o.id)}">${esc(o.name)}</button>`).join('');
      Sync.renderStatements($('#finaleBox'), {
        state: s, active: Sync.isClosingPhase(D.phases, s.phase) , scenario: D,
        options: options, draftKey: 'madamis:' + D.id + ':worddraft',
        getSeat: seatNow,
        onSubmit: (seat, pick, line) => sync.say(seat, pick, line)
      });
      if(s.voteOpen && !opened && Object.keys(s.votes || {}).length){
        opened = true;
        options.forEach(c => { votes[c.id] = 0; });
        Object.keys(s.votes || {}).forEach(k => { if(votes[s.votes[k]] != null) votes[s.votes[k]]++; });
        options.forEach(c => { const o = out(c.id); if(o) o.textContent = votes[c.id]; });
        window.__voteAuto = true;
        $('#open').click();
      }
    },
    onStatus: () => {}
  });
  $('#liveBallot').addEventListener('click', e => {
    const b = e.target.closest('[data-choice]'); if(!b) return;
    const seat = seatNow();
    if(!seat){ M.alert('先に自分の役を選んでください'); return; }
    sync.castVote(seat, b.getAttribute('data-choice'));
  });
}
})();
