# Tennis Tipping — Results Desk

The results, rankings and records of the Tennis Tipping game, from 2007 to
today, as a static site on GitHub Pages: **polanskyfan.github.io/tt-stats**.
No build step, no server, no database, nothing to pay for. Every figure on the
site is worked out in the browser from the data files in this repository.

## What's in the repository

| File | What it is |
|---|---|
| `index.html` | The public site. It has no way to change anything. |
| `desk.html` | The editor: the same site plus the Add data and Issues tabs and the publish panel. Open it at `polanskyfan.github.io/tt-stats/desk.html`. |
| `app.js` | The code both pages share. |
| `data.json` | The index: which season files exist, the tournament calendar, name merges, pinned names and countries, team titles, and every "settled" decision from the Issues tab. It holds no matches. |
| `matches-<year>.json` | One season of results (2007–2018 and 2023 on; 2019–2022 aren't on the site yet). |
| `rankings-<year>.json` | One season of singles and doubles ranking lists (2007 on; 2007–2010 are estimates, marked "(est.)"). |
| `awards.json` | The end-of-season Tennis Tipping Awards. Edited by hand; the editor never saves it. |
| `rules.json` | The game's rules today and their history, for The Game tab. Edited by hand; the editor never saves it. |
| `README.md` | This file. |

`index.html`, `desk.html` and `app.js` are the code and are always uploaded
together. Everything else is data.

---

## The public site

| Tab | What it shows |
|---|---|
| **Overview** | Season span and totals, the current top five on both tours, the latest champions, and **Milestones**: the most recent 100th/200th… wins, first titles and 5th/10th… titles, plus who is closest to their next one. |
| **Seasons** | One page a year, with Singles/Doubles: year-end (or latest) top 10 against the first list of the year, weeks at no. 1, the Grand Slam, Masters and Finals champions, the season's leaders (titles, wins, win rate), biggest climbers, newcomers (first ranked that season), players who left the rankings that season with a career high in the top 100 (each opens to a short career summary: rankings, titles, best Grand Slam, last match, tournaments managed, awards), the awards, and every tournament with its champions and manager. Seasons with no results still show their rankings, awards and calendar. Season numbers on player pages open these. |
| **Calendar** | Every tournament of a season with its surface, draw sizes and manager. Challengers are hidden unless you tick the box. Click a tournament for its event page. |
| **Event pages** | A proper draw sheet for each draw (singles, doubles, qualifying), the champions, draw luck, the round-robin groups for the year-end Finals, Hopman Cup and WTC Dusseldorf, and the same tournament in other seasons. |
| **Matches** | Every match, searchable, with CSV download. |
| **Players** / **Teams** | Career tables for singles players and doubles teams. Filters for event level (ATP main draw by default, Grand Slams, ATP qualifying, Challenger, Challenger qualifying or all events), a From/To season range, surface, and country for players. |
| **Managers** | Tournaments run by each manager. |
| **Head to Head** | Two players' or two teams' full record against each other. |
| **Records** | Singles, doubles and combined record tables: titles, wins, runs, upsets, rivalries, partners and more. |
| **Titles** | Champions, finalists and semi-finalists of every event. |
| **Awards** | The Tennis Tipping Awards by season, plus an All years table. |
| **The Game** | Three pages. *State of the game*: charts and a season table of players in the rankings, newcomers, players' last seasons, countries, tour and Challenger events, average draw size and the no. 1's points. *Coverage*: which seasons and tournaments have results on the site, and a list of what's missing (no results, no singles or doubles, draws with rounds missing), by season, with Challengers on a tick box. *Rules*: the rules today and their history, from `rules.json`. |
| **Singles / Doubles Rankings** | Week lists, No. 1s & top 10, year-end, movers and a two-player compare (see below). |
| **Player pages** | Click any name. Headline figures, awards, a **Grand Slam & Masters timeline**, results by surface and by season, partners, ranking chart, titles, most-played opponents and recent matches. |

Every page has its own address (for example `#player/Snowwy`,
`#event/Paris/2026`, `#season/2015` or `#game/coverage`), so any page can be
linked to directly.

### How things are counted

- **Wins and losses** on the Players and Teams tabs, the Records page and the
  milestones are main-draw matches. The player page's Record card counts
  qualifying too.
- **Byes** and matches where neither player sent picks count for nobody. They
  stay in the draw sheets.
- **Titles** are main-draw finals won. Team events (Hopman Cup, WTC
  Dusseldorf) are team titles and are counted separately.
- **Grand Slam & Masters timeline**: one column a season, from the player's
  first season to their last. A cell shows the round lost in (`W` for a title,
  `RR` for the Finals round robin, `Q1`–`Q3` for a qualifying loss), `–` for an
  event they didn't play, and `·` where the event has no results on the site.
  Montreal and Toronto share the Canada row; Hamburg is a Masters to 2008 and
  Shanghai from 2009. Only the tour event counts: a Challenger with the same
  name is filed separately (`Rome CH`).
- **Milestones**: every 100th main-draw win, a first title and every 5th title,
  at every level, counted exactly as on the Records page. They appear once
  every season file has loaded. Seasons with no results on the site don't
  count, so long-time players' real totals are higher.
- **Ranks on matches** come from the ranking week the draw was tagged with
  (2023 on) or, for 2007–2018, the latest list dated on or before the
  tournament week.
- **Weeks at no. 1 and in the top 10** are calendar weeks: a list counts until
  the next one, and the 2020 ranking freeze (16 March to 24 August) isn't counted.
- **No-score (0–0) matches** are only flagged when a whole main-draw round is
  0–0, or when the winner can't be worked out from the next round. A lone 0–0
  in a scored round is a real result.
- Seasons before 2019 come from the game's old database, which kept one figure
  a side: no tiebreak (SR) or set detail.

---

## The editor (desk.html)

Open `polanskyfan.github.io/tt-stats/desk.html`. It loads every file from the
site by itself, exactly as the public page does, and adds:

- **Add data** — paste a draw, a ranking list or calendar rows; the matches and
  weeks loaded, with Remove buttons; the file list with Save buttons; and the
  **Publish to GitHub** panel.
- **Issues** — everything questionable that the page refused to settle on its
  own (see *What it refuses to do quietly* below). The counter in the menu is
  the number still open.

`desk.html` sits in the repository like the other files. That's safe: it can
only change the repository with your token, and the token is never written
into the file. A visitor who opens it can play with their own copy in their
browser, but nothing they do reaches the site.

The editor still works from your hard drive too: open the file, then use
**Load a whole folder** or **Load files…** (the browser blocks a local page
from loading files by itself).

## Day-to-day use

1. Open the editor and wait for the seasons to load.
2. Paste the week's ranking post and click **Add rankings**.
3. For each tournament: name the event, pick the ranking week, paste the whole
   thread post, **Read draw**, check the preview, **Add**.
4. Check the **Issues** tab if the counter is showing anything.
5. **Publish changed files.** Usually that's `data.json` and the current
   season's match and ranking files.

Nothing is written until you publish (or save). Until then the changes live
only in that browser tab; the page warns you if you try to close it with
unsaved work.

## Publishing

### With the publish button (the usual way)

The **Publish to GitHub** panel on the Add data tab writes the changed files
straight into the repository, the same bytes the Save buttons would download.

Set it up once:

1. On GitHub: **Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token**.
2. Repository access: **Only select repositories → tt-stats**.
3. Permissions: **Contents → Read and write**. Nothing else.
4. Give it an expiry date, generate it, and paste it into the panel.
   **Remember these settings** keeps it in this browser.

Then **Publish changed files** after each session. **Check the connection**
tests the token without writing anything, and **Forget the token** removes it
from the browser (it stays live on GitHub until you delete it there). If a file
has changed on GitHub since this browser last published it (another computer, a
hand upload), the panel asks before replacing it.

The token is stored in this browser for the whole `polanskyfan.github.io`
address, so don't add outside scripts or widgets to any page published under
that account. If a computer is lost, delete the token on GitHub and make a new
one.

### By hand

**Save all files** downloads the changed files. Upload them on GitHub with
**Add file → Upload files**, replacing the old ones.

### Updating the code

Upload `index.html`, `desk.html` and `app.js` together, and nothing else: the
data files are yours and should only ever be replaced by files saved from the
editor. The pages check that the three match; if they don't, a banner says
*These files are from different versions*. GitHub Pages takes a minute or two to
update, and a hard refresh (Cmd-Shift-R) clears an old copy.

---

## Helpers

A helper gets a pack with `index.html`, `desk.html`, `app.js`, a trimmed
`data.json` listing only the season files in the pack, and those season files.
They enter results in the editor and send back **only their season match
file** — never their `data.json`. A reduced pack must never be saved over the
real files: it quietly drops decisions about players it can't see.

Each helper file is merged and checked before publishing: spelling against the
known players, event names against the calendar, and the shape of every draw.

---

## The data files

All plain JSON, readable and diffable. Every commit is a restore point, so a
bad upload can be put right with GitHub's history.

**`data.json`** (`"format": "tennis-tipping/1"`) — `matchFiles` and
`rankingFiles` list the season files; `calendar` holds one row per tournament
(season, week code, date, name, event name, country, surface, draw sizes,
manager, whether it's a Challenger); `aliases` maps old usernames to current
ones; `pinned` holds chosen spellings and countries; `teamTitles` and
`teamGroups` hold the team events; the rest are the settled Issues-tab
decisions, so they never come back.

**`matches-<year>.json`** (`"format": "tt-matches/1"`) — `words` is a list of
every text value used that season, and each entry in `rows` is one match as an
array of 20 values, text given as positions in `words`:

```
event, round, discipline, stage, ranking week,
winner seed, winner, winner country, loser seed, loser, loser country,
winner score, loser score, winner SR, loser SR,
winner rank, loser rank (-1 = none), how the result was read, bye (1/0), tied (1/0)
```

**`rankings-<year>.json`** (`"format": "tt-rankings/1"`) — `players` and
`countries` are lists of names; each entry in `weeks` is one list: `t` is the
tour (`S` or `D`), `n` the week name, and each row in `r` is
`[rank, previous rank, player, country, points, events played]`.

**`awards.json`** (`"format": "tt-awards/1"`) — one entry per season. Each
award has a `group`, an `award` (the row name in the All years table), an
optional `title` (the name used that year), a `type` (`player`, `team`,
`event`, `manager` or `text`) and its `winners`. A tournament award can name
its `manager`; otherwise the calendar's manager for that event is credited. To
show a vote, add `"votes": [{"name": "vjatceslav", "votes": 12}, …]`.

**`rules.json`** (`"format": "tt-rules/1"`) — `note` is a line under the
heading; `current` is a list of topics, each `{"topic": "Rankings", "items":
["…", "…"]}`; `history` is a list of changes, each with a `date`
(`"2020-03-16"`) or a `season` (`"2007"`), an optional `topic`, and the `text`.
Newest first is worked out for you. A topic or a change can carry a table, for
example a points table for an era: `"table": {"columns": ["Round", "Grand Slam",
"Masters"], "rows": [["W", 2000, 1000], ["F", 1200, 600]]}`.

The player list isn't stored anywhere: it's rebuilt from the matches and
rankings every time, so it always matches the data.

---

## If a tab comes up blank

The page says why, in a banner under the menu.

| Banner | Fix |
|---|---|
| *data.json returned 404* | The file isn't beside `index.html`, or the name isn't lower-case `data.json`. |
| *These files are from different versions* | Upload `index.html`, `desk.html` and `app.js` as a set, then hard-refresh. |
| *This page is older than app.js* | Same cause: re-upload the HTML files. |
| *Opened straight from your hard drive* | Expected for a local file. Use **Load a whole folder** in the editor. |
| *data.json isn't valid JSON* | Re-save from the editor and upload again. |
| *… file(s) couldn't be loaded* | A season file named in `data.json` is missing from the repository. |

---

## What it refuses to do quietly

Everything questionable lands on the **Issues** tab instead of into the data.

- **Repeated matches** are held back. Same event, round and players as one
  already stored means it isn't added — you can override per match.
- **Conflicting countries** for one player are flagged, showing how often each
  code appeared. The most frequent one is used until you pin a different one.
- **Spelling variants** are already treated as one player; you choose which
  spelling is displayed and exported.
- **Undecidable matches** wait for you to pick a winner. Where every number is
  zero — neither player sent picks, so there's no result — the row is marked
  *no result* and offers **Neither — leave it out**, with a button to drop all
  of them at once. Anything left out is never recorded.
- **Names that never appear in a ranking.** Everyone in a draw is ranked at some
  point, so a name in the matches and in no ranking list is almost certainly a
  misspelling. The nearest ranked spellings are offered, ones from the same event
  first, with **Other…** to type the right name and **Spelling is right** for a
  genuine case. Merging rewrites every match the name appears in.
- **Events needing attention** — a group of matches with no season set, or one
  event using more than one ranking week. Events repeat year on year, so this
  compares within an event *and* season, never by name alone.
- **Week dates that look wrong.** Ranking posts land on a Monday, so anything
  else is usually a slipped day; the fix button renames the week to the nearest
  Monday and moves any matches tagged with it. **Other…** lets you type the right
  name yourself, which is what a date like February 31st needs since nothing can
  guess it. **It's right** keeps a date as it stands and stops flagging it. Weeks
  where singles and doubles sit a day or two apart are matched up too. Every week
  in *Ranking weeks loaded* has its own **Other…**, so you can rename any week,
  flagged or not.
- **Possible name changes.** When someone drops out of the rankings for good in
  the same week that a name nobody has seen before appears already carrying a
  tournament count, they're usually one person: points and tournaments played
  follow a rename, the username doesn't. Each pair gets a **Merge** button and a **Not the same** button for when they're
different people; dismissed pairs never come back.
- **Weeks with only one tour** are flagged once a season has some of each — the
  two tours run the same calendar, so a week on one and not the other is nearly
  always a post that didn't get pasted.

A country conflict offers three answers. If one code is a typo, **use**
the correct one. If the player genuinely holds several — they moved, or a code
like XXX is meaningful — **accept** each that's right, or **all** at once. There's
no limit on how many, so three or four countries over a career is fine. The
conflict settles once every code seen has been accepted, and a code appearing
later still comes back.

Once you pick a spelling or a country, that conflict is settled and drops out of
the list. Settled ones — chosen spellings, accepted countries, dismissed rename pairs and
confirmed dates — sit in a collapsed *Settled earlier* section at the bottom with
an Undo beside each, so the list above only ever shows what's new.

---

## Pasting draws

Paste the whole tournament post at once — singles and doubles, qualifying and
main draw. With **Discipline** and **Stage** on *Auto*:

- The discipline comes from a heading such as `DOUBLES DRAW AND RESULTS`, and
  applies until the next such heading. It has to say *draw* or *results* too, so
  an ordinary sentence mentioning doubles won't switch it.
- The stage comes from the round itself: `QR1`–`QR3` and `QFR` can only be
  qualifying, everything else is main draw. No dropdown needed.

Match lines are read in whatever shape the thread uses: `|` or a lowercase `l`
between the score and the players, `vs` with or without a full stop, and the
tiebreak written `#SRs:`, `#SR:`, `SR:` or bare `SR`, optionally after a dash,
with its pair joined by `-` or `:`. A seed can come before the name, `(1) Anny
(BLR)`, or after it, `Anny (BLR) (1)`. A line whose tiebreak has wrapped onto
the next line is joined back up before parsing.

Round headings are read in whatever shape the thread uses — `R32`,
`Singles R32 Results`, `Singles - QF Round`, `Doubles - Round 3`,
`Singles Qualifying Round 2 Draw`, `QFR Singles`, `Final Singles` — with the
discipline before or after the round, and BBCode leftovers like `[/B]` ignored.
Rounds can be abbreviated (`SF`), spelled out (`Semifinals`) or given by size
(`Round of 16`, `Last 32`). `R16` and `R32` name the size of the round, while
`R1` and `R2` mean round one and round two — a draw size is a power of two and at
least sixteen, anything smaller is a round number and is resolved from its
position. `Qualifying Final Round` is read as the last
qualifying round rather than the tournament final.
Set either dropdown explicitly to override the detection for a paste that
doesn't say.

Rounds numbered `Round 1`, `Round 2` and so on are worked out from context
rather than the number, because "Round 3" is the last thirty-two in a 128 draw
and the last sixteen in a 64 draw. The numbered rounds run up to the
quarter-final, so the highest-numbered one sits directly before it; where no
quarter-final is named, the size of the round decides. Numbered qualifying
rounds work the same way, with the highest as the final qualifying round.

Because the whole post goes in together, a qualifying final can be settled
against the main draw in the same paste rather than needing it loaded first.

### Nothing is added until you say so

**Read draw** shows what it found before anything is written: the event, the
season, the ranking week, and every round with its match count. A main-draw
round has a known size — the last sixty-four holds thirty-two matches — so a
short round reads *R64 ×30 of 32* in amber and opens itself up automatically.
Every round can be expanded to list the matches actually read, and any line that
couldn't be read is shown in full, which is normally where the missing ones went.
**Add** commits it, **Cancel** discards it. A paste that half-works is worse than one
that fails outright, because the wrong rows go in quietly.

### Checks on the shape of a draw

A draw has a fixed shape, and that's used to catch a misread heading rather than
trusting the words:

- **A slash between two names means doubles.** That's a property of the match,
  so it outranks the heading and the Discipline dropdown, and a heading covering
  both is split in two.
- **A round can't hold more than its size.** The final is one match, the semis
  two, the quarters four, the last sixteen eight. A round holding more has been
  mislabelled, and the count says what it really is; the preview reports the
  correction. Rounds *short* of their size are left alone, since a post can
  simply be incomplete.
- **Every player in a round played in the round before it.** Anyone who didn't
  is counted and reported — *"SF: 1 of 4 players didn't play the round before"* —
  which is the sharpest sign that the rounds haven't lined up.

### When the headings can't be read

If match lines appear with no heading above them, the rounds are worked out from
the draw itself: blocks split on blank lines, then merged while no player
repeats — nobody plays twice in a round, so the first repeat marks the next one.
The sizes then name the rounds, which works the same for a 32, 64 or 128 draw.
The preview says plainly when rounds were inferred rather than read, so you can
check the names before committing.

## Rounds it understands

| Stage | Rounds |
|---|---|
| Main | `F` `SF` `QF` `R16` `R32` `R64` `R128` `R256` `R512` |
| Qualifying | `QFR` (or `FQR`) `QR3` `QR2` `QR1` |

Set **Stage** before adding a draw. If the round names don't match the stage,
the page says so instead of dropping the rows.

## Pasting rankings

The title line is read whichever way round it's written — `Rankings 2026:
January 5th` or `Rankings January 6th 2025` — and the year, the date and the
tour all come from it. Dates are normalised, so "January 6" and "January 6th"
are the same week either way.

### Pasting a whole thread at once

You don't have to add weeks one at a time. Copy as much of the forum thread as
you like — several posts, a whole season — and paste the lot. Each week starts
at its own title line, and anything between titles that isn't a ranking row is
passed over: post headers, join dates, reaction lines, "Weeks at #1" tables,
other people's comments.

A line only starts a new week if a month and day can be read from it, so a post
saying "rankings are going to be a bit late this week" doesn't create an empty
one.

The week-name override only applies to a single-week paste; with several weeks
in the box the page asks you to clear it.

After a bulk paste you get a count of weeks and rows added, and a warning if
consecutive weeks in the same season sit more than three weeks apart — usually
the sign of a post that got skipped. Gaps across the off-season are ignored.

Leave **Tour** on *Auto* to take it from the title. If a title has no year, the
page says so and you can type one into **Season**; without it, weeks from
different years collide.

## Ranking weeks

Each ranking list belongs to a tour — **Singles** or **Doubles** — chosen when
you paste it. They're kept apart everywhere: separate tabs, separate histories,
separate career highs. Only singles weeks can be tagged onto a draw, since only
singles matches carry rank columns.

A week is identified by its tour, season and name together, so "January 5th
2008" and "January 5th 2026" are separate weeks rather than one overwriting the
other. Always set the season when pasting a back year.

Week names like "August 3rd" are read as real dates, so the list, the chart and
"most recent" all follow the calendar rather than the order you happened to
paste things in. A week whose name can't be read as a date is marked *no date
read* in the week manager and sorted to the end — rename it if you'd rather it
sat in sequence.

The **Ranking weeks loaded** panel on the Add data tab lists every week with a
**Remove** button. Removing a singles week that matches were tagged with clears
those rank columns, and you're warned first with a count.

Pasting a week that already exists on the same tour replaces it rather than
duplicating it, and the view jumps to whichever week you just added.

## Seeds

Numeric seeds pass through exactly as written. Entry-status seeds are collapsed,
since the slot number isn't wanted:

| In the draw | Stored as |
|---|---|
| `Q`, `Q1`, `Q2`, `Q3`, `Q4` | `Q` |
| `LL`, `LL1`, `LL2` | `LL` |
| `ALT`, `ALT2`, `ATL` | `ALT` |
| `SE` | `SE` |
| `WC` | `WC` |

`ATL` is folded in as a misspelling of `ALT`. Older data files are cleaned on
load, so you don't need to fix anything by hand.

---

## The rankings tabs

Each tour has five views:

| View | What it shows |
|---|---|
| **Week list** | One week's full table. Season and week pickers, newest first. |
| **No. 1s & top 10** | Weeks spent at the top and in the top ten, plus every reign newest first. |
| **Year-end** | The final week of every season, plus who finished number one each year. |
| **Movers** | Biggest risers, biggest fallers and new entries for a chosen week. |
| **Compare** | Two players' ranking or points lines on one chart, with a summary. |

**No. 1s & top 10** holds seven tables: weeks at no. 1 (with reigns, longest
reign and year-end titles), weeks in the top 10 (with the longest unbroken run),
highest points ever held, the biggest single-week climbs on record, weeks at
no. 1 by country, the most recent debuts, and every reign newest first.

Consecutive weeks under the same player are grouped into one reign, so a long
run reads as a single line rather than thirty. A top-10 run counts unbroken
weeks — dropping out for one week starts it again. Doubles partnerships share a
rank, so a week can have more than one holder; both are counted and the reign is
listed under both names.

## Players who stopped playing

Someone missing from the most recent week isn't ranked any more, so their last
figure is a leaving position rather than a current one. Their page shows
**Current: NR** with *not ranked since …*, keeps the leaving rank in a **Last
ranked** card, and says so under their name. Career high, weeks at no. 1 and the
rest are unaffected. The Compare table and the debut list mark them the same way.

---

## Undoing a mistake

**Matches loaded** on the Add data tab lists every group of matches as it was
entered — event, season, discipline, stage — with a Remove button, so a paste
tagged with the wrong discipline or week can be taken out in one go and redone.
Individual matches have an × in the table.

An **Undo** bar appears after anything is added or removed and takes back that
one step, including any ranks that were filled in at the same time. It's a
single step, not a history — once you do the next thing, the previous state is
gone.

## When a player changes username

On the **Issues** tab, *Same person, new username* points an old name at a
current one. From then on both spellings feed one record — singles, doubles,
titles and rankings alike — and the current name is what's displayed.

Nothing is deleted. The pairing is stored in `data.json` and there's an **Undo**
beside each one.

Two merges are refused: a name that doesn't exist, and two players who have
played each other or partnered each other. If they shared a match they can't be
the same person, so that's a mistake rather than a rename.
