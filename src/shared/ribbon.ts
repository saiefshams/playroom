export const TRAIL_MS = 3500
export const MAX_DRIVERS = 8

export const RIBBON_COLORS = [
  '#ff5a5f',
  '#3ddc97',
  '#4c9aff',
  '#f5c542',
  '#c084fc',
  '#ff8a3d',
  '#2ee6d6',
  '#ff6eb4',
]

export interface TrailPoint {
  x: number
  y: number
  t: number
}

export interface Driver {
  seatIndex: number
  x: number
  y: number
  angle: number
  trail: TrailPoint[]
}

export interface RibbonState {
  drivers: Driver[]
}

export interface RibbonFrame {
  serverNow: number
  seatIndex: number
  x: number
  y: number
  angle: number
  t: number
}

export function createRibbon(): RibbonState {
  return { drivers: [] }
}

export function spawnPoint(index: number): { x: number; y: number } {
  const col = index % 4
  const row = Math.floor(index / 4)
  return { x: 0.18 + col * 0.21, y: 0.3 + row * 0.38 }
}

export function addDriver(state: RibbonState, seatIndex: number): RibbonState {
  if (state.drivers.some((driver) => driver.seatIndex === seatIndex)) return state
  const spot = spawnPoint(seatIndex)
  return {
    drivers: [...state.drivers, { seatIndex, x: spot.x, y: spot.y, angle: -Math.PI / 2, trail: [] }],
  }
}

export function removeDriver(state: RibbonState, seatIndex: number): RibbonState {
  return { drivers: state.drivers.filter((driver) => driver.seatIndex !== seatIndex) }
}

export function pruneTrail(trail: TrailPoint[], now: number): TrailPoint[] {
  const cutoff = now - TRAIL_MS
  let start = 0
  while (start < trail.length && trail[start].t < cutoff) start += 1
  const pruned = start === 0 ? trail : trail.slice(start)
  return pruned.length > 90 ? pruned.slice(pruned.length - 90) : pruned
}

export function drive(
  state: RibbonState,
  seatIndex: number,
  x: number,
  y: number,
  angle: number,
  now: number,
): RibbonState | null {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(angle)) return null
  if (x < 0 || x > 1 || y < 0 || y > 1) return null
  if (!state.drivers.some((driver) => driver.seatIndex === seatIndex)) return null
  return {
    drivers: state.drivers.map((driver) => {
      if (driver.seatIndex !== seatIndex) return driver
      const last = driver.trail[driver.trail.length - 1]
      const moved = !last || Math.hypot(x - last.x, y - last.y) >= 0.004
      const trail = pruneTrail(moved ? [...driver.trail, { x, y, t: now }] : driver.trail, now)
      return { ...driver, x, y, angle, trail }
    }),
  }
}
