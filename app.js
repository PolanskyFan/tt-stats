
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

const HEADER_RE = /^(Singles|Doubles)\s+(\S+)\s+Results/i;
const MATCH_RE  = /^\s*(\d+):(\d+)\s*\|\s*(.+?)\s+vs\.\s+(.+?)\s+#SRs:\s*(\d+)-(\d+)\s*(.*)$/;
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

const rawKey = n => String(n).trim().toLowerCase().replace(/\s+/g," ");
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

function parseDraw(text, stage){
  const qual = stage === "Qualifying";
  const LEVELS = qual ? QUAL_LEVELS : MAIN_LEVELS;
  const LABEL  = qual ? QUAL_LABEL  : MAIN_LABEL;
  const groups = [], bad = [], unknownRounds = [];
  let cur = null;

  for(const raw of String(text).split(/\r?\n/)){
    const line = raw.trim();
    if(!line) continue;
    const h = line.match(HEADER_RE);
    if(h){
      const lbl = h[2].toUpperCase();
      const level = LEVELS[lbl];
      if(level === undefined){ unknownRounds.push(h[2]); cur = null; continue; }
      cur = {disc: h[1][0].toUpperCase()+h[1].slice(1).toLowerCase(), level, matches:[]};
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
const TITLE_RE = /Rankings?\s*(\d{4})?\s*[:\u2013-]\s*(.+?)\s*$/i;

function parseRankings(text){
  const lines = String(text).split(/\r?\n/);
  const list = [], bad = [];
  let week = "", season = "";

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
    if(!week && /rankings/i.test(line)){
      const t = line.match(TITLE_RE);
      if(t){ season = t[1]||""; week = t[2].trim(); }
      continue;
    }
    if(/^\s*\d+\s*\(/.test(line)) bad.push(line);
  }
  return {list, week, season, bad};
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
  {k:"player",h:"Player"}, {k:"country",h:"Country",cls:"ctry"},
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

const RANK_COLS = [
  {k:"rank",h:"Rank",cls:"num"}, {k:"prev",h:"Prev",cls:"num"},
  {k:"move",h:"Move",render:r=>{
      if(r.prev===""||r.prev==null) return '<span class="dim">new</span>';
      const d=r.prev-r.rank;
      if(d>0) return `<span style="color:var(--ball)">\u25B2 ${d}</span>`;
      if(d<0) return `<span style="color:var(--warn)">\u25BC ${-d}</span>`;
      return '<span class="dim">\u2014</span>';
    }, csv:r=>(r.prev===""?"new":r.prev-r.rank)},
  {k:"name",h:"Player",render:r=>esc(canonName(r.name)),csv:r=>canonName(r.name)},
  {k:"country",h:"Country",cls:"ctry"},
  {k:"points",h:"Points",cls:"num",desc:true},
  {k:"events",h:"# Trn",cls:"num"}
];

const HIST_COLS = [
  {k:"week",h:"Week"}, {k:"rank",h:"Ranking",cls:"num"},
  {k:"points",h:"Points",cls:"num"},
  {k:"move",h:"Change",render:r=>{
      if(r.move===null) return '<span class="dim">\u2014</span>';
      if(r.move>0) return `<span style="color:var(--ball)">\u25B2 ${r.move}</span>`;
      if(r.move<0) return `<span style="color:var(--warn)">\u25BC ${-r.move}</span>`;
      return '<span class="dim">\u2014</span>';
    }, csv:r=>r.move??""}
];

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
function rankRows(){
  const w=WEEKS.find(x=>x.name===val("rWeek"));
  if(!w) return [];
  const q=val("rQ").trim().toLowerCase();
  return w.list.filter(r=>!q||hay(canonName(r.name),r.country).includes(q));
}
function histRows(){
  const name=val("hPlayer").trim();
  if(!name) return [];
  const k=keyOf(name), out=[]; let prev=null;
  for(const w of WEEKS){
    const hit=w.list.find(r=>keyOf(r.name)===k);
    if(!hit){ prev=null; continue; }
    out.push({week:w.name, rank:hit.rank, points:hit.points,
      move: prev===null ? null : prev-hit.rank});
    prev=hit.rank;
  }
  return out;
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
const tRanks   = makeTable({head:"rHead",body:"rBody",empty:"rEmpty",
  cols:()=>RANK_COLS, rows:rankRows, defaultSort:"rank", defaultDir:1});
const tHist    = makeTable({head:"hHead",body:"hBody",empty:"hEmpty",
  cols:()=>HIST_COLS, rows:histRows});

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
  const {rows,pending,bad,unknownRounds,groupCount}=parseDraw(text,stage);

  if(groupCount===0){
    msg.className="msg err";
    msg.textContent = unknownRounds.length
      ? `Round "${unknownRounds[0]}" isn't one this stage uses. Main draw expects F, SF, QF, R16\u2026R256; qualifying expects QR1\u2013QR3 and QFR. Is the Stage set correctly?`
      : 'No round headers found. Each round needs a line like "Singles R32 Results" above its matches.';
    return;
  }

  const season=val("season").trim(), week=val("rankWeek"), keepByes=$("optByes").checked;
  const wk = WEEKS.find(w=>w.name===week);
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
  const {list,week,season,bad}=parseRankings(text);
  if(!list.length){ msg.className="msg err";
    msg.textContent="No ranking lines recognised. Each should read like: 1 (1) Michael!(GER)....2795 ...45"; return; }

  const name=val("weekName").trim() || week || `Week ${WEEKS.length+1}`;
  const index=new Map();
  list.forEach(r=>{ index.set(keyOf(r.name), r.rank); seePlayer(r.name, r.country); });

  const existing=WEEKS.findIndex(w=>w.name===name);
  const entry={name, season, list, index};
  let replaced=false;
  if(existing>=0){ WEEKS[existing]=entry; replaced=true; } else WEEKS.push(entry);

  // Backfill any matches already tagged with this week.
  let back=0;
  for(const r of MATCHES) if(r.week===name) back+=applyRanks(r,entry);

  const bits=[`${replaced?"Replaced":"Added"} "${name}" with ${list.length} players.`];
  if(back) bits.push(`${back} rank values backfilled into matches already loaded.`);
  if(bad.length) bits.push(`${bad.length} line${bad.length===1?"":"s"} looked like rankings but didn't parse.`);
  msg.className = bad.length ? "msg warn" : "msg";
  msg.textContent = bits.join(" ");
  setVal("rankIn", ""); setVal("weekName", "");
  markDirty(); refreshAll();
});

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
        const wk=WEEKS.find(w=>w.name===p.week); if(wk) applyRanks(row,wk);
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
  fill("rWeek", WEEKS.map(w=>w.name), false);

  const wk=$("rankWeek");
  if(wk){ const keep=wk.value;
  wk.innerHTML = WEEKS.length ? '<option value="">None</option>' : '<option value="">None loaded</option>';
  WEEKS.forEach(w=>{ const o=document.createElement("option"); o.value=w.name; o.textContent=w.name; wk.appendChild(o); });
  if(WEEKS.some(w=>w.name===keep)) wk.value=keep;
  else if(WEEKS.length) wk.value=WEEKS[WEEKS.length-1].name; }

  const dl=$("playerList"); dl.innerHTML="";
  uniq([...REG.values()].map(e=>e.name)).sort().forEach(n=>{
    const o=document.createElement("option"); o.value=n; dl.appendChild(o); });
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
    ${WEEKS.length} ranking week${WEEKS.length===1?"":"s"}${WEEKS.length?": "+esc(WEEKS.map(w=>w.name).join(", ")):""}
    ${DIRTY?'<br><span class="unsaved">Unsaved changes \u2014 save data.json before you close this tab.</span>':""}`;
}

/* ==================================================================
   REFRESH
   ================================================================== */
function refreshAll(){
  syncFilters();
  tMatches.render(); tPlayers.render(); tTeams.render();
  tTitles.render(); tRanks.render(); tHist.render();
  renderReview(); renderIssues(); renderSummary();
  setText("sbMatches", MATCHES.length);
  setText("sbPlayers", derivePlayers().length);
  setText("sbEvents", uniq(MATCHES.map(m=>m.event)).length);
  setText("sbWeeks", WEEKS.length);
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
on("rankSub","click", e=>{
  const b=e.target.closest("button[data-sub]"); if(!b) return;
  [...$("rankSub").querySelectorAll("button")].forEach(x=>x.setAttribute("aria-pressed", x===b));
  $("rankList").style.display = b.dataset.sub==="list" ? "" : "none";
  $("rankHist").style.display = b.dataset.sub==="hist" ? "" : "none";
});

["mQ","mDisc","mStage","mEvent","mRound"].forEach(id=>{
  on(id,"input",()=>tMatches.render()); on(id,"change",()=>tMatches.render()); });
["pQ","pCtry"].forEach(id=>{
  on(id,"input",()=>tPlayers.render()); on(id,"change",()=>tPlayers.render()); });
on("tQ","input",()=>tTeams.render());
on("ttQ","input",()=>tTitles.render());
["rWeek","rQ"].forEach(id=>{
  on(id,"input",()=>tRanks.render()); on(id,"change",()=>tRanks.render()); });
on("hPlayer","input",()=>tHist.render());

on("btnMcsv","click",()=>downloadCsv(MATCH_COLS,matchRows(),"matches.csv"));
on("btnPcsv","click",()=>downloadCsv(PLAYER_COLS,playerRows(),"players.csv"));
on("btnTcsv","click",()=>downloadCsv(TEAM_COLS,teamRows(),"teams.csv"));
on("btnTtcsv","click",()=>downloadCsv(TITLE_COLS,titleRows(),"titles.csv"));
on("btnRcsv","click",()=>downloadCsv(RANK_COLS,rankRows(),"rankings.csv"));

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
const markDirty = () => { DIRTY = true; renderSummary(); };

function serialise(){
  const pinned = [...PINS.entries()].map(([key,p])=>({key, name:p.name, country:p.country}));
  return {
    format: FORMAT,
    savedAt: new Date().toISOString(),
    matches: MATCHES.map(m=>{ const {raw, ...rest}=m; return rest; }),
    weeks: WEEKS.map(w=>({name:w.name, season:w.season, list:w.list})),
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
  ALIAS.clear(); PINS.clear(); ROW_ID=0;
  (data.aliases||[]).forEach(a=>{ if(a && a.from && a.to) ALIAS.set(a.from, a.to); });

  (data.weeks||[]).forEach(w=>{
    const index=new Map();
    (w.list||[]).forEach(r=>{ index.set(keyOf(r.name), r.rank); seePlayer(r.name, r.country); });
    WEEKS.push({name:w.name, season:w.season, list:w.list||[], index});
  });

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

function saveMsg(text, cls){ const m=$("saveMsg"); if(!m) return; m.className="msg"+(cls?" "+cls:""); m.textContent=text; }

on("btnSave", "click", ()=>{
  if(!MATCHES.length && !WEEKS.length){ saveMsg("Nothing to save yet.","err"); return; }
  const blob=new Blob([JSON.stringify(serialise(),null,1)],{type:"application/json"});
  const url=URL.createObjectURL(blob), a=document.createElement("a");
  a.href=url; a.download="data.json"; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  DIRTY=false; renderSummary();
  saveMsg(`Saved ${MATCHES.length} matches and ${WEEKS.length} ranking weeks to data.json.`);
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
      const r=deserialise(JSON.parse(rd.result));
      saveMsg(`Loaded ${r.matches} matches and ${r.weeks} ranking weeks from ${f.name}.`
        + (r.dupes?` ${r.dupes} repeated ${r.dupes===1?"match":"matches"} held back \u2014 see Issues.`:""),
        r.dupes?"warn":"");
    }catch(err){ saveMsg("Couldn't read that file: "+err.message,"err"); }
  };
  rd.onerror=()=>saveMsg("Couldn't read that file.","err");
  rd.readAsText(f);
  e.target.value="";
});

/* Pick up data.json sitting beside this page. Over file:// the browser
   blocks that read, which is expected — use Load a data file instead. */
async function autoload(){
  try{
    const res = await fetch("data.json", {cache:"no-store"});
    if(!res.ok) return false;
    const r = deserialise(await res.json());
    if(EDIT) saveMsg(`Loaded ${r.matches} matches and ${r.weeks} ranking weeks from data.json.`);
    return true;
  }catch(err){ return false; }
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

applyMode();
refreshAll();
autoload();
