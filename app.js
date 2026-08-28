
"use strict";

/* ==================================================================
   ROUNDS
   Main draw and qualifying are separate ladders. Within each, a lower
   level means closer to the end of that ladder.
   ================================================================== */
const MAIN_LEVELS = {"F":0,"FINAL":0,"FINALS":0,"SF":1,"SEMIFINAL":1,"SEMIFINALS":1,
  "QF":2,"QUARTERFINAL":2,"QUARTERFINALS":2,
  "R16":3,"R32":4,"R64":5,"R128":6,"R256":7,"R512":8};
const QUAL_LEVELS = {"QFR":0,"QF R":0,"QR3":1,"QR2":2,"QR1":3};
const MAIN_LABEL = {0:"F",1:"SF",2:"QF",3:"R16",4:"R32",5:"R64",6:"R128",7:"R256",8:"R512"};
const QUAL_LABEL = {0:"QFR",1:"QR3",2:"QR2",3:"QR1"};

/* Round headers come in two shapes: the long form "Singles R32 Results" and
   the bare form "R32" used in the draw threads. The discipline is optional in
   the bare form and falls back to the one chosen on the Add data tab. */
const HEADER_RE = /^(?:(Singles|Doubles)\s+)?(F|SF|QF|R\d{1,3}|QR\d|QFR)(?:\s+Results)?\s*:?\s*$/i;
const HEADER_LONG_RE = /^(Singles|Doubles)\s+(\S+)\s+Results/i;
/* The tag is written "#SRs:" in main-draw posts and "#SR:" in some qualifying
   ones, so the "s" is optional. */
const MATCH_RE  = /^\s*(\d+):(\d+)\s*\|\s*(.+?)\s+vs\.\s*(.+?)\s*#SRs?:\s*(\d+)-(\d+)\s*(.*)$/;
const SETS_RE   = /Sets to the winner:\s*(\d+)-(\d+)/i;

/* ==================================================================
   PLAYER REGISTRY
   One entry per real person, keyed case-insensitively. Holds every
   spelling and country code ever seen so slips surface instead of
   silently creating a second player.
   ================================================================== */
const REG = new Map();   // key -> {key, names:Counter, countries:Counter, name, country, pinned}

/* Entry-status seeds carry a number in the source (Q1, LL1, ALT2) that says
   which qualifier or alternate slot was used. That distinction isn't wanted,
   so they all collapse to the plain status. ATL is folded into ALT as a typo.
   Ordinary numeric seeds are left exactly as they are. */
function normSeed(v){
  const t = String(v ?? "").trim();
  if(!t) return "";
  if(/^Q\s*\d*$/i.test(t))        return "Q";
  if(/^LL\s*\d*$/i.test(t))       return "LL";
  if(/^(ALT|ATL)\s*\d*$/i.test(t)) return "ALT";
  if(/^SE\s*\d*$/i.test(t))       return "SE";
  if(/^WC\s*\d*$/i.test(t))       return "WC";
  return t;
}

/* ------------------------------------------------------------------
   ALIASES
   When a player changes username, one key is pointed at another so both
   spellings feed a single record. Every identity lookup runs through
   keyOf, so aliasing here reaches matches, teams and rankings alike.
   ------------------------------------------------------------------ */
const ALIAS = new Map();          // old key -> current key

/* "lucian_iasi" and "lucian iasi" are the same person typed two ways, which
   happens constantly in these posts. Treating the underscore as a space keeps
   them as one player instead of quietly splitting a record in two. */
const rawKey = n => String(n).trim().toLowerCase().replace(/_/g," ").replace(/\s+/g," ");
function keyOf(n){
  let k = rawKey(n), guard = 0;
  while(ALIAS.has(k) && guard++ < 20) k = ALIAS.get(k);   // guard stops a cycle
  return k;
}
const teamKeyOf = t => String(t).split("/").map(p=>keyOf(p)).sort().join(" / ");

function bump(counter, val){ if(val!=null && val!=="") counter[val]=(counter[val]||0)+1; }
/* Most frequent value wins. On a tie, fall back to alphabetical order so the
   answer never depends on which source happened to be read first — otherwise
   saving and reloading could silently flip a name or a country code. */
function topOf(counter){
  const keys = Object.keys(counter);
  if(!keys.length) return null;
  keys.sort((a,b) => (counter[b]-counter[a]) || a.localeCompare(b));
  return keys[0];
}

function seePlayer(name, country){
  if(!name || /^bye$/i.test(name)) return null;
  const k = keyOf(name);
  let e = REG.get(k);
  if(!e){ e = {key:k, names:{}, countries:{}, name:name, country:country||"", pinned:false}; REG.set(k,e); }
  bump(e.names, name);
  bump(e.countries, country);
  if(!e.pinned){
    e.name = topOf(e.names) || name;
    e.country = topOf(e.countries) || "";
  }
  return e;
}
const canonName    = n => (REG.get(keyOf(n))||{}).name    ?? n;
const canonCountry = n => (REG.get(keyOf(n))||{}).country ?? "";

/* A team's display name uses each partner's canonical spelling,
   in a stable alphabetical order so the same pair always reads the same. */
function canonTeam(team){
  return String(team).split("/").map(p=>canonName(p.trim()))
    .sort((a,b)=>a.toLowerCase().localeCompare(b.toLowerCase())).join("/");
}

/* ==================================================================
   DRAW PARSER
   ================================================================== */
function parseSide(token){
  token = String(token).trim();
  if(/^bye(\s*\/\s*bye)*$/i.test(token)) return {bye:true, seed:"", name:"BYE", country:""};
  let country="";
  const c = token.match(/\(([^()]*)\)\s*$/);
  if(c){ country = c[1].trim(); token = token.slice(0,c.index).trim(); }
  let seed="";
  const s = token.match(/^\(([^()]*)\)\s+/);
  if(s){ seed = normSeed(s[1]); token = token.slice(s[0].length).trim(); }
  return {bye:false, seed, name:token, country};
}

/* Identity used to follow a side from one round into the next. */
function sideKey(side, isDoubles){
  if(side.bye) return null;
  return isDoubles ? teamKeyOf(side.name) : keyOf(side.name);
}

function parseDraw(text, stage, defaultDisc){
  defaultDisc = defaultDisc || "Singles";
  const qual = stage === "Qualifying";
  const LEVELS = qual ? QUAL_LEVELS : MAIN_LEVELS;
  const LABEL  = qual ? QUAL_LABEL  : MAIN_LABEL;
  const groups = [], bad = [], unknownRounds = [];
  let cur = null;

  for(const raw of String(text).split(/\r?\n/)){
    const line = raw.trim();
    if(!line) continue;
    const h = line.match(HEADER_LONG_RE) || line.match(HEADER_RE);
    if(h){
      const lbl = h[2].toUpperCase();
      const level = LEVELS[lbl];
      if(level === undefined){ unknownRounds.push(h[2]); cur = null; continue; }
      const named = h[1] ? h[1][0].toUpperCase()+h[1].slice(1).toLowerCase() : defaultDisc;
      cur = {disc: named, level, matches:[]};
      groups.push(cur);
      continue;
    }
    if(/^Matches (Counted|Remaining)/i.test(line)) continue;
    const m = line.match(MATCH_RE);
    if(m && cur){
      const rest = m[7] || "";
      const sets = rest.match(SETS_RE);
      cur.matches.push({
        score:[+m[1],+m[2]], sr:[+m[5],+m[6]],
        sets: sets ? [+sets[1],+sets[2]] : null,
        pts1: /PTS1/i.test(rest),
        sides:[parseSide(m[3]), parseSide(m[4])],
        raw: line
      });
    } else if(cur && /\bvs\.?\s/i.test(line)){
      bad.push(line);
    }
  }

  // Who appears in each round.
  const members = new Map();
  for(const g of groups){
    const isD = g.disc === "Doubles";
    const set = new Set();
    for(const mt of g.matches) for(const s of mt.sides){
      const k = sideKey(s, isD); if(k) set.add(k);
    }
    members.set(g.disc+"|"+g.level, set);
  }

  const out = [], pending = [];
  for(const g of groups){
    const isD = g.disc === "Doubles";
    const next = members.get(g.disc+"|"+(g.level-1)) || new Set();
    for(const mt of g.matches){
      const meta = {disc:g.disc, isDoubles:isD, level:g.level,
        round: LABEL[g.level] ?? String(g.level), stage, match:mt};
      const d = decideWinner(mt, next, isD, g.level, g.disc, stage);
      if(d === null){ pending.push(meta); continue; }
      out.push(makeRow(meta, d.idx, d.method));
    }
  }
  return {rows:out, pending, bad, unknownRounds, groupCount:groups.length};
}

function decideWinner(mt, next, isD, level, disc, stage){
  const [L,R] = mt.sides;
  if(L.bye && !R.bye) return {idx:1, method:"bye"};
  if(R.bye && !L.bye) return {idx:0, method:"bye"};
  if(L.bye && R.bye)  return null;

  // 1. Bracket ground truth — whoever turns up in the next round won this one.
  const lk = sideKey(L,isD), rk = sideKey(R,isD);
  let lAdv = next.has(lk), rAdv = next.has(rk);

  // 1b. A qualifying final has no next round here, but its winner walks into
  //     the main draw. If that draw is already loaded, use it.
  if(stage === "Qualifying" && level === 0 && !lAdv && !rAdv){
    const md = mainDrawEntrants(disc);
    lAdv = md.has(lk); rAdv = md.has(rk);
  }
  if(lAdv && !rAdv) return {idx:0, method:"bracket"};
  if(rAdv && !lAdv) return {idx:1, method:"bracket"};

  // 2. Fall back to the numbers.
  const [s1,s2] = mt.score;   if(s1!==s2) return {idx:s1>s2?0:1, method:"score"};
  const [a1,a2] = mt.sr;      if(a1!==a2) return {idx:a1>a2?0:1, method:"score"};
  if(mt.sets){ const [b1,b2]=mt.sets; if(b1!==b2) return {idx:b1>b2?0:1, method:"score"}; }

  // 3. Level on everything. Only a person can call it.
  return null;
}

/* Sides present in the main draw of the event currently being added. */
let PENDING_EVENT = "";
function mainDrawEntrants(disc){
  const set = new Set();
  for(const r of MATCHES){
    if(r.stage!=="Main" || r.disc!==disc || r.event!==PENDING_EVENT) continue;
    set.add(disc==="Doubles" ? teamKeyOf(r.winner) : keyOf(r.winner));
    set.add(disc==="Doubles" ? teamKeyOf(r.loser)  : keyOf(r.loser));
  }
  return set;
}

let ROW_ID = 0;
function makeRow(meta, idx, method){
  const mt = meta.match;
  const w = mt.sides[idx], l = mt.sides[1-idx];
  if(!meta.isDoubles){ seePlayer(w.name, w.country); seePlayer(l.name, l.country); }
  else {
    const wp = w.name.split("/"), wc = (w.country||"").split("/");
    const lp = l.name.split("/"), lc = (l.country||"").split("/");
    wp.forEach((p,i)=>seePlayer(p.trim(), (wc[i]||"").trim()));
    lp.forEach((p,i)=>seePlayer(p.trim(), (lc[i]||"").trim()));
  }
  return {
    id:++ROW_ID, disc:meta.disc, stage:meta.stage, event:"", season:"", week:"",
    round:meta.round, level:meta.level,
    winnerSeed:w.seed, winner:w.name, winnerCountry:w.country,
    loserSeed:l.seed,  loser:l.name,  loserCountry:l.country,
    winnerScore:mt.score[idx], loserScore:mt.score[1-idx],
    winnerSC:mt.sr[idx],       loserSC:mt.sr[1-idx],
    winnerRank:"", loserRank:"",
    method, isBye:w.bye||l.bye, tied:mt.pts1, raw:mt.raw
  };
}

/* ==================================================================
   RANKING PARSER
   1 (1) Michael!(GER).......................2795 ...45 ...30 ...25 ...140
   ================================================================== */
const RANK_RE = /^\s*(\d+)\s*\((\d+|NR|-)\)\s*(.+?)\(([A-Za-z]{2,4})\)\s*\.{2,}\s*(\d+)((?:\s*\.{2,}\s*\d+)*)/;
/* Title lines aren't consistent between years:
     "TT Singles Rankings 2026: January 5th"
     "TT Singles Rankings January 6th 2025"
   so rather than match one layout, pull the year, the date and the tour out of
   wherever they appear. Dates are normalised to "January 6th" so the same week
   written either way is recognised as one week. */
const MONTH_RE = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i;
function ordinal(n){
  const v=+n, t=v%100;
  if(t>=11 && t<=13) return v+"th";
  return v + ({1:"st",2:"nd",3:"rd"}[v%10] || "th");
}
function parseTitle(line){
  const yr = (line.match(/\b(?:19|20)\d{2}\b/) || [])[0] || "";
  const dm = line.match(MONTH_RE);
  const week = dm ? dm[1][0].toUpperCase()+dm[1].slice(1).toLowerCase()+" "+ordinal(dm[2]) : "";
  const tour = /\bdoubles\b/i.test(line) ? "Doubles"
             : /\bsingles\b/i.test(line) ? "Singles" : "";
  return {season:yr, week, tour};
}

/* ------------------------------------------------------------------
   BULK PASTE
   A whole forum thread can go in at once. Each week begins at its title
   line; everything between titles that isn't a ranking row — post
   headers, reaction lines, the "Weeks at #1" tables, stray comments —
   simply never matches and is passed over. A line only counts as a title
   if a month and day can actually be read from it, so a remark like
   "rankings are going to be late this week" doesn't start a new block.
   ------------------------------------------------------------------ */
function parseRankingBlocks(text){
  const lines = String(text).split(/\r?\n/);
  const starts = [];
  lines.forEach((l,i)=>{
    if(!/rankings?/i.test(l)) return;
    const t = parseTitle(l);
    if(t.week) starts.push({i,t});
  });
  if(!starts.length) return [{text:String(text), title:null}];
  return starts.map((s,k)=>({
    text: lines.slice(s.i, k+1<starts.length ? starts[k+1].i : lines.length).join("\n"),
    title: s.t
  }));
}

function parseRankings(text){
  const lines = String(text).split(/\r?\n/);
  const list = [], bad = [];
  let week = "", season = "", tour = "";

  for(const raw of lines){
    const line = raw.trim();
    if(!line) continue;
    const m = line.match(RANK_RE);
    if(m){
      const tail = (m[6]||"").split(/\.{2,}/).map(s=>s.trim()).filter(Boolean).map(Number);
      list.push({
        rank:+m[1], prev:(m[2]==="NR"||m[2]==="-")?"":+m[2],
        name:m[3].trim(), country:m[4].toUpperCase().trim(),
        points:+m[5], events: tail.length ? tail[0] : ""
      });
      continue;
    }
    if(!week && /rankings?/i.test(line)){
      const t = parseTitle(line);
      if(t.week){ week = t.week; season = t.season; tour = t.tour; }
      continue;
    }
    if(/^\s*\d+\s*\(/.test(line)) bad.push(line);
  }
  return {list, week, season, tour, bad};
}
/* ==================================================================
   STATE
   ================================================================== */
let MATCHES = [];              // every parsed match row
let PENDING = [];              // matches awaiting a human verdict
let WEEKS   = [];              // [{name, season, list:[...], index:Map(key->rank)}]
let DUPES   = [];              // rejected duplicate rows
const SEEN  = new Set();       // duplicate detection keys

const $  = id => document.getElementById(id);
/* This one script drives two pages: the public viewer and the editor. The
   viewer simply has fewer elements, so every lookup that might be absent goes
   through these instead of assuming the element is there. */
const has = id => !!document.getElementById(id);
const on  = (id, ev, fn) => { const el=$(id); if(el) el.addEventListener(ev, fn); };
const setText = (id, v) => { const el=$(id); if(el) el.textContent = v; };
const EDIT = document.body.dataset.mode === "edit";

/* index.html, desk.html and app.js are uploaded together. Updating only some
   of them leaves a page whose markup and code disagree, which shows up as a
   blank tab rather than an error, so they carry a matching stamp. */
const APP_VERSION = "2026-08-28e";
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

function matchKey(r){
  const a = r.disc==="Doubles" ? teamKeyOf(r.winner) : keyOf(r.winner);
  const b = r.disc==="Doubles" ? teamKeyOf(r.loser)  : keyOf(r.loser);
  return [r.disc, r.stage, keyOf(r.event), r.round, a, b].join("|");
}

/* ==================================================================
   SHARED SORTABLE TABLE
   ================================================================== */
function makeTable(cfg){
  const state = {key:cfg.defaultSort||null, dir:cfg.defaultDir||1};
  function head(){
    const tr = $(cfg.head); tr.innerHTML = "";
    cfg.cols().forEach(c => {
      const th = document.createElement("th");
      th.innerHTML = `${esc(c.h)}<span class="arr">${state.key===c.k&&state.dir<0?"\u25B2":"\u25BC"}</span>`;
      if(c.cls==="num") th.style.textAlign = "right";
      if(state.key===c.k) th.classList.add("sorted");
      th.addEventListener("click", ()=>{ state.dir = state.key===c.k ? -state.dir : (c.desc?-1:1);
        state.key=c.k; render(); });
      tr.appendChild(th);
    });
    if(cfg.extraHead){ const th=document.createElement("th"); th.className="nosort editcol"; tr.appendChild(th); }
  }
  function sorted(rows){
    if(!state.key) return rows;
    const col = cfg.cols().find(c=>c.k===state.key) || {};
    const k = col.sortAs || state.key;
    return rows.slice().sort((a,b)=>{
      let x=a[k], y=b[k];
      const nx=parseFloat(x), ny=parseFloat(y);
      const bothNum = !isNaN(nx)&&!isNaN(ny)&&String(x).trim()!==""&&String(y).trim()!=="";
      if(bothNum) return (nx-ny)*state.dir;
      x=String(x??"").toLowerCase(); y=String(y??"").toLowerCase();
      if(x==="") return 1; if(y==="") return -1;
      return x.localeCompare(y)*state.dir;
    });
  }
  function render(){
    head();
    const rows = sorted(cfg.rows());
    const tb = $(cfg.body); tb.innerHTML = "";
    const cols = cfg.cols();
    const frag = document.createDocumentFragment();
    rows.forEach(r=>{
      const tr = document.createElement("tr");
      if(cfg.rowClass){ const c=cfg.rowClass(r); if(c) tr.className=c; }
      cols.forEach(c=>{
        const td = document.createElement("td");
        if(c.cls) td.className = c.cls;
        if(c.render){ const v=c.render(r); if(v instanceof Node) td.appendChild(v); else td.innerHTML=v; }
        else { const v=r[c.k]; td.textContent = (v===""||v==null) ? "\u2014" : v; }
        tr.appendChild(td);
      });
      if(cfg.extraCell){ const td=document.createElement("td"); td.className="editcol";
        const n=cfg.extraCell(r); if(n) td.appendChild(n); tr.appendChild(td); }
      frag.appendChild(tr);
    });
    tb.appendChild(frag);
    if(cfg.empty) $(cfg.empty).style.display = rows.length ? "none" : "block";
    cfg.last = rows;
  }
  return {render, cols:cfg.cols, current:()=>cfg.last||[]};
}

function wlBar(w,l){
  const t=w+l, pct = t ? Math.round(w/t*100) : 0;
  const d=document.createElement("div"); d.className="wl";
  const b=document.createElement("div"); b.className="wlbar";
  const i=document.createElement("i"); i.style.width=pct+"%"; b.appendChild(i);
  const s=document.createElement("span"); s.className="wlpct"; s.textContent = t ? pct+"%" : "\u2014";
  d.appendChild(b); d.appendChild(s); return d;
}

/* ==================================================================
   DERIVED STATISTICS
   Everything below is recomputed from MATCHES — nothing is stored twice.
   ================================================================== */
const isQ  = s => /^Q\d*$/i.test(String(s||"").trim());
const isLL = s => /^LL\d*$/i.test(String(s||"").trim());
const rankNum = v => { const n=parseInt(v,10); return isNaN(n)?null:n; };

function blankRec(){
  return {w:0,l:0,titles:0,finals:0,sfs:0,t10w:0,t10l:0,
          qw:0,ql:0,qualified:0,mdQw:0,mdQl:0,mdLLw:0,mdLLl:0,lastTitle:""};
}

function derivePlayers(){
  const rec = new Map();
  const get = n => { const k=keyOf(n); if(!rec.has(k)) rec.set(k,blankRec()); return rec.get(k); };

  for(const r of MATCHES){
    if(r.disc!=="Singles" || r.isBye) continue;
    const W=get(r.winner), L=get(r.loser);
    if(r.stage==="Main"){
      W.w++; L.l++;
      const lr=rankNum(r.loserRank), wr=rankNum(r.winnerRank);
      if(lr!==null && lr<=10) W.t10w++;
      if(wr!==null && wr<=10) L.t10l++;
      if(r.round==="F"){ W.titles++; L.finals++; W.lastTitle=r.event; }
      if(r.round==="SF"){ L.sfs++; }
      if(isQ(r.winnerSeed))  W.mdQw++;
      if(isQ(r.loserSeed))   L.mdQl++;
      if(isLL(r.winnerSeed)) W.mdLLw++;
      if(isLL(r.loserSeed))  L.mdLLl++;
    } else {
      W.qw++; L.ql++;
      if(r.round==="QFR") W.qualified++;
    }
  }

  const out=[];
  for(const [k,v] of rec){
    const e = REG.get(k) || {name:k, country:""};
    out.push({key:k, player:e.name, country:e.country,
      w:v.w,l:v.l, pct:(v.w+v.l)?v.w/(v.w+v.l):-1,
      titles:v.titles, finals:v.finals, sfs:v.sfs,
      t10w:v.t10w, t10l:v.t10l,
      qw:v.qw, ql:v.ql, qualified:v.qualified,
      mdQw:v.mdQw, mdQl:v.mdQl, mdLLw:v.mdLLw, mdLLl:v.mdLLl,
      lastTitle:v.lastTitle});
  }
  return out;
}

function deriveTeams(){
  const rec = new Map(), disp = new Map();
  const get = t => { const k=teamKeyOf(t);
    if(!rec.has(k)){ rec.set(k,blankRec()); disp.set(k,canonTeam(t)); }
    return rec.get(k); };

  for(const r of MATCHES){
    if(r.disc!=="Doubles" || r.isBye) continue;
    const W=get(r.winner), L=get(r.loser);
    if(r.stage==="Main"){
      W.w++; L.l++;
      if(r.round==="F"){ W.titles++; L.finals++; W.lastTitle=r.event; }
      if(r.round==="SF"){ L.sfs++; }
      if(isQ(r.winnerSeed)) W.mdQw++;
      if(isQ(r.loserSeed))  L.mdQl++;
    } else {
      W.qw++; L.ql++;
      if(r.round==="QFR") W.qualified++;
    }
  }
  const out=[];
  for(const [k,v] of rec){
    out.push({key:k, team:disp.get(k), w:v.w, l:v.l,
      pct:(v.w+v.l)?v.w/(v.w+v.l):-1, titles:v.titles, finals:v.finals, sfs:v.sfs,
      qw:v.qw, ql:v.ql, qualified:v.qualified, mdQw:v.mdQw, mdQl:v.mdQl,
      lastTitle:v.lastTitle});
  }
  return out;
}

function deriveTitles(){
  const ev = new Map();
  const nameOf = r => r.disc==="Doubles" ? canonTeam(r.winner) : canonName(r.winner);
  const loseOf = r => r.disc==="Doubles" ? canonTeam(r.loser)  : canonName(r.loser);

  for(const r of MATCHES){
    if(r.stage!=="Main" || r.isBye) continue;
    if(r.round!=="F" && r.round!=="SF") continue;
    const k = r.event+"||"+r.season;
    if(!ev.has(k)) ev.set(k,{event:r.event, season:r.season,
      sW:"",sF:"",sS:[], dW:"",dF:"",dS:[]});
    const e = ev.get(k), s = r.disc==="Doubles" ? "d" : "s";
    if(r.round==="F"){ e[s+"W"]=nameOf(r); e[s+"F"]=loseOf(r); }
    else e[s+"S"].push(loseOf(r));
  }
  return [...ev.values()].map(e=>({
    event:e.event, season:e.season,
    sWinner:e.sW, sFinalist:e.sF, sSF1:e.sS[0]||"", sSF2:e.sS[1]||"",
    dWinner:e.dW, dFinalist:e.dF, dSF1:e.dS[0]||"", dSF2:e.dS[1]||""
  }));
}

/* ==================================================================
   ISSUES
   ================================================================== */
function deriveIssues(){
  const countryConflicts=[], nameVariants=[];
  for(const e of REG.values()){
    const cs = Object.keys(e.countries).filter(Boolean);
    if(cs.length>1) countryConflicts.push({e, options:cs.map(c=>({c,n:e.countries[c]}))
      .sort((a,b)=>b.n-a.n)});
    const ns = Object.keys(e.names);
    if(ns.length>1) nameVariants.push({e, options:ns.map(n=>({n,c:e.names[n]}))
      .sort((a,b)=>b.c-a.c)});
  }
  return {countryConflicts, nameVariants, dupes:DUPES, pending:PENDING};
}
function issueCount(){
  const i = deriveIssues();
  return i.countryConflicts.length + i.nameVariants.length + i.dupes.length + i.pending.length;
}

/* ==================================================================
   CSV
   ================================================================== */
function csvCell(v){ const s=String(v??""); return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; }
function downloadCsv(cols, rows, filename){
  if(!rows.length){ alert("Nothing to download \u2014 that table is empty."); return; }
  const lines=[cols.map(c=>csvCell(c.h)).join(",")];
  rows.forEach(r=>lines.push(cols.map(c=>csvCell(c.csv?c.csv(r):r[c.k])).join(",")));
  const blob=new Blob(["\uFEFF"+lines.join("\r\n")],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob), a=document.createElement("a");
  a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
/* ==================================================================
   TABLE DEFINITIONS
   ================================================================== */
const MATCH_COLS = [
  {k:"event",h:"Event"}, {k:"season",h:"Season",cls:"mono"},
  {k:"disc",h:"Discipline"}, {k:"stage",h:"Stage"},
  {k:"round",h:"Round",cls:"rnd",sortAs:"level"},
  {k:"winnerSeed",h:"Winner Seed",cls:"seed"},
  {k:"winner",h:"Winner",cls:"win",render:r=>esc(r.disc==="Doubles"?canonTeam(r.winner):canonName(r.winner)),
    csv:r=>r.disc==="Doubles"?canonTeam(r.winner):canonName(r.winner)},
  {k:"winnerCountry",h:"Winner Country",cls:"ctry"},
  {k:"loserSeed",h:"Loser Seed",cls:"seed"},
  {k:"loser",h:"Loser",cls:"lose",render:r=>esc(r.disc==="Doubles"?canonTeam(r.loser):canonName(r.loser)),
    csv:r=>r.disc==="Doubles"?canonTeam(r.loser):canonName(r.loser)},
  {k:"loserCountry",h:"Loser Country",cls:"ctry"},
  {k:"winnerScore",h:"Winner Score",cls:"num"}, {k:"loserScore",h:"Loser Score",cls:"num"},
  {k:"winnerSC",h:"Winner SC Score",cls:"num"}, {k:"loserSC",h:"Loser SC Score",cls:"num"},
  {k:"winnerRank",h:"Winner Rank",cls:"num"}, {k:"loserRank",h:"Loser Rank",cls:"num"}
];

const PLAYER_COLS = [
  {k:"player",h:"Player",render:r=>{
      const b=document.createElement("button"); b.className="linkish"; b.textContent=r.player;
      b.addEventListener("click",()=>showRanking("Singles", r.player)); return b;
    }, csv:r=>r.player},
  {k:"country",h:"Country",cls:"ctry"},
  {k:"w",h:"W",cls:"num",desc:true}, {k:"l",h:"L",cls:"num"},
  {k:"pct",h:"Win %",render:r=>wlBar(r.w,r.l),
    csv:r=>(r.w+r.l)?Math.round(r.w/(r.w+r.l)*100)+"%":"",desc:true},
  {k:"titles",h:"Titles",cls:"num",desc:true}, {k:"finals",h:"Finals",cls:"num",desc:true},
  {k:"sfs",h:"Semi-Finals",cls:"num",desc:true},
  {k:"t10w",h:"W vs Top 10",cls:"num",desc:true}, {k:"t10l",h:"L vs Top 10",cls:"num"},
  {k:"qw",h:"Q W",cls:"num",desc:true}, {k:"ql",h:"Q L",cls:"num"},
  {k:"qualified",h:"Times Qualified",cls:"num",desc:true},
  {k:"mdQw",h:"MD W as Q",cls:"num",desc:true}, {k:"mdQl",h:"MD L as Q",cls:"num"},
  {k:"mdLLw",h:"MD W as LL",cls:"num",desc:true}, {k:"mdLLl",h:"MD L as LL",cls:"num"},
  {k:"lastTitle",h:"Most Recent Title"}
];

const TEAM_COLS = [
  {k:"team",h:"Team"},
  {k:"w",h:"W",cls:"num",desc:true}, {k:"l",h:"L",cls:"num"},
  {k:"pct",h:"Win %",render:r=>wlBar(r.w,r.l),
    csv:r=>(r.w+r.l)?Math.round(r.w/(r.w+r.l)*100)+"%":"",desc:true},
  {k:"titles",h:"Titles",cls:"num",desc:true}, {k:"finals",h:"Finals",cls:"num",desc:true},
  {k:"sfs",h:"Semi-Finals",cls:"num",desc:true},
  {k:"qw",h:"Q W",cls:"num",desc:true}, {k:"ql",h:"Q L",cls:"num"},
  {k:"qualified",h:"Times Qualified",cls:"num",desc:true},
  {k:"mdQw",h:"MD W as Q",cls:"num",desc:true}, {k:"mdQl",h:"MD L as Q",cls:"num"},
  {k:"lastTitle",h:"Most Recent Title"}
];

const TITLE_COLS = [
  {k:"event",h:"Event"}, {k:"season",h:"Season",cls:"mono"},
  {k:"sWinner",h:"Singles Winner",cls:"win"}, {k:"sFinalist",h:"Singles Finalist"},
  {k:"sSF1",h:"Singles SF",cls:"dim"}, {k:"sSF2",h:"Singles SF",cls:"dim"},
  {k:"dWinner",h:"Doubles Winner",cls:"win"}, {k:"dFinalist",h:"Doubles Finalist"},
  {k:"dSF1",h:"Doubles SF",cls:"dim"}, {k:"dSF2",h:"Doubles SF",cls:"dim"}
];


/* ==================================================================
   RANKINGS
   Two parallel tours, singles and doubles, sharing one implementation.
   A week is identified by tour + season + name, so "January 5th" in one
   year never collides with "January 5th" in another.
   ================================================================== */

const MONTHS = {january:0,february:1,march:2,april:3,may:4,june:5,july:6,
  august:7,september:8,october:9,november:10,december:11};

/* Week names read like "August 3rd". Turning them into real dates keeps the
   list, the charts and "most recent" in true chronological order instead of
   whatever order they happened to be pasted in. */
function weekDate(name, season){
  const m = String(name||"").match(/([A-Za-z]+)\s+(\d{1,2})\s*(st|nd|rd|th)?/i);
  if(!m) return null;
  const mo = MONTHS[m[1].toLowerCase()];
  if(mo === undefined) return null;
  const yr = parseInt(season,10);
  return new Date(isNaN(yr)?2000:yr, mo, parseInt(m[2],10));
}

const tourWeeks   = tour => WEEKS.filter(w => (w.tour||"Singles") === tour);
const weekLabel   = w => w ? w.name + (w.season ? ` ${w.season}` : "") : "";
/* A history entry keeps its week under .week, not .name, so it needs its own
   label helper — using weekLabel on one silently produced "undefined 2026". */
const histLabel   = h => h ? h.week + (h.season ? ` ${h.season}` : "") : "";
const weekId      = w => `${w.tour||"Singles"}|${w.season||""}|${w.name}`;
const tourSeasons = tour => [...new Set(tourWeeks(tour).map(w=>w.season).filter(Boolean))]
                              .sort((a,b)=>b.localeCompare(a));   // newest first

function sortWeeks(){
  WEEKS.forEach((w,i)=>{ w._i = i; if(w.date===undefined) w.date = weekDate(w.name, w.season); });
  WEEKS.sort((a,b)=>{
    if(a.date && b.date) return a.date - b.date;
    if(a.date) return -1;
    if(b.date) return 1;
    return a._i - b._i;
  });
}

/* One player's whole ranking record on a tour, oldest first. */
function playerHistory(tour, name){
  const k = keyOf(name), out = [];
  let prev = null;
  for(const w of tourWeeks(tour)){
    const hit = (w.list||[]).find(r => keyOf(r.name) === k);
    if(!hit){ prev = null; continue; }
    out.push({week:w.name, season:w.season, date:w.date, rank:hit.rank,
      points:hit.points, move: prev===null ? null : prev-hit.rank});
    prev = hit.rank;
  }
  return out;
}

function historyStats(hist, season){
  if(!hist.length) return null;
  const seasons = [...new Set(hist.map(h=>h.season).filter(Boolean))].sort((a,b)=>b.localeCompare(a));
  const current = hist[hist.length-1];
  const sel = season || current.season || seasons[0] || "";
  const inSeason = hist.filter(h => h.season === sel);
  const best  = a => a.reduce((m,h)=> h.rank < m.rank ? h : m, a[0]);
  const worst = a => a.reduce((m,h)=> h.rank > m.rank ? h : m, a[0]);
  return {
    current,
    careerHigh: best(hist),
    seasonHigh: inSeason.length ? best(inSeason)  : null,
    seasonLow:  inSeason.length ? worst(inSeason) : null,
    weeks: hist.length,
    atNo1:  hist.filter(h=>h.rank===1).length,
    inTop10: hist.filter(h=>h.rank<=10).length,
    seasonWeeks: inSeason.length,
    season: sel, seasons
  };
}

/* The final week of each season, which is what "year-end" means here. */
function yearEndWeeks(tour){
  const by = new Map();
  for(const w of tourWeeks(tour)) if(w.season) by.set(w.season, w);   // sorted, so last wins
  return [...by.entries()].sort((a,b)=>b[0].localeCompare(a[0])).map(e=>e[1]);
}

/* ------------------------------------------------------------------
   CHARTS
   One drawing routine for both metrics. Rank runs downward so number 1
   sits at the top; points run upward the usual way.
   ------------------------------------------------------------------ */
const SVGNS = "http://www.w3.org/2000/svg";
const SERIES_COLOURS = ["var(--ball)", "var(--ball2)"];

function lineChart(series, metric){
  const isRank = metric === "rank";
  const W = 900, H = 270, padR = 18, padT = 18, padB = 42;
  const padL = isRank ? 54 : 72;          // point totals need more room than "#12"
  const svg = document.createElementNS(SVGNS,"svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("class","chart");
  svg.setAttribute("role","img");
  const mk = (tag, attrs, cls) => {
    const e = document.createElementNS(SVGNS, tag);
    for(const k in attrs) e.setAttribute(k, attrs[k]);
    if(cls) e.setAttribute("class", cls);
    return e;
  };

  const live = series.filter(s => s.data.length);
  const total = live.reduce((n,s)=>n+s.data.length, 0);
  if(!total || live.every(s=>s.data.length < 2)){
    const t = mk("text",{x:W/2,y:H/2,"text-anchor":"middle"},"cLabel");
    t.textContent = total ? "Only one week recorded so far" : "Nothing to plot yet";
    svg.appendChild(t); return svg;
  }

  const vals = live.flatMap(s=>s.data.map(d=>d[metric]));
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if(lo === hi){ lo = isRank ? Math.max(1,lo-1) : Math.max(0,lo-1); hi = hi+1; }
  const pad = Math.max(1, Math.round((hi-lo)*0.12));
  lo = isRank ? Math.max(1, lo-pad) : Math.max(0, lo-pad);
  hi = hi + pad;

  // a common time axis across every series
  const stamps = [...new Set(live.flatMap(s=>s.data.map(d=>d.date? d.date.getTime() : null)))]
                   .filter(v=>v!==null).sort((a,b)=>a-b);
  const useDates = stamps.length > 1;
  const maxLen = Math.max(...live.map(s=>s.data.length));
  const xOf = d => {
    const span = W-padL-padR;
    if(useDates && d.date){
      const t0=stamps[0], t1=stamps[stamps.length-1];
      return padL + span * ((d.date.getTime()-t0)/(t1-t0 || 1));
    }
    return padL + span * (maxLen===1 ? .5 : (d._i/(maxLen-1)));
  };
  const yOf = v => isRank
    ? padT + (H-padT-padB) * ((v-lo)/(hi-lo))          // downward
    : H-padB - (H-padT-padB) * ((v-lo)/(hi-lo));       // upward

  // gridlines
  const ticks=[], step=Math.max(1, Math.ceil((hi-lo)/4));
  for(let v=lo; v<=hi; v+=step) ticks.push(v);
  if(ticks[ticks.length-1]!==hi) ticks.push(hi);
  ticks.forEach(v=>{
    svg.appendChild(mk("line",{x1:padL,x2:W-padR,y1:yOf(v),y2:yOf(v)},"cGrid"));
    const t=mk("text",{x:padL-8,y:yOf(v)+4,"text-anchor":"end"},"cLabel");
    t.textContent = isRank ? "#"+v : String(v);
    svg.appendChild(t);
  });

  live.forEach((s, si)=>{
    s.data.forEach((d,i)=> d._i = i);
    const col = SERIES_COLOURS[si % SERIES_COLOURS.length];
    const d = s.data.map((p,i)=> (i?"L":"M")+xOf(p).toFixed(1)+" "+yOf(p[metric]).toFixed(1)).join(" ");
    const path = mk("path",{d, fill:"none"},"cLine");
    path.style.stroke = col;              // inline wins over the .cLine rule
    svg.appendChild(path);
    const bestIdx = isRank
      ? s.data.indexOf(s.data.reduce((m,p)=> p.rank<m.rank?p:m, s.data[0]))
      : -1;
    s.data.forEach((p,i)=>{
      const best = i===bestIdx;
      const c = mk("circle",{cx:xOf(p), cy:yOf(p[metric]), r: best?4.5:2.6}, best?"":"cDot");
      c.style.fill = best ? "var(--court)" : col;
      if(best){ c.style.stroke = col; c.style.strokeWidth = "2.5"; }
      const ttl=document.createElementNS(SVGNS,"title");
      ttl.textContent = `${s.name} \u2014 ${p.week}${p.season?" "+p.season:""}: #${p.rank} (${p.points} pts)`;
      c.appendChild(ttl); svg.appendChild(c);
    });
  });

  // x labels
  const ref = live.reduce((a,b)=> a.data.length>=b.data.length?a:b);
  const multi = new Set(ref.data.map(d=>d.season)).size > 1;
  const label = p => multi
    ? (p.season||"") + " " + p.week.replace(/\s*\d+(st|nd|rd|th)?$/,"").slice(0,3)
    : p.week.replace(/(st|nd|rd|th)$/,"");
  /* keep a minimum gap between labels: weeks are unevenly spaced once several
     seasons are loaded, so index-based thinning alone lets them collide */
  const GAP = multi ? 108 : 92;
  let lastX = -Infinity;
  ref.data.forEach((p,i)=>{
    const last = i===ref.data.length-1;
    const x = xOf(p);
    if(!last && (x-lastX) < GAP) return;
    if(last && (x-lastX) < GAP*0.6){
      const prev = svg.querySelector("text.cLabel[data-x]");
      if(prev && svg.lastElementChild && svg.lastElementChild.classList.contains("cLabel"))
        svg.lastElementChild.remove();
    }
    const anchor = i===0 ? "start" : last ? "end" : "middle";
    const t=mk("text",{x, y:H-14, "text-anchor":anchor, "data-x":Math.round(x)},"cLabel");
    t.textContent = label(p);
    svg.appendChild(t);
    lastX = x;
  });

  if(live.length>1){
    live.forEach((s,si)=>{
      const g=mk("g",{transform:`translate(${padL+si*180},${padT-4})`});
      const ln=mk("line",{x1:0,x2:18,y1:0,y2:0,"stroke-width":2});
      ln.style.stroke=SERIES_COLOURS[si%2]; g.appendChild(ln);
      const t=mk("text",{x:24,y:4},"cLabel"); t.textContent=s.name; g.appendChild(t);
      svg.appendChild(g);
    });
  }
  return svg;
}

/* ------------------------------------------------------------------
   COLUMNS
   ------------------------------------------------------------------ */
const RANK_COLS = [
  {k:"rank",h:"Rank",cls:"num"}, {k:"prev",h:"Prev",cls:"num"},
  {k:"move",h:"Move",render:r=>moveCell(r.prev===""||r.prev==null?null:r.prev-r.rank, r.prev),
    csv:r=>(r.prev===""?"new":r.prev-r.rank)},
  {k:"name",h:"Player",csv:r=>canonName(r.name)},
  {k:"country",h:"Country",cls:"ctry"},
  {k:"points",h:"Points",cls:"num",desc:true},
  {k:"events",h:"# Trn",cls:"num"}
];
const HIST_COLS = [
  {k:"week",h:"Week"}, {k:"season",h:"Season",cls:"mono"},
  {k:"rank",h:"Ranking",cls:"num"}, {k:"points",h:"Points",cls:"num"},
  {k:"move",h:"Change",render:r=>moveCell(r.move,1), csv:r=>r.move??""}
];
function moveCell(d, prev){
  if(prev===""||prev==null) return '<span class="dim">new</span>';
  if(d===null||d===undefined) return '<span class="dim">\u2014</span>';
  if(d>0) return `<span style="color:var(--ball)">\u25B2 ${d}</span>`;
  if(d<0) return `<span style="color:var(--warn)">\u25BC ${-d}</span>`;
  return '<span class="dim">\u2014</span>';
}

/* ------------------------------------------------------------------
   VIEW STATE
   ------------------------------------------------------------------ */
const RANK_UI = {
  Singles:{mount:"rankMount",  sub:"list", season:"", week:null, q:"", player:null,
           metric:"rank", pSeason:"", cmpA:"", cmpB:"", sort:{k:"rank",dir:1}},
  Doubles:{mount:"drankMount", sub:"list", season:"", week:null, q:"", player:null,
           metric:"rank", pSeason:"", cmpA:"", cmpB:"", sort:{k:"rank",dir:1}}
};

function renderRankings(){ ["Singles","Doubles"].forEach(renderTour); }

function renderTour(tour){
  const st = RANK_UI[tour], mount = $(st.mount);
  if(!mount) return;
  const weeks = tourWeeks(tour);
  mount.innerHTML = "";

  if(!weeks.length){
    mount.innerHTML = `<div class="empty"><strong>No ${tour.toLowerCase()} rankings yet</strong>
      ${EDIT ? `Paste a ranking list on the Add data tab and set its tour to ${tour}.`
             : "Nothing has been published here yet."}</div>`;
    return;
  }

  // sub-navigation
  const subs = [["list","Week list"],["yearend","Year-end"],["movers","Movers"],["compare","Compare"]];
  const nav = document.createElement("div"); nav.className="subnav";
  subs.forEach(([k,label])=>{
    const b=document.createElement("button");
    b.textContent=label; b.setAttribute("aria-pressed", String(st.sub===k && !st.player));
    b.addEventListener("click",()=>{ st.sub=k; st.player=null; renderTour(tour); });
    nav.appendChild(b);
  });
  mount.appendChild(nav);

  if(st.player)             renderHistoryPanel(tour, mount);
  else if(st.sub==="yearend") renderYearEnd(tour, mount);
  else if(st.sub==="movers")  renderMovers(tour, mount);
  else if(st.sub==="compare") renderCompare(tour, mount);
  else                        renderWeekPanel(tour, mount);
}

/* helper: a labelled control block */
function field(label, node, cls){
  const d=document.createElement("div"); d.className="field "+(cls||"");
  const l=document.createElement("label"); l.innerHTML=label||"&nbsp;";
  d.appendChild(l); d.appendChild(node); return d;
}
function selectOf(options, value, onChange){
  const s=document.createElement("select");
  options.forEach(([v,t])=>{ const o=document.createElement("option"); o.value=v; o.textContent=t; s.appendChild(o); });
  if(value!=null) s.value=value;
  s.addEventListener("change",()=>onChange(s.value));
  return s;
}
function tableOf(cols, rows, opts){
  const o = opts||{};
  const wrap=document.createElement("div"); wrap.className="tablescroll";
  const tbl=document.createElement("table");
  const thead=document.createElement("thead"), htr=document.createElement("tr");
  cols.forEach(c=>{
    const th=document.createElement("th");
    if(o.sort){
      th.innerHTML=`${esc(c.h)}<span class="arr">${o.sort.k===c.k&&o.sort.dir<0?"\u25B2":"\u25BC"}</span>`;
      if(o.sort.k===c.k) th.classList.add("sorted");
      th.addEventListener("click",()=>o.onSort(c));
    } else { th.className="nosort"; th.textContent=c.h; }
    if(c.cls==="num") th.style.textAlign="right";
    htr.appendChild(th);
  });
  thead.appendChild(htr); tbl.appendChild(thead);
  const tb=document.createElement("tbody");
  rows.forEach(r=>{
    const tr=document.createElement("tr");
    cols.forEach(c=>{
      const td=document.createElement("td");
      if(c.cls) td.className=c.cls;
      if(c.k==="name" && o.onPlayer){
        const b=document.createElement("button"); b.className="linkish";
        b.textContent=canonName(r.name);
        b.addEventListener("click",()=>o.onPlayer(canonName(r.name)));
        td.appendChild(b);
      } else if(c.render){ td.innerHTML=c.render(r); }
      else { const v=r[c.k]; td.textContent=(v===""||v==null)?"\u2014":v; }
      tr.appendChild(td);
    });
    tb.appendChild(tr);
  });
  tbl.appendChild(tb); wrap.appendChild(tbl);
  return wrap;
}

/* ---------------- week list ---------------- */
function renderWeekPanel(tour, mount){
  const st=RANK_UI[tour];
  const seasons=tourSeasons(tour);
  if(seasons.length && !seasons.includes(st.season)) st.season = seasons[0];
  let weeks = tourWeeks(tour).filter(w=>!st.season || w.season===st.season);
  if(!weeks.length) weeks = tourWeeks(tour);
  if(!weeks.some(w=>weekId(w)===st.week)) st.week = weekId(weeks[weeks.length-1]);
  const week = weeks.find(w=>weekId(w)===st.week) || weeks[weeks.length-1];

  const bar=document.createElement("div"); bar.className="controls";
  if(seasons.length>1)
    bar.appendChild(field("Season", selectOf(seasons.map(s=>[s,s]), st.season,
      v=>{ st.season=v; st.week=null; renderTour(tour); }), "xs"));
  bar.appendChild(field("Week", selectOf(
    weeks.slice().reverse().map(w=>[weekId(w), weekLabel(w)]), st.week,
    v=>{ st.week=v; renderTour(tour); }), "md"));
  const inp=document.createElement("input");
  inp.type="text"; inp.placeholder="Player or country\u2026"; inp.value=st.q;
  inp.addEventListener("input",()=>{ st.q=inp.value; renderTour(tour);
    const el=$(st.mount).querySelector(".controls input");
    if(el){ el.focus(); el.setSelectionRange(el.value.length,el.value.length); } });
  bar.appendChild(field("Search", inp, "grow"));
  const dl=document.createElement("button"); dl.className="btn"; dl.textContent="Download CSV";
  bar.appendChild(field("", dl));
  mount.appendChild(bar);

  const q=st.q.trim().toLowerCase();
  let rows=(week?week.list:[]).filter(r=>!q||hay(canonName(r.name),r.country).includes(q));
  dl.addEventListener("click",()=>downloadCsv(RANK_COLS, rows,
    `${tour.toLowerCase()}-rankings-${weekLabel(week).replace(/\s+/g,"-")}.csv`));

  const {k,dir}=st.sort;
  rows=rows.slice().sort((a,b)=>{
    const x=a[k], y=b[k], nx=parseFloat(x), ny=parseFloat(y);
    if(!isNaN(nx)&&!isNaN(ny)) return (nx-ny)*dir;
    return String(x??"").toLowerCase().localeCompare(String(y??"").toLowerCase())*dir;
  });

  mount.appendChild(tableOf(RANK_COLS, rows, {
    sort:st.sort,
    onSort:c=>{ st.sort={k:c.k, dir: st.sort.k===c.k ? -st.sort.dir : (c.desc?-1:1)}; renderTour(tour); },
    onPlayer:n=>{ st.player=n; renderTour(tour); }
  }));
  const hint=document.createElement("p"); hint.className="hint";
  hint.textContent = rows.length ? "Click a player to see their ranking history."
                                 : "Nothing matches that search.";
  mount.appendChild(hint);
}

/* ---------------- year-end ---------------- */
function renderYearEnd(tour, mount){
  const st=RANK_UI[tour];
  const ends=yearEndWeeks(tour);
  if(!ends.length){
    mount.innerHTML+=`<div class="empty"><strong>No completed seasons</strong>Year-end needs at least one week with a season on it.</div>`;
    return;
  }
  const p=document.createElement("p"); p.className="lede";
  p.textContent="The final ranking week of each season.";
  mount.appendChild(p);

  /* Doubles partnerships share a rank, so more than one player can sit at
     the top. List all of them rather than picking one arbitrarily. */
  const champs=ends.map(w=>{
    const list=(w.list||[]).slice().sort((a,b)=>a.rank-b.rank);
    const top=list.length?list[0].rank:null;
    const tied=list.filter(r=>r.rank===top);
    return {season:w.season, week:w.name,
            name: tied.map(r=>canonName(r.name)).join(" \u00b7 "),
            country: [...new Set(tied.map(r=>r.country))].join(" \u00b7 "),
            points: tied.length?tied[0].points:"",
            _one: tied.length===1 ? canonName(tied[0].name) : null};
  });
  const CH=[{k:"season",h:"Season",cls:"mono"},{k:"week",h:"Final week"},
            {k:"name",h:"Year-end no. 1"},
            {k:"country",h:"Country",cls:"ctry"},{k:"points",h:"Points",cls:"num"}];
  mount.appendChild(tableOf(CH, champs));

  const h=document.createElement("h3"); h.className="sec"; h.textContent="Full year-end list";
  mount.appendChild(h);

  if(!ends.some(w=>weekId(w)===st.yeWeek)) st.yeWeek = weekId(ends[0]);
  const bar=document.createElement("div"); bar.className="controls";
  bar.appendChild(field("Season", selectOf(ends.map(w=>[weekId(w), `${w.season} \u2014 ${w.name}`]),
    st.yeWeek, v=>{ st.yeWeek=v; renderTour(tour); }), "md"));
  const dl=document.createElement("button"); dl.className="btn"; dl.textContent="Download CSV";
  bar.appendChild(field("", dl));
  mount.appendChild(bar);

  const wk=ends.find(w=>weekId(w)===st.yeWeek)||ends[0];
  const rows=(wk.list||[]).slice().sort((a,b)=>a.rank-b.rank);
  dl.addEventListener("click",()=>downloadCsv(RANK_COLS, rows,
    `${tour.toLowerCase()}-year-end-${wk.season}.csv`));
  mount.appendChild(tableOf(RANK_COLS, rows, {onPlayer:n=>{ st.player=n; renderTour(tour); }}));
}

/* ---------------- movers ---------------- */
function renderMovers(tour, mount){
  const st=RANK_UI[tour];
  const weeks=tourWeeks(tour);
  if(!weeks.some(w=>weekId(w)===st.mvWeek)) st.mvWeek = weekId(weeks[weeks.length-1]);
  const week=weeks.find(w=>weekId(w)===st.mvWeek)||weeks[weeks.length-1];

  const bar=document.createElement("div"); bar.className="controls";
  bar.appendChild(field("Week", selectOf(weeks.slice().reverse().map(w=>[weekId(w), weekLabel(w)]),
    st.mvWeek, v=>{ st.mvWeek=v; renderTour(tour); }), "md"));
  mount.appendChild(bar);

  const moved=(week.list||[])
    .filter(r=>r.prev!=="" && r.prev!=null)
    .map(r=>({...r, delta:r.prev-r.rank}))
    .filter(r=>r.delta!==0);
  const newcomers=(week.list||[]).filter(r=>r.prev===""||r.prev==null);

  const COLS=[{k:"delta",h:"Move",render:r=>moveCell(r.delta,1),csv:r=>r.delta},
    {k:"name",h:"Player",csv:r=>canonName(r.name)},
    {k:"country",h:"Country",cls:"ctry"},
    {k:"prev",h:"From",cls:"num"},{k:"rank",h:"To",cls:"num"},
    {k:"points",h:"Points",cls:"num"}];

  const pair=document.createElement("div"); pair.className="pairgrid";
  [["Biggest risers", moved.slice().sort((a,b)=>b.delta-a.delta).slice(0,15)],
   ["Biggest fallers", moved.slice().sort((a,b)=>a.delta-b.delta).slice(0,15)]
  ].forEach(([title,rows])=>{
    const col=document.createElement("div");
    const h=document.createElement("p"); h.className="blockhead"; h.textContent=title;
    col.appendChild(h);
    if(rows.length) col.appendChild(tableOf(COLS, rows, {onPlayer:n=>{ st.player=n; renderTour(tour); }}));
    else { const e=document.createElement("p"); e.className="hint"; e.textContent="Nobody moved this week."; col.appendChild(e); }
    pair.appendChild(col);
  });
  mount.appendChild(pair);

  if(newcomers.length){
    const h=document.createElement("h3"); h.className="sec";
    h.textContent=`New entries \u2014 ${newcomers.length}`;
    mount.appendChild(h);
    mount.appendChild(tableOf(
      [{k:"rank",h:"Rank",cls:"num"},{k:"name",h:"Player",csv:r=>canonName(r.name)},
       {k:"country",h:"Country",cls:"ctry"},{k:"points",h:"Points",cls:"num"}],
      newcomers.slice().sort((a,b)=>a.rank-b.rank),
      {onPlayer:n=>{ st.player=n; renderTour(tour); }}));
  }
}

/* ---------------- compare ---------------- */
function renderCompare(tour, mount){
  const st=RANK_UI[tour];
  const names=[...new Set(tourWeeks(tour).flatMap(w=>(w.list||[]).map(r=>canonName(r.name))))]
                .sort((a,b)=>a.toLowerCase().localeCompare(b.toLowerCase()));

  const dl=document.createElement("datalist"); dl.id="cmpNames_"+tour;
  names.forEach(nm=>{ const o=document.createElement("option"); o.value=nm; dl.appendChild(o); });
  mount.appendChild(dl);

  const bar=document.createElement("div"); bar.className="controls";
  const mkInput=(val,ph,set)=>{
    const i=document.createElement("input"); i.type="text"; i.value=val; i.placeholder=ph;
    i.setAttribute("list","cmpNames_"+tour);
    i.addEventListener("change",()=>{ set(i.value); renderTour(tour); });
    return i;
  };
  bar.appendChild(field("Player one", mkInput(st.cmpA,"Start typing\u2026",v=>st.cmpA=v), "grow"));
  bar.appendChild(field("Player two", mkInput(st.cmpB,"Start typing\u2026",v=>st.cmpB=v), "grow"));
  bar.appendChild(field("Metric", selectOf([["rank","Ranking"],["points","Points"]], st.metric,
    v=>{ st.metric=v; renderTour(tour); }), "xs"));
  mount.appendChild(bar);

  const series=[st.cmpA, st.cmpB].filter(Boolean)
    .map(nm=>({name:canonName(nm), data:playerHistory(tour, nm)}));
  if(!series.length){
    const e=document.createElement("div"); e.className="empty";
    e.innerHTML="<strong>Pick two players</strong>Their ranking lines are drawn on one chart.";
    mount.appendChild(e); return;
  }
  const missing=series.filter(s=>!s.data.length);
  if(missing.length){
    const m=document.createElement("div"); m.className="msg warn";
    m.textContent=`No ${tour.toLowerCase()} ranking weeks for ${missing.map(s=>s.name).join(" or ")}.`;
    mount.appendChild(m);
  }
  const box=document.createElement("div"); box.className="chartbox";
  box.appendChild(lineChart(series, st.metric));
  mount.appendChild(box);

  const rows=series.filter(s=>s.data.length).map(s=>{
    const st2=historyStats(s.data);
    return {name:s.name, current:"#"+st2.current.rank, high:"#"+st2.careerHigh.rank,
      weeks:st2.weeks, no1:st2.atNo1, top10:st2.inTop10,
      points:st2.current.points};
  });
  mount.appendChild(tableOf([
    {k:"name",h:"Player"},{k:"current",h:"Current",cls:"num"},{k:"high",h:"Career high",cls:"num"},
    {k:"points",h:"Points",cls:"num"},{k:"weeks",h:"Weeks ranked",cls:"num"},
    {k:"no1",h:"Weeks at no. 1",cls:"num"},{k:"top10",h:"Weeks in top 10",cls:"num"}
  ], rows));
}

/* ---------------- one player's history ---------------- */
function renderHistoryPanel(tour, mount){
  const st=RANK_UI[tour];
  const hist=playerHistory(tour, st.player);
  const stats=historyStats(hist, st.pSeason);

  const bar0=document.createElement("div");
  bar0.style.cssText="display:flex;gap:9px;flex-wrap:wrap;align-items:center";
  const back=document.createElement("button");
  back.className="btn sm"; back.textContent="\u2190 Back";
  back.addEventListener("click",()=>{ st.player=null; st.pSeason=""; renderTour(tour); });
  bar0.appendChild(back);

  /* jump to the same player on the other tour without hunting for them */
  const other = tour==="Singles" ? "Doubles" : "Singles";
  const otherHist = playerHistory(other, st.player);
  const swap=document.createElement("button");
  swap.className="btn sm";
  swap.textContent=`${other} ranking \u2192`;
  if(otherHist.length){
    swap.addEventListener("click",()=>showRanking(other, st.player));
  } else {
    swap.disabled=true; swap.style.opacity=".45";
    swap.title=`No ${other.toLowerCase()} ranking weeks for this player`;
  }
  bar0.appendChild(swap);
  mount.appendChild(bar0);

  const h=document.createElement("h3"); h.className="sec"; h.style.margin="12px 0 2px";
  h.innerHTML=`${esc(canonName(st.player))} <span class="ctry" style="font-size:13px">${esc(canonCountry(st.player))}</span>`;
  mount.appendChild(h);
  const sub=document.createElement("p"); sub.className="lede"; sub.style.margin="0 0 16px";
  sub.textContent=`${tour} ranking history`;
  mount.appendChild(sub);

  if(!stats){
    const e=document.createElement("div"); e.className="empty";
    e.innerHTML=`<strong>Never ranked in ${tour.toLowerCase()}</strong>This player doesn't appear in any ${tour.toLowerCase()} ranking week.`;
    mount.appendChild(e); return;
  }

  if(stats.seasons.length>1){
    const bar=document.createElement("div"); bar.className="controls";
    bar.appendChild(field("Season for the high and low",
      selectOf(stats.seasons.map(s=>[s,s]), stats.season, v=>{ st.pSeason=v; renderTour(tour); }), "sm"));
    mount.appendChild(bar);
  }

  const cards=[
    ["Current","#"+stats.current.rank, histLabel(stats.current)],
    ["Career high","#"+stats.careerHigh.rank, histLabel(stats.careerHigh)],
    ["Season high", stats.seasonHigh?"#"+stats.seasonHigh.rank:"\u2014", histLabel(stats.seasonHigh)],
    ["Season low",  stats.seasonLow ?"#"+stats.seasonLow.rank :"\u2014", histLabel(stats.seasonLow)],
    ["Weeks at no. 1", String(stats.atNo1), stats.atNo1?"career":""],
    ["Weeks in top 10", String(stats.inTop10), stats.inTop10?"career":""],
    ["Weeks ranked", String(stats.weeks), stats.seasons.slice(0,4).join(", ")+(stats.seasons.length>4?"\u2026":"")]
  ];
  const grid=document.createElement("div"); grid.className="statgrid";
  cards.forEach(([k,v,note])=>{
    const c=document.createElement("div"); c.className="stat";
    c.innerHTML=`<span class="k">${esc(k)}</span><span class="v">${esc(v)}</span>
                 <span class="note">${esc(note||"")}</span>`;
    grid.appendChild(c);
  });
  mount.appendChild(grid);

  const toggle=document.createElement("div"); toggle.className="subnav"; toggle.style.margin="0 0 12px";
  [["rank","Ranking"],["points","Points"]].forEach(([k,label])=>{
    const b=document.createElement("button"); b.textContent=label;
    b.setAttribute("aria-pressed", String(st.metric===k));
    b.addEventListener("click",()=>{ st.metric=k; renderTour(tour); });
    toggle.appendChild(b);
  });
  mount.appendChild(toggle);

  const box=document.createElement("div"); box.className="chartbox";
  box.appendChild(lineChart([{name:canonName(st.player), data:hist}], st.metric));
  mount.appendChild(box);

  const bar=document.createElement("div"); bar.className="controls";
  const dl=document.createElement("button"); dl.className="btn"; dl.textContent="Download CSV";
  dl.addEventListener("click",()=>downloadCsv(HIST_COLS, hist,
    `${canonName(st.player).replace(/\W+/g,"_")}-${tour.toLowerCase()}-ranking.csv`));
  bar.appendChild(field("", dl));
  mount.appendChild(bar);

  mount.appendChild(tableOf(HIST_COLS, hist.slice().reverse()));
}

/* Jump straight to a player's ranking history from anywhere. */
function showRanking(tour, name){
  const st=RANK_UI[tour];
  st.player=canonName(name); st.pSeason=""; st.sub="list";
  renderTour(tour);
  const btn=document.querySelector(`#nav button[data-view="${tour==="Doubles"?"drankings":"rankings"}"]`);
  if(btn) btn.click();
}

/* ==================================================================
   FILTERS
   ================================================================== */
const hay = (...v) => v.join(" ").toLowerCase();

const val = id => { const el=$(id); return el ? el.value : ""; };
const setVal = (id,v) => { const el=$(id); if(el) el.value=v; };
function matchRows(){
  const q=val("mQ").trim().toLowerCase();
  const d=val("mDisc"), s=val("mStage"), e=val("mEvent"), r=val("mRound");
  return MATCHES.filter(m =>
    (!d||m.disc===d)&&(!s||m.stage===s)&&(!e||m.event===e)&&(!r||m.round===r)&&
    (!q||hay(m.event,m.season,m.disc,m.stage,m.round,canonName(m.winner),canonName(m.loser),
            m.winnerCountry,m.loserCountry,m.winnerSeed,m.loserSeed).includes(q)));
}
function playerRows(){
  const q=val("pQ").trim().toLowerCase(), c=val("pCtry");
  return derivePlayers().filter(p=>(!c||p.country===c)&&(!q||hay(p.player,p.country).includes(q)));
}
function teamRows(){
  const q=val("tQ").trim().toLowerCase();
  return deriveTeams().filter(t=>!q||t.team.toLowerCase().includes(q));
}
function titleRows(){
  const q=val("ttQ").trim().toLowerCase();
  return deriveTitles().filter(t=>!q||hay(t.event,t.season,t.sWinner,t.sFinalist,t.sSF1,t.sSF2,
    t.dWinner,t.dFinalist,t.dSF1,t.dSF2).includes(q));
}

/* ==================================================================
   TABLE INSTANCES
   ================================================================== */
const tMatches = makeTable({head:"mHead",body:"mBody",empty:"mEmpty",
  cols:()=>MATCH_COLS, rows:matchRows, rowClass:r=>r.tied?"tied":"",
  extraHead:true, extraCell:r=>{
    const b=document.createElement("button"); b.className="flip"; b.textContent="\u21C5";
    b.title="Swap winner and loser";
    b.setAttribute("aria-label",`Swap winner and loser for ${canonName(r.winner)} against ${canonName(r.loser)}`);
    b.addEventListener("click",()=>{ swapRow(r); markDirty(); refreshAll(); }); return b; }});
const tPlayers = makeTable({head:"pHead",body:"pBody",empty:"pEmpty",
  cols:()=>PLAYER_COLS, rows:playerRows, defaultSort:"w", defaultDir:-1});
const tTeams   = makeTable({head:"tHead",body:"tBody",empty:"tEmpty",
  cols:()=>TEAM_COLS, rows:teamRows, defaultSort:"w", defaultDir:-1});
const tTitles  = makeTable({head:"ttHead",body:"ttBody",empty:"ttEmpty",
  cols:()=>TITLE_COLS, rows:titleRows});

function swapRow(r){
  [r.winnerSeed,r.loserSeed]=[r.loserSeed,r.winnerSeed];
  [r.winner,r.loser]=[r.loser,r.winner];
  [r.winnerCountry,r.loserCountry]=[r.loserCountry,r.winnerCountry];
  [r.winnerScore,r.loserScore]=[r.loserScore,r.winnerScore];
  [r.winnerSC,r.loserSC]=[r.loserSC,r.winnerSC];
  [r.winnerRank,r.loserRank]=[r.loserRank,r.winnerRank];
  r.method="manual";
}

/* ==================================================================
   ADDING A DRAW
   ================================================================== */
on("btnDraw", "click", ()=>{
  const msg=$("drawMsg"); msg.className="msg";
  const text=val("drawIn");
  if(!text.trim()){ msg.className="msg err"; msg.textContent="Nothing to add \u2014 the draw box is empty."; return; }
  const event=val("tourn").trim();
  if(!event){ msg.className="msg err"; msg.textContent="Give the event a name first \u2014 without one these matches can't be grouped or filtered."; return; }

  PENDING_EVENT = event;
  const stage=val("stage");
  const {rows,pending,bad,unknownRounds,groupCount}=parseDraw(text,stage,val("drawDisc")||"Singles");

  if(groupCount===0){
    msg.className="msg err";
    msg.textContent = unknownRounds.length
      ? `Round "${unknownRounds[0]}" isn't one this stage uses. Main draw expects F, SF, QF, R16\u2026R256; qualifying expects QR1\u2013QR3 and QFR. Is the Stage set correctly?`
      : 'No round headers found. Each round needs its own line above its matches \u2014 either "R32" on its own or "Singles R32 Results".';
    return;
  }

  const season=val("season").trim(), week=val("rankWeek"), keepByes=$("optByes").checked;
  const wk = tourWeeks("Singles").find(w=>w.name===week && (w.season||"")===season);
  let added=0, dup=0, byes=0, ranked=0;

  for(const r of rows){
    if(r.isBye && !keepByes){ byes++; continue; }
    r.event=event; r.season=season; r.week=week;
    if(wk){ const a=applyRanks(r,wk); ranked+=a; }
    const k=matchKey(r);
    if(SEEN.has(k)){ dup++; DUPES.push(r); continue; }
    SEEN.add(k); MATCHES.push(r); added++;
  }
  pending.forEach(p=>{ p.event=event; p.season=season; p.week=week; });
  PENDING=PENDING.concat(pending);

  const bits=[`Added ${added} ${added===1?"match":"matches"} from ${groupCount} ${groupCount===1?"round":"rounds"}.`];
  if(ranked) bits.push(`${ranked} rank ${ranked===1?"value":"values"} filled from ${week}.`);
  if(byes)   bits.push(`${byes} ${byes===1?"bye":"byes"} skipped.`);
  if(dup)    bits.push(`${dup} already in the table \u2014 skipped, listed under Issues.`);
  if(pending.length) bits.push(`${pending.length} need${pending.length===1?"s":""} a winner \u2014 see below.`);
  if(bad.length) bits.push(`${bad.length} line${bad.length===1?"":"s"} didn't match the expected format.`);
  msg.className = (dup||pending.length||bad.length) ? "msg warn" : "msg";
  msg.textContent = bits.join(" ");
  setVal("drawIn", "");
  markDirty(); refreshAll();
});

function applyRanks(r, wk){
  let n=0;
  if(r.disc==="Singles"){
    const a=wk.index.get(keyOf(r.winner)), b=wk.index.get(keyOf(r.loser));
    if(a!=null){ r.winnerRank=a; n++; }
    if(b!=null){ r.loserRank=b;  n++; }
  }
  return n;
}

/* ==================================================================
   ADDING RANKINGS
   ================================================================== */
on("btnRank", "click", ()=>{
  const msg=$("rankMsg"); msg.className="msg";
  const text=val("rankIn");
  if(!text.trim()){ msg.className="msg err"; msg.textContent="Nothing to add \u2014 the ranking box is empty."; return; }

  const blocks=parseRankingBlocks(text);
  const forcedTour=val("rankTour");
  const seasonOverride=val("rankSeason").trim();
  const nameOverride=val("weekName").trim();
  if(blocks.length>1 && nameOverride){
    msg.className="msg err";
    msg.textContent=`That paste holds ${blocks.length} weeks, so the week-name override can't apply. Clear it, or paste one week at a time.`;
    return;
  }

  const added=[], replaced=[], empty=[], noSeason=[];
  let rows=0, badLines=0, lastTour=null;

  blocks.forEach((block,bi)=>{
    const {list, week, season:titleSeason, tour:titleTour, bad}=parseRankings(block.text);
    badLines += bad.length;
    const name = nameOverride || week || `Week ${WEEKS.length+1}`;
    if(!list.length){ if(week) empty.push(name); return; }

    const tour=(forcedTour==="Auto" ? (titleTour||"Singles") : forcedTour) || "Singles";
    const season=seasonOverride || titleSeason || "";
    if(!season) noSeason.push(name);
    lastTour=tour;

    const index=new Map();
    list.forEach(r=>{ index.set(keyOf(r.name), r.rank); seePlayer(r.name, r.country); });
    const entry={name, season, tour, list, index, date:weekDate(name, season)};

    const at=WEEKS.findIndex(w=>w.name===name && (w.season||"")===season && (w.tour||"Singles")===tour);
    if(at>=0){ WEEKS[at]=entry; replaced.push(`${name} ${season}`); }
    else { WEEKS.push(entry); added.push(`${name} ${season}`); }
    SEASON_DIRTY.add(season||"unknown"); KNOWN_SEASONS.add(season||"unknown");
    rows += list.length;

    if(tour==="Singles") for(const r of MATCHES)
      if(r.week===name && (r.season||"")===season) applyRanks(r, entry);
  });

  sortWeeks();

  if(!added.length && !replaced.length){
    msg.className="msg err";
    msg.textContent = blocks.length>1
      ? "Found ranking titles but no ranking lines under any of them."
      : "No ranking lines recognised. Each should read like: 1 (1) Michael!(GER)....2795 ...45";
    return;
  }

  const bits=[];
  if(added.length)    bits.push(`Added ${added.length} week${added.length===1?"":"s"}`);
  if(replaced.length) bits.push(`${added.length?"replaced":"Replaced"} ${replaced.length}`);
  bits[0] = bits[0] + `, ${rows.toLocaleString()} ranking rows in all.`;
  if(blocks.length>1) bits.push(`Everything between the weeks was ignored.`);
  if(empty.length)    bits.push(`${empty.length} title${empty.length===1?" had":"s had"} no ranking lines (${empty.slice(0,3).join(", ")}${empty.length>3?"\u2026":""}).`);
  if(noSeason.length) bits.push(`No year found for ${noSeason.length} week${noSeason.length===1?"":"s"} \u2014 set one in the Season box, or weeks from different years will collide.`);
  if(badLines)        bits.push(`${badLines} line${badLines===1?"":"s"} looked like rankings but didn't parse.`);

  const gaps=checkWeekGaps(lastTour||"Singles");
  if(gaps.length) bits.push(`Possible missing weeks: ${gaps.slice(0,4).join("; ")}${gaps.length>4?"\u2026":""}.`);

  msg.className=(noSeason.length||badLines||empty.length||gaps.length)?"msg warn":"msg";
  msg.textContent=bits.join(" ");

  setVal("rankIn", ""); setVal("weekName", "");
  const t=lastTour||"Singles";
  RANK_UI[t].week=null; RANK_UI[t].player=null; RANK_UI[t].season=""; RANK_UI[t].sub="list";
  markDirty(); refreshAll();
});

/* Weeks land about seven days apart. A much wider gap usually means a post
   was skipped, which is worth saying out loud during a long entry session. */
function checkWeekGaps(tour){
  const ws=tourWeeks(tour).filter(w=>w.date);
  const out=[];
  for(let i=1;i<ws.length;i++){
    if((ws[i].season||"") !== (ws[i-1].season||"")) continue;   // the off-season isn't a gap
    const days=Math.round((ws[i].date-ws[i-1].date)/86400000);
    if(days>21) out.push(`${days} days between ${ws[i-1].name} and ${ws[i].name} ${ws[i].season||""}`.replace(/\s+/g," "));
  }
  return out;
}

/* ==================================================================
   REVIEW STRIP
   ================================================================== */
function renderReview(){
  const wrap=$("reviewWrap"); if(!wrap) return;
  if(!PENDING.length){ wrap.innerHTML=""; return; }
  const el=document.createElement("section"); el.className="review";
  el.innerHTML=`<p class="blockhead">Needs a winner \u2014 ${PENDING.length} ${PENDING.length===1?"match":"matches"}</p>
    <p class="lede" style="margin-bottom:6px">Level on every tiebreak, with no later round to check.
    Pick the winner and the match joins the table.</p>`;
  PENDING.forEach(p=>{
    const [L,R]=p.match.sides;
    const q=document.createElement("div"); q.className="rq";
    q.innerHTML=`<span class="tag">${esc(p.event||"?")} \u00b7 ${esc(p.disc)} ${esc(p.round)}</span>
      <span class="ctx">${esc(p.match.raw)}</span>`;
    [L,R].forEach((side,idx)=>{
      const b=document.createElement("button"); b.className="btn sm";
      b.textContent=side.bye?"BYE":side.name; b.disabled=side.bye;
      b.addEventListener("click",()=>{
        const row=makeRow(p,idx,"manual");
        row.event=p.event; row.season=p.season; row.week=p.week;
        const wk=tourWeeks("Singles").find(w=>w.name===p.week && (w.season||"")===(p.season||"")); if(wk) applyRanks(row,wk);
        const k=matchKey(row);
        if(SEEN.has(k)) DUPES.push(row); else { SEEN.add(k); MATCHES.push(row); }
        PENDING.splice(PENDING.indexOf(p),1);
        markDirty(); refreshAll();
      });
      q.appendChild(b);
    });
    el.appendChild(q);
  });
  wrap.innerHTML=""; wrap.appendChild(el);
}
/* ==================================================================
   ISSUES PANEL
   ================================================================== */

/* ------------------------------------------------------------------
   MERGING PLAYERS WHO CHANGED USERNAME
   ------------------------------------------------------------------ */
function renderMergePanel(box){
  const names = [...new Set([...REG.values()].map(e=>e.name))].sort((a,b)=>a.toLowerCase().localeCompare(b.toLowerCase()));
  const s = document.createElement("section");
  s.className = "panel";
  s.style.marginBottom = "22px";
  s.innerHTML = `<p class="blockhead">Same person, new username</p>
    <p class="lede" style="margin-bottom:12px">If someone changed their name, point the old one at the
    new one. Every match, title and ranking under either name then counts as one player, in singles
    and doubles alike. Nothing is deleted \u2014 undo it any time.</p>`;

  const dl = document.createElement("datalist");
  dl.id = "mergeNames";
  names.forEach(nm=>{ const o=document.createElement("option"); o.value=nm; dl.appendChild(o); });
  s.appendChild(dl);

  const row = document.createElement("div");
  row.className = "rq"; row.style.borderTop = "0";
  const from = document.createElement("input");
  from.type="text"; from.placeholder="Old username"; from.setAttribute("list","mergeNames");
  from.style.maxWidth="230px"; from.setAttribute("aria-label","Old username");
  const arrow = document.createElement("span");
  arrow.className="dim"; arrow.textContent="becomes";
  const to = document.createElement("input");
  to.type="text"; to.placeholder="Current username"; to.setAttribute("list","mergeNames");
  to.style.maxWidth="230px"; to.setAttribute("aria-label","Current username");
  const go = document.createElement("button");
  go.className="btn sm"; go.textContent="Merge";
  const note = document.createElement("span");
  note.className="ctx";

  go.addEventListener("click", ()=>{
    try{
      const a=from.value.trim(), b=to.value.trim();
      const before = derivePlayers().length;
      mergePlayers(a, b);
      const after = derivePlayers().length;
      note.textContent = `Merged. ${before-after===1?"One player record":"Records"} combined under ${canonName(b)}.`;
      note.style.color = "var(--ball)";
      markDirty(); refreshAll();
    }catch(err){ note.textContent = err.message; note.style.color = "var(--bad)"; }
  });

  row.appendChild(from); row.appendChild(arrow); row.appendChild(to);
  row.appendChild(go); row.appendChild(note);
  s.appendChild(row);

  if(ALIAS.size){
    const list = document.createElement("div");
    list.style.marginTop = "6px";
    [...ALIAS.entries()].forEach(([f,t])=>{
      const q=document.createElement("div"); q.className="rq";
      q.innerHTML = `<span class="tag">merged</span>
        <span class="ctx">${esc(f)} \u2192 ${esc(canonName(t))}</span>`;
      const u=document.createElement("button");
      u.className="btn sm"; u.textContent="Undo";
      u.addEventListener("click", ()=>{ unmerge(f); markDirty(); refreshAll(); });
      q.appendChild(u); list.appendChild(q);
    });
    s.appendChild(list);
  }
  box.appendChild(s);
}

function renderIssues(){
  const box=$("issuesBody"); if(!box) return;
  const {countryConflicts,nameVariants,dupes,pending}=deriveIssues();
  box.innerHTML="";
  renderMergePanel(box);
  const total=countryConflicts.length+nameVariants.length+dupes.length+pending.length;

  if(!total){
    const ok=document.createElement("div"); ok.className="ok";
    ok.innerHTML=`<b>All clean</b>No conflicting countries, no duplicate spellings,
      no repeated matches, nothing waiting on a verdict.`;
    box.appendChild(ok);
    return;
  }

  if(countryConflicts.length){
    const s=document.createElement("section"); s.className="review";
    s.innerHTML=`<p class="blockhead">Conflicting countries \u2014 ${countryConflicts.length}</p>
      <p class="lede" style="margin-bottom:6px">The same player has appeared under more than one code.
      The most frequent one is being used; click another to pin it instead.</p>`;
    countryConflicts.forEach(({e,options})=>{
      const q=document.createElement("div"); q.className="rq";
      q.innerHTML=`<span class="tag">country</span>
        <span class="ctx">${esc(e.name)} \u2014 seen as ${options.map(o=>`${esc(o.c)} \u00d7${o.n}`).join(", ")}</span>`;
      options.forEach(o=>{
        const b=document.createElement("button"); b.className="btn sm";
        b.textContent=o.c;
        if(e.country===o.c) b.style.borderColor="var(--ball)", b.style.color="var(--ball)";
        b.addEventListener("click",()=>{ pin(e.key,"country",o.c); markDirty(); refreshAll(); });
        q.appendChild(b);
      });
      s.appendChild(q);
    });
    box.appendChild(s);
  }

  if(nameVariants.length){
    const s=document.createElement("section"); s.className="review";
    s.innerHTML=`<p class="blockhead">Spelling variants \u2014 ${nameVariants.length}</p>
      <p class="lede" style="margin-bottom:6px">These are already treated as one player. Pick which
      spelling should be the one shown and exported.</p>`;
    nameVariants.forEach(({e,options})=>{
      const q=document.createElement("div"); q.className="rq";
      q.innerHTML=`<span class="tag">spelling</span>
        <span class="ctx">${options.map(o=>`${esc(o.n)} \u00d7${o.c}`).join("  \u00b7  ")}</span>`;
      options.forEach(o=>{
        const b=document.createElement("button"); b.className="btn sm";
        b.textContent=o.n;
        if(e.name===o.n) b.style.borderColor="var(--ball)", b.style.color="var(--ball)";
        b.addEventListener("click",()=>{ pin(e.key,"name",o.n); markDirty(); refreshAll(); });
        q.appendChild(b);
      });
      s.appendChild(q);
    });
    box.appendChild(s);
  }

  if(dupes.length){
    const s=document.createElement("section"); s.className="review";
    s.innerHTML=`<p class="blockhead">Repeated matches \u2014 ${dupes.length}</p>
      <p class="lede" style="margin-bottom:6px">Same event, round and players as one already in the
      table, so these were left out. Add one back if it really is a separate match.</p>`;
    dupes.slice().forEach(r=>{
      const q=document.createElement("div"); q.className="rq";
      q.innerHTML=`<span class="tag">${esc(r.event)} \u00b7 ${esc(r.round)}</span>
        <span class="ctx">${esc(canonName(r.winner))} def. ${esc(canonName(r.loser))}
        ${r.winnerScore}\u2013${r.loserScore}</span>`;
      const b=document.createElement("button"); b.className="btn sm"; b.textContent="Add anyway";
      b.addEventListener("click",()=>{ MATCHES.push(r); SEEN.add(matchKey(r)); DUPES.splice(DUPES.indexOf(r),1); markDirty(); refreshAll(); });
      const d=document.createElement("button"); d.className="btn sm"; d.textContent="Discard";
      d.addEventListener("click",()=>{ DUPES.splice(DUPES.indexOf(r),1); markDirty(); refreshAll(); });
      q.appendChild(b); q.appendChild(d); s.appendChild(q);
    });
    box.appendChild(s);
  }

  if(pending.length){
    const s=document.createElement("section"); s.className="review";
    s.innerHTML=`<p class="blockhead">Waiting on a winner \u2014 ${pending.length}</p>
      <p class="lede">Decide these on the Add data tab.</p>`;
    box.appendChild(s);
  }
}

/* ==================================================================
   FILTER SYNC
   ================================================================== */
function fill(id, vals, keepAll){
  const sel=$(id), keep=sel.value;
  sel.innerHTML = keepAll===false ? "" : '<option value="">All</option>';
  vals.forEach(v=>{ const o=document.createElement("option"); o.value=v; o.textContent=v; sel.appendChild(o); });
  if(vals.includes(keep)) sel.value=keep;
  else if(keepAll===false && vals.length) sel.value=vals[0];
}
const uniq = (arr)=>[...new Set(arr.filter(Boolean))];
const ROUND_ORDER = ["F","SF","QF","R16","R32","R64","R128","R256","R512","QFR","QR3","QR2","QR1"];

function syncFilters(){
  fill("mDisc", uniq(MATCHES.map(m=>m.disc)).sort());
  fill("mStage", uniq(MATCHES.map(m=>m.stage)).sort());
  fill("mEvent", uniq(MATCHES.map(m=>m.event)).sort());
  fill("mRound", uniq(MATCHES.map(m=>m.round))
    .sort((a,b)=>ROUND_ORDER.indexOf(a)-ROUND_ORDER.indexOf(b)));
  fill("pCtry", uniq(derivePlayers().map(p=>p.country)).sort());

  const wk=$("rankWeek");
  if(wk){ const keep=wk.value;
  wk.innerHTML = tourWeeks("Singles").length ? '<option value="">None</option>' : '<option value="">None loaded</option>';
  const sw=tourWeeks("Singles");
  sw.slice().reverse().forEach(w=>{ const o=document.createElement("option"); o.value=w.name;
    o.textContent=w.name+(w.season?` ${w.season}`:""); wk.appendChild(o); });
  if(sw.some(w=>w.name===keep)) wk.value=keep;
  else if(sw.length) wk.value=sw[sw.length-1].name; }

  const dl=$("playerList");
  if(dl){ dl.innerHTML="";
    uniq([...REG.values()].map(e=>e.name)).sort().forEach(n=>{
      const o=document.createElement("option"); o.value=n; dl.appendChild(o); }); }
}

function renderFileManager(){
  const el=$("fileManager"); if(!el) return;
  const seasons=loadedSeasons();
  if(!WEEKS.length && !MATCHES.length){ el.textContent="Nothing to save yet."; return; }
  el.innerHTML="";
  const missing=unloadedSeasons();
  const rows=[["data.json", "index \u00b7 matches, merges, pinned names", DIRTY||LEGACY_INLINE, ()=>{
      saveIndex(); saveMsg("Saved data.json."); renderFileManager(); }]]
    .concat(seasons.map(sea=>{
      const ws=WEEKS.filter(w=>seasonKey(w)===sea);
      const n=ws.reduce((a,w)=>a+(w.list||[]).length,0);
      const s=ws.filter(w=>(w.tour||"Singles")==="Singles").length;
      const d=ws.length-s;
      /* Spell out the tour split: a season file holds both, so "26 singles,
         0 doubles" makes it obvious at a glance if a tour has gone missing. */
      const mix=`${s} singles, ${d} doubles`;
      return [seasonFile(sea),
        `${mix} \u00b7 ${n.toLocaleString()} rows`,
        SEASON_DIRTY.has(sea)||LEGACY_INLINE,
        ()=>{ const b=saveSeason(sea);
              saveMsg(`Saved ${seasonFile(sea)} (${(b/1024).toFixed(0)} KB).`);
              renderFileManager(); }];
    }));
  rows.forEach(([name,note,changed,go])=>{
    const row=document.createElement("div"); row.className="wkrow";
    row.innerHTML=`<span class="nm"><code>${esc(name)}</code>
      <span class="dim">${note}</span>
      ${changed?'<span class="tag" style="margin-left:6px">changed</span>':""}</span>`;
    const b=document.createElement("button"); b.className="btn sm"; b.textContent="Download";
    b.addEventListener("click",go); row.appendChild(b); el.appendChild(row);
  });
  missing.forEach(sea=>{
    const row=document.createElement("div"); row.className="wkrow";
    row.innerHTML=`<span class="nm"><code>${esc(seasonFile(sea))}</code>
      <span class="dim">listed in data.json, not open in this session</span>
      <span class="tag" style="margin-left:6px">not loaded</span></span>
      <span class="dim" style="font-size:12px">left untouched</span>`;
    el.appendChild(row);
  });
  const p=document.createElement("p"); p.className="hint";
  p.textContent = missing.length
    ? "Only the files marked changed need re-committing. The ones marked not loaded stay exactly as they are \u2014 don't delete them from the repository."
    : "Only the files marked changed need re-committing.";
  el.appendChild(p);
}

function renderWeekManager(){
  const el=$("weekManager"); if(!el) return;
  if(!WEEKS.length){ el.textContent="None yet."; return; }
  el.innerHTML="";
  ["Singles","Doubles"].forEach(tour=>{
    const ws=tourWeeks(tour); if(!ws.length) return;
    const h=document.createElement("p"); h.className="blockhead"; h.style.margin="10px 0 4px";
    h.textContent=`${tour} \u2014 ${ws.length} week${ws.length===1?"":"s"}`;
    el.appendChild(h);
    ws.slice().reverse().forEach(w=>{
      const row=document.createElement("div"); row.className="wkrow";
      const undated = !w.date;
      row.innerHTML=`<span class="nm">${esc(w.name)}
        <span class="dim">${esc(w.season||"no season")} \u00b7 ${(w.list||[]).length} players</span>
        ${undated?'<span class="tag" style="margin-left:6px">no date read</span>':""}</span>`;
      const del=document.createElement("button");
      del.className="btn sm"; del.textContent="Remove";
      del.addEventListener("click",()=>{
        const used = tour==="Singles"
          ? MATCHES.filter(r=>r.week===w.name && (r.season||"")===(w.season||"")).length : 0;
        const warn = used ? `\n\n${used} match${used===1?"":"es"} tagged with this week will lose their rank columns.` : "";
        if(!confirm(`Remove the ${tour.toLowerCase()} week "${w.name}" ${w.season||""}?${warn}`)) return;
        removeWeek(w.name, w.season, tour); markDirty(); refreshAll();
      });
      row.appendChild(del); el.appendChild(row);
    });
  });
}

function renderSummary(){
  const el=$("loadSummary"); if(!el) return;
  if(!MATCHES.length && !WEEKS.length){ el.textContent="Nothing loaded yet."; return; }
  const byGroup={};
  MATCHES.forEach(m=>{ const k=m.disc+" "+m.stage; byGroup[k]=(byGroup[k]||0)+1; });
  const parts=Object.entries(byGroup).sort().map(([k,v])=>`<strong>${v}</strong> ${esc(k)}`);
  const evs=uniq(MATCHES.map(m=>m.event));
  el.innerHTML = `${parts.join(" \u00b7 ")}<br>
    ${evs.length} event${evs.length===1?"":"s"}: ${esc(evs.sort().join(", "))||"\u2014"}<br>
    ${tourWeeks("Singles").length} singles and ${tourWeeks("Doubles").length} doubles ranking weeks
    ${DIRTY?'<br><span class="unsaved">Unsaved changes \u2014 save data.json before you close this tab.</span>':""}`;
}

/* ==================================================================
   REFRESH
   ================================================================== */
function refreshAll(){
  syncFilters();
  tMatches.render(); tPlayers.render(); tTeams.render();
  tTitles.render(); renderRankings();
  renderReview(); renderIssues(); renderSummary(); renderWeekManager(); renderFileManager();
  setText("sbMatches", MATCHES.length);
  setText("sbPlayers", derivePlayers().length);
  setText("sbEvents", uniq(MATCHES.map(m=>m.event)).length);
  /* The same calendar week usually exists on both tours; counting the pair
     twice would say 52 for a 26-week season. */
  setText("sbWeeks", new Set(WEEKS.map(w=>(w.season||"")+"|"+w.name)).size);
  const n=issueCount();
  setText("sbIssues", n);
  setText("pillIssues", n || "");
}

/* ==================================================================
   NAV + INPUT WIRING
   ================================================================== */
$("nav").addEventListener("click", e=>{
  const b=e.target.closest("button[data-view]"); if(!b) return;
  [...$("nav").querySelectorAll("button")].forEach(x=>x.setAttribute("aria-selected", x===b));
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("on"));
  $("v-"+b.dataset.view).classList.add("on");
});

["mQ","mDisc","mStage","mEvent","mRound"].forEach(id=>{
  on(id,"input",()=>tMatches.render()); on(id,"change",()=>tMatches.render()); });
["pQ","pCtry"].forEach(id=>{
  on(id,"input",()=>tPlayers.render()); on(id,"change",()=>tPlayers.render()); });
on("tQ","input",()=>tTeams.render());
on("ttQ","input",()=>tTitles.render());

on("btnMcsv","click",()=>downloadCsv(MATCH_COLS,matchRows(),"matches.csv"));
on("btnPcsv","click",()=>downloadCsv(PLAYER_COLS,playerRows(),"players.csv"));
on("btnTcsv","click",()=>downloadCsv(TEAM_COLS,teamRows(),"teams.csv"));
on("btnTtcsv","click",()=>downloadCsv(TITLE_COLS,titleRows(),"titles.csv"));

on("btnWipe", "click",()=>{
  if(!MATCHES.length && !WEEKS.length) return;
  if(!confirm(`Clear all ${MATCHES.length} matches and ${WEEKS.length} ranking weeks? Anything you've already downloaded is unaffected.`)) return;
  MATCHES=[]; PENDING=[]; WEEKS=[]; DUPES=[]; SEEN.clear(); REG.clear();
  setText("drawMsg",""); setText("rankMsg",""); setText("saveMsg","");
  DIRTY=false; refreshAll();
});

on("btnDrawSample", "click",()=>{
  setVal("drawIn", SAMPLE_DRAW);
  if(!val("tourn")) setVal("tourn", "Sample Open");
  if(!val("season")) setVal("season", "2026");
  $("drawMsg").className="msg"; $("drawMsg").textContent="Sample draw loaded \u2014 choose Add draw.";
});
on("btnRankSample", "click",()=>{
  setVal("rankIn", SAMPLE_RANK);
  $("rankMsg").className="msg"; $("rankMsg").textContent="Sample rankings loaded \u2014 choose Add rankings.";
});

const SAMPLE_DRAW=`Singles Finals Results
Matches Counted: 3
Matches Remaining: 0

03:03 | (3) tommyboy0515 (CHI) vs. rodrigol_87 (ARG) #SRs: 2-1

Singles SF Results
Matches Counted: 4
Matches Remaining: 0

02:02 | (30) Jaker (CAN) vs. (3) tommyboy0515 (CHI) #SRs: 1-1, PTS1
01:02 | digor (RUS) vs. rodrigol_87 (ARG) #SRs: 1-1

Singles QF Results
Matches Counted: 8
Matches Remaining: 0

04:04 | Colt th magnific (FRA) vs. (30) Jaker (CAN) #SRs: 2-3
04:04 | Latvian (LAT) vs. (3) tommyboy0515 (CHI) #SRs: 3-3, # Sets to the winner: 0-1
03:04 | Chilenaitor (CHI) vs. digor (RUS) #SRs: 3-3
03:04 | (LL) Jarl_02 (VEN) vs. rodrigol_87 (ARG) #SRs: 2-3

Doubles Finals Results
Matches Counted: 3
Matches Remaining: 0

04:06 | (9) Han Fei-tzu/Randy (ISL/ISL) vs. (16) Snowwy/Jaker (CAN/CAN) #SRs: 1-3

Doubles SF Results
Matches Counted: 4
Matches Remaining: 0

06:06 | (9) Han Fei-tzu/Randy (ISL/ISL) vs. (4) BMT360/starluk (USA/CHN) #SRs: 6-3
04:02 | (16) Snowwy/Jaker (CAN/CAN) vs. (2) Himalaya/PDK (NED/NED) #SRs: 3-2`;

const SAMPLE_RANK=`TT Singles Rankings 2026: January 5th

1 (1) Michael!(GER).......................2795 ...45 ...30 ...25 ...140
2 (2) Egiorazz(LIT).......................2785 ...36 ...25 ...25 ...20
3 (3) Vjatceslav(ESP).....................2665 ...40 ...25 ...25 ...0
4 (4) tommyboy0515(CHI)...................2570 ...48 ...35 ...35 ...10
5 (6) Sdtoot(GBR).........................2430 ...41 ...25 ...25 ...20
38 (40) Digor(RUS)........................1289 ...40 ...5 ...5 ...0
50 (44) Han Fei-Tzu(ISL)..................1142 ...45 ...20 ...20 ...210
65 (58) Rodrigol_87(ARG)..................1005 ...40 ...20 ...20 ...0
72 (74) Jaker(CAN)........................870 ...44 ...20 ...15 ...90
77 (78) Latvian(LAT)......................847 ...43 ...15 ...15 ...5
78 (69) Snowwy(CAN).......................843 ...44 ...20 ...20 ...20
88 (88) Colt th Magnific(FRA).............743 ...36 ...15 ...10 ...10
135 (137) Jarl_02(VEN)....................217 ...16 ...0 ...0 ...0`;

/* ==================================================================
   PERSISTENCE
   One file, data.json, holds everything. The registry is rebuilt from
   the matches and rankings on load, so only the choices you've pinned
   need storing.
   ================================================================== */
const FORMAT = "tennis-tipping/1";
let DIRTY = false;
let LEGACY_INLINE = false;
const markDirty = () => { DIRTY = true; renderSummary(); };

/* ------------------------------------------------------------------
   FILE LAYOUT
   Rankings dwarf everything else — a single season of one tour runs to
   roughly 4,400 rows — so they live in one file per season rather than in
   data.json. Two things keep those files small: a dictionary of player and
   country names, which otherwise repeat on every row, and positional rows
   instead of named fields. Together that's about a sixth of the plain form.
   ------------------------------------------------------------------ */
const RANKINGS_FORMAT = "tt-rankings/1";
const seasonKey  = w => (w.season || "unknown");
const seasonFile = s => `rankings-${s}.json`;
const SEASON_DIRTY = new Set();
/* Seasons named by data.json but not currently open. You only need the season
   you're working on in memory, so the index has to keep listing the rest —
   otherwise saving after a partial load would quietly drop them from the site. */
const KNOWN_SEASONS = new Set();

function loadedSeasons(){
  return [...new Set(WEEKS.map(seasonKey))].sort((a,b)=>b.localeCompare(a));
}
function allSeasons(){
  return [...new Set([...KNOWN_SEASONS, ...WEEKS.map(seasonKey)])].sort((a,b)=>b.localeCompare(a));
}
const unloadedSeasons = () => allSeasons().filter(x=>!loadedSeasons().includes(x));

function encodeSeason(season){
  const players=[], pIdx=new Map(), countries=[], cIdx=new Map();
  const idx=(arr,map,v)=>{ v=v??""; if(!map.has(v)){ map.set(v,arr.length); arr.push(v); } return map.get(v); };
  const weeks = WEEKS.filter(w=>seasonKey(w)===season).map(w=>({
    t: (w.tour||"Singles")==="Doubles" ? "D" : "S",
    n: w.name,
    r: (w.list||[]).map(r=>[
        r.rank,
        (r.prev===""||r.prev==null) ? -1 : r.prev,
        idx(players,pIdx,r.name),
        idx(countries,cIdx,r.country),
        r.points,
        (r.events===""||r.events==null) ? -1 : r.events ])
  }));
  return {format:RANKINGS_FORMAT, season, savedAt:new Date().toISOString(),
          players, countries, weeks};
}

function decodeSeason(data){
  if(!data || data.format !== RANKINGS_FORMAT)
    throw new Error(`Expected a ${RANKINGS_FORMAT} file.`);
  const P=data.players||[], C=data.countries||[];
  (data.weeks||[]).forEach(w=>{
    const list=(w.r||[]).map(row=>({
      rank:row[0], prev: row[1]===-1 ? "" : row[1],
      name:P[row[2]]??"", country:C[row[3]]??"",
      points:row[4], events: row[5]===-1 ? "" : row[5] }));
    const index=new Map();
    list.forEach(r=>{ index.set(keyOf(r.name), r.rank); seePlayer(r.name, r.country); });
    WEEKS.push({name:w.n, season: data.season==="unknown" ? "" : data.season,
                tour: w.t==="D" ? "Doubles" : "Singles",
                list, index, date:weekDate(w.n, data.season)});
  });
}

function serialise(){
  const pinned = [...PINS.entries()].map(([key,p])=>({key, name:p.name, country:p.country}));
  return {
    format: FORMAT,
    savedAt: new Date().toISOString(),
    matches: MATCHES.map(m=>{ const {raw, ...rest}=m; return rest; }),
    rankingFiles: allSeasons().map(seasonFile),
    aliases: [...ALIAS.entries()].map(([from,to])=>({from,to})),
    pinned
  };
}

function deserialise(data){
  if(!data || typeof data!=="object") throw new Error("That file isn't a data file.");
  if(!Array.isArray(data.matches)) throw new Error("No matches found in that file.");
  if(data.format && data.format!==FORMAT)
    throw new Error(`That file says it's format "${data.format}", which this page doesn't read.`);

  MATCHES=[]; PENDING=[]; WEEKS=[]; DUPES=[]; SEEN.clear(); REG.clear();
  ALIAS.clear(); PINS.clear(); SEASON_DIRTY.clear(); KNOWN_SEASONS.clear();
  LEGACY_INLINE=false; ROW_ID=0;
  (data.rankingFiles||[]).forEach(f=>{
    const m=String(f).match(/^rankings-(.+)\.json$/i);
    if(m) KNOWN_SEASONS.add(m[1]);
  });
  (data.aliases||[]).forEach(a=>{ if(a && a.from && a.to) ALIAS.set(a.from, a.to); });

  /* Older files kept the weeks inline; newer ones list separate season files
     that the caller loads. Both are accepted so nothing has to be converted
     by hand. */
  (data.weeks||[]).forEach(w=>{
    const index=new Map();
    (w.list||[]).forEach(r=>{ index.set(keyOf(r.name), r.rank); seePlayer(r.name, r.country); });
    WEEKS.push({name:w.name, season:w.season, tour:w.tour||"Singles",
                list:w.list||[], index, date:weekDate(w.name, w.season)});
  });
  if(data.weeks && data.weeks.length){ LEGACY_INLINE = true; loadedSeasons().forEach(x=>SEASON_DIRTY.add(x)); }
  sortWeeks();

  data.matches.forEach(m=>{
    const r = Object.assign({}, m);
    r.id = ++ROW_ID;
    r.winnerSeed = normSeed(r.winnerSeed);
    r.loserSeed  = normSeed(r.loserSeed);
    if(r.disc==="Doubles"){
      const wc=(r.winnerCountry||"").split("/"), lc=(r.loserCountry||"").split("/");
      r.winner.split("/").forEach((p,i)=>seePlayer(p.trim(),(wc[i]||"").trim()));
      r.loser .split("/").forEach((p,i)=>seePlayer(p.trim(),(lc[i]||"").trim()));
    } else {
      seePlayer(r.winner, r.winnerCountry);
      seePlayer(r.loser,  r.loserCountry);
    }
    const k=matchKey(r);
    if(SEEN.has(k)) DUPES.push(r); else { SEEN.add(k); MATCHES.push(r); }
  });

  (data.pinned||[]).forEach(p=>{
    const rec={}; if(p.name) rec.name=p.name; if(p.country) rec.country=p.country;
    PINS.set(p.key, rec);
    const e=REG.get(p.key);
    if(e){ Object.assign(e, rec); e.pinned=true; }
  });

  DIRTY=false;
  ["Singles","Doubles"].forEach(t=>{ RANK_UI[t].week=null; RANK_UI[t].player=null; RANK_UI[t].q=""; });
  refreshAll();
  return {matches:MATCHES.length, weeks:WEEKS.length, dupes:DUPES.length};
}

/* An alias changes what counts as the same player, so every derived index
   built on keys has to be laid down again. Matches themselves are untouched;
   only the lookups are rebuilt. */
function reindex(){
  REG.clear(); SEEN.clear();
  for(const w of WEEKS){
    w.index = new Map();
    (w.list||[]).forEach(r=>{ w.index.set(keyOf(r.name), r.rank); seePlayer(r.name, r.country); });
  }
  sortWeeks();
  for(const r of MATCHES){
    if(r.disc==="Doubles"){
      const wc=(r.winnerCountry||"").split("/"), lc=(r.loserCountry||"").split("/");
      r.winner.split("/").forEach((p,i)=>seePlayer(p.trim(),(wc[i]||"").trim()));
      r.loser .split("/").forEach((p,i)=>seePlayer(p.trim(),(lc[i]||"").trim()));
    } else {
      seePlayer(r.winner, r.winnerCountry);
      seePlayer(r.loser,  r.loserCountry);
    }
    SEEN.add(matchKey(r));
  }
  PINS.forEach((p,k)=>{ const e=REG.get(k); if(e){ if(p.name) e.name=p.name;
    if(p.country) e.country=p.country; e.pinned=true; } });
}

/* Pins are held separately from the registry so a rebuild doesn't lose them. */
const PINS = new Map();
function pin(key, field, value){
  const cur = PINS.get(key) || {};
  cur[field] = value; PINS.set(key, cur);
  const e = REG.get(key); if(e){ e[field] = value; e.pinned = true; }
}

function mergePlayers(fromName, toName){
  const from = keyOf(fromName), to = keyOf(toName);
  if(!from || !to) throw new Error("Pick both players.");
  if(from === to)  throw new Error("Those are already the same player.");
  if(!REG.has(from)) throw new Error(`No player called "${fromName}".`);
  if(!REG.has(to))   throw new Error(`No player called "${toName}".`);

  /* One person can't have faced or partnered themselves, so if these two ever
     shared a match they're different people and this is a mistake. */
  for(const r of MATCHES){
    if(r.disc === "Doubles"){
      const side = t => new Set(String(t).split("/").map(x=>keyOf(x)));
      for(const t of [r.winner, r.loser]){
        const s = side(t);
        if(s.has(from) && s.has(to))
          throw new Error(`${canonName(fromName)} and ${canonName(toName)} played together as a team in ${r.event} \u2014 they can't be one person.`);
      }
      const w = side(r.winner), l = side(r.loser);
      if((w.has(from)&&l.has(to)) || (w.has(to)&&l.has(from)))
        throw new Error(`${canonName(fromName)} and ${canonName(toName)} met in ${r.event} ${r.round} \u2014 they can't be one person.`);
    } else {
      const w = keyOf(r.winner), l = keyOf(r.loser);
      if((w===from&&l===to) || (w===to&&l===from))
        throw new Error(`${canonName(fromName)} and ${canonName(toName)} played each other in ${r.event} ${r.round} \u2014 they can't be one person.`);
    }
  }

  ALIAS.set(from, to);
  const target = REG.get(to);
  reindex();
  if(target) pin(keyOf(toName), "name", target.name);
  reindex();
}

function unmerge(fromKey){ ALIAS.delete(fromKey); reindex(); }

function removeWeek(name, season, tour){
  const i = WEEKS.findIndex(w => w.name===name && (w.season||"")===(season||"") && (w.tour||"Singles")===tour);
  if(i < 0) return false;
  SEASON_DIRTY.add(season||"unknown");
  WEEKS.splice(i,1);
  /* any match tagged with it loses its ranks rather than keeping stale ones */
  if(tour==="Singles") for(const r of MATCHES)
    if(r.week===name && (r.season||"")===(season||"")){ r.week=""; r.winnerRank=""; r.loserRank=""; }
  return true;
}

function saveMsg(text, cls){ const m=$("saveMsg"); if(!m) return; m.className="msg"+(cls?" "+cls:""); m.textContent=text; }

function saveJson(obj, filename, pretty){
  const text = pretty ? JSON.stringify(obj,null,1) : JSON.stringify(obj);
  const url=URL.createObjectURL(new Blob([text],{type:"application/json"}));
  const a=document.createElement("a");
  a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
  return text.length;
}

function saveIndex(){
  const n = saveJson(serialise(), "data.json", true);
  return n;
}
function saveSeason(season){
  const n = saveJson(encodeSeason(season), seasonFile(season), false);
  SEASON_DIRTY.delete(season);
  return n;
}

/* Browsers queue downloads rather than firing them at once, so they're spaced
   out; without the gap most of them are silently dropped. */
async function saveAll(){
  const seasons = loadedSeasons();
  let bytes = saveIndex();
  for(const s of seasons){
    await new Promise(r=>setTimeout(r,450));
    bytes += saveSeason(s);
  }
  DIRTY=false; LEGACY_INLINE=false; renderSummary(); renderFileManager();
  const missing=unloadedSeasons();
  saveMsg(`Saved data.json and ${seasons.length} season file${seasons.length===1?"":"s"} `
    + `(${(bytes/1024).toFixed(0)} KB in total). Put them all in the same folder.`
    + (missing.length ? ` ${missing.length} other season${missing.length===1?"":"s"} `
        + `(${missing.join(", ")}) weren't open and haven't been rewritten \u2014 leave those files where they are.` : ""),
    missing.length ? "warn" : "");
}
on("btnSave", "click", ()=>{
  if(!MATCHES.length && !WEEKS.length){ saveMsg("Nothing to save yet.","err"); return; }
  saveAll();
});

on("btnLoad", "click", ()=>{
  if(DIRTY && !confirm("Loading a file replaces what's on screen, and you have unsaved changes. Continue?")) return;
  $("fileIn").click();
});
on("fileIn", "change", e=>{
  const f=e.target.files[0]; if(!f) return;
  const rd=new FileReader();
  rd.onload=()=>{
    try{
      const parsed=JSON.parse(rd.result);
      if(parsed && parsed.format===RANKINGS_FORMAT){     // a season file on its own
        decodeSeason(parsed); KNOWN_SEASONS.add(parsed.season); sortWeeks();
        ["Singles","Doubles"].forEach(t=>{ RANK_UI[t].week=null; RANK_UI[t].player=null; });
        refreshAll();
        saveMsg(`Added ${parsed.season} from ${f.name}. ${WEEKS.length} ranking weeks loaded in total.`);
        return;
      }
      const r=deserialise(parsed);
      if((parsed.rankingFiles||[]).length)
        saveMsg(`Loaded ${r.matches} matches from ${f.name}. Now load each season file `
          + `(${parsed.rankingFiles.join(", ")}) with the same button.`, "warn");
      else saveMsg(`Loaded ${r.matches} matches and ${r.weeks} ranking weeks from ${f.name}.`
        + (r.dupes?` ${r.dupes} repeated ${r.dupes===1?"match":"matches"} held back \u2014 see Issues.`:""),
        r.dupes?"warn":"");
    }catch(err){ saveMsg("Couldn't read that file: "+err.message,"err"); }
  };
  rd.onerror=()=>saveMsg("Couldn't read that file.","err");
  rd.readAsText(f);
  e.target.value="";
});

/* Pick up data.json sitting beside this page. Anything that goes wrong is
   reported on the page: a blank site with no explanation is the worst
   possible outcome, so every failure says what happened and what to do. */
function loadBanner(kind, title, detail){
  const wrap = document.querySelector(".wrap");
  if(!wrap) return;
  const old = $("loadBanner"); if(old) old.remove();
  const el = document.createElement("div");
  el.id = "loadBanner";
  el.className = "msg " + kind;
  el.style.margin = "0 0 20px";
  el.innerHTML = `<strong>${esc(title)}</strong><br>${detail}`;
  const nav = document.querySelector("nav");
  wrap.insertBefore(el, nav ? nav.nextSibling : wrap.firstChild);
}

async function autoload(){
  const local = location.protocol === "file:";
  let res;
  try{
    res = await fetch("data.json", {cache:"no-store"});
  }catch(err){
    if(local){
      loadBanner("warn","Opened straight from your hard drive, so data.json can't load",
        `Browsers block a local page from reading a local file. ${EDIT
          ? "Use <b>Load a data file</b> on the Add data tab."
          : "This is only a limitation of opening the file directly \u2014 the published site loads normally."}`);
    } else {
      loadBanner("err","Couldn't reach data.json",
        `The request failed: ${esc(err.message)}. Check that <code>data.json</code> sits in the same folder as this page.`);
    }
    return false;
  }
  if(!res.ok){
    loadBanner("err", `data.json returned ${res.status}`,
      res.status===404
        ? "That file isn't where this page expects it. It must sit in the <b>same folder</b> as index.html, spelled exactly <code>data.json</code> in lower case."
        : "The server refused the request.");
    return false;
  }
  let json;
  try{ json = await res.json(); }
  catch(err){
    loadBanner("err","data.json isn't valid JSON",
      "The file downloaded but couldn't be read. Re-save it from the editor and upload it again.");
    return false;
  }
  try{
    const r = deserialise(json);
    const files = json.rankingFiles || [];
    if(files.length){
      const results = await Promise.all(files.map(async f=>{
        try{
          const fr = await fetch(f, {cache:"no-store"});
          if(!fr.ok) return {f, err:`returned ${fr.status}`};
          decodeSeason(await fr.json());
          return {f, ok:true};
        }catch(e){ return {f, err:e.message}; }
      }));
      sortWeeks();
      ["Singles","Doubles"].forEach(t=>{ RANK_UI[t].week=null; RANK_UI[t].player=null; });
      refreshAll();
      const failed = results.filter(x=>x.err);
      if(failed.length){
        loadBanner("err", `${failed.length} ranking file${failed.length===1?"":"s"} couldn't be loaded`,
          failed.map(x=>`<code>${esc(x.f)}</code> \u2014 ${esc(x.err)}`).join("<br>") +
          "<br>Every file listed in data.json must sit in the same folder.");
      }
      r.weeks = WEEKS.length;
    }
    if(!r.weeks && !r.matches){
      loadBanner("warn","data.json loaded, but it's empty",
        "No matches and no ranking weeks in the file.");
      return true;
    }
    if(EDIT) saveMsg(`Loaded ${r.matches} matches and ${r.weeks} ranking weeks from data.json.`);
    return true;
  }catch(err){
    loadBanner("err","data.json couldn't be loaded", esc(err.message));
    return false;
  }
}

window.addEventListener("beforeunload", e=>{
  if(!DIRTY) return;
  e.preventDefault(); e.returnValue="";
});

/* ==================================================================
   MODE
   The public page and the editor are separate files. Which one this is
   comes from <body data-mode>, set in the markup.
   ================================================================== */
function applyMode(){
  const flag=$("modeFlag"); if(!flag) return;
  flag.innerHTML = EDIT
    ? 'Editor \u00b7 <a href="index.html">view the public page</a>'
    : 'Read-only';
}

function checkVersion(){
  const want = document.body.dataset.appVersion;
  if(want && want !== APP_VERSION){
    loadBanner("err","These files are from different versions",
      `This page expects app.js version <code>${esc(want)}</code> but the loaded one is
       <code>${esc(APP_VERSION)}</code>. Upload <b>index.html</b>, <b>desk.html</b> and
       <b>app.js</b> from the same batch, then hard-refresh with Ctrl-Shift-R.`);
    return false;
  }
  if(!document.getElementById("rankMount")){
    loadBanner("err","This page is older than app.js",
      "The rankings section is missing from the markup. Re-upload <b>index.html</b> and <b>desk.html</b>, then hard-refresh with Ctrl-Shift-R.");
    return false;
  }
  return true;
}

applyMode();
refreshAll();
checkVersion();
autoload();
