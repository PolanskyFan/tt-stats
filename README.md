# Tennis Tipping — Results Desk

Turns pasted draw sheets into a searchable, sortable results site. No build
step, no server, no database.

```
index.html    the public site        <- commit this
app.js        the shared logic       <- commit this
data.json     all your data          <- commit this
desk.html     the editor             <- keep on your computer
```

---

## Why the editor is a separate file

`index.html` contains no way to add anything. No paste boxes, no save button,
no editing code at all. A visitor cannot alter what they see beyond sorting and
filtering it.

That isn't a password, and it doesn't need to be. This is a static site: there's
no server and no database, so nothing a visitor types anywhere could reach your
data. The only way `data.json` changes is you pushing a commit to GitHub, which
your account protects. Keeping `desk.html` off the site just means nobody lands
on an editor and thinks they're supposed to fill it in.

You can commit `desk.html` too if you'd rather have it everywhere — it still
can't write to your repository. That's your call, and it changes nothing about
how safe the data is.

---

## Day-to-day use

1. Open `desk.html` on your computer, then **Load a data file** and pick `data.json`.
2. Paste the week's ranking post into the right-hand box. Add rankings.
3. For each tournament: name the event, pick the ranking week, paste the draw. Add draw.
4. Check the **Issues** tab if the counter is showing anything.
5. **Save data.json** and put the downloaded file next to `index.html`.

Step 5 matters. Nothing is written automatically — until you save, the data
lives only in that browser tab. The page warns you if you try to close it with
unsaved work, and the *Your data file* panel shows an amber note.

The published site looks for `data.json` beside itself and loads it automatically.

> **The editor runs from your hard drive, so it can't auto-load.** Browsers block
> a local page from reading a local file, so opening `desk.html` shows an empty
> table and a console warning. That's expected — use **Load a data file** and pick
> `data.json` by hand. The published site has no such restriction and loads by
> itself.

---

## Publishing to GitHub Pages

1. Create a repository (public, if you want the free Pages hosting).
2. Add `index.html`, `app.js` and `data.json` to the root. Commit and push.
3. Repository **Settings → Pages**.
4. Under *Build and deployment*, set **Source** to *Deploy from a branch*, pick
   your branch and the `/ (root)` folder. Save.
5. Wait a minute or two. Your site appears at
   `https://<your-username>.github.io/<repository-name>/`

To update it afterwards, commit a new `data.json`. That's the whole workflow —
you never need to touch `index.html` or `app.js` again.

If a change doesn't show up, it's almost always the browser holding an old copy
of `data.json`. A hard refresh (Ctrl-Shift-R, or Cmd-Shift-R on a Mac) clears it.

### If a tab comes up blank

The page tells you why, in a banner under the tabs. The usual causes:

| Banner | Fix |
|---|---|
| *data.json returned 404* | The file isn't beside `index.html`, or the name isn't lower-case `data.json`. |
| *These files are from different versions* | `index.html`, `desk.html` and `app.js` must be uploaded as a set. Upload all three, then hard-refresh. |
| *This page is older than app.js* | Same cause — re-upload the HTML files. |
| *Opened straight from your hard drive* | Expected over `file://`. Use **Load a data file** in the editor. |
| *data.json isn't valid JSON* | Re-save from the editor and upload again. |

No banner and still blank means the data really is empty for that tab — with no
matches loaded, Matches, Players, Teams and Titles are all legitimately empty
while Rankings still shows.

---

## What gets worked out for you

Nothing below is typed in. It's all derived from the match rows, so it can't
drift out of step with the results the way a spreadsheet formula can.

- **Winners.** Read from the bracket — whoever appears in the next round won the
  last one. That beats reading the colour of the text, and it settles matches
  that are level on every tiebreak. Where the bracket genuinely can't say (a
  final, or a qualifying final with no main draw loaded yet), the page asks you
  rather than guessing.
- **Ranks.** Filled from the ranking week you tag a draw with. Matching ignores
  capitalisation, so the ranking list's `Digor` finds the draw sheet's `digor`.
- **Ranking history.** Click any player, anywhere, for their week-by-week chart
  plus current rank, career high, season high and low, weeks at number one and
  weeks in the top 10. The chart switches between ranking and points.
- **Player records.** Wins, losses, titles, finals lost, semis lost, record
  against the top 10, qualifying record, and main-draw record as a qualifier or
  as a lucky loser.
- **Team records.** A team is its *pair of players*, so partner order never
  splits one record into two, and a change of partner correctly starts a new one.
- **Titles.** Winner, finalist and both semi-finalists for every event.

## What it refuses to do quietly

Everything questionable lands on the **Issues** tab instead of into the data.

- **Repeated matches** are held back. Same event, round and players as one
  already stored means it isn't added — you can override per match.
- **Conflicting countries** for one player are flagged, showing how often each
  code appeared. The most frequent one is used until you pin a different one.
- **Spelling variants** are already treated as one player; you choose which
  spelling is displayed and exported.
- **Undecidable matches** wait for you to pick a winner.

---

## The data file

Plain JSON. Readable, diffable, and easy to back up.

```jsonc
{
  "format":  "tennis-tipping/1",
  "savedAt": "2026-08-26T...",
  "matches": [ /* one object per match */ ],
  "weeks":   [ { "name": "January 5th", "season": "2026", "list": [ /* rankings */ ] } ],
  "pinned":  [ /* only the name and country choices you've overridden */ ]
}
```

The player registry isn't stored — it's rebuilt from the matches and rankings
every time, so it always reflects the current data. Only your manual overrides
persist. Loading is checked: a file that isn't the right shape is refused with a
reason rather than half-loaded.

Since it's JSON in Git, every commit is a restore point. If an entry goes wrong,
`git revert` puts the site back.

---

## Rounds it understands

| Stage | Rounds |
|---|---|
| Main | `F` `SF` `QF` `R16` `R32` `R64` `R128` `R256` `R512` |
| Qualifying | `QFR` `QR3` `QR2` `QR1` |

Set **Stage** before adding a draw. If the round names don't match the stage,
the page says so instead of dropping the rows.

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

Each tour has four views:

| View | What it shows |
|---|---|
| **Week list** | One week's full table. Season and week pickers, newest first. |
| **Year-end** | The final week of every season, plus who finished number one each year. |
| **Movers** | Biggest risers, biggest fallers and new entries for a chosen week. |
| **Compare** | Two players' ranking or points lines on one chart, with a summary. |

---

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

---

## When a player changes username

On the **Issues** tab, *Same person, new username* points an old name at a
current one. From then on both spellings feed one record — singles, doubles,
titles and rankings alike — and the current name is what's displayed.

Nothing is deleted. The pairing is stored in `data.json` and there's an **Undo**
beside each one.

Two merges are refused: a name that doesn't exist, and two players who have
played each other or partnered each other. If they shared a match they can't be
the same person, so that's a mistake rather than a rename.
