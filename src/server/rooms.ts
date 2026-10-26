import { randomBytes, randomInt } from 'node:crypto'
import { chessTurnSeat, createChess, playChess, type ChessState } from '../shared/chessRules'
import { createConnect4, dropDisc, type Connect4State } from '../shared/connect4'
import { addDriver, createRibbon, drive, MAX_DRIVERS, removeDriver, RIBBON_COLORS, type RibbonFrame, type RibbonState } from '../shared/ribbon'
import type { Snapshot } from '../shared/snapshot'
import { describeStatus } from '../shared/status'
import { cleanChat, cleanColor, cleanName, clockMs } from '../shared/text'
import type { ChatMessage, Difficulty, Finish, GameAction, GameId, PublicSeat, RoomStatus } from '../shared/types'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const RECONNECT_MS = 90_000
const MAX_ROOMS = 500
const MAX_SPECTATORS = 24

export class RoomError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RoomError'
  }
}

export interface Entry {
  code: string
  token: string
  notice?: string
}

export interface CreateInput {
  gameId: GameId
  name: string
  color?: string
  vsCpu?: boolean
  difficulty?: Difficulty
  clock?: string
}

interface Seat {
  token: string
  name: string
  color: string | null
  connected: boolean
  socketId: string | null
  disconnectDeadline: number | null
  isCpu: boolean
  left: boolean
}

interface Spectator {
  token: string
  name: string
  color: string | null
  socketId: string | null
  deadline: number | null
}

interface ClockState {
  baseMs: number
  remaining: [number, number]
  running: boolean
  turnStartedAt: number
}

interface Room {
  code: string
  gameId: GameId
  status: RoomStatus
  seats: (Seat | null)[]
  spectators: Map<string, Spectator>
  version: number
  state: Connect4State | ChessState | RibbonState
  cpu: { seatIndex: number; difficulty: Difficulty } | null
  clock: ClockState | null
  rematch: Set<number>
  chat: ChatMessage[]
  chatSeq: number
  result: Finish | null
  rate: Map<string, number[]>
}

interface Location {
  code: string
  kind: 'seat' | 'spectator'
  seatIndex: number | null
}

export type ActionResult =
  | { code: string; kind: 'snapshot' }
  | { code: string; kind: 'ribbon'; frame: RibbonFrame }
  | { code: string; kind: 'ignore' }

function makeCode(): string {
  let code = ''
  for (let index = 0; index < 6; index += 1) code += ALPHABET[randomInt(ALPHABET.length)]
  return code
}

function isGameId(value: unknown): value is GameId {
  return value === 'connect4' || value === 'chess' || value === 'ribbon'
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>()
  private readonly tokens = new Map<string, Location>()
  private readonly socketToken = new Map<string, string>()

  constructor(private readonly now: () => number = Date.now) {}

  get size(): number {
    return this.rooms.size
  }

  peek(code: string): boolean {
    return this.rooms.has(code)
  }

  create(input: CreateInput): Entry {
    const name = cleanName(input.name)
    if (!name) throw new RoomError('Add your name.')
    if (!isGameId(input.gameId)) throw new RoomError('Pick a game.')
    if (input.vsCpu && input.gameId === 'ribbon') {
      throw new RoomError('Ribbon Rally is a shared floor, so there is no CPU to race.')
    }
    if (this.rooms.size >= MAX_ROOMS) throw new RoomError('The parlor is full. Try again in a minute.')

    let clockLength = 0
    if (input.gameId === 'chess' && input.clock && input.clock !== 'untimed') {
      const parsed = clockMs(input.clock)
      if (parsed == null || parsed <= 0) throw new RoomError('Pick Untimed, 5+0, or 10+0.')
      clockLength = parsed
    }

    let code = ''
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const next = makeCode()
      if (!this.rooms.has(next)) {
        code = next
        break
      }
    }
    if (!code) throw new RoomError('The parlor is full. Try again in a minute.')

    const token = randomBytes(18).toString('base64url')
    const seats = Array.from({ length: input.gameId === 'ribbon' ? MAX_DRIVERS : 2 }, () => null as Seat | null)
    const color = input.gameId === 'ribbon' ? (cleanColor(input.color) ?? RIBBON_COLORS[0]) : null
    seats[0] = this.makeSeat(token, name, color)

    const room: Room = {
      code,
      gameId: input.gameId,
      status: 'lobby',
      seats,
      spectators: new Map(),
      version: 0,
      state:
        input.gameId === 'connect4' ? createConnect4() : input.gameId === 'chess' ? createChess() : createRibbon(),
      cpu: null,
      clock:
        clockLength > 0
          ? { baseMs: clockLength, remaining: [clockLength, clockLength], running: false, turnStartedAt: 0 }
          : null,
      rematch: new Set(),
      chat: [],
      chatSeq: 0,
      result: null,
      rate: new Map(),
    }

    if (input.vsCpu) {
      const difficulty: Difficulty = input.difficulty === 'easy' ? 'easy' : 'medium'
      room.cpu = { seatIndex: 1, difficulty }
      room.seats[1] = {
        token: '',
        name: 'CPU',
        color: null,
        connected: true,
        socketId: null,
        disconnectDeadline: null,
        isCpu: true,
        left: false,
      }
    }

    if (room.gameId === 'ribbon') room.state = addDriver(room.state as RibbonState, 0)
    this.rooms.set(code, room)
    this.tokens.set(token, { code, kind: 'seat', seatIndex: 0 })
    this.maybeStart(room)
    room.version = 1
    return { code, token }
  }

  join(input: { code: string; name: string; color?: string }): Entry {
    const room = this.require(input.code)
    const name = cleanName(input.name)
    if (!name) throw new RoomError('Add your name.')
    if (room.gameId === 'ribbon') {
      const index = room.seats.findIndex((seat) => !seat)
      if (index === -1) {
        const entry = this.addSpectator(room, name, cleanColor(input.color))
        return { ...entry, notice: 'The floor is full, so you are watching.' }
      }
      return this.takeSeat(room, index, name, cleanColor(input.color) ?? RIBBON_COLORS[index % RIBBON_COLORS.length])
    }
    if (room.cpu) {
      const entry = this.addSpectator(room, name, null)
      return { ...entry, notice: 'A player and the CPU have this table, so you are watching.' }
    }
    if (room.status === 'playing') {
      const entry = this.addSpectator(room, name, null)
      return { ...entry, notice: 'This game has already started, so you are watching.' }
    }
    const index = room.seats.findIndex((seat) => !seat)
    if (index === -1) {
      const entry = this.addSpectator(room, name, null)
      return { ...entry, notice: 'Both seats are taken, so you are watching.' }
    }
    return this.takeSeat(room, index, name, null)
  }

  watch(input: { code: string; name: string; color?: string }): Entry {
    const room = this.require(input.code)
    const name = cleanName(input.name)
    if (!name) throw new RoomError('Add your name.')
    return this.addSpectator(room, name, cleanColor(input.color))
  }

  sit(token: string): string {
    const location = this.location(token)
    if (location.kind !== 'spectator') throw new RoomError('You already have a seat.')
    const room = this.require(location.code)
    if (room.cpu) throw new RoomError('The other seat is the CPU.')
    if (room.gameId !== 'ribbon' && room.status === 'playing') throw new RoomError('This game has already started.')
    const index = room.seats.findIndex((seat) => !seat)
    if (index < 0) throw new RoomError('Both seats are taken.')
    const spectator = room.spectators.get(token)
    if (!spectator) throw new RoomError('That seat expired. Join again.')
    room.spectators.delete(token)
    const color = room.gameId === 'ribbon' ? (spectator.color ?? RIBBON_COLORS[index % RIBBON_COLORS.length]) : null
    const seat = this.makeSeat(token, spectator.name, color)
    seat.connected = spectator.socketId != null
    seat.socketId = spectator.socketId
    room.seats[index] = seat
    this.tokens.set(token, { code: room.code, kind: 'seat', seatIndex: index })
    if (room.gameId === 'ribbon') room.state = addDriver(room.state as RibbonState, index)
    if (room.status !== 'finished') this.maybeStart(room)
    room.version += 1
    return room.code
  }

  attach(token: string, socketId: string): { code: string; previousSocketId: string | null } {
    const location = this.location(token)
    const room = this.require(location.code)
    let previousSocketId: string | null = null
    if (location.kind === 'seat' && location.seatIndex != null) {
      const seat = room.seats[location.seatIndex]
      if (!seat || seat.token !== token || seat.left) throw new RoomError('That seat expired. Join again.')
      previousSocketId = seat.socketId
      seat.socketId = socketId
      seat.connected = true
      seat.disconnectDeadline = null
    } else {
      const spectator = room.spectators.get(token)
      if (!spectator) throw new RoomError('That seat expired. Join again.')
      previousSocketId = spectator.socketId
      spectator.socketId = socketId
      spectator.deadline = null
    }
    if (previousSocketId && previousSocketId !== socketId) this.socketToken.delete(previousSocketId)
    this.socketToken.set(socketId, token)
    room.version += 1
    return { code: room.code, previousSocketId: previousSocketId !== socketId ? previousSocketId : null }
  }

  detach(socketId: string): string | null {
    const token = this.socketToken.get(socketId)
    if (!token) return null
    this.socketToken.delete(socketId)
    const location = this.tokens.get(token)
    if (!location) return null
    const room = this.rooms.get(location.code)
    if (!room) return null
    const deadline = this.now() + RECONNECT_MS
    if (location.kind === 'seat' && location.seatIndex != null) {
      const seat = room.seats[location.seatIndex]
      if (seat && seat.socketId === socketId) {
        seat.socketId = null
        seat.connected = false
        seat.disconnectDeadline = deadline
      }
    } else {
      const spectator = room.spectators.get(token)
      if (spectator && spectator.socketId === socketId) {
        spectator.socketId = null
        spectator.deadline = deadline
      }
    }
    room.version += 1
    return room.code
  }

  leave(token: string): string | null {
    const location = this.tokens.get(token)
    if (!location) return null
    const room = this.rooms.get(location.code)
    this.tokens.delete(token)
    if (!room) return null

    if (location.kind === 'spectator') {
      const spectator = room.spectators.get(token)
      if (spectator?.socketId) this.socketToken.delete(spectator.socketId)
      room.spectators.delete(token)
      room.version += 1
      if (this.isVacant(room, this.now())) this.deleteRoom(room)
      return room.code
    }

    const index = location.seatIndex
    const seat = index == null ? null : room.seats[index]
    if (seat?.socketId) this.socketToken.delete(seat.socketId)
    if (!seat || index == null) return room.code

    if (room.cpu) {
      this.deleteRoom(room)
      return room.code
    }
    if (room.gameId === 'ribbon') {
      room.seats[index] = null
      room.state = removeDriver(room.state as RibbonState, index)
      room.version += 1
      if (this.isVacant(room, this.now())) this.deleteRoom(room)
      return room.code
    }
    if (room.status === 'playing') {
      const winner = (index === 0 ? 1 : 0) as 0 | 1
      this.finish(room, { type: 'win', winnerSeat: winner, reason: 'resign' })
      seat.connected = false
      seat.left = true
      seat.socketId = null
      seat.token = ''
      return room.code
    }
    room.seats[index] = null
    room.version += 1
    if (this.isVacant(room, this.now())) this.deleteRoom(room)
    return room.code
  }

  action(token: string, action: GameAction): ActionResult {
    const location = this.location(token)
    const room = this.require(location.code)
    if (location.kind !== 'seat' || location.seatIndex == null) throw new RoomError('You are watching this room.')
    const self = room.seats[location.seatIndex]
    if (!self || self.left) throw new RoomError('That seat expired. Join again.')

    const asCpu = action.type !== 'ribbon:drive' && action.asCpu === true
    if (asCpu && !room.cpu) throw new RoomError('There is no CPU at this table.')
    const actor = asCpu && room.cpu ? room.cpu.seatIndex : location.seatIndex

    if (action.type === 'resign') {
      if (asCpu) throw new RoomError('The CPU will play it out.')
      if (room.gameId === 'ribbon') throw new RoomError('Nothing to resign.')
      if (room.status !== 'playing') throw new RoomError('The game is over.')
      const winner = (actor === 0 ? 1 : 0) as 0 | 1
      this.finish(room, { type: 'win', winnerSeat: winner, reason: 'resign' })
      return { code: room.code, kind: 'snapshot' }
    }

    if (room.status !== 'playing') {
      throw new RoomError(room.status === 'lobby' ? 'Waiting for an opponent.' : 'The game is over.')
    }

    if (action.type === 'ribbon:drive') {
      if (room.gameId !== 'ribbon') throw new RoomError('That move does not belong to this game.')
      if (!this.allow(room, `drive:${token}`, 30, 1000)) return { code: room.code, kind: 'ignore' }
      const next = drive(room.state as RibbonState, actor, action.x, action.y, action.angle, this.now())
      if (!next) throw new RoomError('Stay on the floor.')
      room.state = next
      room.version += 1
      return {
        code: room.code,
        kind: 'ribbon',
        frame: { serverNow: this.now(), seatIndex: actor, x: action.x, y: action.y, angle: action.angle, t: this.now() },
      }
    }

    if (!this.allow(room, `move:${asCpu ? 'cpu' : token}`, 30, 10_000)) throw new RoomError('Slow down a little.')
    const turn = this.turnOf(room)
    if (turn == null || turn !== actor) throw new RoomError('It is not your turn.')
    if (this.flagIfExpired(room, turn)) return { code: room.code, kind: 'snapshot' }
    const elapsed = room.clock?.running ? this.now() - room.clock.turnStartedAt : 0

    if (room.gameId === 'connect4' && action.type === 'connect4:drop') {
      const applied = dropDisc(room.state as Connect4State, action.column, actor)
      if (!applied.ok) throw new RoomError(applied.error)
      this.commit(room, applied.state, applied.finish, turn, elapsed)
      return { code: room.code, kind: 'snapshot' }
    }
    if (room.gameId === 'chess' && action.type === 'chess:move') {
      const applied = playChess(room.state as ChessState, action.from, action.to, action.promotion)
      if (!applied.ok) throw new RoomError(applied.error)
      this.commit(room, applied.state, applied.finish, turn, elapsed)
      return { code: room.code, kind: 'snapshot' }
    }
    throw new RoomError('That move does not belong to this game.')
  }

  chat(token: string, text: string): string {
    const location = this.location(token)
    const room = this.require(location.code)
    const name = this.nameOf(room, token)
    const clean = cleanChat(text)
    if (!clean) throw new RoomError('Write a message first.')
    if (!this.allow(room, `chat:${token}`, 6, 10_000)) throw new RoomError('Slow down a little.')
    room.chat.push({ id: (room.chatSeq += 1), name, text: clean, at: this.now() })
    if (room.chat.length > 40) room.chat.splice(0, room.chat.length - 40)
    room.version += 1
    return room.code
  }

  rematch(token: string): string {
    const location = this.location(token)
    const room = this.require(location.code)
    if (room.gameId === 'ribbon') throw new RoomError('Ribbon Rally does not need a rematch.')
    if (room.status !== 'finished') throw new RoomError('The game is still going.')
    if (location.kind !== 'seat' || location.seatIndex == null) throw new RoomError('Watchers cannot start a rematch.')
    const seat = room.seats[location.seatIndex]
    if (!seat || seat.isCpu || seat.left) throw new RoomError('That seat cannot rematch.')
    if (room.seats.some((item) => !item)) throw new RoomError('Wait for both seats to fill before a rematch.')
    room.rematch.add(location.seatIndex)
    const humans = room.seats
      .map((item, index) => ({ item, index }))
      .filter((entry) => entry.item && !entry.item.isCpu && !entry.item.left)
    if (humans.length > 0 && humans.every((entry) => room.rematch.has(entry.index))) this.reset(room)
    else room.version += 1
    return room.code
  }

  snapshot(code: string, token: string): Snapshot {
    const room = this.require(code)
    const location = this.location(token)
    if (location.code !== code) throw new RoomError('That seat expired. Join again.')
    const you =
      location.kind === 'seat' && location.seatIndex != null
        ? { role: 'player' as const, seatIndex: location.seatIndex, name: room.seats[location.seatIndex]?.name ?? 'Player' }
        : { role: 'spectator' as const, seatIndex: null, name: room.spectators.get(token)?.name ?? 'Watcher' }
    const seats: PublicSeat[] = room.seats.flatMap((seat, index) =>
      seat
        ? [
            {
              index,
              name: seat.name,
              color: seat.color,
              connected: seat.connected || seat.isCpu,
              isCpu: seat.isCpu,
              isYou: location.kind === 'seat' && location.seatIndex === index,
              left: seat.left,
            },
          ]
        : [],
    )
    const turn = this.turnOf(room)
    const inCheck = room.gameId === 'chess' && room.status === 'playing' && (room.state as ChessState).inCheck
    const driverCount = room.gameId === 'ribbon' ? (room.state as RibbonState).drivers.length : 0
    return {
      code: room.code,
      gameId: room.gameId,
      status: room.status,
      version: room.version,
      serverNow: this.now(),
      seats,
      you,
      spectatorCount: [...room.spectators.values()].filter((spectator) => spectator.socketId).length,
      chat: room.chat,
      clock: room.clock
        ? {
            baseMs: room.clock.baseMs,
            remaining: [room.clock.remaining[0], room.clock.remaining[1]],
            activeSeat: room.clock.running ? turn : null,
            running: room.clock.running,
            turnStartedAt: room.clock.turnStartedAt,
          }
        : null,
      cpu: room.cpu,
      result: room.result,
      rematchSeats: [...room.rematch],
      state: room.state,
      statusLine: describeStatus({
        gameId: room.gameId,
        status: room.status,
        you,
        seats: seats.map((seat) => ({ index: seat.index, name: seat.name, isCpu: seat.isCpu })),
        result: room.result,
        turnSeat: turn,
        inCheck,
        driverCount,
      }),
    }
  }

  tokenForSocket(socketId: string): string | null {
    return this.socketToken.get(socketId) ?? null
  }

  sweep(): string[] {
    const now = this.now()
    const changed: string[] = []
    for (const room of [...this.rooms.values()]) {
      const before = room.version
      if (room.clock?.running && room.status === 'playing') {
        const turn = this.turnOf(room)
        if (turn === 0 || turn === 1) {
          if (now - room.clock.turnStartedAt >= room.clock.remaining[turn]) {
            room.clock.remaining[turn] = 0
            this.finish(room, { type: 'win', winnerSeat: turn === 0 ? 1 : 0, reason: 'timeout' })
          }
        }
      }
      if (room.status === 'playing' && room.gameId !== 'ribbon') {
        for (let index = 0; index < room.seats.length; index += 1) {
          const seat = room.seats[index]
          if (!seat || seat.isCpu || seat.left || seat.connected) continue
          if (seat.disconnectDeadline == null || seat.disconnectDeadline > now) continue
          const other = room.seats.findIndex((candidate, candidateIndex) => {
            return candidateIndex !== index && !!candidate && (candidate.connected || candidate.isCpu)
          })
          if (other === 0 || other === 1) {
            this.finish(room, { type: 'win', winnerSeat: other, reason: 'abandon' })
            break
          }
        }
      }
      if (room.gameId === 'ribbon') {
        for (let index = 0; index < room.seats.length; index += 1) {
          const seat = room.seats[index]
          if (!seat || seat.connected || seat.isCpu) continue
          if (seat.disconnectDeadline == null || seat.disconnectDeadline > now) continue
          if (seat.token) this.tokens.delete(seat.token)
          room.seats[index] = null
          room.state = removeDriver(room.state as RibbonState, index)
          room.version += 1
        }
      }
      for (const [token, spectator] of room.spectators) {
        if (!spectator.socketId && spectator.deadline != null && spectator.deadline <= now) {
          room.spectators.delete(token)
          this.tokens.delete(token)
          room.version += 1
        }
      }
      if (this.isVacant(room, now)) {
        this.deleteRoom(room)
        continue
      }
      if (room.version !== before) changed.push(room.code)
    }
    return changed
  }

  private makeSeat(token: string, name: string, color: string | null): Seat {
    return {
      token,
      name,
      color,
      connected: false,
      socketId: null,
      disconnectDeadline: null,
      isCpu: false,
      left: false,
    }
  }

  private takeSeat(room: Room, index: number, name: string, color: string | null): Entry {
    const token = randomBytes(18).toString('base64url')
    room.seats[index] = this.makeSeat(token, name, color)
    this.tokens.set(token, { code: room.code, kind: 'seat', seatIndex: index })
    if (room.gameId === 'ribbon') room.state = addDriver(room.state as RibbonState, index)
    if (room.status !== 'finished') this.maybeStart(room)
    room.version += 1
    return { code: room.code, token }
  }

  private addSpectator(room: Room, name: string, color: string | null): Entry {
    if (room.spectators.size >= MAX_SPECTATORS) throw new RoomError('Too many people are watching this room.')
    const token = randomBytes(18).toString('base64url')
    room.spectators.set(token, { token, name, color, socketId: null, deadline: null })
    this.tokens.set(token, { code: room.code, kind: 'spectator', seatIndex: null })
    room.version += 1
    return { code: room.code, token }
  }

  private maybeStart(room: Room): void {
    if (room.gameId === 'ribbon') {
      room.status = 'playing'
      return
    }
    if (room.status !== 'lobby') return
    if (room.seats.every(Boolean)) {
      room.status = 'playing'
      if (room.clock) {
        room.clock.running = true
        room.clock.turnStartedAt = this.now()
        room.clock.remaining = [room.clock.baseMs, room.clock.baseMs]
      }
    }
  }

  private reset(room: Room): void {
    room.state = room.gameId === 'chess' ? createChess() : createConnect4()
    room.status = 'playing'
    room.result = null
    room.rematch.clear()
    if (room.clock) {
      room.clock.remaining = [room.clock.baseMs, room.clock.baseMs]
      room.clock.running = true
      room.clock.turnStartedAt = this.now()
    }
    room.version += 1
  }

  private commit(room: Room, state: Connect4State | ChessState, finish: Finish | undefined, turn: number, elapsed: number): void {
    room.state = state
    if (finish) this.finish(room, finish)
    else {
      if (room.clock?.running && (turn === 0 || turn === 1)) {
        room.clock.remaining[turn] = Math.max(0, room.clock.remaining[turn] - elapsed)
        room.clock.turnStartedAt = this.now()
      }
      room.version += 1
    }
  }

  private finish(room: Room, result: Finish): void {
    if (room.status === 'finished') return
    room.status = 'finished'
    room.result = result
    room.rematch.clear()
    if (room.clock) room.clock.running = false
    room.version += 1
  }

  private flagIfExpired(room: Room, turn: number): boolean {
    if (!room.clock?.running || (turn !== 0 && turn !== 1)) return false
    if (this.now() - room.clock.turnStartedAt >= room.clock.remaining[turn]) {
      room.clock.remaining[turn] = 0
      this.finish(room, { type: 'win', winnerSeat: turn === 0 ? 1 : 0, reason: 'timeout' })
      return true
    }
    return false
  }

  private turnOf(room: Room): number | null {
    if (room.status !== 'playing') return null
    if (room.gameId === 'connect4') {
      const state = room.state as Connect4State
      if (state.winner || state.draw) return null
      return state.turn - 1
    }
    if (room.gameId === 'chess') return chessTurnSeat(room.state as ChessState)
    return null
  }

  private nameOf(room: Room, token: string): string {
    const location = this.tokens.get(token)
    if (!location) return 'Player'
    if (location.kind === 'seat' && location.seatIndex != null) return room.seats[location.seatIndex]?.name ?? 'Player'
    return room.spectators.get(token)?.name ?? 'Watcher'
  }

  private allow(room: Room, key: string, limit: number, windowMs: number): boolean {
    const now = this.now()
    const recent = (room.rate.get(key) ?? []).filter((stamp) => now - stamp < windowMs)
    if (recent.length >= limit) {
      room.rate.set(key, recent)
      return false
    }
    recent.push(now)
    room.rate.set(key, recent)
    return true
  }

  private isVacant(room: Room, now: number): boolean {
    const seatHeld = room.seats.some((seat) => {
      if (!seat || seat.isCpu || seat.left) return false
      return seat.connected || seat.disconnectDeadline == null || seat.disconnectDeadline > now
    })
    if (seatHeld) return false
    for (const spectator of room.spectators.values()) {
      if (spectator.socketId || spectator.deadline == null || spectator.deadline > now) return false
    }
    return true
  }

  private deleteRoom(room: Room): void {
    for (const seat of room.seats) {
      if (!seat) continue
      if (seat.token) this.tokens.delete(seat.token)
      if (seat.socketId) this.socketToken.delete(seat.socketId)
    }
    for (const spectator of room.spectators.values()) {
      this.tokens.delete(spectator.token)
      if (spectator.socketId) this.socketToken.delete(spectator.socketId)
    }
    this.rooms.delete(room.code)
  }

  private require(code: string): Room {
    const room = this.rooms.get(code)
    if (!room) throw new RoomError('That room code does not exist.')
    return room
  }

  private location(token: string): Location {
    const found = this.tokens.get(token)
    if (!found) throw new RoomError('That seat expired. Join again.')
    return found
  }
}
