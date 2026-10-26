import { describe, expect, test } from 'vitest'
import type { Connect4State } from '../shared/connect4'
import type { ChessState } from '../shared/chessRules'
import type { RibbonState } from '../shared/ribbon'
import { RoomError, RoomManager } from './rooms'

function clocked() {
  const now = { t: 1_000_000 }
  return { now, rooms: new RoomManager(() => now.t) }
}

describe('rooms', () => {
  test('two players finish a vertical connect 4 while a watcher sees the result', () => {
    const rooms = new RoomManager()
    const ada = rooms.create({ gameId: 'connect4', name: 'Ada' })
    const grace = rooms.join({ code: ada.code, name: 'Grace' })
    const watcher = rooms.watch({ code: ada.code, name: 'Lin' })
    expect(rooms.snapshot(ada.code, grace.token).status).toBe('playing')

    const script = [0, 1, 0, 1, 0, 1, 0]
    let token = ada.token
    for (const column of script) {
      rooms.action(token, { type: 'connect4:drop', column })
      token = token === ada.token ? grace.token : ada.token
    }
    const watched = rooms.snapshot(ada.code, watcher.token)
    expect(watched.you.role).toBe('spectator')
    expect(watched.result).toEqual({ type: 'win', winnerSeat: 0, reason: 'line' })
    expect(watched.statusLine).toBe('Ada wins.')
    expect((watched.state as Connect4State).history).toHaveLength(7)
    expect(() => rooms.action(watcher.token, { type: 'connect4:drop', column: 2 })).toThrow(RoomError)
    expect(() => rooms.action(grace.token, { type: 'connect4:drop', column: 2 })).toThrow(/over/)
  })

  test('a full table turns the next visitor into a watcher', () => {
    const rooms = new RoomManager()
    const ada = rooms.create({ gameId: 'chess', name: 'Ada' })
    rooms.join({ code: ada.code, name: 'Grace' })
    const extra = rooms.join({ code: ada.code, name: 'Lin' })
    expect(extra.notice).toMatch(/watching/)
    expect(rooms.snapshot(ada.code, extra.token).you.role).toBe('spectator')
    expect(() => rooms.action(extra.token, { type: 'chess:move', from: 'e2', to: 'e4' })).toThrow(/watching/)
  })

  test('an explicit watch stays out even while a seat is open', () => {
    const rooms = new RoomManager()
    const ada = rooms.create({ gameId: 'connect4', name: 'Ada' })
    const watcher = rooms.watch({ code: ada.code, name: 'Lin' })
    expect(rooms.snapshot(ada.code, watcher.token).statusLine).toBe('Waiting for players.')
    expect(rooms.snapshot(ada.code, ada.token).status).toBe('lobby')
  })

  test('the CPU seat is playable by the human client and illegal moves do not stick', () => {
    const rooms = new RoomManager()
    const ada = rooms.create({ gameId: 'connect4', name: 'Ada', vsCpu: true, difficulty: 'easy' })
    const before = rooms.snapshot(ada.code, ada.token)
    expect(before.cpu?.difficulty).toBe('easy')
    expect(before.statusLine).toBe('Your turn.')
    expect(() => rooms.action(ada.token, { type: 'connect4:drop', column: 3, asCpu: true })).toThrow(/turn/)
    rooms.action(ada.token, { type: 'connect4:drop', column: 3 })
    const thinking = rooms.snapshot(ada.code, ada.token)
    expect(thinking.statusLine).toBe('CPU is thinking.')
    rooms.action(ada.token, { type: 'connect4:drop', column: 3, asCpu: true })
    const after = rooms.snapshot(ada.code, ada.token).state as Connect4State
    expect(after.board[5][3]).toBe(1)
    expect(after.board[4][3]).toBe(2)
    expect(() => rooms.action(ada.token, { type: 'connect4:drop', column: 9 })).toThrow(/column/)
  })

  test('chess clocks flag the player who does not move, and a rematch restores them', () => {
    const { rooms, now } = clocked()
    const ada = rooms.create({ gameId: 'chess', name: 'Ada', vsCpu: true, difficulty: 'medium', clock: '5+0' })
    rooms.attach(ada.token, 'ada')
    expect(rooms.snapshot(ada.code, ada.token).clock?.running).toBe(true)
    now.t += 5 * 60 * 1000 + 20
    expect(rooms.sweep()).toContain(ada.code)
    const flagged = rooms.snapshot(ada.code, ada.token)
    expect(flagged.result).toEqual({ type: 'win', winnerSeat: 1, reason: 'timeout' })
    expect(flagged.statusLine).toBe('CPU wins on time.')
    rooms.rematch(ada.token)
    const again = rooms.snapshot(ada.code, ada.token)
    expect(again.status).toBe('playing')
    expect(again.clock?.remaining).toEqual([300_000, 300_000])
    expect((again.state as ChessState).fen).toContain('w')
  })

  test('a disconnect past the grace period forfeits, and a refresh within it keeps the seat', () => {
    const { rooms, now } = clocked()
    const ada = rooms.create({ gameId: 'chess', name: 'Ada' })
    const grace = rooms.join({ code: ada.code, name: 'Grace' })
    rooms.attach(ada.token, 'ada')
    rooms.attach(grace.token, 'grace')
    rooms.action(ada.token, { type: 'chess:move', from: 'e2', to: 'e4' })
    rooms.detach('ada')
    expect(rooms.snapshot(ada.code, grace.token).seats[0].connected).toBe(false)
    rooms.attach(ada.token, 'ada-2')
    expect(rooms.snapshot(ada.code, ada.token).seats.find((seat) => seat.isYou)?.connected).toBe(true)
    rooms.detach('ada-2')
    now.t += 90_001
    rooms.sweep()
    expect(rooms.snapshot(ada.code, grace.token).result?.reason).toBe('abandon')
  })

  test('chat is plain text, and leaving a live game resigns', () => {
    const rooms = new RoomManager()
    const ada = rooms.create({ gameId: 'connect4', name: 'Ada' })
    const grace = rooms.join({ code: ada.code, name: 'Grace' })
    rooms.attach(ada.token, 'ada')
    rooms.attach(grace.token, 'grace')
    rooms.chat(ada.token, '  hello <b>there</b>  ')
    expect(rooms.snapshot(ada.code, grace.token).chat[0].text).toBe('hello bthere/b')
    rooms.leave(ada.token)
    expect(rooms.snapshot(ada.code, grace.token).result).toEqual({ type: 'win', winnerSeat: 1, reason: 'resign' })
  })

  test('ribbon relays a drive, fades old points, and frees a seat after eight drivers', () => {
    const { rooms, now } = clocked()
    const host = rooms.create({ gameId: 'ribbon', name: 'Ada', color: '#ff5a5f' })
    const tokens = [host.token]
    for (let index = 1; index < 8; index += 1) {
      tokens.push(rooms.join({ code: host.code, name: `P${index}`, color: '#3ddc97' }).token)
    }
    const ninth = rooms.join({ code: host.code, name: 'Watcher' })
    expect(ninth.notice).toMatch(/watching/)
    const moved = rooms.action(host.token, { type: 'ribbon:drive', x: 0.25, y: 0.4, angle: 0.4 })
    expect(moved.kind).toBe('ribbon')
    now.t += 4000
    rooms.action(host.token, { type: 'ribbon:drive', x: 0.55, y: 0.7, angle: 1 })
    const trail = (rooms.snapshot(host.code, host.token).state as RibbonState).drivers[0].trail
    expect(trail.every((point) => point.t >= now.t - 3500)).toBe(true)
    expect(() => rooms.action(ninth.token, { type: 'ribbon:drive', x: 0.2, y: 0.2, angle: 0 })).toThrow(/watching/)
  })

  test('both players must accept a rematch, and an empty lobby room is deleted', () => {
    const rooms = new RoomManager()
    const ada = rooms.create({ gameId: 'connect4', name: 'Ada' })
    const grace = rooms.join({ code: ada.code, name: 'Grace' })
    rooms.action(ada.token, { type: 'resign' })
    rooms.rematch(ada.token)
    expect(rooms.snapshot(ada.code, ada.token).status).toBe('finished')
    rooms.rematch(grace.token)
    expect(rooms.snapshot(ada.code, ada.token).status).toBe('playing')
    expect((rooms.snapshot(ada.code, ada.token).state as Connect4State).history).toHaveLength(0)

    const solo = rooms.create({ gameId: 'chess', name: 'Solo' })
    rooms.leave(solo.token)
    expect(rooms.peek(solo.code)).toBe(false)
  })

  test('three hundred rooms can be opened, played, and closed', () => {
    const rooms = new RoomManager()
    const started = Date.now()
    for (let index = 0; index < 300; index += 1) {
      const created = rooms.create({ gameId: 'connect4', name: 'Ada' })
      const guest = rooms.join({ code: created.code, name: 'Grace' })
      rooms.action(created.token, { type: 'connect4:drop', column: index % 7 })
      rooms.action(guest.token, { type: 'connect4:drop', column: (index + 1) % 7 })
      rooms.leave(created.token)
      rooms.leave(guest.token)
    }
    expect(rooms.size).toBe(0)
    expect(Date.now() - started).toBeLessThan(4000)
  })
})
