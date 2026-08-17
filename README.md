# PF2e Victory Counter

A shared, always-visible victory point counter for **Pathfinder 2e Remaster**
subsystem challenges in **Foundry VTT v14**.

The GM initializes a challenge, sets how many successes are required (and
optionally how many failures end it), and adjusts progress as the scene plays
out. Every player sees the same live state in a collapsible on-screen overlay.

> The module folder is [`pf2e-victory-counter/`](pf2e-victory-counter) — that
> name must match `module.json.id`, which is why it is a subfolder of this repo
> rather than the repo root.

## Features

- **Shared state.** One challenge at a time, stored in a world setting and
  broadcast to every connected client automatically. No custom socket, no
  desync.
- **Success + failure tracks.** Two counters in one HUD, each with its own bar,
  threshold (1-100) and controls. The failure track is optional per challenge.
- **Draggable HUD.** Grab the title bar to move it anywhere; double-click the
  bar to snap back to your configured anchor. Position, scale and collapsed
  state are per-user.
- **Compact mode.** Collapses to a slim bar: label, figure, progress and the
  failure readout.
- **GM quick controls.** `-` / `+` and a "set" field on the HUD itself, plus a
  full control panel. The eye button toggles player visibility in one click.
- **Hide from players.** Run a challenge the party cannot see; chat cards are
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
New-Item -ItemType SymbolicLink `
  -Path "$env:LOCALAPPDATA\FoundryVTT\Data\modules\pf2e-victory-counter" `
  -Target "C:\path\to\Victory-Counter\pf2e-victory-counter"
```

## Usage

### Gamemaster

1. Select the **Token** scene controls; click the **sliders** icon
   (*Victory Counter Controls*).
2. Fill in the challenge name and the number of successes required.
3. Optionally enable **Track Failures** and set how many failures are allowed.
4. Leave **Visible to Players** on so the party can see the counter; turn it off
   to run a hidden challenge.
5. Click **Start Challenge**.
6. During play, use `-` / `+` in the panel or directly on the HUD. To jump to a
   value, type it into the counter's "set" field and press Enter.
7. **Undo Last Change** reverts the most recent change. **Reset Counts** zeroes
   both tracks but keeps the setup. **End Challenge** removes the counter from
   every screen.

Restarting or ending a challenge always asks for confirmation first.

### Players

- The counter appears automatically when the GM starts a visible challenge.
- Drag it by the title bar to get it out of your way; double-click the bar to
  snap it back to your anchor.
- Use the chevron to collapse it to a compact bar, or the `x` to hide it.
- Reopen it from the **Token** scene controls (*Show/Hide Victory Counter*,
  trophy icon).
- Anchor and scale live in **Game Settings → Configure Settings → PF2e
  Victory Counter** and are personal to you.

### Macro API

```js
const vc = game.modules.get("pf2e-victory-counter").api;

// Start a 6-success chase with 3 failures allowed
await vc.start({
  title: "Escape the Ashen Vault",
  requiredSuccesses: 6,
  trackFailures: true,
  requiredFailures: 3,
  visibleToPlayers: true
});

await vc.addSuccess();      // +1 success
await vc.addFailure(2);     // +2 failures
await vc.setCounts(4, 1);   // set both directly
await vc.undo();            // revert the last change
await vc.end();             // clear the counter

vc.getChallenge();          // read the current state
```

All mutating calls are GM-only and fail with a notification for other users.

## Data safety

The module writes **only** two world-scoped settings
(`challenge` and `undoBuffer`) plus per-user display preferences. It never
creates, updates or deletes Actors, Items, Scenes, Journals, Effects or any
other world document, and it never touches PF2e system data. Disabling or
uninstalling the module leaves your world unchanged.

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
as the collapsed state, adapted from a single pool to two counters.

Three deliberate deviations from the source design:

- **Failure colour.** Nocturne is a mono-accent system with no danger role. The
  accent is reserved for progress toward victory, so the failure counter uses
  the neutral ramp — quieter by one step in size and colour. `--pvc-danger`
  (`#c2705f`) is the only added colour and appears solely in the "challenge
  lost" treatment.
- **No web font.** The design loads Inter from Google Fonts. The module asks for
  Inter and falls back to Foundry's UI face instead, so worlds running offline
  never flash an unstyled counter. Install Inter locally to get the intended look.
- **No round counter.** The design's "Round 3" slot shows challenge status
  instead; round tracking was out of scope for 1.0.

Icons are [Phosphor](https://phosphoricons.com/) (MIT), inlined as SVG on
`currentColor`.

## License

[MIT](LICENSE). Contains no Paizo or Foundry Gaming intellectual property.
