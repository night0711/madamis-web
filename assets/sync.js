/* 部屋同期。公開の MQTT 中継（アカウント不要）で、進行・タイマー・公開カード・投票だけを送る。
   ハンドアウトの本文は構造上送れない（送る値は短いIDと数値だけ）。
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

/* 送ってよい形だけに削る。自由文は落とせないので、ここで捨てる。 */
function clean(msg){
  if(!msg || typeof msg !== 'object') return null;
  if(msg.k === 'hello') return { k: 'hello' };
  if(msg.k === 'vote'){
    if(!idOk(msg.seat) || !idOk(msg.choice)) return null;
    return { k: 'vote', seat: msg.seat, choice: msg.choice };
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
  const t = msg.timer || {};
  return {
    k: 'state',
    phase: num(msg.phase, 0, 30),
    revealed: revealed,
    log: log,
    votes: votes,
    voteOpen: !!msg.voteOpen,
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
  return { k: 'state', phase: 0, revealed: [], log: [], votes: {}, voteOpen: false, seq: 0, sentAt: 0, timer: { running: false, endAt: null, remain: null }, _skew: 0 };
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
  return JSON.stringify([s.phase, s.revealed, s.votes, s.voteOpen, s.timer && s.timer.running, s.timer && s.timer.endAt, s.timer && s.timer.remain]);
}

S.connect = function(opts){
  const sid = opts.sid, code = S.normalize(opts.code);
  if(!S.valid(code)) return Promise.reject(new Error('code'));
  if(S._session) S._session.close();
  const saved = loadRoom(sid);
  const host = !!opts.host;
  let state = blank();
  if(saved && saved.code === code && saved.state) state = Object.assign(blank(), saved.state, { _skew: 0 });
  const sess = {
    sid: sid, code: code, isHost: host, state: state, status: 'connecting',
    _sig: '', _closed: false, _try: 0, _mqtt: null, _topic: '', _key: null, _wait: []
  };
  S._session = sess; S._code = code;
  sess.seat = opts.seat || (saved && saved.code === code && saved.seat) || '';
  function persist(){
    saveRoom(sid, { code: code, host: host, seat: sess.seat, state: {
      phase: state.phase, revealed: state.revealed, log: state.log, votes: state.votes,
      voteOpen: state.voteOpen, seq: state.seq, sentAt: state.sentAt, timer: state.timer
    }});
  }
  function emit(){ if(opts.onChange) opts.onChange(state); if(opts.onStatus) opts.onStatus(sess.status); }
  async function publish(obj, retain){
    if(!sess._mqtt || !sess._key) return;
    const bytes = await seal(sess._key, obj);
    try { sess._mqtt.publish(sess._topic, bytes, !!retain); } catch(e){}
  }
  function commit(){
    state.seq = Date.now();
    state.sentAt = Date.now();
    state._skew = 0;
    state.k = 'state';
    persist();
    publish({
      k: 'state', phase: state.phase, revealed: state.revealed, log: state.log, votes: state.votes,
      voteOpen: state.voteOpen, seq: state.seq, sentAt: state.sentAt, timer: state.timer
    }, true);
    emit();
  }
  sess.commit = function(next){
    if(!host) return;
    ['phase', 'revealed', 'log', 'votes', 'voteOpen', 'timer'].forEach(k => { if(next[k] !== undefined) state[k] = next[k]; });
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
  sess.openVotes = function(){ if(host){ state.voteOpen = true; commit(); } };
  sess.clearVotes = function(){ if(host){ state.votes = {}; state.voteOpen = false; commit(); } };
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
            if(msg.k === 'state' && !host){
              if(msg.seq <= state.seq) return;
              const prev = sig(state);
              msg._skew = (msg.sentAt || Date.now()) - Date.now();
              state = msg; sess.state = state;
              persist();
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
})();
