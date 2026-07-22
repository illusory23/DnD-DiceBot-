// Public type surface for @lambersond/3d-dice-engine.
//
// Hand-written on purpose: consumers (e.g. @lambersond/3d-dice-core's
// DiceRenderer) type against this stable seam and never pull the engine's
// implementation `.ts` into their own — stricter — type-check program. The
// engine is built with `noImplicitAny: false`, so loading its source under a
// consumer's `strict` config would surface internal implicit-any errors.
//
// Runtime still resolves to `./src/index.ts` (the `import`/`default` export
// condition, transpiled via the consumer's `transpilePackages`); this file is
// used only for the `types` condition. Keep it in sync with `src/DiceBox.ts`.
//
// eslint-disable camelcase -- engine config keys are snake_case

/**
 * A single die plus where it sits, emitted by the hover/click handlers when
 * `enableDiceSelection` is on. `position` is the world-space center;
 * `screenPosition` is that point projected to canvas pixels.
 */
export interface DiceEventData {
  type: string
  sides: number
  /** Index in the live dice list at event time (shifts as dice are removed). */
  id: number
  /** Stable per-die id (survives rerolls); use this to track a die over time. */
  dieId: number
  value: number
  reason: string
  position: { x: number; y: number; z: number }
  screenPosition: { x: number; y: number }
  scale: number
}

/** Options accepted by the `DiceBox` constructor and `updateConfig`. */
export interface DiceBoxOptions {
  assetPath: string
  framerate: number
  sounds: boolean
  volume: number
  color_spotlight: number
  shadows: boolean
  theme_surface: string
  sound_dieMaterial: string
  theme_customColorset: unknown
  theme_colorset: string
  theme_texture: string
  theme_material: string
  gravity_multiplier: number
  light_intensity: number
  baseScale: number
  strength: number
  iterationLimit: number
  onRollComplete: (results: unknown) => void
  onRerollComplete: (results: unknown) => void
  onAddDiceComplete: (results: unknown) => void
  onRemoveDiceComplete: (results: unknown) => void
  /** Fires when the table empties via timed removal (not an explicit clear). */
  onEmpty: () => void
  /** Attach pointer listeners so hover/click on visible dice are detected. */
  enableDiceSelection: boolean
  /** Fires with the die under the pointer, or null when it leaves all dice. */
  onDiceHover: (data: DiceEventData | null) => void
  /** Fires when a visible die is clicked. */
  onDiceClick: (data: DiceEventData) => void
  /** Attach pointer drag handlers so dice can be grabbed and flicked. */
  enableDiceDrag: boolean
  /** Disposition applied to a flicked/tapped die (default returns it home). */
  dragRemoval: RemovalOptions
  /** Right-click while holding a die drops another of the same type beside it. */
  enableDiceAdd: boolean
  /** Fires when a grab-to-add die (or percentile pair) settles, with its value(s). */
  onDiceAdded: (results: unknown) => void
  /**
   * Solid interior wall across the table at this normalized y (-1..1); rolled
   * dice can't cross it, grabbed dice pass through. Omit for no barrier.
   */
  barrier?: number
}

/** A 3D vector, used for a die's launch velocity/position/spin. */
export interface Vec3 {
  x: number
  y: number
  z: number
}

/** How a throw's dice leave the table once their dwell elapses. */
export type RemovalStyle = 'shrink' | 'fade' | 'reset' | 'none'

/** Per-throw removal options; gaps fall back to the engine's defaults. */
export interface RemovalOptions {
  style?: RemovalStyle
  /** Rest time before the exit animation starts, ms (default 1000). */
  dwellMs?: number
  /** Exit animation duration, ms (default 450). */
  durationMs?: number
}

/** Per-throw options for `roll`/`add`. */
export interface RollOptions {
  /** Colorset bound to just this throw's dice. */
  theme?: Partial<DiceBoxOptions>
  /** When/how this throw's dice leave the table. */
  removal?: RemovalOptions
  /**
   * Fires once the dice exist in the world (before the throw settles), so a
   * caller can let a concurrent add() join the live tumble.
   */
  onSpawned?: () => void
  /**
   * Drop this throw's dice into the middle of the table instead of tumbling in
   * from the edge (used to seed a grabbable die in the center).
   */
  center?: boolean
}

export default class DiceBox {
  constructor(container: string, options?: Partial<DiceBoxOptions>)

  initialize(): Promise<void>
  /**
   * Throws dice into the live table. A roll joins whatever is already there
   * (or starts fresh when empty) and resolves the moment ITS OWN dice rest —
   * not when the whole table does — then its dice leave on their own removal
   * schedule, even while other throws are still tumbling or arriving.
   */
  roll(notation: string | string[], options?: RollOptions): Promise<unknown>
  /** Alias of {@link roll}: explicitly join the live table. */
  add(notation: string | string[], options?: RollOptions): Promise<unknown>
  reroll(
    diceIdArray: number[],
    options?: {
      removal?: RemovalOptions
      /** Launch velocity (world units/sec); defaults to a straight-up flick. */
      velocity?: Vec3
      /** Start position to teleport the die to before launching. */
      position?: Vec3
      /** Angular velocity (spin) imparted on launch. */
      angular?: Vec3
    },
  ): Promise<unknown>
  /** Take dice off the table by index (e.g. a "set aside" action). */
  remove(diceIdArray: number[]): Promise<unknown>
  /**
   * Place a single die at a normalized (-1..1) table coordinate (0,0 = center),
   * resting flat with `value` showing up. Instant (no tumble); `grabbable` only
   * applies when the box has `enableDiceDrag`. `orientation` (degrees, yaw about
   * the vertical axis) makes the pose deterministic so the same options reproduce
   * the same look; omit for a random orientation.
   */
  place(options: {
    type: string
    value: number
    x: number
    y: number
    grabbable?: boolean
    orientation?: number
  }): unknown
  /** Remove dice resting below a normalized y (-1..1), leaving the rest. */
  clearBelow(normalizedY: number): void
  clearDice(): void
  updateConfig(options?: Partial<DiceBoxOptions>): Promise<void>
  /** Stop the loop, drop dice, detach listeners + canvas, release the context. */
  dispose(): void

  // The renderer reads only the canvas, for WebGL context-loss handling; the
  // engine now owns the per-throw exit animation and dice lifecycle.
  readonly renderer: { domElement: HTMLCanvasElement }
}
