
"use strict";

/* ==================================================================
   ROUNDS
   Main draw and qualifying are separate ladders. Within each, a lower
   level means closer to the end of that ladder.
   ================================================================== */
const MAIN_LEVELS = {"F":0,"FINAL":0,"FINALS":0,"SF":1,"SEMIFINAL":1,"SEMIFINALS":1,
  "QF":2,"QUARTERFINAL":2,"QUARTERFINALS":2,
  "R16":3,"R32":4,"R64":5,"R128":6,"R256":7,"R512":8};
const QUAL_LEVELS = {"QFR":0,"FQR":0,"QF R":0,"QR3":1,"QR2":2,"QR1":3};
const MAIN_LABEL = {0:"F",1:"SF",2:"QF",3:"R16",4:"R32",5:"R64",6:"R128",7:"R256",8:"R512"};
const QUAL_LABEL = {0:"QFR",1:"QR3",2:"QR2",3:"QR1"};

/* Round headers come in two shapes: the long form "Singles R32 Results" and
   the bare form "R32" used in the draw threads. The discipline is optional in
   the bare form and falls back to the one chosen on the Add data tab. */
/* Round headings are written half a dozen ways across the draw threads:
     R32                      Singles R32 Results
     Singles - QF Round[/B]   Doubles - Round 3
     Singles Qualifying Round 2 Draw
   Rather than one regex per shape, the line is peeled apart in order:
   BBCode, discipline, a qualifying marker, then the round itself. */
function parseHeaderLine(line){
  let t = String(line).replace(/\[\/?[A-Za-z]+\]/g, "").trim();
  if(!t || t.length>60) return null;

  /* The discipline leads in some threads and trails in others \u2014 "Singles - QF
     Round" against "QFR Singles" \u2014 so it's taken from wherever it appears. */
  let disc = null;
  const dm = t.match(/\b(singles|doubles)\b/i);
  if(dm){
    disc = dm[1][0].toUpperCase()+dm[1].slice(1).toLowerCase();
    t = (t.slice(0,dm.index)+" "+t.slice(dm.index+dm[0].length)).trim();
  }

  let qual = false;
  const qm = t.match(/\b(qualifying|qualifier|qualifiers|qual)\b/i);
  if(qm){ qual = true; t = (t.slice(0,qm.index)+" "+t.slice(qm.index+qm[0].length)).trim(); }

  t = t.replace(/\b(round|results?|draw)\b/gi, " ").replace(/\s+/g," ");
  t = t.replace(/^[\s\-\u2013\u2014:]+|[\s\-\u2013\u2014:]+$/g, "").trim();

  if(!t) return disc ? {disc, banner:true} : null;

  /* Rounds are sometimes spelled out rather than abbreviated. */
  const WORDS={final:"F", finals:"F", semi:"SF", semis:"SF", semifinal:"SF",
    semifinals:"SF", "semi-final":"SF", "semi-finals":"SF", quarter:"QF",
    quarters:"QF", quarterfinal:"QF", quarterfinals:"QF",
    "quarter-final":"QF", "quarter-finals":"QF"};
  let w=WORDS[t.toLowerCase()];

  /* Eighteen years of hand-typed headings means "Quaterfinals", "Semi Finals"
     and "Quarter-Final" all turn up. Anything ending in "final" is split into
     its prefix and matched loosely, so a slip of one or two letters still
     lands on the right round instead of falling through to guesswork. */
  if(!w){
    const flat = t.toLowerCase().replace(/[^a-z]/g, "");
    const fm = flat.match(/^(.*?)fin(?:al)?s?$/);
    if(fm){
      const pre = fm[1];
      const near = (a,b,tol)=>{
        if(Math.abs(a.length-b.length)>tol) return false;
        let prev=[...Array(b.length+1).keys()];
        for(let i=1;i<=a.length;i++){
          const cur=[i];
          for(let j=1;j<=b.length;j++)
            cur.push(Math.min(prev[j]+1, cur[j-1]+1, prev[j-1]+(a[i-1]!==b[j-1]?1:0)));
          prev=cur;
        }
        return prev[b.length]<=tol;
      };
      if(!pre)                        w="F";
      else if(near(pre,"semi",1))     w="SF";
      else if(near(pre,"quarter",2))  w="QF";   // quater, quartre, qarter
    }
  }

  if(w){
    /* A qualifying draw has its own final, so "Qualifying Final Round" means
       the last qualifying round, not the tournament final. */
    if(qual){
      const asQual={F:"QFR", SF:"QR2", QF:"QR1"}[w];
      return {disc, qual, label:asQual||w};
    }
    return {disc, qual, label:w};
  }

  /* "R16" and "R32" name the size of the round \u2014 the last sixteen, the last
     thirty-two \u2014 but "R1" and "R2" mean round one and round two. A draw size is
     a power of two and at least sixteen; anything smaller is a round number,
     resolved from its position like "Round 1" is. */
  const rnum = t.match(/^R(\d{1,3})$/i);
  if(rnum){
    const v=+rnum[1];
    const isDrawSize = v>=16 && (v & (v-1))===0;
    return isDrawSize ? {disc, qual, label:"R"+v} : {disc, qual, numbered:v};
  }

  if(/^(F|SF|QF|QFR|FQR|QR\d)$/i.test(t))
    return {disc, qual, label:t.toUpperCase()};

  /* "Round of 16" and "Last 32" give the size of the round rather than its
     position, which is the R-number directly. Stripping the word "round"
     earlier leaves "of 16" behind, so it's matched here. */
  const sized = t.match(/^(?:of|last)\s*(\d{1,3})$/i);
  if(sized) return {disc, qual, label:"R"+sized[1]};

  const num = t.match(/^(?:round\s*)?(\d{1,2})$/i);
  if(num) return {disc, qual, numbered:+num[1]};

  return null;
}
/* The tag is written "#SRs:" in main-draw posts and "#SR:" in some qualifying
   ones, so the "s" is optional. */
/* Eighteen years of threads have written this line several ways: "|" or a
   lowercase "l" between score and players, "vs" with or without a full stop,
   and the tiebreak as "#SRs:", "#SR:", "SR:" or bare "SR", sometimes after a
   dash, with its pair joined by "-" or ":". */
const MATCH_RE  = /^\s*(\d+)\s*:\s*(\d+)\s*[|lI\u2502]\s*(.+?)\s+vs\.?\s+(.+?)\s*[-,\u2013]?\s*#?SRs?\s*:?\s*(\d+)\s*[-:]\s*(\d+)\s*(.*)$/i;
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

  let seed="";
  const s = token.match(/^\(([^()]*)\)\s+/);
  if(s){ seed = normSeed(s[1]); token = token.slice(s[0].length).trim(); }

  /* Some threads write "Anny (BLR) (1)" rather than "(1) Anny (BLR)". A closing
     bracket that reads like a seed rather than a country is taken as one,
     leaving the bracket before it as the country. */
  if(!seed){
    const tail = token.match(/\(([^()]*)\)\s*$/);
    if(tail && /^(\d{1,3}|Q\d*|LL\d*|ALT\d*|ATL\d*|SE\d*|WC\d*)$/i.test(tail[1].trim())){
      seed = normSeed(tail[1]);
      token = token.slice(0, tail.index).trim();
    }
  }

  /* Doubles sides are written two ways: "A/B (X/Y)" with the countries grouped
     at the end, and "A (X)/B (Y)" with one per player. Reading only the trailing
     bracket turns the second form into a player literally called
     "alwaysfan (ESP)/^Bibi^", which then counts as a separate team. */
  if(token.includes("/")){
    const parts = token.split("/").map(x=>x.trim());
    if(parts.length>1 && parts.every(x=>/\([^()]*\)$/.test(x))){
      return {bye:false, seed,
        name: parts.map(x=>x.replace(/\s*\([^()]*\)$/,"").trim()).join("/"),
        country: parts.map(x=>x.match(/\(([^()]*)\)$/)[1].trim()).join("/")};
    }
  }

  let country="";
  const c = token.match(/\(([^()]*)\)\s*$/);
  /* "CAN /BRA" turns up often enough to be worth tidying here */
  if(c){ country = c[1].split("/").map(x=>x.trim()).join("/"); token = token.slice(0,c.index).trim(); }
  return {bye:false, seed, name:token, country};
}

/* Identity used to follow a side from one round into the next. */
function sideKey(side, isDoubles){
  if(side.bye) return null;
  return isDoubles ? teamKeyOf(side.name) : keyOf(side.name);
}

/* A banner line like "DOUBLES DRAW AND RESULTS" switches discipline partway
   through a paste. "Results" or "draw" has to appear too, so an ordinary
   sentence mentioning doubles doesn't flip it. */
const DISC_BANNER_RE = /^\W*(singles|doubles)\b(?=.*\b(draw|results?)\b)/i;

/* Round labels are unambiguous about which ladder they belong to: QR1..QR3 and
   QFR are qualifying, everything else is main draw. So a post holding all four
   sections needs no dropdowns at all. */
function roundInfo(label, forcedStage){
  const lbl=String(label).toUpperCase();
  if(forcedStage==="Qualifying"){
    const l=QUAL_LEVELS[lbl];
    return l===undefined ? null : {stage:"Qualifying", level:l, name:QUAL_LABEL[l]};
  }
  if(forcedStage==="Main"){
    const l=MAIN_LEVELS[lbl];
    return l===undefined ? null : {stage:"Main", level:l, name:MAIN_LABEL[l]};
  }
  if(QUAL_LEVELS[lbl]!==undefined)
    return {stage:"Qualifying", level:QUAL_LEVELS[lbl], name:QUAL_LABEL[QUAL_LEVELS[lbl]]};
  if(MAIN_LEVELS[lbl]!==undefined)
    return {stage:"Main", level:MAIN_LEVELS[lbl], name:MAIN_LABEL[MAIN_LEVELS[lbl]]};
  return null;
}

function parseDraw(text, forcedStage, defaultDisc){
  defaultDisc = defaultDisc || "Singles";
  const groups = [], bad = [], unknownRounds = [];
  let cur = null, disc = defaultDisc;

  const orphan=[]; let blankRun=0;
  /* Long lines wrap in the forum and leave the tiebreak stranded below. Joining
     those back on is simpler than teaching every rule about it. */
  const joined=[];
  String(text).split(/\r?\n/).forEach(l=>{
    const prev=joined[joined.length-1];
    if(prev && /^\s*[-,]?\s*#?SRs?\s*:?\s*\d/i.test(l) && /\bvs\.?\s/i.test(prev)
       && !/#?SRs?\s*:?\s*\d+\s*[-:]\s*\d/i.test(prev)){
      joined[joined.length-1] = prev + " " + l.trim();
      return;
    }
    joined.push(l);
  });

  for(const raw of joined){
    const line = raw.trim();
    if(!line){ blankRun++; continue; }

    const h = parseHeaderLine(line);
    if(h && h.banner){ disc = h.disc; cur = null; continue; }
    if(h){
      if(h.disc) disc = h.disc;
      const stage = forcedStage || (h.qual ? "Qualifying" : null);
      if(h.numbered!==undefined){
        cur = {disc, stage, numbered:h.numbered, qual:!!h.qual, matches:[]};
        groups.push(cur); continue;
      }
      const info = roundInfo(h.label, stage || (h.qual ? "Qualifying" : ""));
      if(!info){ unknownRounds.push(h.label); cur = null; continue; }
      cur = {disc, stage:info.stage, level:info.level, round:info.name, matches:[]};
      groups.push(cur); continue;
    }

    const banner = line.match(DISC_BANNER_RE);
    if(banner){ disc = banner[1][0].toUpperCase()+banner[1].slice(1).toLowerCase(); cur=null; continue; }

    if(/^(Matches|Finished|Remaining|Played)\s+(matches|counted|remaining)?\s*:?\s*\d*$/i.test(line)) continue;

    const m = line.match(MATCH_RE);
    if(m && !cur){
      /* Match lines with no heading above them still carry the structure: the
         blocks are separated by blank lines, and nobody plays twice in a round,
         so a block sharing a player with the round being built must be a later
         round. That reconstructs the ladder from the draw itself. */
      orphan.push({line, blank:blankRun});
      blankRun=0;
      continue;
    }
    if(m && cur){
      const rest = m[7] || "";
      const sets = rest.match(SETS_RE);
      cur.matches.push({
        score:[+m[1],+m[2]], sr:[+m[5],+m[6]],
        sets: sets ? [+sets[1],+sets[2]] : null,
        pts1: /PTS\d/i.test(rest),
        sides:[parseSide(m[3]), parseSide(m[4])],
        raw: line
      });
    } else if(cur && /\bvs\.?\s/i.test(line)){
      bad.push(line);
    }
  }

  if(orphan.length) groups.push(...inferGroupsFromShape(orphan, defaultDisc, forcedStage));
  resolveNumberedRounds(groups, unknownRounds);
  normaliseQualifyingLevels(groups);

  let live = groups.filter(g=>g.level!==undefined && g.stage);

  /* A slash between two names is a doubles pair. That's a property of the match
     itself, so it outranks whatever the heading or the dropdown claimed \u2014 which
     is how a doubles draw once ended up filed as singles. A heading covering
     both splits into two groups. */
  const split=[];
  live.forEach(g=>{
    const dbl=g.matches.filter(mt=>mt.sides.some(sd=>!sd.bye && /\//.test(sd.name)));
    const sgl=g.matches.filter(mt=>!mt.sides.some(sd=>!sd.bye && /\//.test(sd.name)));
    if(dbl.length && sgl.length){
      split.push({...g, disc:"Doubles", matches:dbl});
      split.push({...g, disc:"Singles", matches:sgl});
    } else if(dbl.length){
      split.push({...g, disc:"Doubles"});
    } else {
      split.push(g);
    }
  });
  live = split.filter(g=>g.matches.length);

  checkRoundSizes(live, unknownRounds);

  const members = new Map();
  const key = g => `${g.disc}|${g.stage}|${g.level}`;
  for(const g of live){
    const isD = g.disc === "Doubles";
    const set = members.get(key(g)) || new Set();
    for(const mt of g.matches) for(const sd of mt.sides){
      const k = sideKey(sd, isD); if(k) set.add(k);
    }
    members.set(key(g), set);
  }

  const mdHere = new Map();
  for(const g of live){
    if(g.stage!=="Main") continue;
    const isD = g.disc==="Doubles";
    const set = mdHere.get(g.disc) || new Set();
    for(const mt of g.matches) for(const sd of mt.sides){
      const k = sideKey(sd, isD); if(k) set.add(k);
    }
    mdHere.set(g.disc, set);
  }

  const out = [], pending = [];
  for(const g of live){
    const isD = g.disc === "Doubles";
    const next = members.get(`${g.disc}|${g.stage}|${g.level-1}`) || new Set();
    for(const mt of g.matches){
      const meta = {disc:g.disc, isDoubles:isD, level:g.level,
        round:g.round, stage:g.stage, match:mt};
      const d = decideWinner(mt, next, isD, g.level, g.disc, g.stage, mdHere.get(g.disc));
      if(d === null){ meta.noResult = noResult(mt); pending.push(meta); continue; }
      out.push(makeRow(meta, d.idx, d.method));
    }
  }
  /* Every player in a round played in the round before it. Counting those who
     didn't is the sharpest check that the rounds have been read correctly. */
  const chain=[];
  live.forEach(g=>{
    const prev = members.get(`${g.disc}|${g.stage}|${g.level+1}`);
    if(!prev || !prev.size) return;
    const isD = g.disc==="Doubles";
    let strangers=0;
    g.matches.forEach(mt=>mt.sides.forEach(sd=>{
      const k=sideKey(sd,isD);
      if(k && !prev.has(k)) strangers++;
    }));
    if(strangers) chain.push({disc:g.disc, stage:g.stage, round:g.round, strangers,
      total:g.matches.length*2});
  });

  return {rows:out, pending, bad, unknownRounds, groupCount:live.length, groups:live,
    chain, relabelled: live.some(g=>g.relabelled),
    inferred: live.some(g=>g.inferred)};
}

/* ------------------------------------------------------------------
   READING A DRAW WITH NO USABLE HEADINGS
   Blocks are split on blank lines, then merged while no player repeats:
   within a round nobody plays twice, so the first repeat marks the start
   of the next round. Sizes then give the rounds their names, which works
   the same for a 32, 64 or 128 draw.
   ------------------------------------------------------------------ */
/* The shape of a draw is fixed: the final is one match, the semis two, the
   quarters four, the last sixteen eight. A round holding more than its size
   allows has been mislabelled, and the count says what it really is. Rounds
   short of their size are left alone, since a post can simply be incomplete. */
function checkRoundSizes(live, unknownRounds){
  live.forEach(g=>{
    if(g.stage!=="Main" || g.level===undefined) return;
    const capacity = Math.pow(2, g.level);
    const got = g.matches.length;
    if(got<=capacity) return;
    const level = Math.round(Math.log2(got));
    if(MAIN_LABEL[level]===undefined) return;
    unknownRounds.push(`${g.round} held ${got} matches, too many for that round \u2014 read as ${MAIN_LABEL[level]}`);
    g.level = level;
    g.round = MAIN_LABEL[level];
    g.relabelled = true;
  });
}

function inferGroupsFromShape(orphan, defaultDisc, forcedStage){
  const parsed=orphan.map(o=>{
    const m=o.line.match(MATCH_RE);
    const rest=m[7]||"", sets=rest.match(SETS_RE);
    return {blank:o.blank, raw:o.line,
      mt:{score:[+m[1],+m[2]], sr:[+m[5],+m[6]],
          sets: sets?[+sets[1],+sets[2]]:null, pts1:/PTS\d/i.test(rest),
          sides:[parseSide(m[3]), parseSide(m[4])], raw:o.line}};
  });

  const byDisc=new Map();
  parsed.forEach(p=>{
    const d = /\//.test(p.mt.sides[0].name) || /\//.test(p.mt.sides[1].name) ? "Doubles" : defaultDisc;
    if(!byDisc.has(d)) byDisc.set(d,[]);
    byDisc.get(d).push(p);
  });

  const out=[];
  byDisc.forEach((items, disc)=>{
    const isD = disc==="Doubles";
    const rounds=[]; let curRound=null, seen=null;
    items.forEach(p=>{
      const keys=p.mt.sides.map(sd=>sideKey(sd,isD)).filter(Boolean);
      const clash = curRound && keys.some(k=>seen.has(k));
      if(!curRound || clash){
        curRound=[]; seen=new Set(); rounds.push(curRound);
      }
      keys.forEach(k=>seen.add(k));
      curRound.push(p);
    });

    /* Biggest round first means the post runs first round to final; smallest
       first means it runs final backwards. Either way the final is the end
       with one match. */
    const sizes=rounds.map(r=>r.length);
    const ascending = sizes.length<2 ? true : sizes[0] >= sizes[sizes.length-1];
    const ordered = ascending ? rounds.slice().reverse() : rounds.slice();

    ordered.forEach((r,i)=>{
      const level = i;                       // 0 is the last round in the chain
      const label = MAIN_LABEL[level];
      if(label===undefined) return;
      out.push({disc, stage: forcedStage || "Main", level, round:label,
        matches:r.map(p=>p.mt), inferred:true});
    });
  });
  return out;
}

/* Qualifying draws vary in length, so the labels alone don't give a usable
   ladder: a two-round qualifying has QR1 then the final round, and QUAL_LEVELS
   would put those three levels apart with nothing in between \u2014 the winner of
   QR1 could then never be found in the next round. Renumbering them 0,1,2\u2026
   from the final backwards makes the ladder continuous whatever its depth. */
function normaliseQualifyingLevels(groups){
  const byDisc=new Map();
  groups.forEach(g=>{
    if(g.stage!=="Qualifying" || g.level===undefined) return;
    if(!byDisc.has(g.disc)) byDisc.set(g.disc,[]);
    byDisc.get(g.disc).push(g);
  });
  byDisc.forEach(list=>{
    /* Ordered from the last qualifying round backwards: QFR, then the highest
       numbered qualifying round down to QR1, which is the earliest. QR1 used to
       score the same as QFR here, so a three-round qualifying could be laddered
       in the wrong order. */
    const depth=g=>{
      const r=String(g.round||"").toUpperCase();
      if(r==="QFR" || r==="FQR") return 1000;
      const m=r.match(/^QR(\d+)$/);
      return m ? +m[1] : 0;
    };
    list.sort((a,b)=>depth(b)-depth(a));
    list.forEach((g,i)=>{ g.level=i; });
  });
}

/* "Round 3" means R32 in a 128 draw and R16 in a 64 draw, so the number alone
   says nothing. Within a discipline the numbered rounds run consecutively up to
   the quarter-final, so the highest-numbered one sits directly before it. Where
   no QF/SF/F is named, fall back to the size of the round: a round of sixteen
   matches is the last thirty-two. */
function resolveNumberedRounds(groups, unknownRounds){
  const buckets=new Map();
  groups.forEach(g=>{
    if(g.numbered===undefined) return;
    const stage = g.stage || (g.qual ? "Qualifying" : "Main");
    g.stage = stage;
    const k=`${g.disc}|${stage}`;
    if(!buckets.has(k)) buckets.set(k,[]);
    buckets.get(k).push(g);
  });

  buckets.forEach((list,k)=>{
    const [disc,stage]=k.split("|");
    const maxN=Math.max(...list.map(g=>g.numbered));
    const named=groups.some(g=>g.disc===disc && g.stage===stage &&
      g.level!==undefined && g.level<=2);

    list.forEach(g=>{
      let level;
      if(stage==="Qualifying"){
        level = maxN - g.numbered;                       // the last one is the final round
        g.qualLabel = g.numbered===maxN ? "QFR" : `QR${g.numbered}`;
      } else if(named){
        level = 2 + (maxN - g.numbered) + 1;             // the highest sits just before the QF
      } else {
        const n=g.matches.length;
        level = n>0 ? Math.round(Math.log2(n)) : null;    // a round of 16 is R32
      }
      if(level===null || level<0 || (stage!=="Qualifying" && MAIN_LABEL[level]===undefined)){
        unknownRounds.push(`Round ${g.numbered}`);
        g.level=undefined; g.stage=null; return;
      }
      g.level=level;
      g.round = stage==="Qualifying" ? g.qualLabel : MAIN_LABEL[level];
    });
  });
}

/* Neither player sent picks, so there is no result to record. These read as a
   dead heat on every measure, which is indistinguishable from a genuine tie
   until you notice every number is zero. */
function noResult(mt){
  return mt.score[0]===0 && mt.score[1]===0 && mt.sr[0]===0 && mt.sr[1]===0
      && !mt.pts1 && (!mt.sets || (mt.sets[0]===0 && mt.sets[1]===0));
}

function decideWinner(mt, next, isD, level, disc, stage, mdInPaste){
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
    const md = mdInPaste && mdInPaste.size ? mdInPaste : mainDrawEntrants(disc);
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
const APP_VERSION = "2026-09-03e";
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
      /* parseFloat("2018-02-26") is 2018, so a date or a score column used to
         compare as a number and every row in the same year tied. A value only
         counts as numeric when the whole of it is a number. */
      const isNum = v => typeof v==="number" ||
        (typeof v==="string" && /^-?\d+(\.\d+)?$/.test(v.trim()) && v.trim()!=="");
      if(isNum(x) && isNum(y)) return (parseFloat(x)-parseFloat(y))*state.dir;
      x=String(x??"").toLowerCase(); y=String(y??"").toLowerCase();
      if(x==="") return 1; if(y==="") return -1;
      return x.localeCompare(y)*state.dir;
    });
  }
  const CAP = 600;
  function render(){
    head();
    const all = sorted(cfg.rows());
    /* Drawing tens of thousands of rows locks the page for the best part of a
       minute, and nobody reads past the first screen. The rest are one filter
       or one CSV away. */
    const rows = all.length>CAP ? all.slice(0,CAP) : all;
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
    const host=tb.parentNode.parentNode || tb.parentNode;
    const prev=host.querySelector(":scope > .rowcap");
    if(prev) prev.remove();
    if(all.length>CAP){
      const p=document.createElement("p"); p.className="hint rowcap";
      p.textContent=`Showing the first ${CAP.toLocaleString()} of ${all.length.toLocaleString()} rows \u2014 `
        + `narrow the filters above, or use Download CSV for all of them.`;
      host.appendChild(p);
    }
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
/* The calendar knows each tournament's surface, so every match inherits one.
   Anything not in the calendar counts as unknown rather than being guessed. */
const SURFACES=["H","CL","G","IH"];
function surfaceOf(m){
  const c=calFor(m.event, m.season);
  return c && c.surface ? c.surface : "";
}

const isQ  = s => /^Q\d*$/i.test(String(s||"").trim());
const isLL = s => /^LL\d*$/i.test(String(s||"").trim());
const rankNum = v => { const n=parseInt(v,10); return isNaN(n)?null:n; };

function blankRec(){
  const r={w:0,l:0,titles:0,finals:0,sfs:0,t10w:0,t10l:0,
           qw:0,ql:0,qualified:0,mdQw:0,mdQl:0,mdLLw:0,mdLLl:0,lastTitle:""};
  SURFACES.forEach(s=>{ r["s_"+s]=0; r["l_"+s]=0; });
  return r;
}
const SURFACE_FILTER={players:"", teams:""};

/* One figure per surface for the table, plus whichever surface they win on
   most often \u2014 only counted where they've played enough for it to mean
   anything. */
function surfaceCols(v){
  const o={};
  let best="", bestPct=-1;
  SURFACES.forEach(s=>{
    const w=v["s_"+s], l=v["l_"+s], t=w+l;
    o["surf_"+s]=t ? `${w}\u2013${l}` : "";
    o["surfw_"+s]=w;
    if(t>=5 && w/t>bestPct){ bestPct=w/t; best=s; }
  });
  o.bestSurface = best ? `${SURFACE_NAME[best]} ${Math.round(bestPct*100)}%` : "";
  o.bestSurfacePct = bestPct<0 ? -1 : bestPct;
  return o;
}

function derivePlayers(surface){
  const rec = new Map();
  const get = n => { const k=keyOf(n); if(!rec.has(k)) rec.set(k,blankRec()); return rec.get(k); };

  for(const r of MATCHES){
    if(r.disc!=="Singles" || r.isBye) continue;
    const surf=surfaceOf(r);
    if(surface && surf!==surface) continue;
    const W=get(r.winner), L=get(r.loser);
    if(surf){ W["s_"+surf]++; L["l_"+surf]++; }
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
      lastTitle:v.lastTitle, ...surfaceCols(v)});
  }
  /* Best win and longest run used to be worked out per player, each scanning
     every match \u2014 fine for one season, ten seconds across eighteen. One pass
     in date order does both for everybody. */
  const bestR=new Map(), bestRun=new Map(), run=new Map();
  inOrder(MATCHES.filter(m=>m.disc==="Singles" && !m.isBye)).forEach(m=>{
    if(surface && surfaceOf(m)!==surface) return;
    const w=keyOf(m.winner), l=keyOf(m.loser);
    const r=parseInt(m.loserRank,10);
    if(!isNaN(r) && (!bestR.has(w) || r<bestR.get(w))) bestR.set(w,r);
    const k=(run.get(w)||0)+1;
    run.set(w,k);
    if(k>(bestRun.get(w)||0)) bestRun.set(w,k);
    run.set(l,0);
  });
  out.forEach(p=>{
    const r=bestR.get(p.key);
    p.best = r!==undefined ? "#"+r : "";
    p.bestNum = r!==undefined ? r : 9999;
    p.streak = bestRun.get(p.key) || 0;
  });
  return out;
}

function deriveTeams(surface){
  const rec = new Map(), disp = new Map();
  const get = t => { const k=teamKeyOf(t);
    if(!rec.has(k)){ rec.set(k,blankRec()); disp.set(k,canonTeam(t)); }
    return rec.get(k); };

  for(const r of MATCHES){
    if(r.disc!=="Doubles" || r.isBye) continue;
    const surf=surfaceOf(r);
    if(surface && surf!==surface) continue;
    const W=get(r.winner), L=get(r.loser);
    if(surf){ W["s_"+surf]++; L["l_"+surf]++; }
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
      lastTitle:v.lastTitle, ...surfaceCols(v)});
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
    surface:(calFor(e.event, e.season)||{}).surface||"",
    sWinner:e.sW, sFinalist:e.sF, sSF1:e.sS[0]||"", sSF2:e.sS[1]||"",
    dWinner:e.dW, dFinalist:e.dF, dSF1:e.dS[0]||"", dSF2:e.dS[1]||""
  }));
}

/* ==================================================================
   ISSUES
   ================================================================== */
/* A conflict counts as settled once you've pinned a choice for that field, and
   settled ones drop off the list. Without that, every spelling you'd already
   decided on came back on every load and buried whatever was actually new. */
/* Scanning for issues costs a couple of seconds across a full archive, and it
   was running on every refresh just to put a number on the tab. The answer only
   changes when the data does, so it's worked out once and kept. */
let ISSUE_CACHE=null;
function invalidateIssues(){ ISSUE_CACHE=null; }

function deriveIssues(){
  if(ISSUE_CACHE) return ISSUE_CACHE;
  return (ISSUE_CACHE = deriveIssuesNow());
}

function deriveIssuesNow(){
  const countryConflicts=[], nameVariants=[], resolved=[];
  for(const e of REG.values()){
    const p = PINS.get(e.key) || {};
    const cs = Object.keys(e.countries).filter(Boolean);
    if(cs.length>1){
      const ok=acceptedCountries(e.key);
      const item={e, field:"country", accepted:ok,
        options:cs.map(c=>({c,n:e.countries[c]})).sort((a,b)=>b.n-a.n)};
      if(p.country || (ok.size>1 && cs.every(c=>ok.has(c)))) resolved.push(item);
      else countryConflicts.push(item);
    }
    const ns = Object.keys(e.names);
    if(ns.length>1){
      const item={e, field:"name", options:ns.map(n=>({n,c:e.names[n]})).sort((a,b)=>b.c-a.c)};
      (p.name ? resolved : nameVariants).push(item);
    }
  }
  return {countryConflicts, nameVariants, resolved,
          tourGaps:deriveTourGaps(), eventProblems:deriveEventProblems(),
          dateProblems:deriveDateProblems(), renames:deriveRenameCandidates(),
          unknowns:deriveUnknownPlayers(),
          dupes:DUPES, pending:PENDING};
}

/* Both tours run the same calendar, so a week that exists on one and not the
   other is nearly always a post that didn't get pasted. Only checked once a
   season has some of each, so a season part-way through entry stays quiet. */
/* Every match at one event should sit on the same ranking week. More than one
   means a paste was tagged with the wrong week. Events do repeat year on year,
   so this compares within an event *and* season rather than by name alone. */
function deriveEventProblems(){
  const out=[];
  for(const g of matchGroups()){
    if(!g.season) out.push({kind:"no season", g,
      text:`${g.event} \u2014 ${g.disc} ${g.stage.toLowerCase()}, ${g.rows.length} matches, no season set`});
  }
  const byEvent=new Map();
  for(const r of MATCHES){
    const k=[r.event, r.season||"", r.disc].join("|");
    if(!byEvent.has(k)) byEvent.set(k,{event:r.event, season:r.season||"", disc:r.disc, weeks:new Map()});
    const e=byEvent.get(k);
    const w=r.week||"(none)";
    e.weeks.set(w,(e.weeks.get(w)||0)+1);
  }
  for(const e of byEvent.values()){
    if(e.weeks.size>1) out.push({kind:"mixed weeks", e,
      text:`${e.event} ${e.season} \u2014 ${e.disc} uses ${e.weeks.size} different ranking weeks: `
        + [...e.weeks].map(([w,c])=>`${w} (${c})`).join(", ")});
  }
  return out;
}

/* Ranking posts land on a Monday. A date that isn't one is nearly always a typo
   or a post that slipped a day, and it also stops singles and doubles for the
   same week lining up. The suggestion is the nearest Monday. */
function nearestMonday(date){
  const d=new Date(date.getTime());
  const day=d.getDay();                    // 0 Sun, 1 Mon
  let shift=(1-day);
  if(shift<-3) shift+=7;
  if(shift>3)  shift-=7;
  d.setDate(d.getDate()+shift);
  return d;
}
const MONTH_NAMES=["January","February","March","April","May","June","July",
  "August","September","October","November","December"];
const dateToWeekName = d => `${MONTH_NAMES[d.getMonth()]} ${ordinal(d.getDate())}`;

const DAYS_IN={0:31,1:29,2:31,3:30,4:31,5:30,6:31,7:31,8:30,9:31,10:30,11:31};
function impossibleDate(name){
  const m=String(name||"").match(MONTH_RE);
  if(!m) return false;
  const mo=MONTHS[m[1].toLowerCase()], day=+m[2];
  return mo!==undefined && (day<1 || day>DAYS_IN[mo]);
}

function deriveDateProblems(){
  const out=[];
  for(const w of WEEKS){
    if(DATE_OK.has(weekTag(w))) continue;
    if(impossibleDate(w.name)){
      out.push({w, kind:"impossible date", suggest:null,
        text:`${w.name} ${w.season||""} (${w.tour||"Singles"}) \u2014 that day doesn't exist in that month, `
          + `so the week has been placed at ${w.date?dateToWeekName(w.date):"an unknown date"}. `
          + `Check the post and rename it by hand.`});
      continue;
    }
    if(!w.date){ out.push({w, kind:"no date", suggest:null,
      text:`${w.name} ${w.season||""} (${w.tour||"Singles"}) \u2014 no date could be read from the name`});
      continue; }
    if(DATE_OK.has(weekTag(w))) continue;
    if(w.date.getDay()!==1){
      const m=nearestMonday(w.date), name=dateToWeekName(m);
      const days=Math.round((m-w.date)/86400000);
      out.push({w, kind:"not a Monday", suggest:name,
        text:`${w.name} ${w.season||""} (${w.tour||"Singles"}) falls on a `
          + `${["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][w.date.getDay()]}`
          + ` \u2014 ${days>0?"+":""}${days} day${Math.abs(days)===1?"":"s"} to ${name}`});
    }
  }
  /* Singles and doubles for the same week, a day or two apart. */
  const byTour={Singles:[],Doubles:[]};
  WEEKS.forEach(w=>{ if(w.date) byTour[(w.tour||"Singles")==="Doubles"?"Doubles":"Singles"].push(w); });
  byTour.Singles.forEach(sw=>{
    if(byTour.Doubles.some(dw=>dw.season===sw.season && dw.name===sw.name)) return;
    const near=byTour.Doubles.find(dw=>dw.season===sw.season &&
      Math.abs(dw.date-sw.date)>0 && Math.abs(dw.date-sw.date)<=3*86400000);
    if(near) out.push({w:near, kind:"a day out", suggest:sw.name,
      text:`Doubles "${near.name}" and singles "${sw.name}" ${sw.season||""} are `
        + `${Math.round(Math.abs(near.date-sw.date)/86400000)} day(s) apart \u2014 probably the same week`});
  });
  return out;
}

/* Weeks you've confirmed are correct even though they aren't a Monday. */
const DATE_OK = new Set();
/* Weeks you've confirmed really do exist on one tour only \u2014 sometimes a
   doubles list simply was never posted, and there's nothing to add. */
const GAP_OK = new Set();
const gapTag = g => [g.season, g.week, g.missing].join("|");
const weekTag = w => [(w.tour||"Singles"), (w.season||""), w.name].join("|");

/* A free-text rename, for the dates no rule can guess \u2014 February 31st and
   the like. Used from the Issues list and from the week manager. */
function otherButton(w){
  const b=document.createElement("button"); b.className="btn sm";
  b.textContent="Other\u2026";
  b.title="Type the correct week name yourself";
  b.addEventListener("click",()=>{
    const v=prompt(`Correct name for "${w.name}" ${w.season||""} (${w.tour||"Singles"}).\n`
      + `Write it as a date, for example "March 2nd".`, w.name);
    if(v===null) return;
    const name=v.trim(); if(!name || name===w.name) return;
    if(!weekDate(name, w.season) &&
       !confirm(`"${name}" doesn't read as a date, so the week won't sort by calendar. Use it anyway?`)) return;
    try{ snapshot("week rename"); renameWeek(w, name); markDirty(); refreshAll(); }
    catch(err){ alert(err.message); }
  });
  return b;
}

function renameWeek(w, newName){
  const clash=WEEKS.find(x=>x!==w && x.name===newName &&
    (x.season||"")===(w.season||"") && (x.tour||"Singles")===(w.tour||"Singles"));
  if(clash) throw new Error(`There's already a ${(w.tour||"Singles").toLowerCase()} week called "${newName}" in ${w.season||"that season"}.`);
  const old=w.name;
  w.name=newName; w.date=weekDate(newName, w.season);
  /* matches point at a week by name, so they have to follow it */
  for(const r of MATCHES)
    if(r.week===old && (r.season||"")===(w.season||"")) r.week=newName;
  SEASON_DIRTY.add(w.season||"unknown");
  sortWeeks();
}

/* ------------------------------------------------------------------
   COUNTRY CHANGES
   A player genuinely moving country looks exactly like a typo until you
   say otherwise. Accepting one records where the switch happened, so the
   pair stops being flagged while a third code still would.
   ------------------------------------------------------------------ */
/* A player can legitimately hold several countries over a career, and a code
   like XXX isn't wrong either. So rather than "which one is right", each code
   can be marked as genuine. The conflict settles once every code seen has been
   accepted; a new one appearing later still raises a fresh issue. */
const COUNTRY_OK = new Map();          // key -> Set of accepted codes

function firstWeekWithCountry(key, code){
  for(const w of WEEKS){
    const hit=(w.list||[]).find(r=>keyOf(r.name)===key && r.country===code);
    if(hit) return w;
  }
  return null;
}
function latestCountryFor(key){
  for(let i=WEEKS.length-1;i>=0;i--){
    const hit=(WEEKS[i].list||[]).find(r=>keyOf(r.name)===key && r.country);
    if(hit) return hit.country;
  }
  return "";
}
function acceptCountry(key, code){
  if(!COUNTRY_OK.has(key)) COUNTRY_OK.set(key, new Set());
  COUNTRY_OK.get(key).add(code);
  applyAcceptedCountry(key);
}
function unacceptCountry(key, code){
  const set=COUNTRY_OK.get(key); if(!set) return;
  set.delete(code);
  if(!set.size) COUNTRY_OK.delete(key);
  const e=REG.get(key); if(e && !(PINS.get(key)||{}).country) e.country=topOf(e.countries)||e.country;
  else applyAcceptedCountry(key);
}
function applyAcceptedCountry(key){
  const e=REG.get(key); if(!e) return;
  if((PINS.get(key)||{}).country) return;         // an explicit pin still wins
  const set=COUNTRY_OK.get(key);
  if(!set || !set.size) return;
  const latest=latestCountryFor(key);
  e.country = set.has(latest) ? latest : [...set][set.size-1];
}
const acceptedCountries = key => COUNTRY_OK.get(key) || new Set();

/* Accepting a code says "this is genuine". The other answer is "this one is
   simply wrong" \u2014 a placeholder like XXX, or a mistyped code \u2014 which needs the
   data corrected rather than another exception recorded. This rewrites that
   player's country wherever it appears, in matches and in ranking rows alike,
   so the conflict goes away because the cause has gone. */
function replaceCountry(key, from, to){
  if(!from || !to || from===to) return 0;
  let hits=0;

  const fixSide=(nameStr, countryStr, isD)=>{
    if(!isD){
      if(keyOf(nameStr)===key && countryStr===from){ hits++; return to; }
      return countryStr;
    }
    const names=String(nameStr).split("/");
    const codes=String(countryStr||"").split("/");
    names.forEach((nm,i)=>{
      if(keyOf(nm.trim())===key && (codes[i]||"").trim()===from){ codes[i]=to; hits++; }
    });
    return codes.join("/");
  };

  for(const r of MATCHES){
    const isD = r.disc==="Doubles";
    r.winnerCountry = fixSide(r.winner, r.winnerCountry, isD);
    r.loserCountry  = fixSide(r.loser,  r.loserCountry,  isD);
  }
  for(const w of WEEKS)
    for(const row of (w.list||[]))
      if(keyOf(row.name)===key && row.country===from){ row.country=to; hits++; }

  const set=COUNTRY_OK.get(key);
  if(set){ set.delete(from); if(!set.size) COUNTRY_OK.delete(key); }
  WEEKS.forEach(w=>SEASON_DIRTY.add(w.season||"unknown"));
  reindex();
  return hits;
}

/* Pairs you've said aren't the same person, so they stop coming back. */
const RENAME_NO = new Set();
const renameKey = r => [r.tour, keyOf(r.from), keyOf(r.to)].join("|");

function deriveRenameCandidates(){
  const out=[];
  ["Singles","Doubles"].forEach(tour=>{
    const ws=tourWeeks(tour);
    if(ws.length<2) return;

    const seenBefore=new Map();          // key -> first week index
    const lastSeen=new Map();            // key -> last week index
    ws.forEach((w,i)=>(w.list||[]).forEach(r=>{
      const k=keyOf(r.name);
      if(!seenBefore.has(k)) seenBefore.set(k,i);
      lastSeen.set(k,i);
    }));

    for(let i=1;i<ws.length;i++){
      const prev=new Map((ws[i-1].list||[]).map(r=>[keyOf(r.name),r]));
      const now =new Map((ws[i].list||[]).map(r=>[keyOf(r.name),r]));

      const gone=[...prev.keys()].filter(k=>!now.has(k) && lastSeen.get(k)===i-1);
      const fresh=[...now.keys()].filter(k=>seenBefore.get(k)===i &&
        Number(now.get(k).events)>1);          // already has history, so not a debutant

      if(!gone.length || !fresh.length) continue;

      /* Score every departure against every arrival, then take the best pairs
         one at a time so nobody is proposed twice. A player with only a couple
         of tournaments behind them is too thin to call either way. */
      const pairs=[];
      fresh.forEach(nk=>{
        const nr=now.get(nk);
        if(ALIAS.has(nk) || Number(nr.events||0)<3) return;
        gone.forEach(ok=>{
          const or=prev.get(ok);
          if(ALIAS.has(ok) || Number(or.events||0)<3) return;
          const dEv=Math.abs(Number(or.events||0)-Number(nr.events||0));
          if(dEv>1) return;                       // tournaments played carry over
          const op=Number(or.points||0), np=Number(nr.points||0);
          const dPts=Math.abs(op-np);
          if(op>0 && dPts/op > 0.25) return;      // and so, roughly, do points
          pairs.push({cost:dEv*10000+dPts, ok, nk, or, nr});
        });
      });
      pairs.sort((a,b)=>a.cost-b.cost);
      const usedOld=new Set(), usedNew=new Set();
      pairs.forEach(p=>{
        if(usedOld.has(p.ok) || usedNew.has(p.nk)) return;
        const cand={tour, week:ws[i].name, season:ws[i].season,
          from:p.or.name, to:p.nr.name,
          fromEvents:p.or.events, toEvents:p.nr.events,
          fromPoints:p.or.points, toPoints:p.nr.points};
        if(RENAME_NO.has(renameKey(cand))) return;
        usedOld.add(p.ok); usedNew.add(p.nk);
        out.push(cand);
      });
    }
  });
  return out;
}

/* ------------------------------------------------------------------
   NAMES THAT NEVER APPEAR IN A RANKING
   Everyone in a draw is ranked at some point, so a name that turns up in
   matches and never in a ranking list is almost always a typo. The nearest
   ranked spellings are offered, closest first.
   ------------------------------------------------------------------ */
const UNKNOWN_OK = new Set();       // names you've confirmed are fine as they are

function editDistance(a,b){
  a=String(a); b=String(b);
  if(a===b) return 0;
  if(Math.abs(a.length-b.length)>4) return 99;
  const prev=new Array(b.length+1);
  for(let j=0;j<=b.length;j++) prev[j]=j;
  for(let i=1;i<=a.length;i++){
    let last=prev[0]; prev[0]=i;
    for(let j=1;j<=b.length;j++){
      const tmp=prev[j];
      prev[j]=Math.min(prev[j]+1, prev[j-1]+1, last+(a[i-1]===b[j-1]?0:1));
      last=tmp;
    }
  }
  return prev[b.length];
}

function rankedKeys(){
  const set=new Set();
  for(const w of WEEKS) for(const r of (w.list||[])) set.add(keyOf(r.name));
  return set;
}

function deriveUnknownPlayers(){
  const ranked=rankedKeys();
  if(!ranked.size) return [];                 // no rankings loaded, so nothing to check against

  const seen=new Map();                       // key -> {matches, events}
  const note=(nm, r)=>{
    const k=keyOf(nm);
    if(!k || k==="bye" || ranked.has(k) || UNKNOWN_OK.has(k)) return;
    if(!seen.has(k)) seen.set(k,{key:k, name:canonName(nm), matches:0, events:new Set()});
    const e=seen.get(k); e.matches++; e.events.add(`${r.event} ${r.season||""}`.trim());
  };
  for(const r of MATCHES){
    if(r.disc==="Doubles"){
      r.winner.split("/").forEach(x=>note(x.trim(), r));
      r.loser .split("/").forEach(x=>note(x.trim(), r));
    } else { note(r.winner, r); note(r.loser, r); }
  }
  if(!seen.size) return [];

  /* Candidates are every ranked name, but the ones already in this player's own
     events come first \u2014 a misspelling usually sits beside its correct form in
     the same draw. */
  const rankedList=[...ranked].map(k=>({key:k, name:canonName(k)}));
  const inEvent=new Map();
  for(const r of MATCHES){
    const ev=`${r.event} ${r.season||""}`.trim();
    const add=nm=>{ const k=keyOf(nm);
      if(!ranked.has(k)) return;
      if(!inEvent.has(ev)) inEvent.set(ev,new Set());
      inEvent.get(ev).add(k); };
    if(r.disc==="Doubles"){ r.winner.split("/").forEach(x=>add(x.trim())); r.loser.split("/").forEach(x=>add(x.trim())); }
    else { add(r.winner); add(r.loser); }
  }

  return [...seen.values()].map(e=>{
    const near=new Set();
    e.events.forEach(ev=>(inEvent.get(ev)||new Set()).forEach(k=>near.add(k)));
    const score=c=>{
      const d=editDistance(e.key, c.key);
      return d + (near.has(c.key) ? -0.5 : 0);      // same event breaks a tie
    };
    const picks=rankedList
      .map(c=>({...c, d:editDistance(e.key,c.key), s:score(c)}))
      .filter(c=>c.d<=Math.max(2, Math.round(e.key.length*0.34)))
      .sort((a,b)=>a.s-b.s)
      .slice(0,3);
    return {...e, events:[...e.events], suggestions:picks};
  }).sort((a,b)=>b.matches-a.matches);
}

function deriveTourGaps(){
  const by=new Map();
  for(const w of WEEKS){
    const s=w.season||"";
    if(!by.has(s)) by.set(s,{S:new Map(), D:new Map()});
    by.get(s)[(w.tour||"Singles")==="Doubles"?"D":"S"].set(w.name, w);
  }
  const out=[];
  for(const [season,{S,D}] of by){
    if(!S.size || !D.size) continue;
    for(const [name,w] of S) if(!D.has(name)) out.push({season, week:name, has:"Singles", missing:"Doubles", date:w.date});
    for(const [name,w] of D) if(!S.has(name)) out.push({season, week:name, has:"Doubles", missing:"Singles", date:w.date});
  }
  return out.filter(g=>!GAP_OK.has(gapTag(g)))
    .sort((a,b)=> (b.season||"").localeCompare(a.season||"") ||
      ((a.date&&b.date) ? a.date-b.date : String(a.week).localeCompare(String(b.week))));
}
function unpin(key, field){
  const p=PINS.get(key); if(!p) return;
  delete p[field];
  if(!p.name && !p.country) PINS.delete(key);
  const e=REG.get(key);
  if(e){ e.pinned = PINS.has(key);
    if(!p.name)    e.name    = topOf(e.names)    || e.name;
    if(!p.country) e.country = topOf(e.countries) || e.country; }
}

function issueCount(){
  const i = deriveIssues();
  return i.countryConflicts.length + i.nameVariants.length + i.tourGaps.length
       + i.eventProblems.length + i.dateProblems.length + i.renames.length
       + i.unknowns.length + i.dupes.length + i.pending.length;
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
  {k:"winner",h:"Winner",cls:"win",render:r=>{
      const nm=r.disc==="Doubles"?canonTeam(r.winner):canonName(r.winner);
      if(r.disc==="Doubles") return esc(nm);
      const b=document.createElement("button"); b.className="linkish"; b.textContent=nm;
      b.addEventListener("click",()=>showPlayer(nm,"Singles")); return b;
    }, csv:r=>r.disc==="Doubles"?canonTeam(r.winner):canonName(r.winner)},
  {k:"winnerCountry",h:"Winner Country",cls:"ctry"},
  {k:"loserSeed",h:"Loser Seed",cls:"seed"},
  {k:"loser",h:"Loser",cls:"lose",render:r=>nameLinks(r.loser, r.disc),
    csv:r=>r.disc==="Doubles"?canonTeam(r.loser):canonName(r.loser)},
  {k:"loserCountry",h:"Loser Country",cls:"ctry"},
  {k:"winnerScore",h:"Winner Score",cls:"num"}, {k:"loserScore",h:"Loser Score",cls:"num"},
  {k:"winnerSC",h:"Winner SC Score",cls:"num"}, {k:"loserSC",h:"Loser SC Score",cls:"num"},
  {k:"winnerRank",h:"Winner Rank",cls:"num"}, {k:"loserRank",h:"Loser Rank",cls:"num"}
];

function renderLuck(){
  if(!viewOn("v-luck")) return;
  const mount=$("luckMount"); if(!mount) return;
  mount.innerHTML="";
  const allSeasons=[...new Set(MATCHES.map(m=>m.season).filter(Boolean))].sort((a,b)=>b.localeCompare(a));
  if(LUCK_UI.season===null) LUCK_UI.season = allSeasons[0] || "";
  const rows=luckTable(LUCK_UI.season);
  if(!rows.length){
    mount.innerHTML=`<div class="empty"><strong>Nothing to measure</strong>Draw luck needs completed draws.</div>`;
    return;
  }
  const p=document.createElement("p"); p.className="lede";
  p.textContent="Each champion is moved to every other slot in turn, swapping with whoever was there, and the "
    +"whole draw is replayed from the recorded scores. A low figure means the draw opened up for them; a high "
    +"one means they would have won it from almost anywhere.";
  mount.appendChild(p);

  const seasons=allSeasons;
  const bar=document.createElement("div"); bar.className="controls";
  if(seasons.length>1)
    bar.appendChild(field("Season", selectOf([["","All seasons"]].concat(seasons.map(x=>[x,x])),
      LUCK_UI.season, v=>{LUCK_UI.season=v; renderLuck();}), "sm"));
  bar.appendChild(field("Discipline", selectOf([["","Both"],["Singles","Singles"],["Doubles","Doubles"]],
    LUCK_UI.disc, v=>{LUCK_UI.disc=v; renderLuck();}), "sm"));
  const dl=document.createElement("button"); dl.className="btn"; dl.textContent="Download CSV";
  bar.appendChild(field("", dl));
  mount.appendChild(bar);

  const shown=rows.filter(r=>!LUCK_UI.disc || r.disc===LUCK_UI.disc);
  const COLS=[
    {k:"pct",h:"Would have won from",render:r=>{
      const d=document.createElement("div"); d.className="wl";
      const b=document.createElement("div"); b.className="wlbar";
      const i2=document.createElement("i"); i2.style.width=r.pct+"%"; b.appendChild(i2);
      const s2=document.createElement("span"); s2.className="wlpct"; s2.textContent=r.pct+"%";
      d.appendChild(b); d.appendChild(s2); return d;}, csv:r=>r.pct+"%"},
    {k:"wins",h:"Slots",cls:"num"},{k:"slots",h:"of",cls:"num"},
    {k:"champion",h:"Champion",render:r=>nameLinks(r.champion,r.disc), csv:r=>r.champion},
    {k:"event",h:"Tournament",render:r=>{
      const b=document.createElement("button"); b.className="linkish"; b.textContent=r.event;
      b.addEventListener("click",()=>showEvent(r.event, r.season)); return b;}, csv:r=>r.event},
    {k:"disc",h:"Draw"},{k:"season",h:"Season",cls:"mono"}];
  dl.addEventListener("click",()=>downloadCsv(COLS, shown, "draw-luck.csv"));
  mount.appendChild(tableOf(COLS, shown));
  const hint=document.createElement("p"); hint.className="hint";
  hint.textContent="Nobody can go further than they actually did, since no figures exist for rounds they "
    +"never reached \u2014 so these read a little kindly toward champions.";
  mount.appendChild(hint);

  const sh=document.createElement("h3"); sh.className="sec"; sh.textContent="How seeds fare";
  mount.appendChild(sh);
  const sp=document.createElement("p"); sp.className="lede";
  sp.textContent="Main-draw record by seeding band, which is as much a question about the seeding as about "
    +"the players. Every match counts both sides, so the columns add up across the table.";
  mount.appendChild(sp);
  const seedRowsNow=seedRows(LUCK_UI.season, LUCK_UI.disc);
  mount.appendChild(tableOf([{k:"band",h:"Seeding"},{k:"played",h:"Matches",cls:"num"},
    {k:"w",h:"W",cls:"num"},{k:"l",h:"L",cls:"num"},{k:"pct",h:"Win rate",cls:"num"},
    {k:"titles",h:"Titles",cls:"num"},{k:"finals",h:"Finals lost",cls:"num"}], seedRowsNow));
}
/* Replaying every draw in the archive takes a few seconds, so the tab opens on
   the newest season and All is a click away. */
const LUCK_UI={season:null, disc:""};

/* Manager names come from the calendar rather than the match data, so the
   player merge doesn't reach them. Renaming rewrites every row, which merges
   two spellings when the new name already exists. */
function renameManager(from, to){
  CAL_INDEX=null;
  let n=0;
  CALENDAR.forEach(c=>{ if(c.manager===from){ c.manager=to; n++; } });
  return n;
}

function renderManagerMerge(mount){
  if(!EDIT) return;
  const names=[...new Set(CALENDAR.map(c=>c.manager).filter(Boolean))].sort(
    (a,b)=>a.toLowerCase().localeCompare(b.toLowerCase()));
  if(names.length<2) return;

  const box=document.createElement("details");
  box.className="panel"; box.style.margin="0 0 18px";
  const sum=document.createElement("summary");
  sum.style.cssText="cursor:pointer;font-family:'IBM Plex Mono',monospace;font-size:10.5px;"
    +"letter-spacing:.16em;text-transform:uppercase;color:var(--slate)";
  sum.textContent="Rename or merge a manager";
  box.appendChild(sum);

  const p=document.createElement("p"); p.className="lede"; p.style.margin="12px 0 8px";
  p.textContent="Pick the name to change and type what it should be. If that name already exists "
    +"the two are merged. This rewrites the calendar, so save afterwards.";
  box.appendChild(p);

  const bar=document.createElement("div"); bar.className="controls";
  const from=selectOf(names.map(x=>[x,`${x} (${CALENDAR.filter(c=>c.manager===x).length})`]),
    names[0], ()=>{});
  const to=document.createElement("input");
  to.type="text"; to.placeholder="Correct name\u2026"; to.setAttribute("list","mgrNames");
  const dl=document.createElement("datalist"); dl.id="mgrNames";
  names.forEach(x=>{ const o=document.createElement("option"); o.value=x; dl.appendChild(o); });
  box.appendChild(dl);
  const go=document.createElement("button"); go.className="btn primary"; go.textContent="Apply";
  go.addEventListener("click",()=>{
    const a=from.value, b=to.value.trim();
    if(!b || a===b) return;
    const exists=names.includes(b);
    const count=CALENDAR.filter(c=>c.manager===a).length;
    if(!confirm(exists
      ? `Merge ${a} into ${b}? ${count} tournaments will move across, and ${a} will no longer exist.`
      : `Rename ${a} to ${b} across ${count} tournaments?`)) return;
    snapshot("manager rename");
    const moved=renameManager(a,b);
    markDirty(); refreshAll();
    saveMsg(`${exists?"Merged":"Renamed"} ${a} \u2192 ${b} across ${moved} tournaments.`);
  });
  bar.appendChild(field("Change", from, "md"));
  bar.appendChild(field("To", to, "md"));
  bar.appendChild(field("", go));
  box.appendChild(bar);
  mount.appendChild(box);
}

function renderManagers(){
  if(!viewOn("v-managers")) return;
  const mount=$("mgrMount"); if(!mount) return;
  mount.innerHTML="";
  const seasons=calSeasons();
  if(!seasons.length){
    mount.innerHTML=`<div class="empty"><strong>No calendar loaded</strong>Manager credits come from the calendar.</div>`;
    return;
  }
  /* "" means every season and is a valid choice, so it mustn't be treated as
     an unknown one and snapped back to the newest year. */
  if(CAL_UI.mgrSeason===undefined) CAL_UI.mgrSeason=seasons[0];
  if(CAL_UI.mgrSeason && !seasons.includes(CAL_UI.mgrSeason)) CAL_UI.mgrSeason=seasons[0];
  renderManagerMerge(mount);
  const bar=document.createElement("div"); bar.className="controls";
  bar.appendChild(field("Season", selectOf([["","All seasons"]].concat(seasons.map(s=>[s,s])),
    CAL_UI.mgrSeason, v=>{CAL_UI.mgrSeason=v; renderManagers();}), "sm"));
  const dl=document.createElement("button"); dl.className="btn"; dl.textContent="Download CSV";
  bar.appendChild(field("", dl));
  mount.appendChild(bar);
  const rows=managerRows(CAL_UI.mgrSeason);
  const COLS=[{k:"manager",h:"Manager",render:r=>{
      const b=document.createElement("button"); b.className="linkish"; b.textContent=r.manager;
      b.addEventListener("click",()=>showManager(r.manager)); return b;
    }, csv:r=>r.manager},
    {k:"events",h:"Tournaments run",cls:"num",desc:true},
    {k:"seasons",h:"Seasons",cls:"num",desc:true},
    {k:"span",h:"Active",cls:"mono",sortAs:"first"},
    {k:"perSeason",h:"Per season",cls:"num",desc:true},
    {k:"challengers",h:"Challengers",cls:"num"},
    {k:"majors",h:"128 draws",cls:"num"},{k:"surfaces",h:"Surfaces"},{k:"run",h:"Including"}];
  dl.addEventListener("click",()=>downloadCsv(COLS, rows, "managers.csv"));
  mount.appendChild(tableOf(COLS, rows));
  const p=document.createElement("p"); p.className="hint";
  const oneYear=rows.filter(r=>r.seasons===1).length;
  const sea=CAL_UI.mgrSeason;
  const cancelled=CALENDAR.filter(c=>(!sea||c.season===sea) && !c.manager).length;
  p.textContent=`${rows.length} managers \u00b7 ${rows.reduce((n,r)=>n+r.events,0)} tournaments`
    + (oneYear?` \u00b7 ${oneYear} ran events in a single season`:"")
    + (cancelled?` \u00b7 ${cancelled} cancelled events have no manager`:"") + ".";
  mount.appendChild(p);
}

const PLAYER_COLS = [
  {k:"player",h:"Player",render:r=>{
      const b=document.createElement("button"); b.className="linkish"; b.textContent=r.player;
      b.addEventListener("click",()=>showPlayer(r.player,"Singles")); return b;
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
  {k:"surf_H",h:"Hard",cls:"mono",sortAs:"surfw_H",desc:true},
  {k:"surf_CL",h:"Clay",cls:"mono",sortAs:"surfw_CL",desc:true},
  {k:"surf_G",h:"Grass",cls:"mono",sortAs:"surfw_G",desc:true},
  {k:"surf_IH",h:"Indoor",cls:"mono",sortAs:"surfw_IH",desc:true},
  {k:"bestSurface",h:"Best surface",sortAs:"bestSurfacePct",desc:true},
  {k:"best",h:"Best win",cls:"num",sortAs:"bestNum",
    render:r=>r.best?esc(r.best):"\u2014", csv:r=>r.best},
  {k:"streak",h:"Longest run",cls:"num",desc:true},
  {k:"lastTitle",h:"Most Recent Title"}
];

const TEAM_COLS = [
  {k:"team",h:"Team",render:r=>nameLinks(r.team,"Doubles"), csv:r=>r.team},
  {k:"w",h:"W",cls:"num",desc:true}, {k:"l",h:"L",cls:"num"},
  {k:"pct",h:"Win %",render:r=>wlBar(r.w,r.l),
    csv:r=>(r.w+r.l)?Math.round(r.w/(r.w+r.l)*100)+"%":"",desc:true},
  {k:"titles",h:"Titles",cls:"num",desc:true}, {k:"finals",h:"Finals",cls:"num",desc:true},
  {k:"sfs",h:"Semi-Finals",cls:"num",desc:true},
  {k:"qw",h:"Q W",cls:"num",desc:true}, {k:"ql",h:"Q L",cls:"num"},
  {k:"qualified",h:"Times Qualified",cls:"num",desc:true},
  {k:"mdQw",h:"MD W as Q",cls:"num",desc:true}, {k:"mdQl",h:"MD L as Q",cls:"num"},
  {k:"surf_H",h:"Hard",cls:"mono",sortAs:"surfw_H",desc:true},
  {k:"surf_CL",h:"Clay",cls:"mono",sortAs:"surfw_CL",desc:true},
  {k:"surf_G",h:"Grass",cls:"mono",sortAs:"surfw_G",desc:true},
  {k:"surf_IH",h:"Indoor",cls:"mono",sortAs:"surfw_IH",desc:true},
  {k:"bestSurface",h:"Best surface",sortAs:"bestSurfacePct",desc:true},
  {k:"lastTitle",h:"Most Recent Title"}
];

const TITLE_COLS = [
  {k:"event",h:"Event",render:r=>{
      const b=document.createElement("button"); b.className="linkish"; b.textContent=r.event;
      b.addEventListener("click",()=>showEvent(r.event, r.season)); return b;
    }, csv:r=>r.event},
  {k:"season",h:"Season",cls:"mono"},
  {k:"surface",h:"Surface",render:r=>r.surface
    ? `<span class="surf ${esc(r.surface)}">${esc(r.surface)}</span> ${esc(SURFACE_NAME[r.surface]||"")}`
    : "\u2014", csv:r=>SURFACE_NAME[r.surface]||""},
  {k:"sWinner",h:"Singles Winner",cls:"win",
    render:r=>r.sWinner?nameLinks(r.sWinner,"Singles"):"\u2014", csv:r=>r.sWinner}, {k:"sFinalist",h:"Singles Finalist"},
  {k:"sSF1",h:"Singles SF",cls:"dim"}, {k:"sSF2",h:"Singles SF",cls:"dim"},
  {k:"dWinner",h:"Doubles Winner",cls:"win",
    render:r=>r.dWinner?nameLinks(r.dWinner,"Doubles"):"\u2014", csv:r=>r.dWinner}, {k:"dFinalist",h:"Doubles Finalist"},
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
/* Weeks are held in date order, so the newest on a tour is simply the last. */
function latestWeek(tour){
  const t=tourWeeks(tour);
  return t.length ? t[t.length-1] : null;
}

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
    current, debut: hist[0],
    active: null,          // filled in by the caller, which knows the tour
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
  const subs = [["list","Week list"],["records","No. 1s & top 10"],
                ["yearend","Year-end"],["movers","Movers"],["compare","Compare"]];
  const nav = document.createElement("div"); nav.className="subnav";
  subs.forEach(([k,label])=>{
    const b=document.createElement("button");
    b.textContent=label; b.setAttribute("aria-pressed", String(st.sub===k && !st.player));
    b.addEventListener("click",()=>{ st.sub=k; st.player=null; renderTour(tour); });
    nav.appendChild(b);
  });
  mount.appendChild(nav);

  if(st.player)              renderHistoryPanel(tour, mount);
  else if(st.sub==="records") renderRecords(tour, mount);
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
      } else if(c.render){
        const v=c.render(r);
        if(v instanceof Node) td.appendChild(v); else td.innerHTML=v;
      }
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

/* ------------------------------------------------------------------
   RANKING RECORDS
   Weeks spent at the top and in the top ten, and the run of number ones
   week by week. Doubles partnerships share a rank, so a week can have
   more than one holder; every one of them is counted.
   ------------------------------------------------------------------ */
function rankTallies(tour){
  const ws=tourWeeks(tour);
  const no1=new Map(), top10=new Map(), firstAt=new Map(), lastAt=new Map();
  const firstSeen=new Map(), lastSeen=new Map(), bestPts=new Map();
  const streak=new Map(), bestStreak=new Map(), lastIdx=new Map();
  const climbs=[];
  const timeline=[];

  ws.forEach((w,i)=>{
    const holders=[];
    (w.list||[]).forEach(r=>{
      const k=keyOf(r.name);
      if(!firstSeen.has(k)) firstSeen.set(k,w);
      lastSeen.set(k,w);

      const bp=bestPts.get(k);
      if(!bp || Number(r.points)>bp.points) bestPts.set(k,{points:Number(r.points), week:w, rank:r.rank});

      /* A top-10 run only continues if the player was in the top 10 in the
         immediately preceding week; missing a week ends it. */
      if(r.rank<=10){
        top10.set(k,(top10.get(k)||0)+1);
        const run = lastIdx.get(k)===i-1 ? (streak.get(k)||0)+1 : 1;
        streak.set(k,run); lastIdx.set(k,i);
        if(run > ((bestStreak.get(k)||{}).weeks||0)) bestStreak.set(k,{weeks:run, to:w});
      }
      if(r.rank===1){
        no1.set(k,(no1.get(k)||0)+1);
        if(!firstAt.has(k)) firstAt.set(k,w);
        lastAt.set(k,w);
        holders.push(k);
      }
      const prev=r.prev;
      if(prev!=="" && prev!=null){
        const d=Number(prev)-Number(r.rank);
        if(d>0) climbs.push({key:k, gain:d, from:Number(prev), to:Number(r.rank), week:w});
      }
    });
    timeline.push({w, holders});
  });
  return {no1, top10, firstAt, lastAt, firstSeen, lastSeen, bestPts, bestStreak, climbs, timeline};
}

/* Consecutive weeks under the same holder collapse into one reign, which is
   how a run at the top actually reads. */
function no1Reigns(tour, tallies){
  const {timeline}=tallies || rankTallies(tour);
  const out=[]; let cur=null;
  timeline.forEach(({w,holders})=>{
    if(!holders.length){ cur=null; return; }
    const sig=holders.slice().sort().join("|");
    if(cur && cur.sig===sig){ cur.weeks++; cur.to=w; return; }
    cur={sig, keys:holders.slice(), from:w, to:w, weeks:1};
    out.push(cur);
  });
  return out.reverse();
}

/* Someone missing from the most recent week isn't ranked any more, so their
   last figure is a leaving position rather than a current one. */
function isActive(tour, key, tallies){
  const last=latestWeek(tour); if(!last) return false;
  const seen=(tallies||rankTallies(tour)).lastSeen.get(key);
  return !!seen && seen===last;
}

function recordRows(tour){
  const t=rankTallies(tour);
  const reigns=no1Reigns(tour, t);
  const last=latestWeek(tour);
  const runsFor=new Map(), longest=new Map();
  reigns.forEach(r=>r.keys.forEach(k=>{
    runsFor.set(k,(runsFor.get(k)||0)+1);
    longest.set(k, Math.max(longest.get(k)||0, r.weeks));
  }));

  const yearEnd=new Map();
  yearEndWeeks(tour).forEach(w=>(w.list||[]).forEach(r=>{
    if(r.rank===1){ const k=keyOf(r.name); yearEnd.set(k,(yearEnd.get(k)||0)+1); }
  }));

  const status=k=>(t.lastSeen.get(k)===last) ? "" : `left after ${weekLabel(t.lastSeen.get(k))}`;

  const one=[...t.no1.entries()].map(([k,v])=>({
    key:k, player:canonName(k), country:canonCountry(k), weeks:v,
    reigns:runsFor.get(k)||0, longest:longest.get(k)||0, yearEnd:yearEnd.get(k)||0,
    first:weekLabel(t.firstAt.get(k)), last:weekLabel(t.lastAt.get(k))
  })).sort((a,b)=>b.weeks-a.weeks || a.player.localeCompare(b.player));

  const ten=[...t.top10.entries()].map(([k,v])=>({
    key:k, player:canonName(k), country:canonCountry(k), weeks:v,
    streak:(t.bestStreak.get(k)||{}).weeks||0,
    streakEnd:weekLabel((t.bestStreak.get(k)||{}).to),
    atNo1:t.no1.get(k)||0
  })).sort((a,b)=>b.weeks-a.weeks || a.player.localeCompare(b.player));

  const points=[...t.bestPts.entries()].map(([k,v])=>({
    key:k, player:canonName(k), country:canonCountry(k),
    points:v.points, rank:v.rank, week:weekLabel(v.week)
  })).sort((a,b)=>b.points-a.points).slice(0,40);

  const climbs=t.climbs.slice().sort((a,b)=>b.gain-a.gain).slice(0,25).map(c=>({
    player:canonName(c.key), country:canonCountry(c.key),
    gain:c.gain, from:c.from, to:c.to, week:weekLabel(c.week)
  }));

  const byCountry=new Map();
  t.no1.forEach((v,k)=>{
    const c=canonCountry(k)||"\u2014";
    if(!byCountry.has(c)) byCountry.set(c,{country:c, weeks:0, players:new Set()});
    const e=byCountry.get(c); e.weeks+=v; e.players.add(canonName(k));
  });
  const countries=[...byCountry.values()].map(e=>({
    country:e.country, weeks:e.weeks, count:e.players.size,
    who:[...e.players].sort().join(", ")
  })).sort((a,b)=>b.weeks-a.weeks);

  const debuts=[...t.firstSeen.entries()].map(([k,w])=>({
    key:k, player:canonName(k), country:canonCountry(k),
    debut:weekLabel(w), date:w.date,
    lastSeen:weekLabel(t.lastSeen.get(k)),
    status:status(k) ? "left" : "active"
  })).sort((a,b)=>(b.date&&a.date)?b.date-a.date:0).slice(0,40);

  return {one, ten, points, climbs, countries, debuts, reigns, tallies:t};
}

/* ---------------- records ---------------- */
function renderRecords(tour, mount){
  const st=RANK_UI[tour];
  const R=recordRows(tour);
  const go=x=>{ st.player=x; renderTour(tour); };

  if(!R.one.length){
    mount.innerHTML+=`<div class="empty"><strong>Nothing to show yet</strong>Load some ranking weeks first.</div>`;
    return;
  }

  const ws=tourWeeks(tour);
  const bestOne=R.one.reduce((m,o)=>o.longest>m.longest?o:m, R.one[0]);
  const bestTen=R.ten.reduce((m,o)=>o.streak>m.streak?o:m, R.ten[0]);
  const grid=document.createElement("div"); grid.className="statgrid";
  [["Weeks recorded", String(ws.length), `${weekLabel(ws[0])} onward`],
   ["Players at no. 1", String(R.one.length), "all time"],
   ["Separate reigns", String(R.reigns.length), "runs at the top"],
   ["Longest reign", `${bestOne.longest} wks`, bestOne.player],
   ["Longest top-10 run", `${bestTen.streak} wks`, bestTen.player],
   ["Most points held", R.points[0].points.toLocaleString(), `${R.points[0].player}, ${R.points[0].week}`]
  ].forEach(([k,v,note])=>{
    const c=document.createElement("div"); c.className="stat";
    c.innerHTML=`<span class="k">${esc(k)}</span><span class="v">${esc(v)}</span><span class="note">${esc(note||"")}</span>`;
    grid.appendChild(c);
  });
  mount.appendChild(grid);

  const section=(title, note, cols, rows, file, opts)=>{
    const h=document.createElement("h3"); h.className="sec"; h.textContent=title;
    mount.appendChild(h);
    if(note){ const p=document.createElement("p"); p.className="lede"; p.textContent=note; mount.appendChild(p); }
    const bar=document.createElement("div"); bar.className="controls";
    const b=document.createElement("button"); b.className="btn"; b.textContent="Download CSV";
    b.addEventListener("click",()=>downloadCsv(cols, rows, `${tour.toLowerCase()}-${file}.csv`));
    bar.appendChild(field("", b)); mount.appendChild(bar);
    mount.appendChild(tableOf(cols, rows, opts||{onPlayer:go}));
  };

  section("Weeks at no. 1", "", [
    {k:"player",h:"Player",csv:r=>r.player},{k:"country",h:"Country",cls:"ctry"},
    {k:"weeks",h:"Weeks at no. 1",cls:"num"},{k:"reigns",h:"Reigns",cls:"num"},
    {k:"longest",h:"Longest reign",cls:"num"},{k:"yearEnd",h:"Year-end no. 1",cls:"num"},
    {k:"first",h:"First"},{k:"last",h:"Most recent"}
  ], R.one, "weeks-at-no1");

  section("Weeks in the top 10",
    "Longest run counts unbroken weeks \u2014 dropping out for a single week starts it again.", [
    {k:"player",h:"Player",csv:r=>r.player},{k:"country",h:"Country",cls:"ctry"},
    {k:"weeks",h:"Weeks in top 10",cls:"num"},{k:"streak",h:"Longest run",cls:"num"},
    {k:"streakEnd",h:"Run ended"},{k:"atNo1",h:"of those, at no. 1",cls:"num"}
  ], R.ten, "weeks-in-top-10");

  section("Highest points ever held", "The single best points total each player has recorded.", [
    {k:"player",h:"Player",csv:r=>r.player},{k:"country",h:"Country",cls:"ctry"},
    {k:"points",h:"Points",cls:"num"},{k:"rank",h:"Rank then",cls:"num"},{k:"week",h:"Week"}
  ], R.points, "highest-points");

  section("Biggest weekly climbs", "The largest single-week rises anywhere in the record.", [
    {k:"gain",h:"Places gained",cls:"num",render:r=>`<span style="color:var(--ball)">\u25B2 ${r.gain}</span>`,csv:r=>r.gain},
    {k:"player",h:"Player",csv:r=>r.player},{k:"country",h:"Country",cls:"ctry"},
    {k:"from",h:"From",cls:"num"},{k:"to",h:"To",cls:"num"},{k:"week",h:"Week"}
  ], R.climbs, "biggest-climbs", {});

  section("Weeks at no. 1 by country", "", [
    {k:"country",h:"Country",cls:"ctry"},{k:"weeks",h:"Weeks",cls:"num"},
    {k:"count",h:"Players",cls:"num"},{k:"who",h:"Who"}
  ], R.countries, "no1-by-country", {});

  section("Most recent debuts", "The week each player first appeared in the rankings.", [
    {k:"player",h:"Player",csv:r=>r.player},{k:"country",h:"Country",cls:"ctry"},
    {k:"debut",h:"First ranked"},{k:"lastSeen",h:"Last ranked"},
    {k:"status",h:"Status",render:r=>r.status==="active"
      ? '<span style="color:var(--ball)">active</span>' : '<span class="dim">no longer ranked</span>',
      csv:r=>r.status}
  ], R.debuts, "debuts");

  const h=document.createElement("h3"); h.className="sec"; h.textContent="Every reign, newest first";
  mount.appendChild(h);
  const note=document.createElement("p"); note.className="lede";
  note.textContent="Consecutive weeks under the same player are grouped into one reign.";
  mount.appendChild(note);
  const rows=R.reigns.map(r=>({
    holder:r.keys.map(k=>canonName(k)).join(" \u00b7 "),
    country:[...new Set(r.keys.map(k=>canonCountry(k)))].join(" \u00b7 "),
    from:weekLabel(r.from), to:weekLabel(r.to), weeks:r.weeks,
    span:r.weeks===1 ? weekLabel(r.from) : `${weekLabel(r.from)} \u2013 ${weekLabel(r.to)}`
  }));
  const bar=document.createElement("div"); bar.className="controls";
  const b=document.createElement("button"); b.className="btn"; b.textContent="Download CSV";
  b.addEventListener("click",()=>downloadCsv(
    [{k:"holder",h:"No. 1"},{k:"country",h:"Country"},{k:"from",h:"From"},{k:"to",h:"To"},{k:"weeks",h:"Weeks"}],
    rows, `${tour.toLowerCase()}-no1-reigns.csv`));
  bar.appendChild(field("", b)); mount.appendChild(bar);
  mount.appendChild(tableOf([
    {k:"holder",h:"No. 1"},{k:"country",h:"Country",cls:"ctry"},
    {k:"span",h:"Weeks held"},{k:"weeks",h:"Weeks",cls:"num"}], rows));
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

  const newest=latestWeek(tour);
  const rows=series.filter(s=>s.data.length).map(s=>{
    const st2=historyStats(s.data);
    const live = !!newest && st2.current.week===newest.name && (st2.current.season||"")===(newest.season||"");
    return {name:s.name, current: live ? "#"+st2.current.rank : "NR", high:"#"+st2.careerHigh.rank,
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
  const newest=latestWeek(tour);
  if(stats) stats.active = !!newest && stats.current.week===newest.name &&
    (stats.current.season||"")===(newest.season||"");

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
  sub.textContent = stats && !stats.active
    ? `${tour} ranking history \u2014 no longer ranked, last appeared ${histLabel(stats.current)}`
    : `${tour} ranking history`;
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

  /* A rank from two years ago isn't a current rank. Anyone missing from the
     newest week reads as NR, with their leaving position kept alongside. */
  const cards=[
    stats.active
      ? ["Current","#"+stats.current.rank, histLabel(stats.current)]
      : ["Current","NR", `not ranked since ${histLabel(stats.current)}`],
    ...(stats.active ? [] : [["Last ranked","#"+stats.current.rank, histLabel(stats.current)]]),
    ["Career high","#"+stats.careerHigh.rank, histLabel(stats.careerHigh)],
    ["Season high", stats.seasonHigh?"#"+stats.seasonHigh.rank:"\u2014", histLabel(stats.seasonHigh)],
    ["Season low",  stats.seasonLow ?"#"+stats.seasonLow.rank :"\u2014", histLabel(stats.seasonLow)],
    ["Weeks at no. 1", String(stats.atNo1), stats.atNo1?"career":""],
    ["Weeks in top 10", String(stats.inTop10), stats.inTop10?"career":""],
    ["Weeks ranked", String(stats.weeks), stats.seasons.slice(0,4).join(", ")+(stats.seasons.length>4?"\u2026":"")],
    ["First ranked", histLabel(stats.debut), "debut"]
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
  setHash(`rank/${enc(tour)}/${enc(canonName(name))}`);
  const st=RANK_UI[tour];
  st.player=canonName(name); st.pSeason=""; st.sub="list";
  renderTour(tour);
  const btn=document.querySelector(`#nav button[data-view="${tour==="Doubles"?"drankings":"rankings"}"]`);
  if(btn) btn.click();
}

/* ==================================================================
   CALENDAR AND TOURNAMENT PAGES
   The calendar is the season's index: every tournament with its week,
   date, surface, draw size and manager. Each row opens that
   tournament's own page.
   ================================================================== */
let CALENDAR = [];
const SURFACE_NAME = {H:"Hard", CL:"Clay", G:"Grass", IH:"Indoor hard"};
const CAL_UI = {season:"", q:"", surface:"", manager:"", showCH:false};

/* This is called once per match by surfaceOf and the date ordering, so a linear
   scan of three thousand calendar rows each time turned into hundreds of
   millions of comparisons across a full archive. */
let CAL_INDEX = null;
function calIndex(){
  if(CAL_INDEX) return CAL_INDEX;
  CAL_INDEX = new Map();
  CALENDAR.forEach(c=>{
    const k=c.event+"|"+(c.season||"");
    if(!CAL_INDEX.has(k)) CAL_INDEX.set(k, c);
    if(!CAL_INDEX.has(c.event)) CAL_INDEX.set(c.event, c);
  });
  return CAL_INDEX;
}
const calFor = (event, season) => {
  const ix=calIndex();
  return ix.get(event+"|"+(season||"")) || (season ? null : ix.get(event)) || null;
};

function calSeasons(){
  return [...new Set(CALENDAR.map(c=>c.season))].sort((a,b)=>b.localeCompare(a));
}

function eventMatchCount(event, season){
  return MATCHES.filter(m=>m.event===event && (!season || m.season===season)).length;
}

/* ------------------------------------------------------------------
   READING A CALENDAR
   The sheet is tab-separated with a month name above each block and a
   repeated header row, both of which are skipped. The season comes from
   the date column unless one is typed in.
   ------------------------------------------------------------------ */
const MONTH_WORDS=new Set(["january","february","march","april","may","june","july",
  "august","september","october","november","december"]);

/* Every season's sheet is laid out a little differently \u2014 seven columns one
   year, eight the next, dots or slashes in the dates, tier numbers appended to
   names. Rather than learn each shape, each cell is identified by what it
   contains: a week code, a date, a draw size, a surface, a country code. What's
   left is the tournament, and the last cell standing is the manager. */
const SURF_MAP={H:"H",HARD:"H",IH:"IH",INDOOR:"IH",CL:"CL",CLAY:"CL",
  G:"G",GR:"G",GRASS:"G",ICL:"ICL"};
const RE_WEEK=/^\d{1,2}[a-z]?$/i;
const RE_DATE=/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})$/;
const RE_DRAW=/^\d{1,3}(\s*\/\s*\d{1,4})*$/;
const RE_CTRY=/^[A-Z]{2,4}(\s*\/\s*[A-Z]{2,4})*$/;
const RE_SURF=/^[A-Za-z]{1,5}(\s*\/\s*[A-Za-z]{1,5})*$/;

function normSurface(v){
  const first=String(v||"").split("/")[0].trim().toUpperCase();
  return SURF_MAP[first] || "";
}
/* "Dallas 500" and "Dallas" are the same tournament; the tier and the
   challenger marker belong to the row, not the name. */
function baseEventName(name){
  return String(name)
    .replace(/\s*\bCH\*?(?=\s|$)/gi,"")
    .replace(/\s*\b(250|500|1000|ITF|Finals)\b\s*$/i,"")
    .replace(/\s{2,}/g," ").trim();
}

function parseCalendar(text, seasonOverride){
  const out=[], bad=[], notes=[];
  String(text).split(/\r?\n/).forEach(line=>{
    const cells=line.split("\t").map(x=>x.trim());
    const live=cells.filter(Boolean);
    if(live.length<4) return;                       // month headings and blanks
    if(/\btournament\b/i.test(line) && /\bmanager\b/i.test(line)) return;
    if(/^week\b/i.test(live[0]) || /opened by/i.test(line)) return;

    let week="", dates=[], draw=null, surface="", country="", rest=[];
    live.forEach(c=>{
      if(!week && RE_WEEK.test(c)){ week=c; return; }
      const dm=c.match(RE_DATE);
      if(dm){ dates.push(dm); return; }
      if(!draw && RE_DRAW.test(c) && c.includes("/")){ draw=c; return; }
      if(!country && RE_CTRY.test(c) && c===c.toUpperCase() && !/^\d/.test(c)
         && !normSurface(c)){ country=c; return; }
      if(!surface && RE_SURF.test(c) && normSurface(c)){ surface=normSurface(c); return; }
      rest.push(c);
    });
    if(!rest.length){ bad.push(line.trim()); return; }
    const manager = rest.length>1 ? rest[rest.length-1] : "";
    const name    = rest.length>1 ? rest.slice(0,-1).join(" ") : rest[0];
    if(!name){ bad.push(line.trim()); return; }

    const d0=dates[0];
    const yr = d0 ? (d0[3].length===2 ? "20"+d0[3] : d0[3]) : "";
    const date = d0 ? `${yr}-${String(+d0[2]).padStart(2,"0")}-${String(+d0[1]).padStart(2,"0")}` : "";
    const opened = dates[1] ? `${dates[1][1]}/${dates[1][2]}/${dates[1][3]}` : "";
    const sizes=(draw||"").split("/").map(x=>parseInt(x,10)).filter(x=>!isNaN(x));
    if(draw && sizes.some(x=>x>512)) notes.push(`draw size "${draw}" for ${name} looks mistyped`);
    if(!surface) notes.push(`no surface read for ${name}`);

    out.push({season:"", code:week, date, opened, name, event:baseEventName(name),
      country, surface, draw:sizes, manager,
      challenger:/\bCH\*?\b/i.test(name) || /\bITF\b/i.test(name),
      _year:yr});
  });

  /* Dates can be mistyped a year out, so the season is whichever year most of
     them agree on unless one is given. */
  let season=seasonOverride;
  if(!season){
    const c={};
    out.forEach(r=>{ if(r._year) c[r._year]=(c[r._year]||0)+1; });
    season=Object.keys(c).sort((a,b)=>c[b]-c[a])[0]||"";
  }
  out.forEach(r=>{
    if(r._year && r._year!==season) notes.push(`${r.name} is dated ${r._year}, filed under ${season}`);
    r.season=season; delete r._year;
  });
  return {rows:out, bad, notes};
}

on("btnCal","click",()=>{
  const msg=$("calMsg"); msg.className="msg";
  const text=val("calIn");
  if(!text.trim()){ msg.className="msg err"; msg.textContent="Nothing to add \u2014 the calendar box is empty."; return; }
  const {rows,bad,notes}=parseCalendar(text, val("calSeason").trim());
  if(!rows.length){
    msg.className="msg err";
    msg.textContent="No calendar rows recognised. Each needs eight tab-separated columns: week, date, thread opened, tournament, country, surface, draw size, manager.";
    return;
  }
  snapshot("calendar paste");
  const seasons=[...new Set(rows.map(r=>r.season))];
  /* Merged on season and week code rather than wiping the season, so pasting
     one month at a time doesn't discard the rest of the year. */
  const incoming=new Set(rows.map(r=>r.season+"|"+r.code));
  const before=CALENDAR.length;
  CALENDAR = CALENDAR.filter(c=>!incoming.has(c.season+"|"+c.code)).concat(rows);
  CAL_INDEX=null;
  const replaced=before + rows.length - CALENDAR.length;

  /* An event already in the matches under a different spelling can't be linked
     by name alone, so those are named rather than guessed at. */
  const evs=[...new Set(MATCHES.filter(m=>seasons.includes(m.season)).map(m=>m.event))];
  const known=new Set(CALENDAR.filter(c=>seasons.includes(c.season)).map(c=>c.event));
  const orphanEvents=evs.filter(e=>!known.has(e));
  const orphanCal=rows.filter(r=>!evs.includes(r.event) && !r.challenger).map(r=>r.name);

  const bits=[`${replaced?`Added ${rows.length-replaced} and replaced ${replaced}`:`Added ${rows.length}`} `
    + `tournaments for ${seasons.join(", ")}`
    + ` \u2014 ${new Set(rows.map(r=>r.manager)).size} managers, `
    + `${rows.filter(r=>r.challenger).length} challengers.`];
  if(orphanEvents.length) bits.push(`These events have matches but no calendar row: ${orphanEvents.join(", ")}.`);
  if(orphanCal.length && orphanCal.length<=12) bits.push(`No matches entered yet for: ${orphanCal.join(", ")}.`);
  if(bad.length) bits.push(`${bad.length} line${bad.length===1?"":"s"} skipped.`);
  if(notes.length) bits.push(`Worth a look: ${[...new Set(notes)].slice(0,6).join("; ")}`
    + (notes.length>6?` and ${notes.length-6} more.`:"."));
  msg.className=(orphanEvents.length||bad.length||notes.length)?"msg warn":"msg";
  msg.textContent=bits.join(" ");
  setVal("calIn",""); markDirty(); refreshAll();
});

function renderCalendar(){
  if(!viewOn("v-calendar")) return;
  const mount=$("calMount"); if(!mount) return;
  mount.innerHTML="";
  if(!CALENDAR.length){
    mount.innerHTML=`<div class="empty"><strong>No calendar loaded</strong>
      ${EDIT?"Paste one on the Add data tab.":"Nothing has been published here yet."}</div>`;
    return;
  }
  const seasons=calSeasons();
  if(!seasons.includes(CAL_UI.season)) CAL_UI.season=seasons[0];

  const bar=document.createElement("div"); bar.className="controls";
  if(seasons.length>1)
    bar.appendChild(field("Season", selectOf(seasons.map(s=>[s,s]), CAL_UI.season,
      v=>{CAL_UI.season=v; renderCalendar();}), "xs"));
  const surfaces=[...new Set(CALENDAR.map(c=>c.surface))].sort();
  bar.appendChild(field("Surface", selectOf([["","All"]].concat(surfaces.map(s=>[s,SURFACE_NAME[s]||s])),
    CAL_UI.surface, v=>{CAL_UI.surface=v; renderCalendar();}), "sm"));
  const mans=[...new Set(CALENDAR.map(c=>c.manager).filter(Boolean))].sort();
  bar.appendChild(field("Manager", selectOf([["","All"]].concat(mans.map(m=>[m,m])),
    CAL_UI.manager, v=>{CAL_UI.manager=v; renderCalendar();}), "md"));
  const inp=document.createElement("input");
  inp.type="text"; inp.placeholder="Tournament or country\u2026"; inp.value=CAL_UI.q;
  inp.addEventListener("input",()=>{ CAL_UI.q=inp.value; renderCalendar();
    const el=$("calMount").querySelector(".controls input");
    if(el){ el.focus(); el.setSelectionRange(el.value.length,el.value.length); } });
  bar.appendChild(field("Search", inp, "grow"));
  mount.appendChild(bar);

  const chk=document.createElement("label"); chk.className="check"; chk.style.margin="10px 0 4px";
  const cb=document.createElement("input"); cb.type="checkbox"; cb.checked=CAL_UI.showCH;
  cb.addEventListener("change",()=>{CAL_UI.showCH=cb.checked; renderCalendar();});
  const sp=document.createElement("span"); sp.textContent="Show challenger events (managed, results not tracked)";
  chk.appendChild(cb); chk.appendChild(sp); mount.appendChild(chk);

  const q=CAL_UI.q.trim().toLowerCase();
  const rows=CALENDAR.filter(c=>
    c.season===CAL_UI.season &&
    (CAL_UI.showCH || !c.challenger) &&
    (!CAL_UI.surface || c.surface===CAL_UI.surface) &&
    (!CAL_UI.manager || c.manager===CAL_UI.manager) &&
    (!q || hay(c.name, c.country, c.manager).includes(q)));

  const wrap=document.createElement("div");
  const head=document.createElement("div"); head.className="calrow calhead";
  head.innerHTML=`<span>Week</span><span>Date</span><span>Tournament</span><span>Country</span>
    <span>Surface</span><span>Draw</span><span>Manager</span>`;
  wrap.appendChild(head);

  rows.forEach(c=>{
    const played=eventMatchCount(c.event, c.season);
    const row=document.createElement("div");
    row.className="calrow"+(played?"":" notrack");
    const name=document.createElement("span");
    if(played){
      const b=document.createElement("button"); b.className="linkish"; b.textContent=c.name;
      b.addEventListener("click",()=>showEvent(c.event, c.season));
      name.appendChild(b);
      const n=document.createElement("span"); n.className="dim";
      n.style.cssText="font-size:11px;margin-left:8px"; n.textContent=` ${played} matches`;
      name.appendChild(n);
    } else {
      name.innerHTML=`${esc(c.name)} <span class="dim" style="font-size:11px">results not tracked</span>`;
    }
    row.innerHTML=`<span class="wk">${esc(c.code)}</span><span class="dt">${esc(c.date)}</span>`;
    row.appendChild(name);
    const rest=document.createElement("span"); rest.className="ctry"; rest.textContent=c.country;
    const surf=document.createElement("span");
    surf.innerHTML=`<span class="surf ${esc(c.surface)}" title="${esc(SURFACE_NAME[c.surface]||c.surface)}">${esc(c.surface)}</span>`;
    const dr=document.createElement("span"); dr.className="mono";
    dr.style.fontSize="11px"; dr.textContent=(c.draw||[]).join("/");
    const mg=document.createElement("span");
    const mb=document.createElement("button"); mb.className="linkish"; mb.textContent=c.manager||"\u2014";
    mb.addEventListener("click",()=>{ CAL_UI.manager=c.manager; renderCalendar(); });
    mg.appendChild(mb);
    row.appendChild(rest); row.appendChild(surf); row.appendChild(dr); row.appendChild(mg);
    wrap.appendChild(row);
  });
  mount.appendChild(wrap);

  const tracked=rows.filter(c=>eventMatchCount(c.event,c.season)).length;
  const p=document.createElement("p"); p.className="hint";
  p.textContent=`${rows.length} tournaments \u00b7 ${tracked} with results \u00b7 `
    + `${[...new Set(rows.map(c=>c.manager))].length} managers`;
  mount.appendChild(p);
}

/* ------------------------------------------------------------------
   ONE TOURNAMENT
   ------------------------------------------------------------------ */
const EVENT_UI = {event:null, season:null, disc:"Singles", stage:"Main"};

function showEvent(event, season){
  setHash(`event/${enc(event)}${season?"/"+enc(season):""}`);
  EVENT_UI.event=event; EVENT_UI.season=season||"";
  EVENT_UI.disc="Singles"; EVENT_UI.stage="Main";
  renderEvent();
  openView("event");
}

function renderEvent(){
  if(!viewOn("v-event")) return;
  const mount=$("eventMount"); if(!mount) return;
  mount.innerHTML="";
  const {event, season}=EVENT_UI;
  if(!event){
    mount.innerHTML=`<div class="empty"><strong>No tournament chosen</strong>Pick one from the Calendar.</div>`;
    return;
  }
  const c=calFor(event, season);
  const ms=MATCHES.filter(m=>m.event===event && (!season || m.season===season));

  const back=document.createElement("button");
  back.className="btn sm"; back.textContent="\u2190 Calendar";
  back.addEventListener("click",()=>{
    const b=document.querySelector('#nav button[data-view="calendar"]'); if(b) b.click();
  });
  mount.appendChild(back);

  const h=document.createElement("h3"); h.className="sec"; h.style.margin="12px 0 2px";
  h.textContent=event;
  mount.appendChild(h);
  const sub=document.createElement("p"); sub.className="lede"; sub.style.margin="0 0 14px";
  sub.innerHTML = c
    ? `${esc(c.date)} \u00b7 ${esc(c.country)} \u00b7 <span class="surf ${esc(c.surface)}">${esc(c.surface)}</span>
       ${esc(SURFACE_NAME[c.surface]||"")} \u00b7 draw ${esc((c.draw||[]).join("/"))}
       \u00b7 run by <b>${esc(c.manager||"\u2014")}</b>`
    : `${esc(season||"")} \u2014 not in the calendar`;
  mount.appendChild(sub);

  /* champions */
  const grid=document.createElement("div"); grid.className="statgrid";
  ["Singles","Doubles"].forEach(disc=>{
    const f=ms.find(m=>m.disc===disc && m.stage==="Main" && m.round==="F");
    const nm = f ? (disc==="Doubles"?canonTeam(f.winner):canonName(f.winner)) : "\u2014";
    const runner = f ? (disc==="Doubles"?canonTeam(f.loser):canonName(f.loser)) : "";
    const card=document.createElement("div"); card.className="stat";
    card.innerHTML=`<span class="k">${disc} champion</span>
      <span class="v" style="font-size:20px;line-height:1.25">${esc(nm)}</span>
      <span class="note">${runner?"beat "+esc(runner):""}</span>`;
    grid.appendChild(card);
  });
  ["Singles","Doubles"].forEach(disc=>{
    const lk=drawLuck(event, season, disc);
    if(!lk || lk.slots<4) return;
    const c2=document.createElement("div"); c2.className="stat";
    c2.innerHTML=`<span class="k">${disc} draw luck</span>
      <span class="v">${Math.round(lk.pct*100)}%</span>
      <span class="note">would have won from ${lk.wins} of ${lk.slots} slots</span>`;
    grid.appendChild(c2);
  });
  const qual=ms.filter(m=>m.stage==="Qualifying" && m.round==="QFR");
  const card=document.createElement("div"); card.className="stat";
  card.innerHTML=`<span class="k">Matches</span><span class="v">${ms.length}</span>
    <span class="note">${qual.length} qualified</span>`;
  grid.appendChild(card);
  mount.appendChild(grid);

  /* which draw to show */
  const combos=[["Singles","Main"],["Doubles","Main"],["Singles","Qualifying"],["Doubles","Qualifying"]]
    .filter(([d,s])=>ms.some(m=>m.disc===d && m.stage===s));
  if(!combos.some(([d,s])=>d===EVENT_UI.disc && s===EVENT_UI.stage) && combos.length)
    [EVENT_UI.disc, EVENT_UI.stage]=combos[0];

  const nav=document.createElement("div"); nav.className="subnav";
  combos.forEach(([disc,stage])=>{
    const b=document.createElement("button");
    b.textContent = stage==="Main" ? disc : `${disc} qualifying`;
    b.setAttribute("aria-pressed", String(disc===EVENT_UI.disc && stage===EVENT_UI.stage));
    b.addEventListener("click",()=>{ EVENT_UI.disc=disc; EVENT_UI.stage=stage; renderEvent(); });
    nav.appendChild(b);
  });
  mount.appendChild(nav);

  const shown=ms.filter(m=>m.disc===EVENT_UI.disc && m.stage===EVENT_UI.stage);
  if(!shown.length){
    mount.innerHTML+=`<div class="empty"><strong>Nothing here</strong>No matches for that draw.</div>`;
    return;
  }

  /* rounds run from the first played to the final, side by side */
  const ORDER=["R512","R256","R128","R64","R32","R16","QF","SF","F","QR1","QR2","QR3","QFR"];
  const rounds=[...new Set(shown.map(m=>m.round))].sort((a,b)=>ORDER.indexOf(a)-ORDER.indexOf(b));
  const champ = (shown.find(m=>m.round==="F")||{}).winner;
  const champKey = champ ? (EVENT_UI.disc==="Doubles"?teamKeyOf(champ):keyOf(champ)) : null;

  /* A player in one round with no match in the round before had a bye. Those
     aren't stored as results, so they're worked out here and shown in place. */
  const byesFor={};
  rounds.forEach((rnd,i)=>{
    if(i===0) return;
    const prev=new Set();
    shown.filter(m=>m.round===rounds[i-1]).forEach(m=>{
      prev.add(idOf(m.winner,m.disc)); prev.add(idOf(m.loser,m.disc)); });
    const here=[];
    shown.filter(m=>m.round===rnd).forEach(m=>{
      ["winner","loser"].forEach(k=>{
        if(!prev.has(idOf(m[k],m.disc))) here.push(sideOf(m,k)); });
    });
    if(here.length) byesFor[rounds[i-1]]=here;
  });

  const board=document.createElement("div"); board.className="bracket";
  rounds.forEach(rnd=>{
    const col=document.createElement("div"); col.className="bcol";
    const hh=document.createElement("h4");
    hh.textContent=`${rnd} \u2014 ${shown.filter(m=>m.round===rnd).length}`;
    const nb=(byesFor[rnd]||[]).length;
    if(nb) hh.textContent=`${rnd} \u2014 ${shown.filter(m=>m.round===rnd).length} + ${nb} byes`;
    col.appendChild(hh);
    shown.filter(m=>m.round===rnd).forEach(m=>{
      const isD=m.disc==="Doubles";
      const w=isD?canonTeam(m.winner):canonName(m.winner);
      const l=isD?canonTeam(m.loser):canonName(m.loser);
      const onPath = champKey && (isD?teamKeyOf(m.winner):keyOf(m.winner))===champKey;
      const el=document.createElement("div");
      el.className="bm"+(onPath?" champ":"");
      el.innerHTML=`<div class="w">${m.winnerSeed?`<span class="seed">(${esc(m.winnerSeed)})</span> `:""}${esc(w)}
          <span class="sc">${m.winnerScore}\u2013${m.loserScore}</span></div>
        <div class="l">${m.loserSeed?`<span class="seed">(${esc(m.loserSeed)})</span> `:""}${esc(l)}</div>`;
      col.appendChild(el);
    });
    (byesFor[rnd]||[]).forEach(nm=>{
      const el=document.createElement("div"); el.className="bm";
      el.style.opacity=".65";
      el.innerHTML=`<div class="w">${esc(nm)}<span class="sc">bye</span></div>
        <div class="l">\u2014</div>`;
      col.appendChild(el);
    });
    board.appendChild(col);
  });
  mount.appendChild(board);
  const hint=document.createElement("p"); hint.className="hint";
  hint.textContent="The champion's path is marked down the left of each match.";
  mount.appendChild(hint);
}

/* ------------------------------------------------------------------
   MANAGERS
   ------------------------------------------------------------------ */
function managerRows(season){
  const by=new Map();
  CALENDAR.filter(c=>!season || c.season===season).forEach(c=>{
    if(!c.manager) return;                       // cancelled events have nobody
    const k=c.manager;
    if(!by.has(k)) by.set(k,{manager:k, events:0, challengers:0,
      surfaces:new Set(), majors:0, seasons:new Set(), list:[]});
    const e=by.get(k);
    e.events++;
    if(c.challenger) e.challengers++;
    if((c.draw||[])[0]>=128) e.majors++;
    e.surfaces.add(c.surface); e.seasons.add(c.season); e.list.push(c.name);
  });
  /* A flat count only measures how long somebody has been around. Seasons
     active and the span say whether 40 events was a long steady run or one
     very heavy year. */
  return [...by.values()].map(e=>{
    const yrs=[...e.seasons].sort();
    return {...e,
      seasons:yrs.length,
      span: yrs.length>1 ? `${yrs[0]}\u2013${yrs[yrs.length-1]}` : yrs[0],
      first: yrs[0], last: yrs[yrs.length-1],
      perSeason: Math.round(e.events/yrs.length*10)/10,
      surfaces:[...e.surfaces].filter(Boolean).sort().join(" "),
      run:e.list.slice(0,4).join(", ")+(e.list.length>4?"\u2026":"")};
  }).sort((a,b)=>b.events-a.events || a.manager.localeCompare(b.manager));
}

/* ==================================================================
   HEAD TO HEAD
   ================================================================== */
const H2H_UI = {a:"", b:"", disc:"Singles", sub:"pair", drawText:"", rows:null};

const sideOf = (m, which) => m.disc==="Doubles" ? canonTeam(m[which]) : canonName(m[which]);
const idOf   = (name, disc) => disc==="Doubles" ? teamKeyOf(name) : keyOf(name);

function h2hMatches(a, b, disc){
  const ka=idOf(a,disc), kb=idOf(b,disc);
  return MATCHES.filter(m=>{
    if(m.disc!==disc || m.isBye) return false;
    const w=idOf(m.winner,disc), l=idOf(m.loser,disc);
    return (w===ka&&l===kb) || (w===kb&&l===ka);
  });
}

function h2hSummary(a, b, disc){
  const ms=h2hMatches(a,b,disc);
  const ka=idOf(a,disc);
  let aw=0, bw=0;
  ms.forEach(m=>{ if(idOf(m.winner,disc)===ka) aw++; else bw++; });
  return {matches:ms, aw, bw};
}

/* Everyone who has played, for the pickers. */
function allSides(disc){
  const set=new Map();
  MATCHES.forEach(m=>{
    if(m.disc!==disc || m.isBye) return;
    ["winner","loser"].forEach(w=>{ const n=sideOf(m,w); set.set(idOf(n,disc), n); });
  });
  return [...set.values()].sort((x,y)=>x.toLowerCase().localeCompare(y.toLowerCase()));
}

function renderH2H(){
  if(!viewOn("v-h2h")) return;
  const mount=$("h2hMount"); if(!mount) return;
  mount.innerHTML="";
  if(!MATCHES.length){
    mount.innerHTML=`<div class="empty"><strong>No matches yet</strong>Head to head needs some results first.</div>`;
    return;
  }
  const nav=document.createElement("div"); nav.className="subnav";
  [["pair","Two players"],["draw","Paste a draw"]].forEach(([k,label])=>{
    const b=document.createElement("button"); b.textContent=label;
    b.setAttribute("aria-pressed", String(H2H_UI.sub===k));
    b.addEventListener("click",()=>{H2H_UI.sub=k; renderH2H();});
    nav.appendChild(b);
  });
  mount.appendChild(nav);
  if(H2H_UI.sub==="pair") renderH2HPair(mount); else renderH2HDraw(mount);
}

function renderH2HPair(mount){
  const names=allSides(H2H_UI.disc);
  const dl=document.createElement("datalist"); dl.id="h2hNames";
  names.forEach(n=>{const o=document.createElement("option"); o.value=n; dl.appendChild(o);});
  mount.appendChild(dl);

  const bar=document.createElement("div"); bar.className="controls";
  bar.appendChild(field("Discipline", selectOf([["Singles","Singles"],["Doubles","Doubles"]],
    H2H_UI.disc, v=>{H2H_UI.disc=v; H2H_UI.a=""; H2H_UI.b=""; renderH2H();}), "xs"));
  const mk=(val,ph,set)=>{
    const i=document.createElement("input"); i.type="text"; i.value=val; i.placeholder=ph;
    i.setAttribute("list","h2hNames");
    i.addEventListener("change",()=>{set(i.value); renderH2H();});
    return i;
  };
  bar.appendChild(field(H2H_UI.disc==="Doubles"?"Team one":"Player one",
    mk(H2H_UI.a,"Start typing\u2026",v=>H2H_UI.a=v), "grow"));
  bar.appendChild(field(H2H_UI.disc==="Doubles"?"Team two":"Player two",
    mk(H2H_UI.b,"Start typing\u2026",v=>H2H_UI.b=v), "grow"));
  mount.appendChild(bar);

  if(!H2H_UI.a || !H2H_UI.b){
    const e=document.createElement("div"); e.className="empty";
    e.innerHTML="<strong>Pick two</strong>Their whole record against each other appears here.";
    mount.appendChild(e); return;
  }
  const {matches, aw, bw}=h2hSummary(H2H_UI.a, H2H_UI.b, H2H_UI.disc);
  const A=canonicalName(H2H_UI.a), B=canonicalName(H2H_UI.b);

  const grid=document.createElement("div"); grid.className="statgrid";
  [[A, String(aw), aw>bw?"leads":""],["Meetings", String(matches.length), ""],
   [B, String(bw), bw>aw?"leads":""]].forEach(([k,v,note])=>{
    const c=document.createElement("div"); c.className="stat";
    c.innerHTML=`<span class="k">${esc(k)}</span><span class="v">${esc(v)}</span><span class="note">${esc(note)}</span>`;
    grid.appendChild(c);
  });
  mount.appendChild(grid);

  if(!matches.length){
    const e=document.createElement("div"); e.className="empty";
    e.innerHTML="<strong>Never met</strong>No match between these two in the data.";
    mount.appendChild(e); return;
  }
  const COLS=[
    {k:"event",h:"Event",render:r=>{
      const b=document.createElement("button"); b.className="linkish"; b.textContent=r.event;
      b.addEventListener("click",()=>showEvent(r.event,r.season)); return b;}, csv:r=>r.event},
    {k:"season",h:"Season",cls:"mono"},
    {k:"round",h:"Round",cls:"rnd"},
    {k:"winner",h:"Won by",cls:"win",render:r=>nameLinks(r.winner,H2H_UI.disc), csv:r=>r.winner},
    {k:"score",h:"Score",cls:"mono"},{k:"sc",h:"SC",cls:"mono"}];
  const rows=matches.map(m=>({event:m.event, season:m.season, round:m.round,
    winner:sideOf(m,"winner"), score:`${m.winnerScore}\u2013${m.loserScore}`,
    sc:`${m.winnerSC}\u2013${m.loserSC}`}));
  mount.appendChild(tableOf(COLS, rows));
}
const canonicalName = n => n;

function renderH2HDraw(mount){
  const p=document.createElement("p"); p.className="lede";
  p.textContent="Paste an upcoming draw and every match comes back with the record between those two.";
  mount.appendChild(p);
  const ta=document.createElement("textarea");
  ta.spellcheck=false; ta.style.height="180px"; ta.value=H2H_UI.drawText;
  ta.placeholder="R32\n00:00 | Player (GBR) vs. Other (USA) #SRs: 0-0\n\u2026";
  mount.appendChild(ta);
  const bar=document.createElement("div"); bar.className="btnrow";
  const go=document.createElement("button"); go.className="btn primary"; go.textContent="Look up";
  go.addEventListener("click",()=>{
    H2H_UI.drawText=ta.value;
    const res=parseDraw(ta.value, "", "Singles");
    const seen=new Set(); const rows=[];
    const add=(disc, round, A, B)=>{
      const k=[disc,round,idOf(A,disc),idOf(B,disc)].sort().join("|");
      if(seen.has(k)) return; seen.add(k);
      const s=h2hSummary(A,B,disc);
      rows.push({round, disc, a:A, b:B,
        record:`${s.aw}\u2013${s.bw}`,
        lead: s.aw>s.bw ? A : s.bw>s.aw ? B : (s.matches.length?"level":"never met"),
        met:s.matches.length,
        last: s.matches.length ? `${sideOf(s.matches[s.matches.length-1],"winner")} at ${s.matches[s.matches.length-1].event}` : ""});
    };
    res.rows.forEach(r=>{ if(!r.isBye) add(r.disc, r.round, sideOf(r,"winner"), sideOf(r,"loser")); });
    res.pending.forEach(pm=>{
      const disc=pm.disc, [L,R]=pm.match.sides;
      if(L.bye||R.bye) return;
      add(disc, pm.round,
        disc==="Doubles"?canonTeam(L.name):canonName(L.name),
        disc==="Doubles"?canonTeam(R.name):canonName(R.name));
    });
    H2H_UI.rows=rows; renderH2H();
  });
  const clr=document.createElement("button"); clr.className="btn"; clr.textContent="Clear";
  clr.addEventListener("click",()=>{H2H_UI.drawText=""; H2H_UI.rows=null; renderH2H();});
  bar.appendChild(go); bar.appendChild(clr);
  mount.appendChild(bar);

  if(!H2H_UI.rows) return;
  if(!H2H_UI.rows.length){
    const e=document.createElement("div"); e.className="empty";
    e.innerHTML="<strong>Nothing read</strong>No match lines recognised in that paste.";
    mount.appendChild(e); return;
  }
  const COLS=[{k:"round",h:"Round",cls:"rnd"},
    {k:"a",h:"Player",render:r=>nameLinks(r.a,r.disc), csv:r=>r.a},
    {k:"b",h:"Player",render:r=>nameLinks(r.b,r.disc), csv:r=>r.b},
    {k:"record",h:"Record",cls:"mono"},{k:"lead",h:"Ahead"},{k:"last",h:"Last meeting"}];
  mount.appendChild(tableOf(COLS, H2H_UI.rows));
  const n=H2H_UI.rows.filter(r=>!r.met).length;
  const hint=document.createElement("p"); hint.className="hint";
  hint.textContent=`${H2H_UI.rows.length} matches \u00b7 ${n} first meetings.`;
  mount.appendChild(hint);
}

/* ==================================================================
   DRAW LUCK
   Move the champion to every other slot in turn, swapping with whoever
   was there, and replay the whole draw from the recorded scores. A
   player can only win a round they actually have a score for, so nobody
   travels further than they really did. The count of slots the champion
   still wins from is how kind the draw was.
   ================================================================== */
const ORDER_MAIN = ["R512","R256","R128","R64","R32","R16","QF","SF","F"];

function drawTree(event, season, disc){
  /* A bye recorded as a 0:0 match isn't a contest. Left in, it seats the
     player in the opening round with a score of nothing, so relocating them
     anywhere real would lose every time. */
  const isByeRow = m => m.isBye || /^bye(\/bye)?$/i.test(String(m.winner).trim())
                     || /^bye(\/bye)?$/i.test(String(m.loser).trim());
  const ms=MATCHES.filter(m=>m.event===event && (!season||m.season===season)
                            && m.disc===disc && m.stage==="Main" && !isByeRow(m));
  if(!ms.length) return null;
  const rounds=ORDER_MAIN.filter(r=>ms.some(m=>m.round===r));
  const fin=ms.find(m=>m.round===rounds[rounds.length-1]);
  if(!fin || rounds[rounds.length-1]!=="F") return null;

  const wonAt=new Map();                 // "key|round" -> match
  ms.forEach(m=>wonAt.set(idOf(m.winner,disc)+"|"+m.round, m));

  /* Plenty of matches were settled by something the figures don't carry \u2014 a
     PTS tiebreak, a countback. Where the two really did meet in that round the
     recorded result stands, so replaying an untouched draw reproduces it
     exactly. Only invented pairings fall back to comparing figures. */
  const played=new Map();
  ms.forEach(m=>{
    const a=idOf(m.winner,disc), b=idOf(m.loser,disc);
    played.set([m.round,a,b].sort().join("|"), a);
  });

  /* Each player's own figures, round by round. */
  const score=new Map();
  ms.forEach(m=>{
    const setOne=(k,r,a,b,c)=>{ if(!score.has(k)) score.set(k,{}); score.get(k)[r]={s:a,sr:b,st:c}; };
    setOne(idOf(m.winner,disc), m.round, m.winnerScore, m.winnerSC, 0);
    if(!m.isBye) setOne(idOf(m.loser,disc), m.round, m.loserScore, m.loserSC, 0);
  });

  let slots=[];
  /* entryIdx is the round the player actually joined at, which is not the same
     as the round the search was looking at: a player with no match at round i
     sat that round out and came in at i+1. */
  const leaf=(player, round, entryIdx)=>{
    const slot={player, entryIdx}; slots.push(slot); return {leaf:true, slot, round}; };

  function node(player, roundIdx){
    const round=rounds[roundIdx];
    const feeder=wonAt.get(idOf(player,disc)+"|"+round);
    if(!feeder) return leaf(player, round, roundIdx+1);      // sat this round out
    const other = idOf(feeder.winner,disc)===idOf(player,disc) ? feeder.loser : feeder.winner;
    /* At the opening round both players are seats in the draw. Treating only
       the winner as a seat halved every count: a 32-draw reported 16. */
    if(roundIdx===0)
      return {leaf:false, round, kids:[leaf(player, round, 0), leaf(other, round, 0)]};
    return {leaf:false, round, kids:[node(player, roundIdx-1), node(other, roundIdx-1)]};
  }
  const root={leaf:false, round:"F",
    kids:[node(fin.winner, rounds.length-2), node(fin.loser, rounds.length-2)]};
  /* Where the champion joined the draw. A seed who sat out the opening round
     would have done so from any seat, so they carry that bye with them rather
     than being asked to play a round they never played. */
  const ck=idOf(fin.winner, disc);
  const champSeat=slots.find(s=>idOf(s.player,disc)===ck);
  const champEntry = champSeat ? champSeat.entryIdx : 0;

  return {root, rounds, score, played, champEntry,
          champion:sideOf(fin,"winner"), disc, ms, slots};
}

function beats(A, B, round, score, disc, played){
  if(!A) return false;
  if(!B) return true;
  if(played){
    const hit=played.get([round, idOf(A,disc), idOf(B,disc)].sort().join("|"));
    if(hit) return hit===idOf(A,disc);
  }
  const a=(score.get(idOf(A,disc))||{})[round];
  const b=(score.get(idOf(B,disc))||{})[round];
  if(!a && !b) return false;
  if(!a) return false;                  // no figures for this round, so can't win it
  if(!b) return true;
  if(a.s!==b.s)   return a.s>b.s;
  if(a.sr!==b.sr) return a.sr>b.sr;
  return false;                          // dead level: the draw doesn't settle it, so no advance
}

function playOut(tree, swapA, swapB){
  const {score, disc, played, rounds, champEntry, champion}=tree;
  const sub = p => p===swapA ? swapB : p===swapB ? swapA : p;
  const ck = champion ? idOf(champion, disc) : null;
  function run(n){
    if(n.leaf) return sub(n.slot.player);
    const A=run(n.kids[0]), B=run(n.kids[1]);
    if(A===B) return A;
    /* Rounds the champion sat out originally are sat out here too. */
    const idx = rounds.indexOf(n.round);
    if(idx >= 0 && idx < champEntry){
      if(A && idOf(A,disc)===ck) return A;
      if(B && idOf(B,disc)===ck) return B;
    }
    if(beats(A,B,n.round,score,disc,played)) return A;
    if(beats(B,A,n.round,score,disc,played)) return B;
    return null;
  }
  return run(tree.root);
}

function drawLuck(event, season, disc, pool){
  const tree=drawTree(event, season, disc, pool);
  if(!tree) return null;
  const champ=tree.champion;
  const seats=tree.slots.map(s=>s.player);
  let wins=0, tested=0;
  const lost=[];
  seats.forEach(p=>{
    if(idOf(p,disc)===idOf(champ,disc)){ wins++; tested++; return; }
    tested++;
    const out=playOut(tree, champ, p);
    if(out && idOf(out,disc)===idOf(champ,disc)) wins++;
    else lost.push({swappedWith:p, wonBy: out ? sideOf({disc, winner:out},"winner") : "nobody"});
  });
  return {champion:champ, slots:tested, wins, pct: tested?wins/tested:0, lost, disc, event, season};
}

function luckTable(season){
  const out=[];
  /* Grouping once means each draw is built from its own handful of matches
     rather than filtering the entire archive per tournament. */
  const byEvent=new Map();
  MATCHES.forEach(m=>{
    if(season && m.season!==season) return;
    const k=m.event+"||"+(m.season||"");
    if(!byEvent.has(k)) byEvent.set(k,[]);
    byEvent.get(k).push(m);
  });
  [...byEvent.keys()].forEach(k=>{
    const [ev,se]=k.split("||");
    const pool=byEvent.get(k);
    ["Singles","Doubles"].forEach(disc=>{
      const r=drawLuck(ev, se, disc, pool);
      if(!r || r.slots<4) return;
      out.push({event:ev, season:se, disc, champion:r.champion,
        slots:r.slots, wins:r.wins, pct:Math.round(r.pct*100)});
    });
  });
  return out.sort((a,b)=>a.pct-b.pct || a.event.localeCompare(b.event));
}

/* ==================================================================
   PLAYER PROFILE
   Everything about one player on a single page: record, surfaces,
   titles, ranking, opponents and recent matches.
   ================================================================== */
const PROFILE = {name:null, disc:"Singles"};

/* Player and tournament pages have no tab in the nav, so clicking a button
   that isn't there did nothing at all: the page rendered behind whatever you
   were already looking at. */
/* A doubles side is two people, so it links as two names rather than one. */
function nameLinks(raw, disc){
  const wrap=document.createElement("span");
  if(disc!=="Doubles"){
    const nm=canonName(raw);
    const b=document.createElement("button"); b.className="linkish"; b.textContent=nm;
    b.addEventListener("click",()=>showPlayer(nm,"Singles"));
    wrap.appendChild(b);
    return wrap;
  }
  String(raw).split("/").forEach((p,i)=>{
    if(i){ const sep=document.createElement("span"); sep.className="dim"; sep.textContent=" / "; wrap.appendChild(sep); }
    const nm=canonName(p.trim());
    const b=document.createElement("button"); b.className="linkish"; b.textContent=nm;
    b.addEventListener("click",()=>showPlayer(nm,"Doubles"));
    wrap.appendChild(b);
  });
  return wrap;
}

function openView(name){
  const btn=document.querySelector(`#nav button[data-view="${name}"]`);
  if(btn){ btn.click(); return; }
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("on"));
  const v=$("v-"+name);
  if(v) v.classList.add("on");
  document.querySelectorAll("#nav button").forEach(b=>b.setAttribute("aria-selected","false"));
  window.scrollTo(0,0);
  refreshAll();
}

function showPlayer(name, disc){
  setHash(`player/${enc(canonName(name))}${disc&&disc!=="Singles"?"/"+enc(disc):""}`);
  PROFILE.name = canonName(name);
  PROFILE.disc = disc || "Singles";
  renderProfile();
  openView("player");
}

/* Every match a player appears in, either alone or as part of a team. */
function playerMatches(name, disc){
  const k=keyOf(name);
  return MATCHES.filter(m=>{
    if(m.disc!==disc || m.isBye) return false;
    const inSide = s => disc==="Doubles"
      ? String(m[s]).split("/").some(p=>keyOf(p.trim())===k)
      : keyOf(m[s])===k;
    return inSide("winner") || inSide("loser");
  });
}
const wonBy = (m, name) => {
  const k=keyOf(name);
  return m.disc==="Doubles"
    ? String(m.winner).split("/").some(p=>keyOf(p.trim())===k)
    : keyOf(m.winner)===k;
};

function renderProfile(){
  if(!viewOn("v-player")) return;
  const mount=$("playerMount"); if(!mount) return;
  mount.innerHTML="";
  const name=PROFILE.name;
  if(!name){
    mount.innerHTML=`<div class="empty"><strong>No player chosen</strong>Click a name anywhere on the site.</div>`;
    return;
  }
  const disc=PROFILE.disc;
  const ms=playerMatches(name, disc);

  const h=document.createElement("h3"); h.className="sec"; h.style.margin="0 0 2px";
  h.innerHTML=`${esc(name)} <span class="ctry" style="font-size:14px">${esc(canonCountry(name))}</span>`;
  mount.appendChild(h);

  const share=document.createElement("button");
  share.className="btn sm"; share.style.cssText="float:right";
  share.textContent="Copy link";
  share.addEventListener("click",()=>{
    const url=location.origin+location.pathname+"#player/"+enc(name);
    navigator.clipboard?.writeText(url);
    share.textContent="Copied"; setTimeout(()=>share.textContent="Copy link",1500);
  });
  mount.appendChild(share);

  const nav=document.createElement("div"); nav.className="subnav";
  ["Singles","Doubles"].forEach(d=>{
    const b=document.createElement("button"); b.textContent=d;
    b.setAttribute("aria-pressed", String(d===disc));
    const has=playerMatches(name,d).length;
    if(!has){ b.disabled=true; b.style.opacity=".45"; }
    b.addEventListener("click",()=>{ PROFILE.disc=d; renderProfile(); });
    nav.appendChild(b);
  });
  mount.appendChild(nav);

  if(!ms.length){
    mount.innerHTML+=`<div class="empty"><strong>No ${disc.toLowerCase()} matches</strong></div>`;
    return;
  }

  /* headline figures */
  const w=ms.filter(m=>wonBy(m,name)).length, l=ms.length-w;
  const main=ms.filter(m=>m.stage==="Main");
  const titles=main.filter(m=>m.round==="F" && wonBy(m,name));
  const finals=main.filter(m=>m.round==="F" && !wonBy(m,name));
  const semis =main.filter(m=>m.round==="SF" && !wonBy(m,name));
  const hist=playerHistory(disc, name);
  const stats=hist.length?historyStats(hist):null;
  const newest=latestWeek(disc);
  const live = stats && newest && stats.current.week===newest.name
               && (stats.current.season||"")===(newest.season||"");

  const grid=document.createElement("div"); grid.className="statgrid";
  const cards=[
    ["Record", `${w}\u2013${l}`, ms.length+" matches"],
    ["Win rate", ms.length?Math.round(w/ms.length*100)+"%":"\u2014", ""],
    ["Titles", String(titles.length), titles.length?titles[titles.length-1].event:""],
    ["Finals lost", String(finals.length), ""],
    ["Semis lost", String(semis.length), ""]
  ];
  if(stats) cards.push(
    ["Ranking", live?"#"+stats.current.rank:"NR", live?histLabel(stats.current):"not ranked since "+histLabel(stats.current)],
    ["Career high", "#"+stats.careerHigh.rank, histLabel(stats.careerHigh)]);
  const bw=bestWin(name, disc);
  if(bw) cards.push(["Best win", "#"+bw.rank, `${bw.over}, ${bw.event} ${bw.round}`]);
  const st=longestStreak(name, disc);
  if(st.length>1) cards.push(["Longest run", st.length+" wins",
    st.from ? `${st.from.event} to ${st.to.event}` : ""]);
  cards.forEach(([k,v,note])=>{
    const c=document.createElement("div"); c.className="stat";
    c.innerHTML=`<span class="k">${esc(k)}</span><span class="v">${esc(v)}</span><span class="note">${esc(note||"")}</span>`;
    grid.appendChild(c);
  });
  mount.appendChild(grid);

  /* surfaces */
  const bySurf=new Map();
  ms.forEach(m=>{
    const s=surfaceOf(m)||"?";
    if(!bySurf.has(s)) bySurf.set(s,{surface:SURFACE_NAME[s]||s, w:0, l:0, titles:0});
    const e=bySurf.get(s);
    wonBy(m,name) ? e.w++ : e.l++;
    if(m.stage==="Main" && m.round==="F" && wonBy(m,name)) e.titles++;
  });
  const surfRows=[...bySurf.values()].sort((a,b)=>(b.w+b.l)-(a.w+a.l))
    .map(e=>({...e, pct:(e.w+e.l)?Math.round(e.w/(e.w+e.l)*100)+"%":""}));
  const sh=document.createElement("h3"); sh.className="sec"; sh.textContent="By surface";
  mount.appendChild(sh);
  mount.appendChild(tableOf([{k:"surface",h:"Surface"},{k:"w",h:"W",cls:"num"},
    {k:"l",h:"L",cls:"num"},{k:"pct",h:"Win rate",cls:"num"},{k:"titles",h:"Titles",cls:"num"}], surfRows));

  const seasons=seasonRows(name, disc);
  if(seasons.length>1 || (seasons[0] && seasons[0].season!=="\u2014")){
    const sh2=document.createElement("h3"); sh2.className="sec"; sh2.textContent="Season by season";
    mount.appendChild(sh2);
    mount.appendChild(tableOf([{k:"season",h:"Season",cls:"mono"},{k:"w",h:"W",cls:"num"},
      {k:"l",h:"L",cls:"num"},{k:"pct",h:"Win rate",cls:"num"},{k:"titles",h:"Titles",cls:"num"},
      {k:"finals",h:"Finals lost",cls:"num"},{k:"sfs",h:"Semis lost",cls:"num"},
      {k:"events",h:"Tournaments",cls:"num"}], seasons));
  }

  if(disc==="Doubles"){
    const partners=partnerRows(name);
    if(partners.length){
      const ph=document.createElement("h3"); ph.className="sec";
      ph.textContent=`Partners \u2014 ${partners.length}`;
      mount.appendChild(ph);
      mount.appendChild(tableOf([
        {k:"partner",h:"Partner",render:r=>{
          const b=document.createElement("button"); b.className="linkish"; b.textContent=r.partner;
          b.addEventListener("click",()=>showPlayer(r.partner,"Doubles")); return b;}, csv:r=>r.partner},
        {k:"played",h:"Played",cls:"num"},{k:"record",h:"Record",cls:"mono"},
        {k:"pct",h:"Win rate",cls:"num"},{k:"titles",h:"Titles",cls:"num"}], partners));
    }
  }

  /* ranking line */
  if(hist.length>1){
    const rh=document.createElement("h3"); rh.className="sec"; rh.textContent="Ranking";
    mount.appendChild(rh);
    const box=document.createElement("div"); box.className="chartbox";
    box.appendChild(lineChart([{name, data:hist}], "rank"));
    mount.appendChild(box);
    const go=document.createElement("button"); go.className="btn sm";
    go.textContent=`Full ${disc.toLowerCase()} ranking history \u2192`;
    go.addEventListener("click",()=>showRanking(disc, name));
    mount.appendChild(go);
  }

  /* titles */
  if(titles.length){
    const th=document.createElement("h3"); th.className="sec"; th.textContent=`Titles \u2014 ${titles.length}`;
    mount.appendChild(th);
    mount.appendChild(tableOf([
      {k:"event",h:"Tournament",render:r=>{
        const b=document.createElement("button"); b.className="linkish"; b.textContent=r.event;
        b.addEventListener("click",()=>showEvent(r.event,r.season)); return b;}, csv:r=>r.event},
      {k:"season",h:"Season",cls:"mono"},{k:"surface",h:"Surface"},
      {k:"beat",h:"Beat",render:r=>nameLinks(r.beat,disc), csv:r=>r.beat},
      {k:"score",h:"Final",cls:"mono"}],
      titles.map(m=>({event:m.event, season:m.season,
        surface:SURFACE_NAME[surfaceOf(m)]||"", beat:sideOf(m,"loser"),
        score:`${m.winnerScore}\u2013${m.loserScore}`})).reverse()));
  }

  /* who they meet most */
  const opp=new Map();
  ms.forEach(m=>{
    const other = wonBy(m,name) ? sideOf(m,"loser") : sideOf(m,"winner");
    const k=idOf(other,disc);
    if(!opp.has(k)) opp.set(k,{name:other, w:0, l:0});
    const e=opp.get(k);
    wonBy(m,name) ? e.w++ : e.l++;
  });
  const oppRows=[...opp.values()].sort((a,b)=>(b.w+b.l)-(a.w+a.l)).slice(0,12)
    .map(o=>({...o, played:o.w+o.l, record:`${o.w}\u2013${o.l}`}));
  const oh=document.createElement("h3"); oh.className="sec"; oh.textContent="Most-played opponents";
  mount.appendChild(oh);
  mount.appendChild(tableOf([
    {k:"name",h:"Opponent",render:r=>{
      const b=document.createElement("button"); b.className="linkish"; b.textContent=r.name;
      b.addEventListener("click",()=>{ H2H_UI.a=name; H2H_UI.b=r.name; H2H_UI.disc=disc;
        H2H_UI.sub="pair"; setHash(`h2h/${enc(name)}/${enc(r.name)}`); renderH2H();
        const t=document.querySelector('#nav button[data-view="h2h"]'); if(t) t.click(); });
      return b;}, csv:r=>r.name},
    {k:"played",h:"Played",cls:"num"},{k:"record",h:"Record",cls:"mono"}], oppRows));

  /* recent matches */
  const mh=document.createElement("h3"); mh.className="sec"; mh.textContent="Matches";
  mount.appendChild(mh);
  const rows=ms.slice().reverse().slice(0,60).map(m=>({
    event:m.event, season:m.season, round:m.round,
    result: wonBy(m,name) ? "won" : "lost",
    other: wonBy(m,name) ? sideOf(m,"loser") : sideOf(m,"winner"),
    score: wonBy(m,name) ? `${m.winnerScore}\u2013${m.loserScore}` : `${m.loserScore}\u2013${m.winnerScore}`
  }));
  mount.appendChild(tableOf([
    {k:"event",h:"Tournament",render:r=>{
      const b=document.createElement("button"); b.className="linkish"; b.textContent=r.event;
      b.addEventListener("click",()=>showEvent(r.event,r.season)); return b;}, csv:r=>r.event},
    {k:"round",h:"Round",cls:"rnd"},
    {k:"result",h:"Result",render:r=>r.result==="won"
      ? '<span style="color:var(--ball)">won</span>' : '<span class="dim">lost</span>', csv:r=>r.result},
    {k:"other",h:"Against",render:r=>nameLinks(r.other,disc), csv:r=>r.other},
    {k:"score",h:"Score",cls:"mono"}], rows));
  if(ms.length>60){
    const p=document.createElement("p"); p.className="hint";
    p.textContent=`Showing the most recent 60 of ${ms.length}.`;
    mount.appendChild(p);
  }
}

/* ==================================================================
   LINKS
   Every view goes in the URL so it can be posted, bookmarked and
   stepped back through. Without this a link to "my profile" just lands
   on the home page, which on a forum is most of the point.
   ================================================================== */
let ROUTING = false;
const enc = s => encodeURIComponent(String(s));

function setHash(h){
  if(location.hash === "#"+h) return;
  ROUTING = true;
  location.hash = h;
  setTimeout(()=>{ ROUTING=false; }, 0);
}

function currentHash(){
  return decodeURIComponent(location.hash.replace(/^#/,"")).trim();
}

function applyHash(){
  const raw = location.hash.replace(/^#/,"");
  if(!raw) return false;
  const parts = raw.split("/").map(x=>decodeURIComponent(x));
  const [what, a, b] = parts;
  const go = view => { openView(view); return !!$("v-"+view); };
  switch(what){
    case "player":
      if(!a) return false;
      PROFILE.name=canonName(a); PROFILE.disc=b||"Singles";
      renderProfile(); return go("player");
    case "event":
      if(!a) return false;
      EVENT_UI.event=a; EVENT_UI.season=b||"";
      EVENT_UI.disc="Singles"; EVENT_UI.stage="Main";
      renderEvent(); return go("event");
    case "h2h":
      if(a){ H2H_UI.a=a; H2H_UI.b=b||""; H2H_UI.sub="pair"; renderH2H(); }
      return go("h2h");
    case "manager":
      if(a){ MANAGER_UI.name=a; renderManagerPage(); }
      return go("manager");
    case "rank":
      if(a){ RANK_UI[a==="Doubles"?"Doubles":"Singles"].player = b?canonName(b):null;
             renderTour(a==="Doubles"?"Doubles":"Singles"); }
      return go(a==="Doubles"?"drankings":"rankings");
    default:
      return go(what);
  }
}

window.addEventListener("hashchange", ()=>{ if(!ROUTING) applyHash(); });

/* ==================================================================
   WHEN A MATCH HAPPENED
   Matches carry no date, but the calendar dates the tournament, so
   ordering a career is possible. Anything undated keeps its load order.
   ================================================================== */
function matchDate(m){
  const c=calFor(m.event, m.season);
  return c && c.date ? c.date : "";
}
function inOrder(list){
  return list.slice().sort((x,y)=>{
    const a=matchDate(x), b=matchDate(y);
    if(a && b && a!==b) return a<b ? -1 : 1;
    return (x.id||0)-(y.id||0);
  });
}

/* ==================================================================
   EXTRA PLAYER FIGURES
   ================================================================== */
function bestWin(name, disc){
  let best=null;
  playerMatches(name, disc).forEach(m=>{
    if(!wonBy(m,name)) return;
    const r=parseInt(m.loserRank,10);
    if(isNaN(r)) return;
    if(!best || r<best.rank) best={rank:r, over:sideOf(m,"loser"), event:m.event, season:m.season, round:m.round};
  });
  return best;
}

function longestStreak(name, disc){
  const ms=inOrder(playerMatches(name, disc));
  let run=0, best=0, from=null, bestFrom=null, bestTo=null, cur=null;
  ms.forEach(m=>{
    if(wonBy(m,name)){
      if(!run) from=m;
      run++; cur=m;
      if(run>best){ best=run; bestFrom=from; bestTo=cur; }
    } else run=0;
  });
  return {length:best, from:bestFrom, to:bestTo};
}

function seasonRows(name, disc){
  const by=new Map();
  playerMatches(name, disc).forEach(m=>{
    const s=m.season||"\u2014";
    if(!by.has(s)) by.set(s,{season:s, w:0, l:0, titles:0, finals:0, sfs:0, events:new Set()});
    const e=by.get(s);
    wonBy(m,name) ? e.w++ : e.l++;
    e.events.add(m.event);
    if(m.stage==="Main" && m.round==="F"){ wonBy(m,name) ? e.titles++ : e.finals++; }
    if(m.stage==="Main" && m.round==="SF" && !wonBy(m,name)) e.sfs++;
  });
  return [...by.values()].map(e=>({...e, events:e.events.size,
    pct:(e.w+e.l)?Math.round(e.w/(e.w+e.l)*100)+"%":""}))
    .sort((a,b)=>String(b.season).localeCompare(String(a.season)));
}

/* Who a player has partnered, and how the pairing fared. */
function partnerRows(name){
  const k=keyOf(name), by=new Map();
  MATCHES.forEach(m=>{
    if(m.disc!=="Doubles" || m.isBye) return;
    ["winner","loser"].forEach(sideName=>{
      const parts=String(m[sideName]).split("/").map(x=>x.trim());
      if(!parts.some(p=>keyOf(p)===k)) return;
      const mate=parts.find(p=>keyOf(p)!==k);
      if(!mate) return;
      const mk=keyOf(mate);
      if(!by.has(mk)) by.set(mk,{partner:canonName(mate), w:0, l:0, titles:0});
      const e=by.get(mk);
      sideName==="winner" ? e.w++ : e.l++;
      if(sideName==="winner" && m.stage==="Main" && m.round==="F") e.titles++;
    });
  });
  return [...by.values()].map(e=>({...e, played:e.w+e.l,
    record:`${e.w}\u2013${e.l}`, pct:(e.w+e.l)?Math.round(e.w/(e.w+e.l)*100)+"%":""}))
    .sort((a,b)=>b.played-a.played);
}

/* ==================================================================
   SEEDS
   Whether being seeded is worth anything, which in a tipping game is a
   fair question to ask of the seeding itself.
   ================================================================== */
function seedRows(season, disc){
  const band = s => {
    const n=parseInt(s,10);
    if(!isNaN(n)) return n<=4 ? "1\u20134" : n<=8 ? "5\u20138" : n<=16 ? "9\u201316" : "17+";
    const t=String(s||"").toUpperCase();
    if(t==="Q")  return "Qualifier";
    if(t==="LL") return "Lucky loser";
    if(t)        return t;
    return "Unseeded";
  };
  const by=new Map();
  MATCHES.forEach(m=>{
    if(m.stage!=="Main" || m.isBye) return;
    if(season && m.season!==season) return;
    if(disc && m.disc!==disc) return;
    [["winner",m.winnerSeed],["loser",m.loserSeed]].forEach(([who,sd])=>{
      const b=band(sd);
      if(!by.has(b)) by.set(b,{band:b, w:0, l:0, titles:0, finals:0});
      const e=by.get(b);
      who==="winner" ? e.w++ : e.l++;
      if(m.round==="F"){ who==="winner" ? e.titles++ : e.finals++; }
    });
  });
  const ORDER=["1\u20134","5\u20138","9\u201316","17+","Unseeded","Qualifier","Lucky loser","SE","ALT","WC"];
  return [...by.values()].map(e=>({...e, played:e.w+e.l,
    pct:(e.w+e.l)?Math.round(e.w/(e.w+e.l)*100)+"%":"", pctNum:(e.w+e.l)?e.w/(e.w+e.l):-1}))
    .sort((a,b)=>{
      const i=ORDER.indexOf(a.band), j=ORDER.indexOf(b.band);
      return (i<0?99:i)-(j<0?99:j);
    });
}

/* ==================================================================
   SCORE DETAIL
   Matches taken from the old database carry a single figure a side,
   with no tiebreak or set detail. Anything counting SRs or sets means
   something different across that boundary, so it's said plainly
   rather than left for someone to work out.
   ================================================================== */
const DETAIL_FROM = "2019";
function detailNote(seasons){
  const old=[...new Set(seasons)].filter(s=>s && s<DETAIL_FROM);
  if(!old.length) return null;
  const p=document.createElement("p"); p.className="hint";
  p.textContent=`Seasons before ${DETAIL_FROM} came from the game's own database, which `
    + `recorded one figure a side. Tiebreak and set detail begins with ${DETAIL_FROM}.`;
  return p;
}

/* ==================================================================
   OVERVIEW
   A front door. The calendar is a fine index but a poor first
   impression of twenty seasons.
   ================================================================== */
function renderOverview(){
  if(!viewOn("v-home")) return;
  const mount=$("homeMount"); if(!mount) return;
  mount.innerHTML="";
  if(!MATCHES.length && !CALENDAR.length){
    mount.innerHTML=`<div class="empty"><strong>Nothing loaded yet</strong></div>`;
    return;
  }

  const seasons=[...new Set(MATCHES.map(m=>m.season).filter(Boolean))].sort();
  const titles=deriveTitles();
  const players=derivePlayers();
  const grid=document.createElement("div"); grid.className="statgrid";
  [["Seasons", seasons.length ? `${seasons[0]}\u2013${seasons[seasons.length-1]}` : "\u2014",
      `${CALENDAR.length.toLocaleString()} tournaments`],
   ["Matches", MATCHES.length.toLocaleString(), `${titles.length.toLocaleString()} finals played`],
   ["Players", players.length.toLocaleString(), `${deriveTeams().length.toLocaleString()} doubles teams`],
   ["Managers", String(new Set(CALENDAR.map(c=>c.manager).filter(Boolean)).size),
      "who have run a tournament"]
  ].forEach(([k,v,note])=>{
    const c=document.createElement("div"); c.className="stat";
    c.innerHTML=`<span class="k">${esc(k)}</span><span class="v">${esc(v)}</span>
      <span class="note">${esc(note)}</span>`;
    grid.appendChild(c);
  });
  mount.appendChild(grid);

  /* who is on top right now */
  ["Singles","Doubles"].forEach(tour=>{
    const wk=latestWeek(tour);
    if(!wk || !wk.list || !wk.list.length) return;
    const top=wk.list.slice().sort((a,b)=>a.rank-b.rank).slice(0,5);
    const h=document.createElement("h3"); h.className="sec";
    h.textContent=`${tour} top five \u2014 ${histLabel({week:wk.name, season:wk.season})}`;
    mount.appendChild(h);
    mount.appendChild(tableOf([
      {k:"rank",h:"#",cls:"num"},
      {k:"player",h:"Player",render:r=>nameLinks(r.player,tour), csv:r=>r.player},
      {k:"country",h:"",cls:"ctry"},
      {k:"points",h:"Points",cls:"num"}], top.map(r=>({
        rank:r.rank, player:r.name, country:r.country, points:r.points}))));
  });

  /* the most recent tournaments with results */
  const recent=titles.slice().sort((a,b)=>
    whenOf(b.event,b.season).localeCompare(whenOf(a.event,a.season))).slice(0,8);
  if(recent.length){
    const h=document.createElement("h3"); h.className="sec"; h.textContent="Latest champions";
    mount.appendChild(h);
    mount.appendChild(tableOf([
      {k:"event",h:"Tournament",render:r=>{
        const b=document.createElement("button"); b.className="linkish"; b.textContent=r.event;
        b.addEventListener("click",()=>showEvent(r.event,r.season)); return b;}, csv:r=>r.event},
      {k:"season",h:"Season",cls:"mono"},
      {k:"sWinner",h:"Singles",render:r=>r.sWinner?nameLinks(r.sWinner,"Singles"):"\u2014", csv:r=>r.sWinner},
      {k:"dWinner",h:"Doubles",render:r=>r.dWinner?nameLinks(r.dWinner,"Doubles"):"\u2014", csv:r=>r.dWinner}
    ], recent));
  }
  const note=detailNote(seasons);
  if(note) mount.appendChild(note);
}

/* ==================================================================
   RECORDS
   The arguments people actually have in the threads.
   ================================================================== */
function renderRecords(){
  if(!viewOn("v-records")) return;
  const mount=$("recordsMount"); if(!mount) return;
  mount.innerHTML="";
  if(!MATCHES.length){
    mount.innerHTML=`<div class="empty"><strong>No matches loaded</strong></div>`;
    return;
  }
  const lede=document.createElement("p"); lede.className="lede";
  lede.textContent="Every season loaded, singles unless stated.";
  mount.appendChild(lede);

  const section=(title, cols, rows, hint)=>{
    if(!rows.length) return;
    const h=document.createElement("h3"); h.className="sec"; h.textContent=title;
    mount.appendChild(h);
    if(hint){ const p=document.createElement("p"); p.className="lede"; p.textContent=hint;
      mount.appendChild(p); }
    mount.appendChild(tableOf(cols, rows));
  };
  const pl = (k,label) => ({k, h:label, render:r=>nameLinks(r[k], r.disc||"Singles"), csv:r=>r[k]});

  /* longest winning run, in tournament order */
  const runs=[];
  ["Singles","Doubles"].forEach(disc=>{
    const run=new Map(), from=new Map(), best=new Map();
    inOrder(MATCHES.filter(m=>m.disc===disc && !m.isBye)).forEach(m=>{
      const w=idOf(m.winner,disc), l=idOf(m.loser,disc);
      if(!run.has(w)){ run.set(w,0); }
      if(run.get(w)===0) from.set(w, m);
      run.set(w, run.get(w)+1);
      const cur=run.get(w);
      const b=best.get(w);
      if(!b || cur>b.n) best.set(w, {n:cur, name:sideOf(m,"winner"), disc,
        from:from.get(w), to:m});
      run.set(l,0);
    });
    [...best.values()].forEach(b=>runs.push(b));
  });
  section("Longest winning runs",
    [pl("name","Player"), {k:"disc",h:"Discipline"}, {k:"n",h:"Wins",cls:"num",desc:true},
     {k:"span",h:"From \u2014 to"}],
    runs.sort((a,b)=>b.n-a.n).slice(0,15).map(b=>({
      name:b.name, disc:b.disc, n:b.n,
      span:`${b.from.event} ${b.from.season} \u2014 ${b.to.event} ${b.to.season}`})));

  /* most titles in one season */
  const bySeason=new Map();
  MATCHES.forEach(m=>{
    if(m.stage!=="Main" || m.round!=="F" || m.isBye) return;
    const k=idOf(m.winner,m.disc)+"|"+m.season+"|"+m.disc;
    if(!bySeason.has(k)) bySeason.set(k,{name:sideOf(m,"winner"), season:m.season,
      disc:m.disc, n:0, events:[]});
    const e=bySeason.get(k); e.n++; e.events.push(m.event);
  });
  section("Most titles in a season",
    [pl("name","Player"), {k:"disc",h:"Discipline"}, {k:"season",h:"Season",cls:"mono"},
     {k:"n",h:"Titles",cls:"num",desc:true}, {k:"list",h:"Including"}],
    [...bySeason.values()].sort((a,b)=>b.n-a.n).slice(0,15).map(e=>({
      ...e, list:e.events.slice(0,4).join(", ")+(e.events.length>4?"\u2026":"")})));

  /* career totals */
  const players=derivePlayers();
  section("Most titles, all time",
    [pl("player","Player"), {k:"titles",h:"Titles",cls:"num",desc:true},
     {k:"w",h:"W",cls:"num"}, {k:"l",h:"L",cls:"num"}, {k:"pctStr",h:"Win rate",cls:"num"}],
    players.slice().sort((a,b)=>b.titles-a.titles).slice(0,15)
      .map(p=>({...p, pctStr:Math.round(p.pct*100)+"%"})));
  section("Best win rate",
    [pl("player","Player"), {k:"pctStr",h:"Win rate",cls:"num",desc:true},
     {k:"w",h:"W",cls:"num"}, {k:"l",h:"L",cls:"num"}, {k:"titles",h:"Titles",cls:"num"}],
    players.filter(p=>p.w+p.l>=100).sort((a,b)=>b.pct-a.pct).slice(0,15)
      .map(p=>({...p, pctStr:Math.round(p.pct*100)+"%"})),
    "Minimum one hundred matches.");

  /* ranking records, if any weeks are loaded */
  ["Singles","Doubles"].forEach(tour=>{
    /* Counted straight from the loaded weeks so this doesn't depend on the
       rankings tab having been opened. */
    const ws=tourWeeks(tour);
    if(ws.length<2) return;
    const tally=new Map();
    ws.forEach(w=>{
      const top=(w.list||[]).find(r=>r.rank===1);
      if(!top) return;
      const k=keyOf(top.name);
      if(!tally.has(k)) tally.set(k,{player:canonName(top.name), weeks:0});
      tally.get(k).weeks++;
    });
    section(`Most weeks at no. 1 \u2014 ${tour.toLowerCase()}`,
      [{k:"player",h:"Player",render:r=>nameLinks(r.player,tour), csv:r=>r.player},
       {k:"weeks",h:"Weeks",cls:"num",desc:true}],
      [...tally.values()].sort((a,b)=>b.weeks-a.weeks).slice(0,10));
  });

  const note=detailNote(MATCHES.map(m=>m.season));
  if(note) mount.appendChild(note);
}

/* ==================================================================
   MANAGER PAGE
   ================================================================== */
const MANAGER_UI={name:null};
function showManager(name){
  MANAGER_UI.name=name;
  setHash(`manager/${enc(name)}`);
  renderManagerPage();
  openView("manager");
}

function renderManagerPage(){
  if(!viewOn("v-manager")) return;
  const mount=$("managerMount"); if(!mount) return;
  mount.innerHTML="";
  const name=MANAGER_UI.name;
  if(!name){
    mount.innerHTML=`<div class="empty"><strong>No manager chosen</strong>
      Click a name on the Managers tab.</div>`;
    return;
  }
  const runs=CALENDAR.filter(c=>c.manager===name)
    .sort((a,b)=>(b.date||"").localeCompare(a.date||""));
  const h=document.createElement("h3"); h.className="sec"; h.style.margin="0 0 10px";
  h.textContent=name;
  mount.appendChild(h);
  if(!runs.length){
    mount.innerHTML+=`<div class="empty"><strong>No tournaments</strong></div>`;
    return;
  }

  const seasons=[...new Set(runs.map(c=>c.season))].sort();
  const tracked=runs.filter(c=>eventMatchCount(c.event,c.season)).length;
  const grid=document.createElement("div"); grid.className="statgrid";
  [["Tournaments", String(runs.length), `${tracked} with results`],
   ["Seasons", String(seasons.length), `${seasons[0]}\u2013${seasons[seasons.length-1]}`],
   ["Per season", String(Math.round(runs.length/seasons.length*10)/10), ""],
   ["Challengers", String(runs.filter(c=>c.challenger).length), ""],
   ["128 draws", String(runs.filter(c=>(c.draw||[])[0]>=128).length), ""]
  ].forEach(([k,v,note])=>{
    const c=document.createElement("div"); c.className="stat";
    c.innerHTML=`<span class="k">${esc(k)}</span><span class="v">${esc(v)}</span>
      <span class="note">${esc(note)}</span>`;
    grid.appendChild(c);
  });
  mount.appendChild(grid);

  /* by season, so a long steady run reads differently from one heavy year */
  const perSeason=seasons.slice().reverse().map(s=>({
    season:s, events:runs.filter(c=>c.season===s).length,
    challengers:runs.filter(c=>c.season===s && c.challenger).length}));
  const sh=document.createElement("h3"); sh.className="sec"; sh.textContent="By season";
  mount.appendChild(sh);
  mount.appendChild(tableOf([{k:"season",h:"Season",cls:"mono"},
    {k:"events",h:"Tournaments",cls:"num"},{k:"challengers",h:"Challengers",cls:"num"}], perSeason));

  const bySurf=new Map();
  runs.forEach(c=>{
    const s=c.surface||"?";
    bySurf.set(s,(bySurf.get(s)||0)+1);
  });
  const sfh=document.createElement("h3"); sfh.className="sec"; sfh.textContent="By surface";
  mount.appendChild(sfh);
  mount.appendChild(tableOf([{k:"surface",h:"Surface"},{k:"n",h:"Tournaments",cls:"num"}],
    [...bySurf.entries()].sort((a,b)=>b[1]-a[1])
      .map(([s,n])=>({surface:SURFACE_NAME[s]||s||"not recorded", n}))));

  const th=document.createElement("h3"); th.className="sec";
  th.textContent=`Tournaments \u2014 ${runs.length}`;
  mount.appendChild(th);
  mount.appendChild(tableOf([
    {k:"name",h:"Tournament",render:r=>{
      const b=document.createElement("button"); b.className="linkish"; b.textContent=r.name;
      b.addEventListener("click",()=>showEvent(r.event,r.season)); return b;}, csv:r=>r.name},
    {k:"season",h:"Season",cls:"mono"},{k:"date",h:"Week",cls:"mono"},
    {k:"country",h:"",cls:"ctry"},
    {k:"surfaceName",h:"Surface"},
    {k:"drawStr",h:"Draw",cls:"mono"}],
    runs.map(c=>({name:c.name, event:c.event, season:c.season, date:c.date,
      country:c.country, surfaceName:SURFACE_NAME[c.surface]||"",
      drawStr:(c.draw||[]).join("/")}))));
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
            m.winnerCountry,m.loserCountry,m.winnerSeed,m.loserSeed).includes(q)))
    .map(m=>({...m,
      when: whenOf(m.event, m.season) + "|" + m.event +
            "|" + String(99-roundRank(m.round)).padStart(2,"0")}));
}
function playerRows(){
  const q=val("pQ").trim().toLowerCase(), c=val("pCtry"), s=val("pSurf");
  return derivePlayers(s).filter(p=>(!c||p.country===c)&&(!q||hay(p.player,p.country).includes(q)));
}
function teamRows(){
  const q=val("tQ").trim().toLowerCase(), s=val("tSurf");
  return deriveTeams(s).filter(t=>!q||t.team.toLowerCase().includes(q));
}
/* Both tables read best in playing order rather than alphabetically, so each
   row carries the tournament's calendar date. Rounds sort within a tournament
   so a final sits above the semi-final it came from. */
const roundRank = r => {
  const i = ROUND_ORDER.indexOf(r);
  return i<0 ? 50 : i;
};
function whenOf(event, season){
  const c=calFor(event, season);
  if(c && c.date) return c.date;
  return (season||"0000")+"-99-99";
}

function titleRows(){
  const q=val("ttQ").trim().toLowerCase();
  return deriveTitles().map(t=>({...t, when:whenOf(t.event,t.season)}))
    .filter(t=>!q||hay(t.event,t.season,t.sWinner,t.sFinalist,t.sSF1,t.sSF2,
      t.dWinner,t.dFinalist,t.dSF1,t.dSF2).includes(q));
}

/* ==================================================================
   TABLE INSTANCES
   ================================================================== */
const tMatches = makeTable({head:"mHead",body:"mBody",empty:"mEmpty",
  cols:()=>MATCH_COLS, rows:matchRows, defaultSort:"when", defaultDir:-1, rowClass:r=>r.tied?"tied":"",
  extraHead:true, extraCell:r=>{
    const b=document.createElement("button"); b.className="flip"; b.textContent="\u21C5";
    b.title="Swap winner and loser";
    b.setAttribute("aria-label",`Swap winner and loser for ${canonName(r.winner)} against ${canonName(r.loser)}`);
    b.addEventListener("click",()=>{ swapRow(r); markDirty(); refreshAll(); });
    const x=document.createElement("button"); x.className="flip"; x.textContent="\u00d7";
    x.title="Remove this match";
    x.setAttribute("aria-label",`Remove ${canonName(r.winner)} against ${canonName(r.loser)}`);
    x.addEventListener("click",()=>{
      snapshot("match removal"); removeMatches([r]); markDirty(); refreshAll(); });
    const wrap=document.createElement("span");
    wrap.appendChild(b); wrap.appendChild(x);
    return wrap; }});
const tPlayers = makeTable({head:"pHead",body:"pBody",empty:"pEmpty",
  cols:()=>PLAYER_COLS, rows:playerRows, defaultSort:"w", defaultDir:-1});
const tTeams   = makeTable({head:"tHead",body:"tBody",empty:"tEmpty",
  cols:()=>TEAM_COLS, rows:teamRows, defaultSort:"w", defaultDir:-1});
const tTitles  = makeTable({head:"ttHead",body:"ttBody",empty:"ttEmpty",
  cols:()=>TITLE_COLS, rows:titleRows, defaultSort:"when", defaultDir:-1});

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
/* Nothing is written until you've seen what was read. A paste that half-works
   is worse than one that fails outright, because the wrong rows go in quietly \u2014
   which is exactly how a doubles draw once ended up filed as singles. */
let PREVIEW = null;

on("btnDraw", "click", ()=>{
  const msg=$("drawMsg"); msg.className="msg";
  const text=val("drawIn");
  if(!text.trim()){ msg.className="msg err"; msg.textContent="Nothing to add \u2014 the draw box is empty."; return; }
  const event=val("tourn").trim();
  if(!event){ msg.className="msg err"; msg.textContent="Give the event a name first \u2014 without one these matches can't be grouped or filtered."; return; }

  PENDING_EVENT = event;
  const stage=val("stage");
  const res=parseDraw(text, stage==="Auto" ? "" : stage,
                      val("drawDisc")==="Auto" ? "" : val("drawDisc"));

  if(res.groupCount===0){
    msg.className="msg err";
    msg.textContent = res.unknownRounds.length
      ? `Round "${res.unknownRounds[0]}" isn't one this stage uses. Main draw expects F, SF, QF, R16\u2026R256; qualifying expects QR1\u2013QR3 and QFR. Is the Stage set correctly?`
      : "No matches found. Lines should read like: 12:11 | Player (GBR) vs. Other (USA) #SRs: 5-7";
    return;
  }

  PREVIEW = {res, event, season:val("season").trim(), week:val("rankWeek"),
             keepByes:$("optByes").checked};
  renderPreview();
  msg.textContent="";
});

/* A full round of the last sixty-four holds thirty-two matches, and so on down.
   Comparing against that turns "30 matches" into "30 of 32", which is the
   difference between a number and a warning. */
function expectedMatches(round){
  const r=String(round).toUpperCase();
  if(r==="F")  return 1;
  if(r==="SF") return 2;
  if(r==="QF") return 4;
  const m=r.match(/^R(\d+)$/);
  return m ? (+m[1])/2 : null;      // qualifying draws vary, so no expectation
}

function renderPreview(){
  if(!viewOn("v-add")) return;
  const box=$("previewBox"); if(!box) return;
  box.innerHTML="";
  if(!PREVIEW){ box.style.display="none"; return; }
  box.style.display="";
  const {res, event, season, week, keepByes}=PREVIEW;

  const counts=new Map();
  let byes=0, dup=0;
  const provisional=new Set();
  res.rows.forEach(r=>{
    if(r.isBye && !keepByes){ byes++; return; }
    const k=`${r.disc} ${r.stage.toLowerCase()}`;
    if(!counts.has(k)) counts.set(k,new Map());
    const c=counts.get(k);
    c.set(r.round,(c.get(r.round)||0)+1);
    r.event=event; r.season=season;
    if(SEEN.has(matchKey(r))) dup++;
    r.event=""; r.season="";
  });

  const sec=document.createElement("section");
  sec.className="review";
  sec.style.borderColor = res.inferred ? "var(--warn)" : "var(--ball)";
  sec.style.background  = res.inferred ? "rgba(242,169,59,.06)" : "rgba(221,240,75,.05)";
  sec.innerHTML=`<p class="blockhead" style="color:${res.inferred?"var(--warn)":"var(--ball)"}">
      Ready to add \u2014 check this first</p>
    <p class="lede" style="margin-bottom:10px">
      <b>${esc(event)}</b> ${esc(season||"(no season)")} \u00b7 ranks from ${esc(week||"none")}
      ${res.inferred?"<br><b>No usable round headings, so the rounds were worked out from the draw itself.</b> Check the round names below before adding.":""}
    </p>`;

  [...counts.entries()].sort().forEach(([group,rounds])=>{
    const order=["R512","R256","R128","R64","R32","R16","QF","SF","F","QR1","QR2","QR3","QFR"];
    const list=[...rounds.entries()].sort((a,b)=>order.indexOf(a[0])-order.indexOf(b[0]));
    const total=list.reduce((n,[,v])=>n+v,0);
    const row=document.createElement("div"); row.className="rq";
    row.innerHTML=`<span class="tag">${esc(group)}</span>
      <span class="ctx"><b>${total}</b> \u2014 ${list.map(([r,v])=>{
        const want=expectedMatches(r);
        const short = want!==null && v!==want;
        return short
          ? `<span style="color:var(--warn)">${esc(r)} \u00d7${v} of ${want}</span>`
          : `${esc(r)} \u00d7${v}`;
      }).join(", ")}</span>`;
    sec.appendChild(row);

    /* Counts alone don't say which matches are there, so each round opens up
       to the actual list. A round short of its full size is the usual reason
       to look. */
    list.forEach(([rnd,v])=>{
      const want=expectedMatches(rnd);
      const d=document.createElement("details");
      d.style.cssText="margin:2px 0 6px 0";
      if(want!==null && v!==want) d.open=true;
      const sum=document.createElement("summary");
      sum.style.cssText="cursor:pointer;font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--slate)";
      sum.textContent = want!==null && v!==want
        ? `${group} ${rnd} \u2014 ${v} read, ${want} expected in a full round`
        : `${group} ${rnd} \u2014 list the ${v} matches read`;
      d.appendChild(sum);
      const ul=document.createElement("div");
      ul.style.cssText="font-family:'IBM Plex Mono',monospace;font-size:11.5px;color:var(--slate);"
        +"padding:6px 0 2px 14px;line-height:1.7";
      res.rows.filter(r=>`${r.disc} ${r.stage.toLowerCase()}`===group && r.round===rnd
                         && (keepByes || !r.isBye))
        .forEach(r=>{
          const line=document.createElement("div");
          line.textContent=`${canonName(r.winner)}  def  ${canonName(r.loser)}   ${r.winnerScore}\u2013${r.loserScore}`;
          ul.appendChild(line);
        });
      d.appendChild(ul);
      sec.appendChild(d);
    });
  });

  if(res.pending.length){
    const d=document.createElement("details"); d.open=true; d.style.margin="2px 0 6px";
    const sum=document.createElement("summary");
    sum.style.cssText="cursor:pointer;font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--warn)";
    const nores=res.pending.filter(p=>noResult(p.match)).length;
    sum.textContent=`${res.pending.length} match${res.pending.length===1?"":"es"} with no winner yet \u2014 you'll be asked after adding`
      + (nores?` (${nores} with no result at all, which you can leave out in one go)`:"");
    d.appendChild(sum);
    const ul=document.createElement("div");
    ul.style.cssText="font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--slate);padding:6px 0 2px 14px;line-height:1.7";
    res.pending.forEach(p=>{ const l=document.createElement("div"); l.textContent=p.match.raw; ul.appendChild(l); });
    d.appendChild(ul); sec.appendChild(d);
  }

  if(res.bad.length){
    const d=document.createElement("details"); d.open=true; d.style.margin="2px 0 6px";
    const sum=document.createElement("summary");
    sum.style.cssText="cursor:pointer;font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--bad)";
    sum.textContent=`${res.bad.length} line${res.bad.length===1?"":"s"} couldn't be read \u2014 these are the ones missing`;
    d.appendChild(sum);
    const ul=document.createElement("div");
    ul.style.cssText="font-family:'IBM Plex Mono',monospace;font-size:11px;color:#F5B8B2;padding:6px 0 2px 14px;line-height:1.7";
    res.bad.forEach(b=>{ const l=document.createElement("div"); l.textContent=b; ul.appendChild(l); });
    d.appendChild(ul); sec.appendChild(d);
  }

  const notes=[];
  if(byes) notes.push(`${byes} bye${byes===1?"":"s"} will be skipped`);
  if(dup)  notes.push(`${dup} already in the table and will be held back`);
  if(res.pending.length) notes.push(`${res.pending.length} need a winner and will be listed below`);
  if(res.bad.length)     notes.push(`${res.bad.length} line${res.bad.length===1?"":"s"} didn't parse`);
  if(res.unknownRounds.length) notes.push(`${[...new Set(res.unknownRounds)].join("; ")}`);
  res.chain.forEach(c=>notes.push(
    `${c.disc} ${c.round}: ${c.strangers} of ${c.total} players didn't play the round before \u2014 check the rounds line up`));
  if(!season) notes.push("no season set \u2014 events repeat year on year, so this is worth filling in");
  if(CALENDAR.length && !CALENDAR.some(c=>c.event===event))
    notes.push(`"${event}" isn't in the calendar \u2014 check the spelling, or add the tournament first`);
  if(notes.length){
    const p=document.createElement("p"); p.className="hint";
    p.style.color="var(--warn)"; p.textContent=notes.join(" \u00b7 ");
    sec.appendChild(p);
  }

  const bar=document.createElement("div"); bar.className="btnrow";
  const go=document.createElement("button"); go.className="btn primary";
  go.textContent=`Add ${res.rows.length-byes} matches`;
  go.addEventListener("click", commitPreview);
  const no=document.createElement("button"); no.className="btn"; no.textContent="Cancel";
  no.addEventListener("click",()=>{ PREVIEW=null; renderPreview(); });
  bar.appendChild(go); bar.appendChild(no);
  sec.appendChild(bar);
  box.appendChild(sec);
}

function commitPreview(){
  if(!PREVIEW) return;
  const {res, event, season, week, keepByes}=PREVIEW;
  const msg=$("drawMsg");
  snapshot(`draw for ${event}`);

  const wk = tourWeeks("Singles").find(w=>w.name===week && (w.season||"")===season);
  let added=0, dup=0, byes=0, ranked=0;
  const breakdown={};

  for(const r of res.rows){
    if(r.isBye && !keepByes){ byes++; continue; }
    r.event=event; r.season=season; r.week=week;
    const bk=`${r.disc} ${r.stage.toLowerCase()}`;
    breakdown[bk]=(breakdown[bk]||0)+1;
    if(wk) ranked+=applyRanks(r,wk);
    const k=matchKey(r);
    if(SEEN.has(k)){ dup++; DUPES.push(r); continue; }
    SEEN.add(k); MATCHES.push(r); MATCH_DIRTY.add(season||"unknown"); MATCH_SEASONS.add(season||"unknown"); added++;
  }
  res.pending.forEach(p=>{ p.event=event; p.season=season; p.week=week; });
  PENDING=PENDING.concat(res.pending);

  const parts=Object.entries(breakdown).sort().map(([k,v])=>`${v} ${k}`);
  const bits=[`Added ${added} ${added===1?"match":"matches"}`
    + (parts.length>1 ? ` \u2014 ${parts.join(", ")}.` : ".")];
  if(ranked) bits.push(`${ranked} rank ${ranked===1?"value":"values"} filled from ${week}.`);
  if(byes)   bits.push(`${byes} ${byes===1?"bye":"byes"} skipped.`);
  if(dup)    bits.push(`${dup} already in the table \u2014 skipped, listed under Issues.`);
  if(res.pending.length) bits.push(`${res.pending.length} need${res.pending.length===1?"s":""} a winner \u2014 see below.`);
  if(res.bad.length) bits.push(`${res.bad.length} line${res.bad.length===1?"":"s"} didn't match the expected format.`);
  msg.className = (dup||res.pending.length||res.bad.length) ? "msg warn" : "msg";
  msg.textContent = bits.join(" ");

  PREVIEW=null;
  setVal("drawIn","");
  markDirty(); refreshAll();
}

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

  snapshot("ranking paste");
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
  if(!viewOn("v-add")) return;
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
      ${p.noResult?'<span class="tag">no result</span>':""}
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
    const skip=document.createElement("button"); skip.className="btn sm";
    skip.textContent = p.noResult ? "Neither \u2014 leave it out" : "Leave it out";
    skip.title="Not a real result; don't record it at all";
    skip.addEventListener("click",()=>{
      PENDING.splice(PENDING.indexOf(p),1); markDirty(); refreshAll(); });
    q.appendChild(skip);
    el.appendChild(q);
  });
  if(PENDING.some(p=>p.noResult)){
    const all=document.createElement("div"); all.className="btnrow";
    const b=document.createElement("button"); b.className="btn sm";
    const n=PENDING.filter(p=>p.noResult).length;
    b.textContent=`Leave out all ${n} with no result`;
    b.addEventListener("click",()=>{
      PENDING=PENDING.filter(p=>!p.noResult); markDirty(); refreshAll(); });
    all.appendChild(b); el.appendChild(all);
  }
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
  if(!viewOn("v-issues")) return;
  const box=$("issuesBody"); if(!box) return;
  const {countryConflicts,nameVariants,resolved,tourGaps,eventProblems,
         dateProblems,renames,unknowns,dupes,pending}=deriveIssues();
  box.innerHTML="";
  renderMergePanel(box);
  const total=countryConflicts.length+nameVariants.length+tourGaps.length+eventProblems.length
    +dateProblems.length+renames.length+unknowns.length+dupes.length+pending.length;

  if(!total){
    const ok=document.createElement("div"); ok.className="ok";
    ok.innerHTML=`<b>All clean</b>No conflicting countries, no duplicate spellings,
      no repeated matches, no half-entered weeks, nothing waiting on a verdict.`;
    box.appendChild(ok);
    renderResolved(box, resolved);
    return;
  }

  if(eventProblems.length){
    const s=document.createElement("section"); s.className="review";
    s.innerHTML=`<p class="blockhead">Events needing attention \u2014 ${eventProblems.length}</p>
      <p class="lede" style="margin-bottom:6px">Fix these on the Add data tab: remove the group and paste it again
      with the right season and ranking week.</p>`;
    eventProblems.forEach(pb=>{
      const q=document.createElement("div"); q.className="rq";
      q.innerHTML=`<span class="tag">${esc(pb.kind)}</span><span class="ctx">${esc(pb.text)}</span>`;
      s.appendChild(q);
    });
    box.appendChild(s);
  }

  if(dateProblems.length){
    const s=document.createElement("section"); s.className="review";
    s.innerHTML=`<p class="blockhead">Week dates that look wrong \u2014 ${dateProblems.length}</p>
      <p class="lede" style="margin-bottom:6px">Ranking posts land on a Monday, so anything else is usually
      a slipped day. Applying a fix renames the week and moves any matches tagged with it.</p>`;
    dateProblems.slice(0,80).forEach(dp=>{
      const q=document.createElement("div"); q.className="rq";
      q.innerHTML=`<span class="tag">${esc(dp.kind)}</span><span class="ctx">${esc(dp.text)}</span>`;
      if(dp.suggest){
        const b=document.createElement("button"); b.className="btn sm";
        b.textContent=`Rename to ${dp.suggest}`;
        b.addEventListener("click",()=>{
          try{ snapshot("week rename"); renameWeek(dp.w, dp.suggest); markDirty(); refreshAll(); }
          catch(err){ alert(err.message); }
        });
        q.appendChild(b);
      }
      q.appendChild(otherButton(dp.w));
      const skip=document.createElement("button"); skip.className="btn sm";
      skip.textContent="It's right"; skip.title="Leave this week alone and stop flagging it";
      skip.addEventListener("click",()=>{ snapshot("week accepted");
        DATE_OK.add(weekTag(dp.w)); markDirty(); refreshAll(); });
      q.appendChild(skip);
      s.appendChild(q);
    });
    if(dateProblems.length>80){
      const m=document.createElement("p"); m.className="hint";
      m.textContent=`\u2026and ${dateProblems.length-80} more.`; s.appendChild(m);
    }
    box.appendChild(s);
  }

  if(unknowns.length){
    const s=document.createElement("section"); s.className="review";
    s.innerHTML=`<p class="blockhead">Names that never appear in a ranking \u2014 ${unknowns.length}</p>
      <p class="lede" style="margin-bottom:6px">Everyone in a draw is ranked at some point, so these are
      almost certainly misspellings. The nearest ranked spellings are offered, ones from the same event
      first. Merging rewrites every match they appear in.</p>`;
    unknowns.forEach(u=>{
      const q=document.createElement("div"); q.className="rq";
      q.innerHTML=`<span class="tag">${u.matches} match${u.matches===1?"":"es"}</span>
        <span class="ctx"><b>${esc(u.name)}</b>
        <span class="dim">${esc(u.events.slice(0,2).join(", "))}${u.events.length>2?"\u2026":""}</span></span>`;
      u.suggestions.forEach(c=>{
        const b=document.createElement("button"); b.className="btn sm";
        b.textContent=c.name;
        b.title=`Merge into ${c.name}`;
        b.addEventListener("click",()=>{
          try{ snapshot("player merge"); mergePlayers(u.name, c.name); markDirty(); refreshAll(); }
          catch(err){ alert(err.message); }
        });
        q.appendChild(b);
      });
      const other=document.createElement("button"); other.className="btn sm"; other.textContent="Other\u2026";
      other.addEventListener("click",()=>{
        const v=prompt(`Who is "${u.name}" really?\nType the correct username as it appears in the rankings.`, "");
        if(v===null) return;
        const nm=v.trim(); if(!nm) return;
        try{ snapshot("player merge"); mergePlayers(u.name, nm); markDirty(); refreshAll(); }
        catch(err){ alert(err.message); }
      });
      q.appendChild(other);
      const fine=document.createElement("button"); fine.className="btn sm"; fine.textContent="Spelling is right";
      fine.title="Genuinely never ranked \u2014 stop flagging this name";
      fine.addEventListener("click",()=>{
        snapshot("name accepted"); UNKNOWN_OK.add(u.key); markDirty(); refreshAll(); });
      q.appendChild(fine);
      s.appendChild(q);
    });
    box.appendChild(s);
  }

  if(renames.length){
    const s=document.createElement("section"); s.className="review";
    s.innerHTML=`<p class="blockhead">Possible name changes \u2014 ${renames.length}</p>
      <p class="lede" style="margin-bottom:6px">One player dropped out of the list for good in the same week
      another appeared already carrying a tournament count. Points and tournaments played carry across a
      rename; the name doesn't.</p>`;
    renames.forEach(rn=>{
      const q=document.createElement("div"); q.className="rq";
      q.innerHTML=`<span class="tag">${esc(rn.tour)} ${esc(rn.season||"")}</span>
        <span class="ctx"><b>${esc(rn.from)}</b> (${rn.fromEvents} trn, ${rn.fromPoints} pts) last seen before
        <b>${esc(rn.to)}</b> (${rn.toEvents} trn, ${rn.toPoints} pts) appeared at ${esc(rn.week)}</span>`;
      const yes=document.createElement("button"); yes.className="btn sm";
      yes.textContent=`Merge into ${rn.to}`;
      yes.addEventListener("click",()=>{
        try{ snapshot("player merge"); mergePlayers(rn.from, rn.to); markDirty(); refreshAll(); }
        catch(err){ alert(err.message); }
      });
      q.appendChild(yes);
      const no=document.createElement("button"); no.className="btn sm";
      no.textContent="Not the same";
      no.title="Different people \u2014 stop suggesting this pair";
      no.addEventListener("click",()=>{
        snapshot("rename dismissal");
        RENAME_NO.add(renameKey(rn)); markDirty(); refreshAll(); });
      q.appendChild(no);
      s.appendChild(q);
    });
    box.appendChild(s);
  }

  if(tourGaps.length){
    const s=document.createElement("section"); s.className="review";
    s.innerHTML=`<p class="blockhead">Weeks with only one tour \u2014 ${tourGaps.length}</p>
      <p class="lede" style="margin-bottom:6px">These weeks exist on one tour but not the other,
      matched on the week name. Usually a post that didn't get pasted.</p>`;
    tourGaps.slice(0,60).forEach(g=>{
      const q=document.createElement("div"); q.className="rq";
      q.innerHTML=`<span class="tag">${esc(g.season||"no year")}</span>
        <span class="ctx">${esc(g.week)} \u2014 has ${esc(g.has.toLowerCase())},
        <b>no ${esc(g.missing.toLowerCase())}</b></span>`;
      const ok=document.createElement("button"); ok.className="btn sm";
      ok.textContent="There isn't one";
      ok.title="That list was never posted \u2014 stop flagging this week";
      ok.addEventListener("click",()=>{
        snapshot("week gap accepted"); GAP_OK.add(gapTag(g)); markDirty(); refreshAll(); });
      q.appendChild(ok);
      s.appendChild(q);
    });
    if(tourGaps.length>60){
      const more=document.createElement("p"); more.className="hint";
      more.textContent=`\u2026and ${tourGaps.length-60} more.`;
      s.appendChild(more);
    }
    box.appendChild(s);
  }

  if(countryConflicts.length){
    const s=document.createElement("section"); s.className="review";
    s.innerHTML=`<p class="blockhead">Conflicting countries \u2014 ${countryConflicts.length}</p>
      <p class="lede" style="margin-bottom:6px">If one code is a typo, <b>use</b> the right one.
      If the player genuinely holds more than one \u2014 they moved, or a code like XXX is meaningful \u2014
      <b>accept</b> each that's correct. Accepting them all settles it, and a new code appearing later
      still comes back here.</p>`;
    countryConflicts.forEach(({e,options,accepted})=>{
      const q=document.createElement("div"); q.className="rq";
      q.innerHTML=`<span class="tag">country</span>
        <span class="ctx">${esc(e.name)} \u2014 ${options.map(o=>`${esc(o.c)} \u00d7${o.n}`).join(", ")}
        ${accepted.size?`<br><span style="color:var(--ball)">accepted: ${[...accepted].map(esc).join(", ")}</span>`:""}</span>`;

      const useWrap=document.createElement("span");
      useWrap.innerHTML=`<span class="dim" style="font-size:11px;margin-right:6px">use only</span>`;
      options.forEach(o=>{
        const b=document.createElement("button"); b.className="btn sm"; b.textContent=o.c;
        if(e.country===o.c && !accepted.size){ b.style.borderColor="var(--ball)"; b.style.color="var(--ball)"; }
        b.addEventListener("click",()=>{ snapshot("country choice"); pin(e.key,"country",o.c);
          COUNTRY_OK.delete(e.key); markDirty(); refreshAll(); });
        useWrap.appendChild(b);
      });
      q.appendChild(useWrap);

      const okWrap=document.createElement("span");
      okWrap.innerHTML=`<span class="dim" style="font-size:11px;margin:0 6px 0 12px">accept</span>`;
      options.forEach(o=>{
        const b=document.createElement("button"); b.className="btn sm";
        const on=accepted.has(o.c);
        b.textContent=(on?"\u2713 ":"")+o.c;
        if(on){ b.style.borderColor="var(--ball)"; b.style.color="var(--ball)"; }
        b.addEventListener("click",()=>{
          snapshot("country acceptance");
          on ? unacceptCountry(e.key,o.c) : acceptCountry(e.key,o.c);
          markDirty(); refreshAll(); });
        okWrap.appendChild(b);
      });
      const all=document.createElement("button"); all.className="btn sm"; all.textContent="all";
      all.title="Accept every code shown as genuine";
      all.addEventListener("click",()=>{ snapshot("country acceptance");
        options.forEach(o=>acceptCountry(e.key,o.c)); markDirty(); refreshAll(); });
      okWrap.appendChild(all);
      q.appendChild(okWrap);

      if(options.length>1){
        const fixWrap=document.createElement("span");
        fixWrap.style.cssText="display:block;width:100%;margin-top:6px";
        fixWrap.innerHTML=`<span class="dim" style="font-size:11px;margin-right:6px">or correct</span>`;
        const from=selectOf(options.map(o=>[o.c,o.c]), options[options.length-1].c, ()=>{});
        const to  =selectOf(options.map(o=>[o.c,o.c]), options[0].c, ()=>{});
        [from,to].forEach(sel=>{ sel.style.cssText="width:auto;display:inline-block;margin:0 4px;padding:4px 6px;font-size:12px"; });
        const arrow=document.createElement("span"); arrow.className="dim";
        arrow.style.fontSize="12px"; arrow.textContent="should be";
        const go=document.createElement("button"); go.className="btn sm"; go.textContent="Correct";
        go.title="Rewrite this player's country wherever the wrong code appears";
        go.addEventListener("click",()=>{
          if(from.value===to.value) return;
          if(!confirm(`Change ${e.name}'s country from ${from.value} to ${to.value} everywhere it appears?\n\n`
            + `This edits the stored data rather than recording an exception, so save afterwards.`)) return;
          snapshot("country correction");
          const hits=replaceCountry(e.key, from.value, to.value);
          markDirty(); refreshAll();
          saveMsg(`Changed ${hits} occurrence${hits===1?"":"s"} of ${from.value} to ${to.value} for ${e.name}.`);
        });
        fixWrap.appendChild(from); fixWrap.appendChild(arrow); fixWrap.appendChild(to);
        fixWrap.appendChild(go);
        q.appendChild(fixWrap);
      }
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
  renderResolved(box, resolved);
}

/* Settled conflicts, kept out of the way but reversible. */
function renderResolved(box, resolved){
  const extras = RENAME_NO.size + DATE_OK.size + UNKNOWN_OK.size + GAP_OK.size;
  if(!resolved.length && !extras) return;
  const d=document.createElement("details");
  d.className="panel"; d.style.marginTop="20px";
  /* Hundreds of settled decisions shouldn't stand between you and the ones that
     still need doing, so the list only builds itself when it's opened. */
  let built=false;
  d.addEventListener("toggle",()=>{
    if(!d.open || built) return;
    built=true;
    buildResolvedList(d, resolved);
  });
  const sum=document.createElement("summary");
  sum.style.cssText="cursor:pointer;font-family:'IBM Plex Mono',monospace;font-size:10.5px;"
    +"letter-spacing:.16em;text-transform:uppercase;color:var(--slate)";
  sum.textContent=`Settled earlier \u2014 ${resolved.length+extras}`;
  d.appendChild(sum);
  box.appendChild(d);
}

function buildResolvedList(d, resolved){
  const p=document.createElement("p"); p.className="lede"; p.style.margin="12px 0 4px";
  p.textContent="Choices you've already made. They stay out of the list above until you undo one.";
  d.appendChild(p);
  resolved.forEach(({e,field,options})=>{
    const q=document.createElement("div"); q.className="wkrow";
    const chosen = field==="country" ? e.country : e.name;
    const ok = field==="country" ? acceptedCountries(e.key) : new Set();
    q.innerHTML = ok.size
      ? `<span class="nm"><span class="tag">all genuine</span>
         <b style="margin-left:8px">${esc(e.name)}</b>
         <span class="dim">${[...ok].map(c=>{
             const w=firstWeekWithCountry(e.key,c);
             return `${esc(c)}${w?` from ${esc(weekLabel(w))}`:""}`;
           }).join(" \u00b7 ")} \u2014 showing ${esc(chosen)}</span></span>`
      : `<span class="nm"><span class="tag">${field}</span>
         <b style="margin-left:8px">${esc(chosen)}</b>
         <span class="dim">chosen over ${esc(options
           .map(o=>field==="country"?o.c:o.n).filter(v=>v!==chosen).join(", "))}</span></span>`;
    const u=document.createElement("button"); u.className="btn sm"; u.textContent="Undo";
    u.addEventListener("click",()=>{
      if(ok.size) COUNTRY_OK.delete(e.key), (REG.get(e.key)||{}).country=topOf((REG.get(e.key)||{}).countries||{});
      else unpin(e.key, field);
      markDirty(); refreshAll(); });
    q.appendChild(u); d.appendChild(q);
  });

  RENAME_NO.forEach(k=>{
    const [tour,from,to]=k.split("|");
    const q=document.createElement("div"); q.className="wkrow";
    q.innerHTML=`<span class="nm"><span class="tag">not a rename</span>
      <b style="margin-left:8px">${esc(canonName(from))} / ${esc(canonName(to))}</b>
      <span class="dim">${esc(tour)} \u2014 marked as different people</span></span>`;
    const u=document.createElement("button"); u.className="btn sm"; u.textContent="Undo";
    u.addEventListener("click",()=>{ RENAME_NO.delete(k); markDirty(); refreshAll(); });
    q.appendChild(u); d.appendChild(q);
  });

  UNKNOWN_OK.forEach(k=>{
    const q=document.createElement("div"); q.className="wkrow";
    q.innerHTML=`<span class="nm"><span class="tag">never ranked</span>
      <b style="margin-left:8px">${esc(canonName(k))}</b>
      <span class="dim">confirmed as spelt</span></span>`;
    const u=document.createElement("button"); u.className="btn sm"; u.textContent="Undo";
    u.addEventListener("click",()=>{ UNKNOWN_OK.delete(k); markDirty(); refreshAll(); });
    q.appendChild(u); d.appendChild(q);
  });

  GAP_OK.forEach(k=>{
    const [season,week,missing]=k.split("|");
    const q=document.createElement("div"); q.className="wkrow";
    q.innerHTML=`<span class="nm"><span class="tag">no ${esc((missing||"").toLowerCase())} list</span>
      <b style="margin-left:8px">${esc(week)} ${esc(season)}</b>
      <span class="dim">confirmed as never posted</span></span>`;
    const u=document.createElement("button"); u.className="btn sm"; u.textContent="Undo";
    u.addEventListener("click",()=>{ GAP_OK.delete(k); markDirty(); refreshAll(); });
    q.appendChild(u); d.appendChild(q);
  });

  DATE_OK.forEach(k=>{
    const [tour,season,name]=k.split("|");
    const q=document.createElement("div"); q.className="wkrow";
    q.innerHTML=`<span class="nm"><span class="tag">date kept</span>
      <b style="margin-left:8px">${esc(name)} ${esc(season)}</b>
      <span class="dim">${esc(tour)} \u2014 confirmed correct</span></span>`;
    const u=document.createElement("button"); u.className="btn sm"; u.textContent="Undo";
    u.addEventListener("click",()=>{ DATE_OK.delete(k); markDirty(); refreshAll(); });
    q.appendChild(u); d.appendChild(q);
  });
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

function syncCalendarEvents(){
  const dl=$("eventList"); if(!dl) return;
  const names=[...new Set(CALENDAR.map(c=>c.event).concat(MATCHES.map(m=>m.event)))]
    .filter(Boolean).sort();
  dl.innerHTML="";
  names.forEach(n=>{ const o=document.createElement("option"); o.value=n; dl.appendChild(o); });
}

function syncFilters(){
  fill("mDisc", uniq(MATCHES.map(m=>m.disc)).sort());
  fill("mStage", uniq(MATCHES.map(m=>m.stage)).sort());
  fill("mEvent", uniq(MATCHES.map(m=>m.event)).sort());
  fill("mRound", uniq(MATCHES.map(m=>m.round))
    .sort((a,b)=>ROUND_ORDER.indexOf(a)-ROUND_ORDER.indexOf(b)));
  syncCalendarEvents();
  fill("pCtry", uniq(derivePlayers().map(p=>p.country)).sort());
  ["pSurf","tSurf"].forEach(id=>{
    const el=$(id); if(!el || el.options.length>1) return;
    SURFACES.forEach(sf=>{ const o=document.createElement("option");
      o.value=sf; o.textContent=SURFACE_NAME[sf]||sf; el.appendChild(o); });
  });

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

function renderMatchManager(){
  if(!viewOn("v-add")) return;
  const el=$("matchManager"); if(!el) return;
  const groups=matchGroups();
  if(!groups.length){ el.textContent="No matches loaded."; return; }
  el.innerHTML="";
  const CAP=200;
  if(groups.length>CAP){
    const note=document.createElement("p"); note.className="hint";
    note.textContent=`${groups.length.toLocaleString()} groups of matches loaded \u2014 showing the `
      + `${CAP} most recent. Load a single season if you need to remove an older one.`;
    el.appendChild(note);
  }
  groups.slice(-CAP).forEach(g=>{
    const weeks=[...g.weeks].map(w=>w||"no week").join(", ");
    const row=document.createElement("div"); row.className="wkrow";
    row.innerHTML=`<span class="nm"><b>${esc(g.event||"unnamed")}</b>
      <span class="dim">${esc(g.season||"no season")} \u00b7 ${esc(g.disc)} ${esc(g.stage.toLowerCase())}
      \u00b7 ${g.rows.length} match${g.rows.length===1?"":"es"} \u00b7 ranks from ${esc(weeks)}</span>
      ${!g.season?'<span class="tag" style="margin-left:6px">no season</span>':""}
      ${g.weeks.size>1?'<span class="tag" style="margin-left:6px">mixed weeks</span>':""}</span>`;
    const del=document.createElement("button");
    del.className="btn sm"; del.textContent="Remove";
    del.addEventListener("click",()=>{
      if(!confirm(`Remove all ${g.rows.length} ${g.disc.toLowerCase()} ${g.stage.toLowerCase()} matches for ${g.event} ${g.season}?`)) return;
      snapshot(`removing ${g.event} ${g.disc} ${g.stage}`);
      removeMatches(g.rows); markDirty(); refreshAll();
    });
    row.appendChild(del); el.appendChild(row);
  });
}

function renderUndo(){
  const el=$("undoBar"); if(!el) return;
  el.innerHTML="";
  if(!UNDO){ el.style.display="none"; return; }
  el.style.display="";
  const b=document.createElement("button");
  b.className="btn sm"; b.textContent=`\u21B6 Undo the last ${UNDO.label}`;
  b.addEventListener("click",()=>{ const l=UNDO.label; if(undoLast()) saveMsg(`Undid the last ${l}.`,"warn"); });
  el.appendChild(b);
  const note=document.createElement("span");
  note.className="dim"; note.style.cssText="font-size:12px;margin-left:10px";
  note.textContent="Only the most recent change can be taken back.";
  el.appendChild(note);
}

function renderFileManager(){
  if(!viewOn("v-add")) return;
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
  loadedMatchSeasons().forEach(sea=>{
    const rows2=MATCHES.filter(m=>(m.season||"unknown")===sea).length;
    const row=document.createElement("div"); row.className="wkrow";
    row.innerHTML=`<span class="nm"><code>${esc(matchFile(sea))}</code>
      <span class="dim">${rows2.toLocaleString()} matches</span>
      ${MATCH_DIRTY.has(sea)||LEGACY_INLINE?'<span class="tag" style="margin-left:6px">changed</span>':""}</span>`;
    const b=document.createElement("button"); b.className="btn sm"; b.textContent="Download";
    b.addEventListener("click",()=>{ const n2=saveMatchSeason(sea);
      saveMsg(`Saved ${matchFile(sea)} (${(n2/1024).toFixed(0)} KB).`); renderFileManager(); });
    row.appendChild(b); el.appendChild(row);
  });
  unloadedMatchSeasons().forEach(sea=>{
    const row=document.createElement("div"); row.className="wkrow";
    row.innerHTML=`<span class="nm"><code>${esc(matchFile(sea))}</code>
      <span class="dim">listed in data.json, not open in this session</span>
      <span class="tag" style="margin-left:6px">not loaded</span></span>
      <span class="dim" style="font-size:12px">left untouched</span>`;
    el.appendChild(row);
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
  if(!viewOn("v-add")) return;
  const el=$("weekManager"); if(!el) return;
  if(!WEEKS.length){ el.textContent="None yet."; return; }
  el.innerHTML="";
  ["Singles","Doubles"].forEach(tour=>{
    const ws=tourWeeks(tour); if(!ws.length) return;
    const h=document.createElement("p"); h.className="blockhead"; h.style.margin="10px 0 4px";
    const CAPW=120;
    h.textContent=`${tour} \u2014 ${ws.length} week${ws.length===1?"":"s"}`
      + (ws.length>CAPW ? ` (newest ${CAPW} shown)` : "");
    el.appendChild(h);
    ws.slice().reverse().slice(0,CAPW).forEach(w=>{
      const row=document.createElement("div"); row.className="wkrow";
      const undated = !w.date;
      row.innerHTML=`<span class="nm">${esc(w.name)}
        <span class="dim">${esc(w.season||"no season")} \u00b7 ${(w.list||[]).length} players</span>
        ${undated?'<span class="tag" style="margin-left:6px">no date read</span>':""}</span>`;
      row.appendChild(otherButton(w));
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
/* Everything used to be redrawn on every change, including the panels behind
   whichever tab you're on. With a full archive that's a hundred and seventy
   thousand DOM nodes rebuilt for one edit, so a view now only draws when it's
   the one you're looking at. */
function viewOn(id){
  const v=$(id);
  return !!v && v.classList.contains("on");
}

function refreshAll(){
  syncFilters();
  tMatches.render(); tPlayers.render(); tTeams.render();
  tTitles.render(); renderRankings();
  renderCalendar(); renderEvent(); renderManagers(); renderH2H(); renderLuck(); renderProfile();
  renderOverview(); renderRecords(); renderManagerPage();
  renderPreview();
  renderReview(); renderIssues(); renderSummary(); renderWeekManager();
  renderFileManager(); renderMatchManager(); renderUndo();
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
  setHash(b.dataset.view);
  setTimeout(refreshAll, 0);
  [...$("nav").querySelectorAll("button")].forEach(x=>x.setAttribute("aria-selected", x===b));
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("on"));
  $("v-"+b.dataset.view).classList.add("on");
});

["mQ","mDisc","mStage","mEvent","mRound"].forEach(id=>{
  on(id,"input",()=>tMatches.render()); on(id,"change",()=>tMatches.render()); });
["pQ","pCtry","pSurf"].forEach(id=>{
  on(id,"input",()=>tPlayers.render()); on(id,"change",()=>tPlayers.render()); });
on("tQ","input",()=>tTeams.render());
on("tSurf","change",()=>tTeams.render());
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

/* One step of undo, taken immediately before anything is added. Match objects
   are cloned because rank backfilling writes into them; the week list only
   needs its array copied, since weeks are replaced rather than edited. */
let UNDO = null;
function snapshot(label){
  invalidateIssues();
  UNDO = {
    label,
    matches: MATCHES.map(m=>Object.assign({},m)),
    weeks:   WEEKS.slice(),
    pending: PENDING.slice(),
    dupes:   DUPES.slice(),
    seen:    new Set(SEEN),
    pins:    new Map([...PINS].map(([k,v])=>[k,Object.assign({},v)])),
    alias:   new Map(ALIAS),
    dirtySeasons: new Set(SEASON_DIRTY),
    known:   new Set(KNOWN_SEASONS),
    wasDirty: DIRTY
  };
}
function undoLast(){
  if(!UNDO) return false;
  MATCHES = UNDO.matches; WEEKS = UNDO.weeks;
  PENDING = UNDO.pending; DUPES = UNDO.dupes;
  SEEN.clear(); UNDO.seen.forEach(k=>SEEN.add(k));
  PINS.clear();  UNDO.pins.forEach((v,k)=>PINS.set(k,v));
  ALIAS.clear(); UNDO.alias.forEach((v,k)=>ALIAS.set(k,v));
  SEASON_DIRTY.clear(); UNDO.dirtySeasons.forEach(x=>SEASON_DIRTY.add(x));
  KNOWN_SEASONS.clear(); UNDO.known.forEach(x=>KNOWN_SEASONS.add(x));
  DIRTY = UNDO.wasDirty;
  reindex(); sortWeeks();
  ["Singles","Doubles"].forEach(t=>{ RANK_UI[t].week=null; RANK_UI[t].player=null; });
  UNDO = null;
  refreshAll();
  return true;
}
const markDirty = () => { DIRTY = true; invalidateIssues(); renderSummary(); };

/* ------------------------------------------------------------------
   FILE LAYOUT
   Rankings dwarf everything else — a single season of one tour runs to
   roughly 4,400 rows — so they live in one file per season rather than in
   data.json. Two things keep those files small: a dictionary of player and
   country names, which otherwise repeat on every row, and positional rows
   instead of named fields. Together that's about a sixth of the plain form.
   ------------------------------------------------------------------ */
const RANKINGS_FORMAT = "tt-rankings/1";
const MATCHES_FORMAT  = "tt-matches/1";
const matchFile = s => `matches-${s}.json`;
const MATCH_SEASONS = new Set();      // seasons named by the index
const MATCH_DIRTY   = new Set();

/* Matches are the bulk of everything \u2014 a season runs to well over a megabyte
   written plainly \u2014 so they get the same treatment as the rankings: one file
   per season, names held once in a dictionary, rows as plain arrays. That's
   about an eighth of the size, and entering a week rewrites one year rather
   than the whole archive. */
const MATCH_FIELDS = ["round","disc","stage","week","winnerSeed","winner","winnerCountry",
  "loserSeed","loser","loserCountry","winnerScore","loserScore","winnerSC","loserSC",
  "winnerRank","loserRank","method","isBye","tied"];

function encodeMatches(season){
  const words=[], wi=new Map();
  const w = v => { v = (v===undefined||v===null) ? "" : String(v);
    if(!wi.has(v)){ wi.set(v, words.length); words.push(v); } return wi.get(v); };
  const rows = MATCHES.filter(m=>(m.season||"")===(season==="unknown"?"":season)).map(m=>[
    w(m.event), w(m.round), w(m.disc), w(m.stage), w(m.week),
    w(m.winnerSeed), w(m.winner), w(m.winnerCountry),
    w(m.loserSeed),  w(m.loser),  w(m.loserCountry),
    Number(m.winnerScore)||0, Number(m.loserScore)||0,
    Number(m.winnerSC)||0,    Number(m.loserSC)||0,
    m.winnerRank===""||m.winnerRank==null ? -1 : Number(m.winnerRank),
    m.loserRank===""||m.loserRank==null   ? -1 : Number(m.loserRank),
    w(m.method), m.isBye?1:0, m.tied?1:0
  ]);
  return {format:MATCHES_FORMAT, season, savedAt:new Date().toISOString(), words, rows};
}

function decodeMatches(data){
  if(!data || data.format!==MATCHES_FORMAT) throw new Error(`Expected a ${MATCHES_FORMAT} file.`);
  const W=data.words||[];
  const season = data.season==="unknown" ? "" : data.season;
  for(let i=MATCHES.length-1;i>=0;i--) if((MATCHES[i].season||"")===season) MATCHES.splice(i,1);
  (data.rows||[]).forEach(r=>{
    const m={id:++ROW_ID, season,
      event:W[r[0]], round:W[r[1]], disc:W[r[2]], stage:W[r[3]], week:W[r[4]],
      winnerSeed:W[r[5]], winner:W[r[6]], winnerCountry:W[r[7]],
      loserSeed:W[r[8]],  loser:W[r[9]],  loserCountry:W[r[10]],
      winnerScore:r[11], loserScore:r[12], winnerSC:r[13], loserSC:r[14],
      winnerRank:r[15]===-1?"":r[15], loserRank:r[16]===-1?"":r[16],
      method:W[r[17]], isBye:!!r[18], tied:!!r[19]};
    m.level = (MAIN_LEVELS[m.round]!==undefined) ? MAIN_LEVELS[m.round]
            : (QUAL_LEVELS[m.round]!==undefined ? QUAL_LEVELS[m.round] : 0);
    MATCHES.push(m);
  });
  MATCH_SEASONS.add(data.season);
}

function matchSeasons(){
  return [...new Set([...MATCH_SEASONS, ...MATCHES.map(m=>m.season||"unknown")])]
    .filter(Boolean).sort((a,b)=>b.localeCompare(a));
}
const loadedMatchSeasons = () =>
  [...new Set(MATCHES.map(m=>m.season||"unknown"))].sort((a,b)=>b.localeCompare(a));
const unloadedMatchSeasons = () =>
  matchSeasons().filter(s=>!loadedMatchSeasons().includes(s));
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
  /* Loading a season that's already open replaces it, so picking the same
     folder twice doesn't end up with every week duplicated. */
  const sea = data.season==="unknown" ? "" : data.season;
  for(let i=WEEKS.length-1;i>=0;i--) if((WEEKS[i].season||"")===(sea||"")) WEEKS.splice(i,1);
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
    matchFiles: matchSeasons().map(matchFile),
    rankingFiles: allSeasons().map(seasonFile),
    calendar: CALENDAR,
    aliases: [...ALIAS.entries()].map(([from,to])=>({from,to})),
    countryAccepted: [...COUNTRY_OK.entries()].map(([key,set])=>({key, codes:[...set]})),
    datesAccepted: [...DATE_OK],
    gapsAccepted: [...GAP_OK],
    renameRejected: [...RENAME_NO],
    unknownAccepted: [...UNKNOWN_OK],
    pinned
  };
}

function deserialise(data){
  if(!data || typeof data!=="object") throw new Error("That file isn't a data file.");
  if(!Array.isArray(data.matches) && !Array.isArray(data.matchFiles) && !Array.isArray(data.rankingFiles))
    throw new Error("That doesn't look like a data file.");
  if(data.format && data.format!==FORMAT)
    throw new Error(`That file says it's format "${data.format}", which this page doesn't read.`);

  MATCHES=[]; PENDING=[]; WEEKS=[]; DUPES=[]; SEEN.clear(); REG.clear();
  ALIAS.clear(); PINS.clear(); COUNTRY_OK.clear(); RENAME_NO.clear(); DATE_OK.clear(); GAP_OK.clear(); UNKNOWN_OK.clear();
  CALENDAR=[]; MATCH_SEASONS.clear(); MATCH_DIRTY.clear();
  CAL_INDEX=null;
  (data.matchFiles||[]).forEach(f=>{
    const m=String(f).match(/^matches-(.+)\.json$/i);
    if(m) MATCH_SEASONS.add(m[1]);
  });
  SEASON_DIRTY.clear(); KNOWN_SEASONS.clear();
  LEGACY_INLINE=false; ROW_ID=0;
  (data.rankingFiles||[]).forEach(f=>{
    const m=String(f).match(/^rankings-(.+)\.json$/i);
    if(m) KNOWN_SEASONS.add(m[1]);
  });
  /* Keys in a saved file were made by whatever rules applied at the time. An
     underscore used to be its own character, so a pin recorded against
     "p_varna" no longer finds the player now keyed "p varna" \u2014 the decision
     survives in the file but attaches to nobody. Re-keying on load fixes that
     for good, since the file is rewritten with the current form. */
  (data.aliases||[]).forEach(a=>{ if(a && a.from && a.to) ALIAS.set(rawKey(a.from), rawKey(a.to)); });
  (data.countryAccepted||[]).forEach(m=>{
    if(m && m.key && Array.isArray(m.codes)) COUNTRY_OK.set(keyOf(m.key), new Set(m.codes)); });
  /* files written by an earlier build recorded a single move instead */
  (data.countryMoves||[]).forEach(m=>{
    if(!m || !m.key || !Array.isArray(m.list)) return;
    const set=COUNTRY_OK.get(keyOf(m.key)) || new Set();
    m.list.forEach(x=>{ if(x.from) set.add(x.from); if(x.to) set.add(x.to); });
    COUNTRY_OK.set(keyOf(m.key), set); });
  (data.renameRejected||[]).forEach(k=>{
    const [tour,from,to]=String(k).split("|");
    RENAME_NO.add(to===undefined ? k : [tour, keyOf(from), keyOf(to)].join("|")); });
  (data.datesAccepted||[]).forEach(k=>DATE_OK.add(k));
  (data.gapsAccepted||[]).forEach(k=>GAP_OK.add(k));
  CALENDAR = Array.isArray(data.calendar) ? data.calendar : [];
  CAL_INDEX=null;
  (data.unknownAccepted||[]).forEach(k=>UNKNOWN_OK.add(keyOf(k)));

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
  if(data.matches && data.matches.length){
    LEGACY_INLINE = true; loadedMatchSeasons().forEach(x=>MATCH_DIRTY.add(x));
  }
  sortWeeks();

  (data.matches||[]).forEach(m=>{
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
    const k=keyOf(p.key);
    PINS.set(k, rec);
    const e=REG.get(k);
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
  invalidateIssues();
  CAL_INDEX=null;
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
  COUNTRY_OK.forEach((_,k)=>applyAcceptedCountry(k));
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

/* Matches are grouped the way they were entered, so a mis-tagged paste can be
   taken back out in one go rather than row by row. */
function matchGroups(){
  const g=new Map();
  for(const r of MATCHES){
    const k=[r.event, r.season||"", r.disc, r.stage].join("|");
    if(!g.has(k)) g.set(k, {event:r.event, season:r.season||"", disc:r.disc,
      stage:r.stage, rows:[], weeks:new Set()});
    const e=g.get(k); e.rows.push(r); e.weeks.add(r.week||"");
  }
  return [...g.values()].sort((a,b)=>
    (a.event||"").localeCompare(b.event||"") || (b.season||"").localeCompare(a.season||"") ||
    a.disc.localeCompare(b.disc) || a.stage.localeCompare(b.stage));
}
function removeMatches(rows){
  rows.forEach(r=>MATCH_DIRTY.add(r.season||"unknown"));
  const kill=new Set(rows.map(r=>r.id));
  MATCHES = MATCHES.filter(r=>!kill.has(r.id));
  SEEN.clear(); MATCHES.forEach(r=>SEEN.add(matchKey(r)));
  reindex();
}

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
function saveMatchSeason(season){
  const n = saveJson(encodeMatches(season), matchFile(season), false);
  MATCH_DIRTY.delete(season);
  return n;
}

/* Browsers queue downloads rather than firing them at once, so they're spaced
   out; without the gap most of them are silently dropped. */
async function saveAll(){
  const seasons = loadedSeasons(), msea = loadedMatchSeasons();
  let bytes = saveIndex();
  for(const s of seasons){
    await new Promise(r=>setTimeout(r,450));
    bytes += saveSeason(s);
  }
  for(const s of msea){
    await new Promise(r=>setTimeout(r,450));
    bytes += saveMatchSeason(s);
  }
  DIRTY=false; LEGACY_INLINE=false; renderSummary(); renderFileManager();
  const missing=unloadedSeasons().concat(unloadedMatchSeasons());
  saveMsg(`Saved data.json, ${seasons.length} ranking and ${msea.length} match file${(seasons.length+msea.length)===1?"":"s"} `
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
  if(DIRTY && !confirm("Loading replaces what's on screen, and you have unsaved changes. Continue?")) return;
  $("fileIn").click();
});
/* A folder or a multiple selection arrives in no particular order, so the
   index is read first and the season files after it \u2014 loading the index is
   what clears the board, so doing it second would wipe the seasons. */
function readFileText(f){
  return new Promise((res,rej)=>{
    const rd=new FileReader();
    rd.onload=()=>res(rd.result);
    rd.onerror=()=>rej(new Error(`couldn't read ${f.name}`));
    rd.readAsText(f);
  });
}

async function loadFiles(files){
  const list=[...files].filter(f=>/\.json$/i.test(f.name));
  if(!list.length){ saveMsg("No .json files in that selection.","err"); return; }

  const parsed=[], bad=[];
  for(const f of list){
    try{ parsed.push({f, data:JSON.parse(await readFileText(f))}); }
    catch(err){ bad.push(`${f.name} (${err.message})`); }
  }
  const index   = parsed.filter(p=>p.data && (Array.isArray(p.data.matches)
                    || Array.isArray(p.data.matchFiles) || Array.isArray(p.data.rankingFiles)));
  const seasons = parsed.filter(p=>p.data && p.data.format===RANKINGS_FORMAT);
  const matchF  = parsed.filter(p=>p.data && p.data.format===MATCHES_FORMAT);
  const unknown = parsed.filter(p=>!index.includes(p) && !seasons.includes(p) && !matchF.includes(p));

  if(index.length>1){
    saveMsg(`That selection has ${index.length} index files (${index.map(p=>p.f.name).join(", ")}). `
      + "Pick one folder at a time.","err");
    return;
  }

  snapshot("file load");
  const notes=[];
  if(index.length){
    try{
      const r=deserialise(index[0].data);
      notes.push(`${r.matches} matches from ${index[0].f.name}`);
    }catch(err){ saveMsg(`Couldn't read ${index[0].f.name}: ${err.message}`,"err"); return; }
  }
  let weeks=0;
  seasons.sort((a,b)=>String(a.data.season).localeCompare(String(b.data.season)));
  seasons.forEach(p=>{
    try{ decodeSeason(p.data); KNOWN_SEASONS.add(p.data.season); weeks+=(p.data.weeks||[]).length; }
    catch(err){ bad.push(`${p.f.name} (${err.message})`); }
  });
  let mrows=0;
  matchF.sort((a,b)=>String(a.data.season).localeCompare(String(b.data.season)));
  matchF.forEach(p=>{
    try{ decodeMatches(p.data); mrows+=(p.data.rows||[]).length; }
    catch(err){ bad.push(`${p.f.name} (${err.message})`); }
  });
  sortWeeks();
  SEEN.clear(); MATCHES.forEach(r=>SEEN.add(matchKey(r)));
  reindex();
  invalidateIssues();
  ["Singles","Doubles"].forEach(t=>{ RANK_UI[t].week=null; RANK_UI[t].player=null; });
  DIRTY=false;
  refreshAll();

  if(matchF.length) notes.push(`${mrows.toLocaleString()} matches across `
    + `${matchF.length} season file${matchF.length===1?"":"s"} (${matchF.map(p=>p.data.season).join(", ")})`);
  if(seasons.length) notes.push(`${weeks.toLocaleString()} ranking weeks across `
    + `${seasons.length} season file${seasons.length===1?"":"s"} (${seasons.map(p=>p.data.season).join(", ")})`);
  if(!index.length && seasons.length) notes.push("no index file in that selection, so matches were left as they are");
  if(unknown.length) notes.push(`${unknown.length} file${unknown.length===1?"":"s"} skipped, not recognised `
    + `(${unknown.map(p=>p.f.name).slice(0,3).join(", ")})`);
  if(bad.length) notes.push(`${bad.length} failed: ${bad.slice(0,3).join(", ")}`);

  saveMsg("Loaded " + notes.join("; ") + ".", (bad.length||unknown.length) ? "warn" : "");
}

on("fileIn", "change", e=>{ const f=e.target.files; if(f&&f.length) loadFiles(f); e.target.value=""; });
on("folderIn", "change", e=>{ const f=e.target.files; if(f&&f.length) loadFiles(f); e.target.value=""; });
on("btnLoadFolder", "click", ()=>{
  if(DIRTY && !confirm("Loading replaces what's on screen, and you have unsaved changes. Continue?")) return;
  $("folderIn").click();
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
    /* Twenty seasons is several megabytes and most visitors want the recent
       ones. The newest few arrive first so the page is usable in about a
       second, and the rest follow in the background. */
    const seasonOf = f => (String(f).match(/-(\d{4})\.json$/) || [,""])[1];
    const all = (json.rankingFiles || []).concat(json.matchFiles || []);
    const newest = [...new Set(all.map(seasonOf).filter(Boolean))]
      .sort((a,b)=>b.localeCompare(a)).slice(0,3);
    const first = all.filter(f=>!seasonOf(f) || newest.includes(seasonOf(f)));
    const rest  = all.filter(f=>!first.includes(f));

    const grab = async f => {
      try{
        const fr = await fetch(f, {cache:"no-store"});
        if(!fr.ok) return {f, err:`returned ${fr.status}`};
        const body = await fr.json();
        body.format===MATCHES_FORMAT ? decodeMatches(body) : decodeSeason(body);
        return {f, ok:true};
      }catch(e){ return {f, err:e.message}; }
    };

    const files = all;
    if(files.length){
      const results = await Promise.all(first.map(grab));
      if(rest.length){
        sortWeeks(); reindex(); refreshAll();
        loadBanner("info", `Showing ${newest.slice().reverse().join(", ")} \u2014 `
          + `loading ${rest.length} earlier file${rest.length===1?"":"s"}\u2026`, "");
        setTimeout(async ()=>{
          const more = await Promise.all(rest.map(grab));
          sortWeeks(); reindex();
          ["Singles","Doubles"].forEach(t=>{ RANK_UI[t].week=null; RANK_UI[t].player=null; });
          refreshAll();
          const bad = more.filter(x=>x.err);
          if(bad.length) loadBanner("err", `${bad.length} file${bad.length===1?"":"s"} couldn't be loaded`,
            bad.map(x=>`<code>${esc(x.f)}</code> \u2014 ${esc(x.err)}`).join("<br>"));
          else loadBanner("", "", "");
        }, 50);
      }
      sortWeeks();
      /* Loading the seasons adds players the index never saw, so the registry
         has to be rebuilt \u2014 and rebuilding is what re-applies the pins and the
         accepted countries. Without this a settled choice loads but doesn't
         show. */
      reindex();
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
autoload().then(()=>{ if(location.hash) applyHash(); });
