# @lambersond/3d-dice-engine

A **vendored fork** of [`@3d-dice/dice-box-threejs`](https://github.com/3d-dice/dice-box-threejs): a 3D dice engine built on [three.js](https://threejs.org/) and [cannon-es](https://github.com/pmndrs/cannon-es). It renders dice into a DOM canvas, simulates the physics throw, and either lands the dice on predetermined values (deterministic) or reads the result off the physics (non-deterministic).

## Features

- **Real physics dice**: three.js rendering + cannon-es simulation; dice tumble,
  collide, and settle on a configurable surface, with optional shadows and impact
  sounds. Supports d4/d6/d8/d10/d12/d20 and percentile d100 (a d100 + d10 pair).
- **Deterministic _and_ non-deterministic rolls**: bake the values into the
  notation (`4d20@11,20,3,13`) and the dice are made to land on them (so every
  client agrees); omit them (`4d20`) and the result is whatever the physics gives,
  read off the landed faces and returned to the caller.
- **Concurrent, coalescing throws**: a roll joins the live table instead of
  waiting for the previous one to settle. Per-throw cannon collision groups
  isolate deterministic throws so their predetermined landings can't be disturbed;
  non-deterministic throws share a group and tumble into each other.
- **Per-throw colour**: each `roll`/`add` carries its own theme (colorset /
  material), so a burst of rolls from different players keeps everyone's colours.
- **Per-throw timed removal**: every throw leaves on its own schedule once its
  dice rest: a `shrink` or `fade` exit after a configurable dwell, independent of
  other dice still on the table (and of new throws arriving).

## DiceBox API

> This is the published type seam ([`types/index.d.ts`](./types/index.d.ts)). The
> `DiceBox` is **stateful and browser-only** (it owns a `<canvas>`, the three.js
> scene, and the cannon world); apps normally drive it through core's
> `DiceRenderer` rather than constructing it directly.

### Construction

```ts
import DiceBox from '@lambersond/3d-dice-engine'

const box = new DiceBox('#dice-canvas', { assetPath: '/3d-dice/', sounds: true })
await box.initialize() // build renderer/scene/world, load the theme + sounds
```

`new DiceBox(container, options?)`: `container` is a CSS selector for the element
to mount the canvas into; `options` is a partial config (table below). Call
`initialize()` once before throwing.

### Throwing dice

```ts
// deterministic: the dice are made to land on these values
await box.roll('2d20@18,4', { theme: { theme_colorset: 'fire' } })

// non-deterministic: physics decides; resolves with the landed faces, in order
const landed = await box.roll('2d20') // e.g. [18, 4]

// join the live table mid-tumble, with a custom removal (roll() also joins)
await box.add('1d6', { removal: { style: 'fade', dwellMs: 2000 } })
```

| Method | Description |
| --- | --- |
| `initialize()` | Build renderer/scene/world; load the theme and (optional) sounds. Await before throwing. |
| `roll(notation, options?)` | Throw dice into the live table (joins what's there, or starts fresh when empty). Resolves with the values the dice landed on (in notation order) once _its own_ dice rest. |
| `add(notation, options?)` | Explicitly join the live table. (`roll` delegates here.) |
| `reroll(diceIdArray)` | Re-throw the named dice as a fresh group. |
| `clearDice()` | Immediately remove every die (explicit teardown; does **not** fire `onEmpty`). |
| `updateConfig(options?)` | Merge new config (e.g. change the default theme/surface between rolls). |

`options` is a **`RollOptions`**:

| Field | Type | Description |
| --- | --- | --- |
| `theme` | `Partial<DiceBoxOptions>` | Colorset/material bound to just this throw's dice. |
| `removal` | `RemovalOptions` | When/how this throw's dice leave the table. |
| `onSpawned` | `() => void` | Fires once the dice exist in the world (before they settle), so a caller can let a concurrent throw join. |

**`RemovalOptions`** (all optional):

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `style` | `'shrink' \| 'fade'` | `'shrink'` | Exit animation: scale to nothing, or fade opacity. |
| `dwellMs` | `number` | `1000` | How long the dice rest before they leave. |
| `durationMs` | `number` | `450` | Exit animation length. |

### Options (`DiceBoxOptions`)

Passed to the constructor or `updateConfig` (all partial). Keys are dice-box's
original snake_case.

| Option | Default | Description |
| --- | --- | --- |
| `assetPath` | `'./'` | Base URL for `textures/` and `sounds/` (see **Assets**). |
| `sounds` | `false` | Load + play impact sounds. |
| `volume` | `100` | Sound volume (0–100). |
| `shadows` | `true` | Cast/receive shadows. |
| `theme_surface` | `'green-felt'` | Table surface (also selects the surface sound set). |
| `theme_colorset` | `'white'` | Default dice colorset. |
| `theme_customColorset` | `null` | A one-off custom colorset object (overrides `theme_colorset`). |
| `theme_material` | `'glass'` | Default dice material (`none`/`glass`/`metal`/`wood`/…). |
| `theme_texture` | `''` | Default face texture. |
| `gravity_multiplier` | `400` | Gravity scale. |
| `light_intensity` | `0.7` | Scene light intensity. |
| `strength` | `1` | Throw strength. |
| `framerate` | `1 / 60` | Physics step. |
| `iterationLimit` | `1000` | Safety cap on settle iterations. |

### Completion callbacks & events

Each is a config callback; the engine also dispatches a matching DOM
`CustomEvent` (its `detail` is the same payload), so you can subscribe without
holding the box:

| Callback / event | Fires when |
| --- | --- |
| `onRollComplete` / `rollComplete` | The first throw onto an empty table settles. |
| `onAddDiceComplete` / `addDiceComplete` | Any throw's own dice settle; every throw reports here. |
| `onRerollComplete` / `rerollComplete` | A `reroll()`'s dice settle. |
| `onRemoveDiceComplete` / `removeDiceComplete` | Dice are taken off the table programmatically. |
| `onEmpty` | The table fully drains via timed removal (not an explicit `clearDice`). |

## Custom dice textures (stub)

> **Not implemented yet**: this is the intended shape, captured so we can pick it
> up later.

A dice "texture" is the image skinned under the numbers. Built-ins live in
[`public/3d-dice/textures/`](./public/3d-dice/textures) and are referenced by a
colorset's `texture` field, an object the engine loads relative to `assetPath`:

```ts
{ name, composite, source: 'textures/marble.webp', source_bump?, material? }
```

To support **user-provided** textures the plan is:

1. Accept a `texture` object whose `source` (and optional `source_bump`) is an
   absolute `https:` / `data:` / `blob:` URL, passed via `theme_customColorset`.
2. In `DiceColors.getTexture`, pass an object straight through instead of only
   resolving built-in names; in `loadImage`, skip the `assetPath` prefix for
   absolute sources.
3. Surface it from core (a `customTexture` on `RollTheme` → `themeToBoxConfig`).

**Caveat:** a cross-origin image without CORS headers taints the canvas and WebGL
refuses it (`crossOrigin = 'anonymous'` is already set, so the _host_ must send
the headers). The texture skins the whole die, not individual faces.

## Why it's vendored

We forked rather than depend on the upstream package so we can fix two
limitations that are baked into the published build:

1. **Concurrent throws.** Upstream `startClickThrow()` clears the table whenever
   a throw is in progress, so a second roll can only spawn after the first
   settles. We want bursts (multiple players rolling within a moment) to spawn
   into the live physics world and tumble together.
2. **Per-die colour.** Upstream applies a single global colorset per throw. We
   want each die to carry its own roller's theme, so a coalesced burst keeps
   everyone's colours.

Owning the engine dissolves the concurrency-vs-colour tradeoff that the external
build forces. Upstream
[issue #6](https://github.com/3d-dice/dice-box-threejs/issues/6) ("multiple rolls
with different dice textures") reports this exact gap, still open with no fix.

## Provenance

- Upstream: https://github.com/3d-dice/dice-box-threejs
- Forked from commit `6945e00` (v0.0.12, 2022-10-26)
- License: MIT © 2022 3D Dice (Frank Ali); see [LICENSE](./LICENSE). Lineage
  traces to MajorVictory's 3D Dice roller / "Dice So Nice".

Both `src/` and `public/` were vendored; the textures and sounds are the dice's
sight and sound, so they ship with the engine (see **Assets** below).

### Upstream fixes applied

Bug fixes cherry-picked from upstream PRs/forks (logic only, none of their
packaging or formatting changes):

- [PR #21](https://github.com/3d-dice/dice-box-threejs/pull/21): `add()` wakes
  the freshly-added dice, which `simulateThrow()` leaves sleeping (otherwise
  `throwFinished()` returns immediately and they never animate).
- [PR #20](https://github.com/3d-dice/dice-box-threejs/pull/20): `reroll()`
  resets `last_time` so the animation starts from the beginning instead of
  fast-forwarding by the gap since the previous roll settled.

## Assets

The engine renders dice faces from **textures** and plays **sounds** on impact;
these ship namespaced under [`public/3d-dice/`](./public/3d-dice):

- `public/3d-dice/textures/`: 38 face/material textures. **Required**: without
  them the dice render untextured.
- `public/3d-dice/sounds/`: 75 impact clips (`dicehit/`, `surfaces/`).
  **Optional**: pass `sounds: false` to skip loading them.

At runtime the engine loads them from a configurable base URL (`assetPath`),
under which it expects `textures/…` and `sounds/…` directly. As with the upstream
package, **the consumer hosts the files**: copy `public/3d-dice/` into your app's
static directory and point `assetPath` at it, e.g. copy to
`your-app/public/3d-dice/` and set `assetPath: '/3d-dice/'`. The `3d-dice/`
namespace keeps these from colliding with your own `textures/`/`sounds/` folders.

## Status

Vendored from upstream and **converted to TypeScript** (pragmatic typing,
behaviour preserved) on **three 0.184** + cannon-es. The port is intended to be
faithful; no behavioural changes yet. Planned phases:

| Phase | Change |
| ----- | ------ |
| 0 ✅  | Vendor upstream `src/` + assets; convert to TypeScript on three 0.184. |
| 1 ✅  | Drive it from core's `DiceRenderer` (no app changes). Core dynamically imports the engine, app transpiles it, type-checks via a `.d.ts` seam, `next build` bundles it; runtime parity confirmed in-browser. |
| 2 ✅  | Per-roller colour. `roll`/`add` take an optional per-throw `theme`, applied to the factory just before that call spawns its dice (materials bake per-die at `create()`), so a coalesced burst keeps each roller's colours; no global-state race with a separate `updateConfig`. Threaded through `DiceRenderer.roll({ theme })` and the app's `use-roll-executor`. Runtime confirmed in-browser (per-roller burst colours across two browsers). |
| 3 ✅  | Concurrent bursts. A later roll spawns into the LIVE tumble instead of waiting for the previous to settle: per-throw cannon collision groups isolate throws (a die hits the table + its own throw, never another's) so predetermined landings hold; `add()` pre-simulates only the new dice (freezing/restoring the in-flight ones) to swap their faces first; one continuous loop services every die (each throw now resolves the moment its own dice rest, see Phase 5). `DiceRenderer` serializes only the spawn (engine `onSpawned`), not the animation. Cost: dice from different deterministic throws can visually overlap (collision-isolated). Runtime confirmed in-browser: rapid-fire from one user + near-simultaneous rolls across two browsers. |
| 3b ✅ | Non-deterministic interaction. A throw whose notation has no `@values` lands on whatever physics gives, so it has nothing to protect: such throws share one collision group and run live (no pre-sim/replay; value read at the real landing), so concurrent non-deterministic rolls actually collide and tumble with each other. They still never collide with deterministic dice (whose `@values` stay guaranteed). Inferred from the notation; deterministic throws are unchanged. The app's `/lonely` route drives this path (bare notation → physics-read results via `executeNonDetRoll`); rooms stay deterministic (`@values`). Runtime confirmed in-browser. |
| 4 ⏸   | Interaction: pointer hover/click dice selection. **On hold**, see _Deferred: Phase 4_ below. |
| 5 ✅  | Per-roll removal, continuous table. `roll`/`add` take an optional `removal: { style, dwellMs, durationMs }`; the engine (which owns the meshes, render loop, and physics world) owns the timed exit that core's `DiceRenderer` used to hardcode. Every throw is tracked as its own group (dice + resolver + removal spec) and **a roll now joins the live table rather than clearing it**, so a settled throw leaves even as new dice are still tumbling in. One loop services all groups, but each resolves the moment _its own_ dice rest (not when the whole table does; this also removes the rapid-fire animation timeout), then dwells and plays its own exit (`shrink` scales to nothing, `fade` lerps opacity) and leaves independently; an exiting throw stops colliding so arrivals pass through it. When the last group leaves, the engine fires `onEmpty` (core hides the overlay). Default with no option = `shrink` @ 1000ms dwell + 450ms anim. `drop`/`scatter` (physics-driven) are a deliberate fast-follow; they revive settled bodies, more than the visual-only lerp. Runtime confirmed in-browser: rapid-fire from one user + near-simultaneous rolls across two browsers. |

## Deferred: Phase 4, interaction (hover / click), on hold

Picking dice with the pointer (hover + click → a die-info callback/event), so the
app can highlight a die or open its log entry. Parked intentionally; this section
is the resume kit.

**Basis:** upstream [PR #17](https://github.com/3d-dice/dice-box-threejs/pull/17)
(via the `@drdreo` fork), verbatim shape to port:

- **Config:** `enableDiceSelection: false`, `onDiceHover(info|null)`, `onDiceClick(info)`.
- **Constructor:** a `THREE.Raycaster`, a pointer `THREE.Vector2`, and a `hoveredDice` ref.
- **Listeners (only when enabled):** pointer-move + click on `this.container`.
- **On move:** NDC from `container.getBoundingClientRect()` → `raycaster.setFromCamera(pointer, camera)` → `intersectObjects(this.diceList)`; on a *change* of hovered die, emit the die-info; on exit, emit `null`.
- **On click:** if a die is hovered, emit its die-info.
- **Die-info:** `getDiceResults(id)` extended with `position` (3D), `screenPosition` (2D), `scale`; delivered via the callbacks **and** `diceHover` / `diceClick` `CustomEvent`s.
- **`getScreenPosition(pos)`:** `pos.clone().project(camera)` → `x = (v.x*0.5+0.5)*rect.width`, `y = (-v.y*0.5+0.5)*rect.height`.

**Adapt for our port (decisions already made):**

- Use **pointer events** (`pointermove`/`pointerdown`), not mouse, for touch.
- Skip the PR's packaging/format churn; cherry-pick the selection logic only.
- Surface config + callbacks/events through core's `DiceRenderer` (the stable seam); don't expose `DiceBox` directly.
- Land it **after** Phases 2/3/3b are runtime-confirmed (it iterates `diceList`/projects per-die state, the same surface those reshape).
- Ship a **`dispose()`** that removes these listeners, and fold in the existing **resize listener** (added in `resizeWorld`, currently never removed) so teardown is leak-free.

## Tooling note

Although now TypeScript, this stays vendored third-party code and is
intentionally **excluded** from the repo's ESLint and Prettier (see the root
`eslint.config.mjs` ignores and `.prettierignore`) so its structure remains easy
to diff against upstream until we converge it to our conventions.
