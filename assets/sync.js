/* 部屋同期。公開の MQTT 中継（アカウント不要）で、進行・タイマー・公開カード・投票と、
   最後のひとこと（60字まで。公開までは人数だけ）を送る。
   ハンドアウトの本文は構造上送れない。自由文は、プレイヤーが打った短いひとこと以外は捨てる。
   部屋コードがなければ、今まで通り各端末のローカル進行（画面共有）のまま。 */
(function(){
'use strict';
const M = window.Madamis || {};
const S = window.MadamisSync = {};
const BROKER = 'wss://broker.hivemq.com:8884/mqtt';
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function encStr(s){
  const b = new TextEncoder().encode(s);
  const out = new Uint8Array(2 + b.length);
  out[0] = (b.length >> 8) & 255; out[1] = b.length & 255;
  out.set(b, 2); return out;
}
function rl(n){
  const o = [];
  do { let d = n % 128; n = Math.floor(n / 128); if(n > 0) d |= 128; o.push(d); } while(n > 0);
  return new Uint8Array(o);
}
function cat(parts){
  let n = 0; parts.forEach(p => n += p.length);
  const out = new Uint8Array(n); let i = 0;
  parts.forEach(p => { out.set(p, i); i += p.length; });
  return out;
}
function connectPkt(id){
  const body = cat([encStr('MQTT'), new Uint8Array([4, 2, 0, 30]), encStr(id)]);
  return cat([new Uint8Array([0x10]), rl(body.length), body]);
}
function subPkt(topic, pid){
  const body = cat([new Uint8Array([(pid >> 8) & 255, pid & 255]), encStr(topic), new Uint8Array([0])]);
  return cat([new Uint8Array([0x82]), rl(body.length), body]);
}
function pubPkt(topic, bytes, retain){
  const body = cat([encStr(topic), bytes]);
  return cat([new Uint8Array([retain ? 0x31 : 0x30]), rl(body.length), body]);
}
function decodePub(u){
  let i = 1, mul = 1, len = 0, d;
  do { d = u[i++]; len += (d & 127) * mul; mul *= 128; } while(d & 128);
  const tl = (u[i] << 8) | u[i + 1]; i += 2;
  const topic = new TextDecoder().decode(u.slice(i, i + tl)); i += tl;
  if(((u[0] >> 1) & 3) > 0) i += 2;
  return { topic: topic, payload: u.slice(i) };
}
function idOk(s){ return typeof s === 'string' && /^[a-z0-9]{1,16}$/.test(s); }
function num(n, a, b){ n = +n; if(!isFinite(n)) return a; return Math.max(a, Math.min(b, Math.floor(n))); }

/* プレイヤーが打った一行だけ。ハンドアウト本文や改行は入れない。 */
function clipLine(s){
  if(typeof s !== 'string') return '';
  s = s.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  const chars = Array.from(s);
  if(chars.length > 60) s = chars.slice(0, 60).join('');
  return s;
}
function stamp(n){ return typeof n === 'number' && n > 0 ? num(n, 0, 1e15) : 0; }

/* 送ってよい形だけに削る。自由文は、公開後のひとこと（60字）以外は捨てる。 */
function clean(msg){
  if(!msg || typeof msg !== 'object') return null;
  if(msg.k === 'hello') return { k: 'hello' };
  if(msg.k === 'vote'){
    if(!idOk(msg.seat) || !idOk(msg.choice)) return null;
    return { k: 'vote', seat: msg.seat, choice: msg.choice };
  }
  if(msg.k === 'word'){
    if(!idOk(msg.seat) || !idOk(msg.pick)) return null;
    const line = clipLine(msg.line);
    if(!line) return null;
    return { k: 'word', seat: msg.seat, pick: msg.pick, line: line };
  }
  if(msg.k !== 'state') return null;
  const revealed = [];
  (msg.revealed || []).forEach(id => { if(idOk(id) && revealed.length < 40) revealed.push(id); });
  const votes = {};
  if(msg.votes && typeof msg.votes === 'object'){
    Object.keys(msg.votes).forEach(k => { if(idOk(k) && idOk(msg.votes[k])) votes[k] = msg.votes[k]; });
  }
  const log = [];
  (msg.log || []).forEach(x => { if(Array.isArray(x) && idOk(x[1]) && log.length < 40) log.push([num(x[0], 0, 1e15), x[1]]); });
  const marks = [];
  (msg.marks || []).forEach(x => { if(Array.isArray(x) && marks.length < 40) marks.push([num(x[0], 0, 1e15), num(x[1], 0, 30)]); });
  const wordsOpen = !!msg.wordsOpen;
  const words = {};
  const wordSeats = [];
  (msg.wordSeats || []).forEach(id => { if(idOk(id) && wordSeats.length < 12 && wordSeats.indexOf(id) < 0) wordSeats.push(id); });
  if(wordsOpen && msg.words && typeof msg.words === 'object'){
    Object.keys(msg.words).forEach(k => {
      if(!idOk(k) || Object.keys(words).length >= 12) return;
      const w = msg.words[k];
      if(!w || !idOk(w.pick)) return;
      const line = clipLine(w.line);
      if(!line) return;
      words[k] = { pick: w.pick, line: line };
      if(wordSeats.indexOf(k) < 0) wordSeats.push(k);
    });
  }
  const t = msg.timer || {};
  return {
    k: 'state',
    phase: num(msg.phase, 0, 30),
    revealed: revealed,
    log: log,
    marks: marks,
    votes: votes,
    voteOpen: !!msg.voteOpen,
    voteAt: stamp(msg.voteAt),
    words: words,
    wordSeats: wordSeats,
    wordsOpen: wordsOpen,
    wordsAt: stamp(msg.wordsAt),
    seq: num(msg.seq, 0, 1e15),
    sentAt: typeof msg.sentAt === 'number' ? msg.sentAt : 0,
    timer: {
      running: !!t.running,
      endAt: typeof t.endAt === 'number' ? t.endAt : null,
      remain: typeof t.remain === 'number' ? t.remain : null
    }
  };
}

async function derive(code){
  const enc = new TextEncoder();
  const topicRaw = await crypto.subtle.digest('SHA-256', enc.encode('madamis-topic:' + code));
  const keyRaw = await crypto.subtle.digest('SHA-256', enc.encode('madamis-key:' + code));
  const hex = [...new Uint8Array(topicRaw)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
  const key = await crypto.subtle.importKey('raw', keyRaw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  return { topic: 'mw1/' + hex, key: key };
}
async function seal(key, obj){
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, new TextEncoder().encode(JSON.stringify(obj))));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv, 0); out.set(ct, 12); return out;
}
async function openSeal(key, bytes){
  if(!bytes || bytes.length < 13) return null;
  try {
    const iv = bytes.slice(0, 12), ct = bytes.slice(12);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ct);
    return clean(JSON.parse(new TextDecoder().decode(plain)));
  } catch(e){ return null; }
}

function blank(){
  return {
    k: 'state', phase: 0, revealed: [], log: [], marks: [], votes: {}, voteOpen: false, voteAt: 0,
    words: {}, wordSeats: [], wordsOpen: false, wordsAt: 0,
    seq: 0, sentAt: 0, timer: { running: false, endAt: null, remain: null }, _skew: 0
  };
}
function normalize(state){
  state.revealed = Array.isArray(state.revealed) ? state.revealed : [];
  state.log = Array.isArray(state.log) ? state.log : [];
  state.marks = Array.isArray(state.marks) ? state.marks : [];
  state.votes = state.votes && typeof state.votes === 'object' ? state.votes : {};
  state.words = state.words && typeof state.words === 'object' ? state.words : {};
  state.wordSeats = Array.isArray(state.wordSeats) ? state.wordSeats : [];
  state.wordsOpen = !!state.wordsOpen;
  state.voteOpen = !!state.voteOpen;
  state.voteAt = state.voteAt || 0;
  state.wordsAt = state.wordsAt || 0;
  state.timer = state.timer || { running: false, endAt: null, remain: null };
  return state;
}
function storeKey(sid){ return 'madamis:' + sid + ':room'; }
function loadRoom(sid){ try { return JSON.parse(localStorage.getItem(storeKey(sid)) || 'null'); } catch(e){ return null; } }
function saveRoom(sid, data){ try { localStorage.setItem(storeKey(sid), JSON.stringify(data)); } catch(e){} }

S.normalize = function(s){ return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); };
S.valid = function(s){ return /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/.test(s); };
S.hashCode = function(){ const m = location.hash.match(/r=([A-Za-z0-9]{8})/); return m ? S.normalize(m[1]) : ''; };
S.currentCode = function(){ return S._code || ''; };
S.leftMs = function(state){
  if(!state || !state.timer) return null;
  const t = state.timer;
  if(t.running && typeof t.endAt === 'number') return t.endAt - (state._skew || 0) - Date.now();
  if(typeof t.remain === 'number') return t.remain * 1000;
  return null;
};

function Mqtt(){}
Mqtt.prototype.connect = function(){
  const self = this;
  return new Promise((resolve, reject) => {
    let ws;
    const timer = setTimeout(() => { try{ ws && ws.close(); }catch(e){} reject(new Error('timeout')); }, 8000);
    try { ws = new WebSocket(BROKER, ['mqtt']); } catch(e){ clearTimeout(timer); reject(e); return; }
    ws.binaryType = 'arraybuffer';
    self.ws = ws;
    self.pid = 1;
    self._on = [];
    ws.onmessage = ev => {
      const u = new Uint8Array(ev.data);
      const type = u[0] >> 4;
      if(type === 3){ const d = decodePub(u); self._on.forEach(fn => fn(d.payload)); }
    };
    ws.onopen = () => ws.send(connectPkt('mw' + Math.random().toString(16).slice(2, 10)));
    ws.onerror = () => {};
    const waitConn = (ev) => {
      const u = new Uint8Array(ev.data);
      if((u[0] >> 4) === 2){
        ws.removeEventListener('message', waitConn);
        clearTimeout(timer);
        if(u[3] !== 0){ reject(new Error('conn')); return; }
        self.ping = setInterval(() => { try{ ws.send(new Uint8Array([0xC0, 0])); }catch(e){} }, 20000);
        resolve();
      }
    };
    ws.addEventListener('message', waitConn);
    ws.onclose = () => { clearInterval(self.ping); if(self.onclose) self.onclose(); };
  });
};
Mqtt.prototype.subscribe = function(topic){
  const self = this, pid = this.pid++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('sub')), 8000);
    const fn = ev => {
      const u = new Uint8Array(ev.data);
      if((u[0] >> 4) === 9){ self.ws.removeEventListener('message', fn); clearTimeout(timer); resolve(); }
    };
    this.ws.addEventListener('message', fn);
    this.ws.send(subPkt(topic, pid));
  });
};
Mqtt.prototype.publish = function(topic, bytes, retain){ this.ws.send(pubPkt(topic, bytes, retain)); };
Mqtt.prototype.onPayload = function(fn){ this._on.push(fn); };
Mqtt.prototype.close = function(){ this.onclose = null; clearInterval(this.ping); try{ this.ws && this.ws.close(); }catch(e){} };

function sig(s){
  const seats = (s.wordSeats || []).join(',');
  const lines = s.wordsOpen ? JSON.stringify(s.words || {}) : '';
  return JSON.stringify([
    s.phase, s.revealed, s.votes, s.voteOpen, s.voteAt || 0,
    s.timer && s.timer.running, s.timer && s.timer.endAt, s.timer && s.timer.remain,
    !!s.wordsOpen, seats, lines, s.marks || [], s.wordsAt || 0
  ]);
}

S.connect = function(opts){
  const sid = opts.sid, code = S.normalize(opts.code);
  if(!S.valid(code)) return Promise.reject(new Error('code'));
  if(S._session) S._session.close();
  const saved = loadRoom(sid);
  const host = !!opts.host;
  let state = blank();
  if(saved && saved.code === code && saved.state) state = normalize(Object.assign(blank(), saved.state, { _skew: 0 }));
  if(host){
    let sh = null;
    try { sh = JSON.parse(localStorage.getItem('madamis:' + sid + ':hostshadow') || 'null'); } catch(e){}
    if(sh && sh.code === code && sh.state){
      const alt = sh.state;
      if(Object.keys(alt.words || {}).length > Object.keys(state.words || {}).length){
        state.words = alt.words;
        if(alt.wordsOpen) state.wordsOpen = true;
        if(alt.wordsAt) state.wordsAt = alt.wordsAt;
      }
      if((alt.marks || []).length > (state.marks || []).length) state.marks = alt.marks;
      if((alt.log || []).length > (state.log || []).length) state.log = alt.log;
    }
  }
  const sess = {
    sid: sid, code: code, isHost: host, state: state, status: 'connecting',
    _sig: '', _closed: false, _try: 0, _mqtt: null, _topic: '', _key: null, _wait: []
  };
  S._session = sess; S._code = code;
  sess.seat = opts.seat || (saved && saved.code === code && saved.seat) || '';
  function snapshot(){
    const seats = (state.wordSeats && state.wordSeats.length)
      ? state.wordSeats.filter(idOk)
      : Object.keys(state.words || {}).filter(idOk);
    return {
      phase: state.phase, revealed: state.revealed, log: state.log, marks: state.marks,
      votes: state.votes, voteOpen: state.voteOpen, voteAt: state.voteAt || 0,
      words: (host || state.wordsOpen) ? state.words : {},
      wordSeats: seats, wordsOpen: !!state.wordsOpen, wordsAt: state.wordsAt || 0,
      seq: state.seq, sentAt: state.sentAt, timer: state.timer
    };
  }
  function persist(){
    if(!host){
      try {
        const cur = JSON.parse(localStorage.getItem(storeKey(sid)) || 'null');
        if(cur && cur.host && cur.code === code) return;
      } catch(e){}
    }
    saveRoom(sid, { code: code, host: host, seat: sess.seat, state: snapshot() });
    if(host){
      try { localStorage.setItem('madamis:' + sid + ':hostshadow', JSON.stringify({ code: code, state: snapshot() })); } catch(e){}
    }
  }
  function wire(){
    const seats = Object.keys(state.words || {}).filter(idOk).slice(0, 12);
    const words = {};
    if(state.wordsOpen) seats.forEach(k => { if(state.words[k]) words[k] = { pick: state.words[k].pick, line: state.words[k].line }; });
    return {
      k: 'state', phase: state.phase, revealed: state.revealed, log: state.log, marks: state.marks,
      votes: state.votes, voteOpen: !!state.voteOpen, voteAt: state.voteAt || 0,
      words: words, wordSeats: seats, wordsOpen: !!state.wordsOpen, wordsAt: state.wordsAt || 0,
      seq: state.seq, sentAt: state.sentAt, timer: state.timer
    };
  }
  function maybeRecap(){
    const D = window.SCENARIO;
    if(D && state.seq) S.syncRecap(D, state);
  }
  function emit(){ if(opts.onChange) opts.onChange(state); if(opts.onStatus) opts.onStatus(sess.status); }
  async function publish(obj, retain){
    if(!sess._mqtt || !sess._key) return;
    const bytes = await seal(sess._key, obj);
    try { sess._mqtt.publish(sess._topic, bytes, !!retain); } catch(e){}
  }
  function trackPhase(){
    const marks = Array.isArray(state.marks) ? state.marks.slice() : [];
    const last = marks.length ? marks[marks.length - 1] : null;
    if(!last || last[1] !== state.phase) marks.push([Date.now(), state.phase]);
    if(marks.length > 40) marks.splice(0, marks.length - 40);
    state.marks = marks;
  }
  function commit(){
    trackPhase();
    state.wordSeats = Object.keys(state.words || {}).filter(idOk).slice(0, 12);
    state.seq = Math.max(Date.now(), (state.seq || 0) + 1);
    state.sentAt = Date.now();
    state._skew = 0;
    state.k = 'state';
    persist();
    publish(wire(), true);
    maybeRecap();
    emit();
  }
  sess.commit = function(next){
    if(!host) return;
    ['phase', 'revealed', 'log', 'marks', 'votes', 'voteOpen', 'voteAt', 'timer', 'words', 'wordsOpen', 'wordsAt'].forEach(k => { if(next[k] !== undefined) state[k] = next[k]; });
    commit();
  };
  sess.castVote = function(seat, choice){
    if(!idOk(seat) || !idOk(choice)) return;
    if(host){ state.votes = Object.assign({}, state.votes); state.votes[seat] = choice; commit(); }
    else {
      state.votes = Object.assign({}, state.votes); state.votes[seat] = choice; emit(); persist();
      publish({ k: 'vote', seat: seat, choice: choice }, false);
    }
  };
  sess.say = function(seat, pick, line){
    line = clipLine(line);
    if(!idOk(seat) || !idOk(pick) || !line || state.wordsOpen) return;
    if(host){ state.words = Object.assign({}, state.words); state.words[seat] = { pick: pick, line: line }; commit(); }
    else publish({ k: 'word', seat: seat, pick: pick, line: line }, false);
  };
  sess.openVotes = function(){ if(host){ state.voteOpen = true; if(!state.voteAt) state.voteAt = Date.now(); commit(); } };
  sess.openWords = function(){
    if(!host || state.wordsOpen) return false;
    if(!Object.keys(state.words || {}).length) return false;
    state.wordsOpen = true;
    state.wordsAt = Date.now();
    commit();
    return true;
  };
  sess.clearVotes = function(){ if(host){ state.votes = {}; state.voteOpen = false; state.voteAt = 0; commit(); } };
  sess.hello = function(){ publish({ k: 'hello' }, false); };
  sess.close = function(){ sess._closed = true; if(sess._beat) clearInterval(sess._beat); if(sess._mqtt) sess._mqtt.close(); if(S._session === sess) S._session = null; };
  async function loop(){
    const d = await derive(code);
    sess._topic = d.topic; sess._key = d.key;
    while(!sess._closed){
      const mqtt = new Mqtt();
      sess._mqtt = mqtt;
      try {
        await mqtt.connect();
        await new Promise((resolve, reject) => {
          mqtt.onclose = () => reject(new Error('drop'));
          mqtt.onPayload(async bytes => {
            const msg = await openSeal(d.key, bytes);
            if(!msg) return;
            if(msg.k === 'hello' && host){ commit(); return; }
            if(msg.k === 'vote' && host){
              state.votes = Object.assign({}, state.votes);
              state.votes[msg.seat] = msg.choice;
              commit();
              return;
            }
            if(msg.k === 'word' && host){
              if(!state.wordsOpen){
                state.words = Object.assign({}, state.words);
                state.words[msg.seat] = { pick: msg.pick, line: msg.line };
                commit();
              }
              return;
            }
            if(msg.k === 'state' && !host){
              if(msg.seq <= state.seq) return;
              const prev = sig(state);
              msg._skew = (msg.sentAt || Date.now()) - Date.now();
              state = msg; sess.state = state;
              persist();
              maybeRecap();
              if(sig(state) !== prev) emit();
              else if(opts.onTick) opts.onTick(state);
            }
          });
          mqtt.subscribe(d.topic).then(resolve, reject);
        });
        sess._try = 0;
        sess.status = 'live';
        if(host) commit();
        else { sess.hello(); emit(); }
        if(sess._beat) clearInterval(sess._beat);
        if(host) sess._beat = setInterval(() => { if(!sess._closed) commit(); }, 8000);
        await new Promise((resolve, reject) => { mqtt.onclose = () => reject(new Error('drop')); });
      } catch(e){
        if(sess._closed) return;
        sess.status = 'connecting';
        emit();
        sess._try = Math.min(6, sess._try + 1);
        await new Promise(r => setTimeout(r, 700 * sess._try));
      }
    }
  }
  persist();
  queueMicrotask(emit);
  loop();
  return sess;
};

S.leave = function(sid){
  try { localStorage.removeItem(storeKey(sid)); } catch(e){}
  try { localStorage.removeItem('madamis:' + sid + ':hostshadow'); } catch(e){}
  S._code = '';
  if(S._session) S._session.close();
};

S.recall = loadRoom;
S.tally = function(state, ids){
  const counts = {};
  ids.forEach(id => counts[id] = 0);
  Object.keys((state && state.votes) || {}).forEach(seat => {
    const ch = state.votes[seat];
    if(counts[ch] != null) counts[ch]++;
  });
  return counts;
};
S.winner = function(state, ids){
  const counts = S.tally(state, ids);
  let best = 'none', n = 0, tie = false, any = 0;
  ids.forEach(id => {
    any += counts[id];
    if(counts[id] > n){ n = counts[id]; best = id; tie = false; }
    else if(counts[id] === n && n > 0) tie = true;
  });
  if(!any || tie) return 'none';
  return best;
};
S.makeCode = function(){
  const a = new Uint8Array(8); crypto.getRandomValues(a);
  let s = ''; for(let i = 0; i < 8; i++) s += ALPHA[a[i] % ALPHA.length];
  return s;
};

S.clipLine = clipLine;
S.isClosingPhase = function(phases, index){
  const p = phases && phases[index];
  if(!p) return false;
  if(p.id === 'final' || p.id === 'vote') return true;
  const name = String(p.name || '');
  return name.indexOf('最終') >= 0 || name.indexOf('投票') >= 0;
};
S.optionsOf = function(D){
  return (D.characters || []).map(c => ({ id: c.id, name: c.name })).concat(((D.vote || {}).extra || []).map(c => ({ id: c.id, name: c.name })));
};
S.nameOf = function(D, id){
  const o = S.optionsOf(D).filter(x => x.id === id)[0];
  if(o) return o.name;
  const c = (D.characters || []).filter(x => x.id === id)[0];
  return c ? c.name : '';
};
S.submitted = function(state){
  if(!state) return [];
  const out = [];
  const add = id => { if(idOk(id) && out.indexOf(id) < 0) out.push(id); };
  (state.wordSeats || []).forEach(add);
  Object.keys(state.words || {}).forEach(add);
  return out;
};
S.timelineItems = function(D, state){
  if(!D || !state) return [];
  const items = [];
  const marks = (state.marks || []).filter(x => Array.isArray(x) && x.length >= 2);
  const log = (state.log || []).filter(x => Array.isArray(x) && x.length >= 2);
  let t0 = 0;
  const touch = t => { if(typeof t === 'number' && t > 0 && (!t0 || t < t0)) t0 = t; };
  marks.forEach(x => touch(x[0]));
  log.forEach(x => touch(x[0]));
  touch(state.voteAt);
  touch(state.wordsAt);
  if(!t0) t0 = Date.now();
  const minOf = t => Math.floor(Math.max(0, (t || t0) - t0) / 60000) + '分';
  marks.forEach(x => {
    const p = (D.phases || [])[x[1]];
    if(!p || !p.name) return;
    items.push({ t: x[0], min: minOf(x[0]), text: p.name + 'が始まる' });
  });
  log.forEach(x => {
    const c = (D.clues || []).filter(cl => cl.id === x[1])[0];
    if(!c) return;
    items.push({ t: x[0], min: minOf(x[0]), text: 'カード' + c.no + '「' + c.title + '」をめくった' });
  });
  if(state.wordsOpen && state.words){
    const wt = state.wordsAt || state.voteAt || t0;
    const order = (D.characters || []).map(c => c.id);
    order.forEach(seat => {
      const w = state.words[seat];
      if(!w || !w.line) return;
      const who = S.nameOf(D, seat) || '参加者';
      const pick = S.nameOf(D, w.pick) || '';
      items.push({ t: wt, min: minOf(wt), text: who + 'のひとこと：' + pick + '。「' + w.line + '」' });
    });
  }
  if(state.voteOpen){
    const vt = state.voteAt || t0;
    const votes = state.votes || {};
    const seats = Object.keys(votes);
    if(seats.length){
      const order = (D.characters || []).map(c => c.id);
      order.filter(id => votes[id]).forEach(seat => {
        items.push({ t: vt, min: minOf(vt), text: (S.nameOf(D, seat) || '参加者') + 'の票 → ' + (S.nameOf(D, votes[seat]) || '') });
      });
      const counts = S.tally(state, S.optionsOf(D).map(o => o.id));
      const tally = S.optionsOf(D).map(o => o.name + ' ' + (counts[o.id] || 0)).join('、');
      items.push({ t: vt + 1, min: minOf(vt), text: '開票　' + tally });
    } else if(state.voteCounts){
      const tally = S.optionsOf(D).map(o => o.name + ' ' + (state.voteCounts[o.id] || 0)).join('、');
      items.push({ t: vt, min: minOf(vt), text: '開票　' + tally });
    }
  }
  items.sort((a, b) => a.t - b.t);
  return items.map(it => ({ min: it.min, text: it.text }));
};
S.syncRecap = function(D, state){
  if(!D || !state || !M.store) return;
  const key = 'madamis:' + D.id + ':recap';
  if(!state.voteOpen){
    if(state.seq) M.store.del(key);
    return;
  }
  const items = S.timelineItems(D, state);
  if(!items.length) return;
  M.store.set(key, { items: items, voteAt: state.voteAt || 0 });
};
S.recapHTML = function(D, state){
  const esc = M.esc;
  const items = S.timelineItems(D, state);
  if(!items.length) return '';
  return '<details class="recap"><summary>今夜の振り返り</summary><ol class="timeline">' +
    items.map(it => '<li><time>' + esc(it.min) + '</time><span>' + esc(it.text) + '</span></li>').join('') +
    '</ol><p class="xs muted">この欄は、今夜の進行の記録だけです。</p></details>';
};
S.animateCards = function(root){
  if(!root) return;
  const reduce = !!(M && M.reduce);
  root.querySelectorAll('.finale-card').forEach((card, i) => {
    if(reduce) return;
    card.classList.add('arm');
    setTimeout(() => card.classList.add('go'), 240 * i);
  });
};
S.renderStatements = function(el, ctx){
  if(!el) return;
  const esc = M.esc;
  const state = ctx.state || {};
  const open = !!state.wordsOpen;
  const show = !!(ctx.active || open);
  if(!show){
    el.hidden = true;
    if(el._mode){ el.innerHTML = ''; el._mode = ''; }
    return;
  }
  el.hidden = false;
  const mode = open ? 'open' : 'form';
  const animate = el._wasOpen === false && open;
  el._wasOpen = open;
  if(el._mode !== mode){
    el._mode = mode;
    if(mode === 'form'){
      const opts = ctx.options || [];
      el.innerHTML = '<div class="finale"><div class="eyebrow">LAST WORD</div><h3>最後のひとこと推理</h3>' +
        '<p class="small">容疑者を一人と、一行の理由（60字まで）。公開されるまで中身は見えず、人数だけが共有されます。出さなくても投票できます。</p>' +
        '<label class="finale-label">容疑者<select data-pick aria-label="容疑者"><option value="">選ぶ</option>' +
        opts.map(o => '<option value="' + esc(o.id) + '">' + esc(o.name) + '</option>').join('') +
        '</select></label>' +
        '<label class="finale-label">ひとこと<input data-line type="text" maxlength="60" autocomplete="off" placeholder="一行で、理由" aria-label="ひとことの理由"></label>' +
        '<p class="xs muted" data-left>0 / 60</p>' +
        '<button class="btn primary" type="button" data-send>提出する</button>' +
        '<p class="small" data-count aria-live="polite">0人が提出済み</p>' +
        '<p class="small muted" data-mine></p></div>';
      const line = el.querySelector('[data-line]');
      const left = el.querySelector('[data-left]');
      const pick = el.querySelector('[data-pick]');
      try {
        const draft = JSON.parse(sessionStorage.getItem(ctx.draftKey || '') || 'null');
        if(draft){ if(draft.pick) pick.value = draft.pick; if(draft.line) line.value = draft.line; }
      } catch(e){}
      const countChars = () => { const n = Array.from(line.value || '').length; left.textContent = Math.min(n, 60) + ' / 60'; };
      const saveDraft = () => {
        if(!ctx.draftKey) return;
        try { sessionStorage.setItem(ctx.draftKey, JSON.stringify({ pick: pick.value, line: line.value })); } catch(e){}
      };
      countChars();
      line.addEventListener('input', () => { countChars(); saveDraft(); });
      pick.addEventListener('change', saveDraft);
      el.querySelector('[data-send]').addEventListener('click', () => {
        const seat = ctx.getSeat ? ctx.getSeat() : '';
        const choice = pick.value;
        const text = clipLine(line.value);
        if(!seat){ M.alert('先に自分の役を選んでください'); return; }
        if(!choice){ M.alert('容疑者を選んでください'); return; }
        if(!text){ M.alert('ひとことを一行入れてください'); return; }
        if(ctx.onSubmit) ctx.onSubmit(seat, choice, text);
        if(M.sound) M.sound.play('click');
      });
    } else {
      el.innerHTML = '<div class="finale finale-reveal"><div class="eyebrow">LAST WORD</div><h3>最後のひとこと</h3><div class="finale-list" aria-live="polite">' +
        S.cardsInner(ctx.scenario, state) + '</div></div>';
      if(animate){
        S.animateCards(el);
        if(M.sound) M.sound.play('phase');
      }
    }
  }
  if(mode === 'form'){
    const n = S.submitted(state).length;
    const c = el.querySelector('[data-count]');
    if(c) c.textContent = n + '人が提出済み';
    const seat = ctx.getSeat ? ctx.getSeat() : '';
    const mine = el.querySelector('[data-mine]');
    if(mine) mine.textContent = seat && S.submitted(state).indexOf(seat) >= 0 ? '提出しました。公開まで、ほかの人には見えません。' : '';
  }
};
S.cardsInner = function(D, state){
  const esc = M.esc;
  const order = (D.characters || []).map(c => c.id);
  return order.filter(seat => state.words && state.words[seat] && state.words[seat].line).map(seat => {
    const w = state.words[seat];
    return '<article class="finale-card"><p class="who">' + esc(S.nameOf(D, seat)) + '</p><p class="pick">→ ' + esc(S.nameOf(D, w.pick)) + '</p><p class="line">' + esc(w.line) + '</p></article>';
  }).join('');
};
})();
