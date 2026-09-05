# Victory Counter

A shared, always-visible progress counter for **any game system** in
**Foundry VTT v14**.

The GM creates any number of named tracks and adjusts them as the scene plays
out. Every player sees the same live state in a collapsible on-screen HUD.

A track runs in one of two **modes**:

- **Progress** — counts up from zero toward a target and completes there. Suits
  any subsystem built on "fill a bar before the other bar fills": PF2e
  infiltration and research points, D&D 5e skill challenges and clocks, Blades
  in the Dark progress clocks, chase trackers, doom counters, faction heat.
- **Thresholds** — starts at a value you choose, moves up *and* down, and takes
  its meaning from the band it lands in rather than from a finish line. Suits
  standing, reputation, morale, alert level, faction disposition — anything that
  can get better or worse and where the interesting moments are the crossings.

## Features

- **Shared state.** Up to 10 concurrent tracks, stored in a world setting and
  broadcast to every connected client automatically. No custom socket, no
  desync.
- **One target per progress track.** A progress track has a name, a target, a
  current value and a polarity. It completes when `current >= target`. Progress
  can never go below zero.
- **Threshold ladders.** A threshold track carries up to 12 GM-described bands.
  Each band has a value where it begins, a name, and a description of what it
  means. Bands below the starting value read as negative, the band containing it
  is the status quo, and bands above it read as positive — derived from the start
  value, so there is nothing extra to tag.
- **Band-change announcements.** When a threshold track moves into a different
  band, in either direction, it can post a chat card naming the band and quoting
  its description. Skipped bands are listed rather than swallowed. Toggle it per
  track, and per band.
- **Positive and negative tracks.** Positive is the default and keeps the
  module's accent colour. Negative tracks show their progress numbers and ring
  in red — plus an arrow icon and the written word *Negative*, so the
  distinction survives colour-blindness, greyscale and screen readers.
- **Circular progress rings.** Optional (world setting, on by default). Pure SVG
  and CSS, with `current / target` in the centre, clamped to 100%.
- **Rune circles.** A second way to draw *any* track, chosen per track. A ring of
  seats, one rune each, all of them adrift outside the circle to begin with; each
  success slides one into place. A progress track seats one rune per point of its
  target, a threshold track one per rung of its ladder — so the same figure works
  on both, and a threshold track keeps its bands, tones and announcements while
  wearing it. Seats carry the Elder Futhark by default and the GM can override
  any glyph or name.
- **Responsive layout.** Cards reflow through CSS Grid: one column when narrow,
  two or three when wide. Both windows are resizable and only scroll when they
  genuinely run out of screen.
- **Draggable, resizable HUD.** Grab the title bar to move it, the bottom-right
  grip to resize it. Double-click either to reset. Position, width, scale and
  collapsed state are per-user.
- **Compact mode.** Collapses to one slim chip per track — value and target on a
  progress track, value and band name on a threshold track.
- **GM quick controls.** `-` / `+` and a "set" field on the HUD itself, plus a
  full control panel. The eye button toggles player visibility in one click.
- **Hide from players.** Run a track the party cannot see; chat cards are
  whispered to GMs while it is hidden.
- **Undo.** Every change stores a one-level snapshot that the GM can restore.
- **System-agnostic.** No system is declared, detected or special-cased. The
  module stores its entire state in its own settings and never reads a system's
  actor, item or roll data, so it behaves identically everywhere.
- **Macro API** for automation.

## Installation

### From a manifest URL

1. In Foundry, go to **Add-on Modules → Install Module**.
2. Paste:
```
https://github.com/sargas79/Victory-Counter/releases/latest/download/module.json
```
3. Click **Install**, then enable the module in your world.

### Local development

Clone or symlink this repository into your Foundry user data directory under a
folder named exactly `victory-counter` (the name must match `module.json.id`),
so the path is:

```
<FoundryUserData>/Data/modules/victory-counter/
```

Restart Foundry, then enable **Victory Counter** in
**Game Settings → Manage Modules**.

On Windows, a symlink from an admin PowerShell prompt:

```powershell
New-Item -ItemType SymbolicLink -Path "$env:LOCALAPPDATA\FoundryVTT\Data\modules\victory-counter" -Target "C:\path\to\Victory-Counter"
```

## Usage

### Gamemaster

1. Select the **Token** scene controls; click the **sliders** icon
   (*Victory Counter Controls*).
2. Fill in the track name and pick a **Mode**.
   - *Progress*: set the **Target** and the **Type** (*Positive* or *Negative*).
   - *Thresholds*: set **Start**, **Minimum** and **Maximum**.
3. Pick a **Display**: *Standard* for the usual bar, ring or ladder, or *Rune
   circle* to draw the track as a ring of runes that move into place (see below).
   This is independent of Mode; both work with either.
4. Leave **Visible to Players** on so the party can see the track; turn it off
   to run a hidden one.
5. Click **Add Track**. Repeat for as many tracks as the scene needs.
6. For a threshold track, click **Edit Thresholds** on its card and describe each
   band (see below).
7. During play, use `-` / `+` in the panel or directly on the HUD. To jump to a
   value, type it into the track's "set" field and press Enter.
8. **Undo Last Change** reverts the most recent change. **Reset Progress**
   zeroes a progress track; on a threshold track the same button reads **Reset to
   Start** and returns it to its starting value. **End Track** removes it from
   every screen.

Resetting or ending a track always asks for confirmation first.

By default a progress track that has reached its target refuses further
increases. Turn on **Allow Progress Beyond Target** in the module settings if you
want it to keep counting past the finish line. Threshold tracks ignore that
setting: they are bounded by their own **Minimum** and **Maximum** instead.

#### Threshold tracks

Say the party's standing with a faction starts at **6**, can run from **0** to
**12**, and matters at five points:

| At value | Band | Means |
| --- | --- | --- |
| 0 | Blood Feud | Kill on sight. |
| 3 | Strained | Doors close; prices double. |
| 6 | Uneasy Truce | The status quo. |
| 9 | Trusted | The back room is open to you. |
| 12 | Sworn Allies | They come when called. |

Create the track with Start 6, Minimum 0, Maximum 12, then add those five rungs
in **Edit Thresholds**. The value sits in the highest band it has reached, so 7
and 8 are still *Uneasy Truce*, and the band only changes when the value crosses
into the next one.

Because the start is 6, the two bands below it read as negative, the band at 6 is
the status quo, and the two above it read as positive. There is nothing to tag by
hand — move the start and the whole ladder re-reads itself.

Announcements have three independent switches:

| Switch | Where | Covers |
| --- | --- | --- |
| **Post Progress to Chat** | Module settings | Every card, for every track. Master switch. |
| **Announce in Chat** | Track card | Every value change on that track. |
| **Announce Band Changes** | Track card | Only crossings into a new band, either direction. |
| **Announce This Band** | Ladder editor | Lets one band pass without comment. |

A change that trips more than one posts a single card carrying all of it, not one
card each. A jump that skips bands names the band it landed in and lists the ones
it passed through. Rewriting the ladder never announces anything — the scale
changing is not the same event as the value moving across it.

**Show Players Every Threshold** is off by default: players see their current
band, its description, and the shape of the scale, but not the other bands'
numbers or descriptions. Turn it on to make the whole ladder public.

#### Rune circles

Every track is drawn one of two ways, chosen per track in the **Display** field
beside **Mode**:

| Display | Progress track | Threshold track |
| --- | --- | --- |
| **Standard** | Bar, or the ring when rings are enabled | The ladder rail |
| **Rune circle** | One seat per point of the target | One seat per rung of the ladder |

A rune circle is a ring of seats with a rune for each. They all begin **adrift** —
dim, tilted, scattered outside the ring — and each success slides one into its
place on the circle, upright and lit. The rune at the leading edge is marked:
on a progress track that is the one just earned, on a threshold track it is the
band the value currently sits in.

Nothing about how the track *counts* changes. Display and Mode are separate
fields, so a threshold track drawn as a circle keeps its bands, its tones, its
descriptions, its band-change chat cards and **Show Players Every Threshold** —
only the rail is replaced by the circle. Switching Display back and forth is
free and never touches a value.

Seats carry the 24 staves of the Elder Futhark by default, assigned in order, so
a circle is usable the moment you switch it on. Click **Runes** on the track card
to give any seat a different glyph or name; clear a field to go back to its
default. On a threshold track a seat's name overrides its band name, and the
overrides are tied to the rung itself, so inserting a new band lower down does
not shuffle everyone's glyphs.

**When the circle is not drawn.** A circle can show between 1 and 24 seats. A
progress track with a target above 24, or a threshold track whose ladder is still
empty, falls back to its standard readout and the control panel says why. The
choice is remembered, so the circle returns the moment the track can carry one.

### Players

- The HUD appears automatically when the GM starts a visible track.
- Drag it by the title bar to get it out of your way; double-click the bar to
  snap it back to your anchor.
- Drag the grip in the bottom-right corner to resize it — a wider HUD lays the
  track cards out in two or three columns. Double-click the grip to reset.
- Use the chevron to collapse it to compact chips, or the `x` to hide it.
- Reopen it from the **Token** scene controls (*Show/Hide Victory Counter*,
  trophy icon).
- Anchor, width and scale live in **Game Settings → Configure Settings →
  Victory Counter** and are personal to you.

Only the GM can create, rename, configure, retype, delete or adjust a track.
On a progress track, players see the name, the Positive/Negative indicator, the
current value against the target, the ring (when enabled) and the completion
state. On a threshold track they see the name, the value, the band they are
currently in and what it means, and where they sit on the scale — the rest of the
ladder only if the GM has revealed it. A track drawn as a rune circle follows the
same rule: everyone sees which runes are seated and which are still adrift, but
on a threshold track an unearned rune stays unnamed until the ladder is revealed.

### Macro API

```js
const vc = game.modules.get("victory-counter").api;

// A 6-step infiltration, and the alarm working against the party
const infiltration = await vc.create({ title: "Infiltration Points", target: 6 });
const alarm = await vc.create({ title: "Raise the Alarm", target: 5, type: "negative" });

await vc.increase(infiltration.id);        // +1
await vc.increase(alarm.id, 2);            // +2
await vc.decrease(alarm.id);               // -1, never below 0
await vc.setProgress(infiltration.id, 4);  // set directly
await vc.setType(alarm.id, "positive");    // change polarity
await vc.undo();                           // revert the last change
await vc.end(infiltration.id);             // clear the track

vc.getTracks();                            // read all current state
vc.getTrack(alarm.id);                     // read one track
```

Threshold tracks use the same value calls (`increase`, `decrease`, `adjust`,
`setProgress`, `reset`) plus a ladder of their own:

```js
const standing = await vc.create({
  title: "Faction Standing",
  mode: vc.MODES.THRESHOLD,
  start: 6, min: 0, max: 12
});

await vc.setThresholds(standing.id, [
  { value: 0,  label: "Blood Feud",   description: "Kill on sight." },
  { value: 3,  label: "Strained",     description: "Doors close; prices double." },
  { value: 6,  label: "Uneasy Truce", description: "The status quo." },
  { value: 9,  label: "Trusted",      description: "The back room is open to you." },
  { value: 12, label: "Sworn Allies", description: "They come when called.", announce: false }
]);

await vc.increase(standing.id, 3);   // 6 -> 9, announces "Trusted"
await vc.decrease(standing.id, 9);   // 9 -> 0, announces "Blood Feud"
vc.getBand(standing.id);             // the band it currently sits in, or null
await vc.toggleThresholdAnnounce(standing.id);
```

Rungs may be passed in any order; ids are generated for any that arrive without
one, and the list is sorted, deduplicated by value and capped on the way in.
Writing a ladder never posts a chat card.

Either mode can be drawn as a rune circle instead of its usual readout:

```js
// A ritual with eight seals. Eight runes, all adrift until they are earned.
const ritual = await vc.create({
  title: "Seal the Rift",
  target: 8,
  display: vc.DISPLAYS.CIRCLE
});

await vc.increase(ritual.id);              // one rune slides into place

// The faction ladder above, drawn as a circle: one rune per band.
await vc.setDisplay(standing.id, vc.DISPLAYS.CIRCLE);

// Name a seat. `key` is the rung's id on a threshold track, the seat's index
// as a string on a progress one. Passing [] clears every override.
await vc.setRunes(ritual.id, [{ key: "2", glyph: "ᛞ", label: "The Seal" }]);
```

`display` is accepted by `create()` and `configure()` as well. It never touches a
value: switching a track to a circle and back is free, and the choice is
remembered even while the circle cannot be drawn — a target above 24 seats, or a
threshold track whose ladder is still empty, falls back to the standard readout
until the track can carry one.

All mutating calls are GM-only and fail with a notification for other users.

`addSuccess()` and `setCounts()` still work as deprecated aliases for
`increase()` and `setProgress()`. `addFailure()` was removed in 1.0.3 — model a
"bad" track as a separate negative track instead.

## Data schema

One world setting (`tracks`) holds an array of:

```json
{
  "schema": 5,
  "id": "unique-track-id",
  "active": true,
  "title": "Raise the Alarm",
  "mode": "progress",
  "display": "standard",
  "type": "negative",
  "current": 2,
  "target": 5,
  "start": 0,
  "min": 0,
  "max": 12,
  "thresholds": [],
  "band": null,
  "runes": [],
  "announceThresholds": true,
  "revealLadder": false,
  "visibleToPlayers": true,
  "postToChat": true,
  "status": "running",
  "lastChange": { "delta": 1, "time": 1755400000000 },
  "legacy": null
}
```

`mode` decides which fields mean anything. A `progress` track reads `target` and
ignores `start`/`min`/`max`/`thresholds`; a `threshold` track does the reverse.
The unused fields are kept rather than stripped, so switching a track between
modes and back does not throw away a ladder the GM wrote.

`display` is independent of `mode`: it decides only how the track is drawn, and
no value, bound or status anywhere in the module reads it. `standard` is the bar,
ring or ladder; `circle` is the rune circle.

Each entry in `runes` is `{ "key": "2", "glyph": "ᛞ", "label": "The Seal" }` —
a per-seat override, where `key` is the rung's `id` on a threshold track and the
seat's index as a string on a progress one. Both fields are optional and an entry
carrying neither is dropped, so a circle the GM never customised stores nothing.
Overrides for seats a track no longer has are kept rather than pruned, so a rung
deleted by mistake gets its glyph back.

Each entry in `thresholds` is
`{ "id": "...", "value": 3, "label": "Strained", "description": "...", "announce": true }`.
The array is sorted ascending by `value` and deduplicated by it on every read, so
only one band can ever own a given number.

Two fields are derived and never authored:

- `status` — `complete` when a progress track has `current >= target`, otherwise
  `running`. A threshold track is always `running`; it has no finish line.
- `band` — the id of the threshold the value currently sits in, or `null` when it
  is below every rung. Recomputed on every read so a hand-edited ladder cannot
  leave it pointing at a rung that no longer exists, but also stored, because
  announcements compare the band before a change with the band after it.

`legacy` holds the pre-schema-3 failure fields of a migrated track, and is never
read at runtime.

Upgrading from schema 4 is purely additive and changes nothing visible: every
track gains `display: "standard"` and an empty `runes` array, which is exactly
how it was already being drawn.
Upgrading from schema 3 is purely additive: every track gains `mode: "progress"`,
which is exactly what it already was, and no stored value changes meaning.
Upgrading from schema 2 migrates `successes → current` and
`requiredSuccesses → target`, defaults every track to `type: "positive"`, and
preserves the failure fields under `legacy`. The migration is versioned and
idempotent, writes a one-time verbatim backup to a hidden `legacyBackup`
setting, and deletes nothing. See the
[changelog](CHANGELOG.md) for the full table.

## Manual test plan

Run these in a v14 world under any system. Everything except the two-client
checks can be done in a single GM session.

**Upgrading from the PF2e-only build**

1. In a world that ran the PF2e build as `pf2e-victory-counter`, disable that
   module, install this one and reload as GM. The existing tracks appear, a
   notification reports how many were imported, and the old module's settings
   are still present in the world database untouched.
2. Reload again. No second import notification, and the tracks are unchanged.
3. In a world that has never had the old module, confirm the import is silent
   and the world starts with no tracks.

**Migration**

4. With schema 2 data present, load the world as GM. The tracks appear with
   their old success totals as the current value and their old
   required-successes as the target, all marked *Positive*, with no console
   errors.
5. Enable **Debug Logging** and reload. The console prints one migration summary
   line; a second reload prints "already at schema 5 — nothing to do."
6. Hand-edit a track's stored data to remove `target`, or set it to `null`. It
   reloads with a safe default instead of throwing.
6a. With schema 3 data present, load the world as GM. Every track appears exactly
    as before, now in **Progress** mode, with its value, target and polarity
    unchanged and no console errors.

**Progress rules**

7. Create a track. It defaults to **Positive**.
8. Press `-` at 0. The value stays at 0.
9. Fill a track to its target. The status reads **Complete** and the ring closes.
10. Press `+` again. The increase is refused with a notification.
11. Turn on **Allow Progress Beyond Target** and press `+`. The value rises past
    the target; the ring stays visually full.

**Polarity**

12. Set a track to **Negative**. Its numbers, ring and badge turn red, in both
    the HUD and the panel, and the badge reads "Negative" with a down arrow.
13. Log in as a player. The negative track is red there too.

**Rings**

14. With rings on, check a track at 0 (empty ring), part-way (partial arc), and
    at/over target (full ring plus halo).
15. Turn **Show Progress Rings** off. Every track falls back to the figure and
    bar; no layout breaks.

**Rune circles**

16. Create a progress track with target 8 and Display **Rune circle**. Eight
    runes sit adrift outside the ring, dim and tilted.
17. Press `+` eight times. Each press slides exactly one more rune into its seat,
    in order, and the newest one is marked. At 8 the track reads **Complete**.
18. Press `-`. The last rune drifts back out.
19. Switch Display back to **Standard** and apply. The bar or ring returns and
    the value is unchanged. Switch back: the circle returns.
20. Give the faction ladder from above Display **Rune circle**. Five runes, one
    per band; at value 6 three are seated and the third is marked as the current
    band, tinted with that band's tone.
21. Open **Runes** on that track, set a glyph and a name on one seat, and save.
    The circle shows them. Add a new rung *below* that band in **Edit
    Thresholds**: the override stays on the band it was written for.
22. Set a progress track's target to 60. The card falls back to its standard
    readout and the panel explains why. Lower it to 8: the circle comes back
    without the display having to be re-picked.
23. Give a threshold track Display **Rune circle** before writing any rungs. The
    card falls back and the **Runes** button is disabled.
24. Turn **Show Players Every Threshold** off and log in as a player. Seated
    runes name themselves in a tooltip; unearned ones read "Not yet revealed".

**Layout and resizing**

25. Open 1, 3, 4, 6 and 10 tracks in turn. At each count, drag the HUD's
    bottom-right grip from narrow to wide and confirm the cards reflow from one
    column to two to three.
26. With 10 tracks open, confirm the resize grip is still visible and draggable.
27. Confirm a scrollbar appears only when the cards actually reach the bottom of
    the screen, and disappears again when the HUD is widened.
28. Open the control panel with 4+ tracks. Drag its bottom-right corner: it
    resizes, the cards reflow, and it refuses to go below 380×320.
29. Add and remove a track with the panel open. It refits to the viewport rather
    than growing off screen.
30. Turn on **Reduce Motion** in the OS. Nothing animates; every state is still
    readable.

**Threshold tracks**

31. Create a threshold track with Start 6, Min 0, Max 12 and the five bands from
    the table above. The HUD shows the value, the band *Uneasy Truce*, and a
    ladder with five ticks.
32. Press `+` three times. At 9 the band becomes *Trusted* and one chat card is
    posted naming it and quoting its description.
33. Press `-` once, to 8. The band returns to *Uneasy Truce* and a card announces
    the fall. Press `-` again, to 7. No card: the band did not change.
34. Set the value to 12 from 0 in one step. One card is posted, naming *Sworn
    Allies* and listing *Strained*, *Uneasy Truce* and *Trusted* as passed
    through — but only if that band's **Announce This Band** is on; with it off
    (as in the API example) no card appears.
35. Press `-` at the Minimum and `+` at the Maximum. The value does not move and
    a notification explains which bound was hit.
36. Set Min to -5 and press `-` past 0. The value goes negative, the band reads
    *Below the first threshold*, and the ladder marker sits left of every tick.
37. Turn **Announce Band Changes** off and cross a band. No card. Turn
    **Announce in Chat** off as well and adjust the value: still no card. Turn
    band announcements back on and cross a band: exactly one card.
38. Turn the world setting **Post Progress to Chat** off. No card is posted for
    either kind of change, on any track.
39. Open **Edit Thresholds**, add a rung with the same value as an existing one,
    and save. One is dropped with a notification explaining why; the ladder stays
    sorted. Rewriting the ladder posts no chat card.
40. Click **Reset to Start**. The confirmation names the starting value, and the
    track returns to it.
41. With **Show Players Every Threshold** off, log in as a player. The band name,
    its description and the tick positions are visible; the other bands' numbers
    are not. Turn the setting on: the numbers appear.
42. Switch a threshold track to **Progress** mode and back. The ladder is still
    there, and no chat card was posted for either switch.
43. Collapse the HUD. The threshold chip shows the value and band name, with no
    `/ target`.

**Terminology**

44. Search the HUD, panel, dialogs, chat cards and settings for the word
    "successes". It should not appear.

**Permissions and sync**

45. As a player, try the API: `game.modules.get("victory-counter").api
    .increase(id)`. It is refused with a GM-only notification.
46. With a GM and a player connected, change a track on the GM screen. The
    player's HUD updates immediately without a reload.
47. Hide a track from players. It disappears from the player HUD, and its chat
    cards are whispered — including band-change cards.

**Systems**

48. Load the same world under a different game system (or a second world running
    one). The HUD, panel, chat cards and settings all behave identically and the
    console stays clean.

Console must stay clean throughout.

## Data safety

The module writes **only** world-scoped settings for track data, the undo
snapshot, the schema version and the pre-schema-3 backup, plus per-user display
preferences. It never creates, updates or deletes Actors, Items, Scenes,
Journals, Effects or any other world document, and it never touches any game
system's data. Disabling or uninstalling the module leaves your world unchanged.

Upgrading from the PF2e-only build reads the old `pf2e-victory-counter`
settings once and copies the tracks across. It never writes to or deletes the
old namespace, so reinstalling that build recovers the original world as it
was. Per-user display preferences (anchor, width, scale, collapsed state) are
not carried over and are simply set again on first use.

## Compatibility

| | |
|---|---|
| Foundry VTT | v14 (verified 14.366) |
| Game system | Any — no system is declared or required |
| Dependencies | None |

The module declares no `relationships.systems` entry, so Foundry offers it in
every world. It reads and writes only its own settings, which is what makes that
safe rather than merely permitted.

## Design

The HUD is a port of variant **1a** ("party total — the by-the-book panel") from
the Nocturne *Victory Points HUD* design, with the compact bar from variant 1e
as the collapsed state.

Deliberate deviations from the source design:

- **Negative colour.** Nocturne is a mono-accent system with no danger role. The
  accent carries progress on a positive track; `--pvc-negative` (`#ef7f6e`,
  5.81:1 against the card surface) is the single sanctioned extension and is
  used only for negative-polarity tracks — always alongside an icon and a
  written label, never as the only signal.
- **No web font.** The design loads Inter from Google Fonts. The module asks for
  Inter and falls back to Foundry's UI face instead, so worlds running offline
  never flash an unstyled counter. Install Inter locally to get the intended look.
- **Progress rings.** Not in the source design; added as an optional readout
  that replaces the figure-plus-bar when the GM enables it.
- **No round counter.** The design's "Round 3" slot shows track status instead.

Icons are [Phosphor](https://phosphoricons.com/) (MIT), inlined as SVG on
`currentColor`.

## License

[MIT](LICENSE). Contains no Paizo or Foundry Gaming intellectual property.
