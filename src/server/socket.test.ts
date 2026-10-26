import { io as ioClient, type Socket } from 'socket.io-client'
import { afterAll, beforeAll, expect, test } from 'vitest'
import type { Snapshot } from '../shared/snapshot'
import { createPlayroom, type Playroom } from './createServer'

let parlor: Playroom
let port = 0

beforeAll(async () => {
  parlor = createPlayroom({ createPerMinute: 100 })
  port = await parlor.listen(0, '127.0.0.1')
})

afterAll(async () => {
  await parlor.close()
})

function connect(): Promise<Socket> {
  const socket = ioClient(`http://127.0.0.1:${port}`, { transports: ['websocket'], forceNew: true })
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('socket timeout')), 5000)
    socket.on('connect', () => {
      clearTimeout(timer)
      resolve(socket)
    })
    socket.on('connect_error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

function request<T>(socket: Socket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    socket.timeout(5000).emit(event, payload, (error: Error | null, body: { ok: true; data: T } | { ok: false; error: string }) => {
      if (error || !body) reject(error ?? new Error('empty'))
      else if (!body.ok) reject(new Error(body.error))
      else resolve(body.data)
    })
  })
}

function waitSnapshot(socket: Socket, predicate: (snap: Snapshot) => boolean): Promise<Snapshot> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('snapshot timeout')), 5000)
    const onSnap = (snap: Snapshot) => {
      if (!predicate(snap)) return
      clearTimeout(timer)
      socket.off('room:snapshot', onSnap)
      resolve(snap)
    }
    socket.on('room:snapshot', onSnap)
  })
}

test('a guest and a watcher both see a connect 4 drop', async () => {
  const ada = await connect()
  const grace = await connect()
  const lin = await connect()
  const created = await request<{ token: string; snapshot: Snapshot }>(ada, 'room:create', {
    gameId: 'connect4',
    name: 'Ada',
  })
  const code = created.snapshot.code
  await request(grace, 'room:join', { code, name: 'Grace' })
  await request(lin, 'room:watch', { code, name: 'Lin' })
  const seen = waitSnapshot(lin, (snap) => (snap.state as { history: unknown[] }).history.length === 1)
  await request(ada, 'room:action', { type: 'connect4:drop', column: 3 })
  const snap = await seen
  expect(snap.you.role).toBe('spectator')
  expect(snap.seats.map((seat) => seat.name)).toEqual(['Ada', 'Grace'])
  ada.disconnect()
  grace.disconnect()
  lin.disconnect()
})

test('reconnect restores the same seat after a dropped socket', async () => {
  const ada = await connect()
  const created = await request<{ token: string; snapshot: Snapshot }>(ada, 'room:create', {
    gameId: 'chess',
    name: 'Ada',
    clock: '10+0',
  })
  ada.disconnect()
  const next = await connect()
  const again = await request<{ snapshot: Snapshot }>(next, 'room:reconnect', {
    code: created.snapshot.code,
    token: created.token,
  })
  expect(again.snapshot.you.seatIndex).toBe(0)
  expect(again.snapshot.clock?.baseMs).toBe(600_000)
  expect(again.snapshot.seats[0].connected).toBe(true)
  next.disconnect()
})

test('ribbon frames reach the other driver', async () => {
  const ada = await connect()
  const grace = await connect()
  const created = await request<{ snapshot: Snapshot }>(ada, 'room:create', {
    gameId: 'ribbon',
    name: 'Ada',
    color: '#ff5a5f',
  })
  await request(grace, 'room:join', { code: created.snapshot.code, name: 'Grace', color: '#3ddc97' })
  const frame = new Promise<{ seatIndex: number; x: number }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('frame timeout')), 5000)
    grace.on('ribbon:frame', (payload: { seatIndex: number; x: number }) => {
      clearTimeout(timer)
      resolve(payload)
    })
  })
  await request(ada, 'room:action', { type: 'ribbon:drive', x: 0.33, y: 0.44, angle: 0.2 })
  await expect(frame).resolves.toMatchObject({ seatIndex: 0, x: 0.33 })
  ada.disconnect()
  grace.disconnect()
})

test('health reports and a burst of rooms all close', async () => {
  const health = (await fetch(`http://127.0.0.1:${port}/health`).then((res) => res.json())) as { ok: boolean }
  expect(health.ok).toBe(true)

  const before = parlor.manager.size
  const sockets: Socket[] = []
  await Promise.all(
    Array.from({ length: 24 }, async () => {
      const socket = await connect()
      sockets.push(socket)
      const created = await request<{ token: string }>(socket, 'room:create', { gameId: 'connect4', name: 'Ada' })
      await request(socket, 'room:leave', {})
      expect(created.token.length).toBeGreaterThan(8)
    }),
  )
  expect(parlor.manager.size).toBe(before)
  sockets.forEach((socket) => socket.disconnect())
})

test('the room create limit pushes back', async () => {
  const limited = createPlayroom({ createPerMinute: 2 })
  const limitedPort = await limited.listen(0, '127.0.0.1')
  const open = async () => {
    const socket = await new Promise<Socket>((resolve, reject) => {
      const client = ioClient(`http://127.0.0.1:${limitedPort}`, { transports: ['websocket'], forceNew: true })
      client.on('connect', () => resolve(client))
      client.on('connect_error', reject)
    })
    const result = await request<{ snapshot: Snapshot }>(socket, 'room:create', { gameId: 'connect4', name: 'Ada' }).then(
      () => 'ok' as const,
      (error: Error) => error.message,
    )
    socket.disconnect()
    return result
  }
  expect(await open()).toBe('ok')
  expect(await open()).toBe('ok')
  expect(await open()).toMatch(/Too many rooms/)
  await limited.close()
})
