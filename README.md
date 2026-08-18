# PF2e Victory Counter

A shared, always-visible progress counter for **Pathfinder 2e Remaster**
subsystem challenges in **Foundry VTT v14**.

The GM creates any number of named tracks, gives each one a target and a
positive or negative polarity, and adjusts progress as the scene plays out.
Every player sees the same live state in a collapsible on-screen HUD.

> The module folder is [`pf2e-victory-counter/`](pf2e-victory-counter) — that
> name must match `module.json.id`, which is why it is a subfolder of this repo
> rather than the repo root.

## Features

- **Shared state.** Up to 10 concurrent tracks, stored in a world setting and
  broadcast to every connected client automatically. No custom socket, no
  desync.
- **One target per track.** A track has a name, a target, a current value and a
  polarity. It completes when `current >= target`. Progress can never go below
  zero.
- **Positive and negative tracks.** Positive is the default and keeps the
  module's accent colour. Negative tracks show their progress numbers and ring
  in red — plus an arrow icon and the written word *Negative*, so the
  distinction survives colour-blindness, greyscale and screen readers.
- **Circular progress rings.** Optional (world setting, on by default). Pure SVG
  and CSS, with `current / target` in the centre, clamped to 100%.
- **Responsive layout.** Cards reflow through CSS Grid: one column when narrow,
  two or three when wide. Both windows are resizable and only scroll when they
  genuinely run out of screen.
- **Draggable, resizable HUD.** Grab the title bar to move it, the bottom-right
  grip to resize it. Double-click either to reset. Position, width, scale and
  collapsed state are per-user.
- **Compact mode.** Collapses to one slim chip per track.
- **GM quick controls.** `-` / `+` and a "set" field on the HUD itself, plus a
  full control panel. The eye button toggles player visibility in one click.
- **Hide from players.** Run a track the party cannot see; chat cards are
  whispered to GMs while it is hidden.
- **Undo.** Every change stores a one-level snapshot that the GM can restore.
- **Macro API** for automation.

## Installation

### From a manifest URL

1. In Foundry, go to **Add-on Modules → Install Module**.
2. Paste:
   `https://github.com/sargas79/Victory-Counter/releases/latest/download/module.json`
3. Click **Install**, then enable the module in your world.

### Local development

Copy or symlink the `pf2e-victory-counter/` folder into your Foundry user data
directory so the path is:

```
<FoundryUserData>/Data/modules/pf2e-victory-counter/
```

The folder name must be exactly `pf2e-victory-counter`. Restart Foundry, then
enable **PF2e Victory Counter** in **Game Settings → Manage Modules**.

On Windows, a symlink from an admin PowerShell prompt:

```powershell
New-Item -ItemType SymbolicLink -Path "$env:LOCALAPPDATA\FoundryVTT\Data\modules\pf2e-victory-counter" -Target "C:\path\to\Victory-Counter\pf2e-victory-counter"
```

## Usage

### Gamemaster

1. Select the **Token** scene controls; click the **sliders** icon
   (*Victory Counter Controls*).
2. Fill in the track name, the **Target**, and the **Type**
   (*Positive* or *Negative*).
3. Leave **Visible to Players** on so the party can see the track; turn it off
   to run a hidden one.
4. Click **Add Track**. Repeat for as many tracks as the scene needs.
5. During play, use `-` / `+` in the panel or directly on the HUD. To jump to a
   value, type it into the track's "set" field and press Enter.
6. **Undo Last Change** reverts the most recent change. **Reset Progress**
   zeroes a track but keeps its setup. **End Track** removes it from every
   screen.

Resetting or ending a track always asks for confirmation first.

By default a track that has reached its target refuses further increases. Turn
on **Allow Progress Beyond Target** in the module settings if you want a track
to keep counting past the finish line.

### Players

- The HUD appears automatically when the GM starts a visible track.
- Drag it by the title bar to get it out of your way; double-click the bar to
  snap it back to your anchor.
- Drag the grip in the bottom-right corner to resize it — a wider HUD lays the
  track cards out in two or three columns. Double-click the grip to reset.
- Use the chevron to collapse it to compact chips, or the `x` to hide it.
- Reopen it from the **Token** scene controls (*Show/Hide Victory Counter*,
  trophy icon).
- Anchor, width and scale live in **Game Settings → Configure Settings → PF2e
  Victory Counter** and are personal to you.

Only the GM can create, rename, configure, retype, delete or adjust a track.
Players see the name, the Positive/Negative indicator, the current value against
the target, the ring (when enabled) and the completion state.

### Macro API

```js
const vc = game.modules.get("pf2e-victory-counter").api;

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

All mutating calls are GM-only and fail with a notification for other users.

`addSuccess()` and `setCounts()` still work as deprecated aliases for
`increase()` and `setProgress()`. `addFailure()` was removed in 3.0 — model a
"bad" track as a separate negative track instead.

## Data schema

One world setting (`tracks`) holds an array of:

```json
{
  "schema": 3,
  "id": "unique-track-id",
  "active": true,
  "title": "Raise the Alarm",
  "type": "negative",
  "current": 2,
  "target": 5,
  "visibleToPlayers": true,
  "status": "running",
  "lastChange": { "delta": 1, "time": 1755400000000 },
  "legacy": null
}
```

`status` is derived, never authored: `complete` when `current >= target`,
otherwise `running`. `legacy` holds the pre-3.0 failure fields of a migrated
track, and is never read at runtime.

Upgrading from 2.x migrates `successes → current` and
`requiredSuccesses → target`, defaults every track to `type: "positive"`, and
preserves the failure fields under `legacy`. The migration is versioned and
idempotent, writes a one-time verbatim backup to a hidden `legacyBackup`
setting, and deletes nothing. See the
[changelog](pf2e-victory-counter/CHANGELOG.md) for the full table.

## Manual test plan

Run these in a v14 world with the current PF2e system. Everything except the
two-client checks can be done in a single GM session.

**Migration**

1. With 2.x data present, load the world as GM. The tracks appear with their old
   success totals as the current value and their old required-successes as the
   target, all marked *Positive*, with no console errors.
2. Enable **Debug Logging** and reload. The console prints one migration summary
   line; a second reload prints "already at schema 3 — nothing to do."
3. Hand-edit a track's stored data to remove `target`, or set it to `null`. It
   reloads with a safe default instead of throwing.

**Progress rules**

4. Create a track. It defaults to **Positive**.
5. Press `-` at 0. The value stays at 0.
6. Fill a track to its target. The status reads **Complete** and the ring closes.
7. Press `+` again. The increase is refused with a notification.
8. Turn on **Allow Progress Beyond Target** and press `+`. The value rises past
   the target; the ring stays visually full.

**Polarity**

9. Set a track to **Negative**. Its numbers, ring and badge turn red, in both
   the HUD and the panel, and the badge reads "Negative" with a down arrow.
10. Log in as a player. The negative track is red there too.

**Rings**

11. With rings on, check a track at 0 (empty ring), part-way (partial arc), and
    at/over target (full ring plus halo).
12. Turn **Show Progress Rings** off. Every track falls back to the figure and
    bar; no layout breaks.

**Layout and resizing**

13. Open 1, 3, 4, 6 and 10 tracks in turn. At each count, drag the HUD's
    bottom-right grip from narrow to wide and confirm the cards reflow from one
    column to two to three.
14. With 10 tracks open, confirm the resize grip is still visible and draggable.
15. Confirm a scrollbar appears only when the cards actually reach the bottom of
    the screen, and disappears again when the HUD is widened.
16. Open the control panel with 4+ tracks. Drag its bottom-right corner: it
    resizes, the cards reflow, and it refuses to go below 380×320.
17. Add and remove a track with the panel open. It refits to the viewport rather
    than growing off screen.
18. Turn on **Reduce Motion** in the OS. Nothing animates; every state is still
    readable.

**Terminology**

19. Search the HUD, panel, dialogs, chat cards and settings for the word
    "successes". It should not appear.

**Permissions and sync**

20. As a player, try the API: `game.modules.get("pf2e-victory-counter").api
    .increase(id)`. It is refused with a GM-only notification.
21. With a GM and a player connected, change a track on the GM screen. The
    player's HUD updates immediately without a reload.
22. Hide a track from players. It disappears from the player HUD, and its chat
    cards are whispered.

Console must stay clean throughout.

## Data safety

The module writes **only** world-scoped settings for track data, the undo
snapshot, the schema version and the pre-3.0 backup, plus per-user display
preferences. It never creates, updates or deletes Actors, Items, Scenes,
Journals, Effects or any other world document, and it never touches PF2e system
data. Disabling or uninstalling the module leaves your world unchanged.

## Compatibility

| | |
|---|---|
| Foundry VTT | v14 (verified 14.365) |
| Game system | Pathfinder 2e (Remaster) |
| Dependencies | None |

The counter itself is system-agnostic; it is declared for and tested with PF2e
only. If run under another system it logs a console warning and continues.

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
