import { describe, expect, test } from 'vitest'
import { describeStatus } from './status'
import { clockMs, extractCode, formatClock, cleanChat, cleanName } from './text'
import { drive, pruneTrail, TRAIL_MS } from './ribbon'
import { addDriver, createRibbon } from './ribbon'

describe('text and clocks', () => {
  test('cleans names, chat, and room links', () => {
    expect(cleanName('  Ada   Lovelace  ')).toBe('Ada Lovelace')
    expect(cleanName('<script>')).toBe('script')
    expect(cleanName('   ')).toBeNull()
    expect(cleanChat('hello <there>\nfriend')).toBe('hello there friend')
    expect(extractCode('ab12cd')).toBe('AB12CD')
    expect(extractCode('https://play.example/room/HK7M2Q')).toBe('HK7M2Q')
    expect(extractCode('nope')).toBeNull()
  })

  test('formats the chess clocks', () => {
    expect(clockMs('5+0')).toBe(300_000)
    expect(clockMs('10+0')).toBe(600_000)
    expect(clockMs('untimed')).toBe(0)
    expect(clockMs('3+2')).toBeNull()
    expect(formatClock(300_000)).toBe('5:00')
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(1500)).toBe('0:02')
  })
})

describe('status copy', () => {
  const seats = [
    { index: 0, name: 'Ada', isCpu: false },
    { index: 1, name: 'Grace', isCpu: false },
  ]

  test('describes turns, watching, wins, and the ribbon floor', () => {
    expect(
      describeStatus({
        gameId: 'connect4',
        status: 'lobby',
        you: { role: 'player', seatIndex: 0 },
        seats,
        result: null,
        turnSeat: null,
        inCheck: false,
        driverCount: 0,
      }),
    ).toBe('Waiting for an opponent.')

    expect(
      describeStatus({
        gameId: 'chess',
        status: 'playing',
        you: { role: 'spectator', seatIndex: null },
        seats,
        result: null,
        turnSeat: 0,
        inCheck: true,
        driverCount: 0,
      }),
    ).toBe("Watching. Ada's turn. Check.")

    expect(
      describeStatus({
        gameId: 'chess',
        status: 'finished',
        you: { role: 'player', seatIndex: 0 },
        seats,
        result: { type: 'win', winnerSeat: 1, reason: 'timeout' },
        turnSeat: null,
        inCheck: false,
        driverCount: 0,
      }),
    ).toBe('Grace wins on time.')

    expect(
      describeStatus({
        gameId: 'ribbon',
        status: 'playing',
        you: { role: 'player', seatIndex: 0 },
        seats: [seats[0]],
        result: null,
        turnSeat: null,
        inCheck: false,
        driverCount: 1,
      }),
    ).toContain('3.5s')
  })
})

describe('ribbon trails', () => {
  test('keeps a point while it is fresh and drops it after the fade', () => {
    let state = addDriver(createRibbon(), 0)
    const moved = drive(state, 0, 0.4, 0.4, 0, 1_000)
    expect(moved?.drivers[0].trail).toHaveLength(1)
    state = moved ?? state
    const kept = drive(state, 0, 0.5, 0.42, 0.2, 1_000 + TRAIL_MS - 10)
    expect(kept?.drivers[0].trail.length).toBe(2)
    const faded = pruneTrail(kept?.drivers[0].trail ?? [], 1_000 + TRAIL_MS + 5)
    expect(faded.every((point) => point.t >= 1_000 + TRAIL_MS + 5 - TRAIL_MS)).toBe(true)
    expect(drive(state, 0, 1.4, 0.2, 0, 2_000)).toBeNull()
    expect(drive(state, 3, 0.2, 0.2, 0, 2_000)).toBeNull()
  })
})
