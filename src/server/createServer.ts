import compression from 'compression'
import express from 'express'
import { existsSync } from 'node:fs'
import { createServer, type Server as HttpServer } from 'node:http'
import path from 'node:path'
import { Server, type Socket } from 'socket.io'
import { extractCode } from '../shared/text'
import type { GameAction, Promotion } from '../shared/types'
import { RoomError, RoomManager, type CreateInput } from './rooms'

type Ack = (body: { ok: true; data: unknown } | { ok: false; error: string }) => void

export interface Playroom {
  manager: RoomManager
  server: HttpServer
  io: Server
  listen: (port?: number, host?: string) => Promise<number>
  close: () => Promise<void>
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function readCreate(value: unknown): CreateInput {
  const body = asRecord(value)
  if (!body) throw new RoomError('Pick a game.')
  if (body.gameId !== 'connect4' && body.gameId !== 'chess' && body.gameId !== 'ribbon') throw new RoomError('Pick a game.')
  return {
    gameId: body.gameId,
    name: typeof body.name === 'string' ? body.name : '',
    color: typeof body.color === 'string' ? body.color : undefined,
    vsCpu: body.vsCpu === true,
    difficulty: body.difficulty === 'easy' ? 'easy' : 'medium',
    clock: typeof body.clock === 'string' ? body.clock : undefined,
  }
}

function readJoin(value: unknown): { code: string; name: string; color?: string } {
  const body = asRecord(value)
  const code = extractCode(typeof body?.code === 'string' ? body.code : '')
  if (!code) throw new RoomError('Enter a 6-character room code.')
  return {
    code,
    name: typeof body?.name === 'string' ? body.name : '',
    color: typeof body?.color === 'string' ? body.color : undefined,
  }
}

function readAction(value: unknown): GameAction {
  const body = asRecord(value)
  if (!body || typeof body.type !== 'string') throw new RoomError('That move does not belong to this game.')
  const asCpu = body.asCpu === true
  if (body.type === 'connect4:drop') {
    if (typeof body.column !== 'number' || !Number.isInteger(body.column)) throw new RoomError('Choose a column.')
    return { type: 'connect4:drop', column: body.column, asCpu }
  }
  if (body.type === 'chess:move') {
    if (typeof body.from !== 'string' || typeof body.to !== 'string') throw new RoomError('That move is not legal.')
    const promotion = body.promotion
    const legal = promotion === 'q' || promotion === 'r' || promotion === 'b' || promotion === 'n'
    return { type: 'chess:move', from: body.from, to: body.to, promotion: legal ? (promotion as Promotion) : undefined, asCpu }
  }
  if (body.type === 'resign') return { type: 'resign', asCpu }
  if (body.type === 'ribbon:drive') {
    if (typeof body.x !== 'number' || typeof body.y !== 'number' || typeof body.angle !== 'number') {
      throw new RoomError('Stay on the floor.')
    }
    return { type: 'ribbon:drive', x: body.x, y: body.y, angle: body.angle }
  }
  throw new RoomError('That move does not belong to this game.')
}

function clientDirectory(): string {
  const scriptDir = path.dirname(process.argv[1] ?? process.cwd())
  const candidates = [path.resolve(scriptDir, 'client'), path.resolve(process.cwd(), 'dist/client')]
  return candidates.find((dir) => existsSync(path.join(dir, 'index.html'))) ?? candidates[1]
}

export function createPlayroom(options?: { createPerMinute?: number }): Playroom {
  const createPerMinute = options?.createPerMinute ?? 20
  const manager = new RoomManager()
  const app = express()
  const server = createServer(app)
  const io = new Server(server, { maxHttpBufferSize: 64 * 1024, cors: { origin: true } })
  const creates = new Map<string, number[]>()

  if (process.env.NODE_ENV === 'production') {
    io.use((socket, next) => {
      const origin = socket.handshake.headers.origin
      const host = socket.handshake.headers.host
      if (!origin || !host) return next()
      try {
        if (new URL(origin).host !== host) return next(new Error('origin'))
      } catch {
        return next(new Error('origin'))
      }
      next()
    })
  }

  app.get('/health', (_req, res) => {
    res.json({ ok: true, rooms: manager.size })
  })

  if (process.env.NODE_ENV === 'production') {
    const root = clientDirectory()
    app.use(compression())
    app.use(
      express.static(root, {
        index: false,
        maxAge: '1h',
        setHeaders(res, filePath) {
          if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache')
          else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
          }
        },
      }),
    )
    app.get('*', (req, res, next) => {
      if (req.method !== 'GET') return next()
      res.setHeader('Cache-Control', 'no-cache')
      res.sendFile(path.join(root, 'index.html'), (error) => {
        if (error) next(error)
      })
    })
  }

  const allowCreate = (ip: string) => {
    const now = Date.now()
    const recent = (creates.get(ip) ?? []).filter((stamp) => now - stamp < 60_000)
    if (recent.length >= createPerMinute) {
      creates.set(ip, recent)
      return false
    }
    recent.push(now)
    creates.set(ip, recent)
    return true
  }

  const broadcast = (code: string) => {
    if (!manager.peek(code)) return
    const ids = io.sockets.adapter.rooms.get(code)
    if (!ids) return
    for (const id of ids) {
      const socket = io.sockets.sockets.get(id)
      const token = manager.tokenForSocket(id)
      if (!socket || !token) continue
      try {
        socket.emit('room:snapshot', manager.snapshot(code, token))
      } catch (error) {
        if (!(error instanceof RoomError)) console.error(error)
      }
    }
  }

  const fail = (ack: Ack, error: unknown) => {
    if (!(error instanceof RoomError)) console.error(error)
    ack({ ok: false, error: error instanceof RoomError ? error.message : 'Something went wrong.' })
  }

  const replacePrevious = (previousSocketId: string | null) => {
    if (!previousSocketId) return
    const previous = io.sockets.sockets.get(previousSocketId)
    previous?.emit('room:replaced')
    previous?.disconnect(true)
  }

  const bind = async (socket: Socket, token: string) => {
    const attached = manager.attach(token, socket.id)
    replacePrevious(attached.previousSocketId)
    await socket.join(attached.code)
    return attached.code
  }

  io.on('connection', (socket) => {
    const ip = socket.handshake.address || 'unknown'

    socket.on('room:create', async (payload: unknown, ack: Ack) => {
      if (typeof ack !== 'function') return
      try {
        if (!allowCreate(ip)) throw new RoomError('Too many rooms from this connection. Wait a minute.')
        const entry = manager.create(readCreate(payload))
        await bind(socket, entry.token)
        ack({ ok: true, data: { token: entry.token, snapshot: manager.snapshot(entry.code, entry.token) } })
        broadcast(entry.code)
      } catch (error) {
        fail(ack, error)
      }
    })

    socket.on('room:join', async (payload: unknown, ack: Ack) => {
      if (typeof ack !== 'function') return
      try {
        const entry = manager.join(readJoin(payload))
        await bind(socket, entry.token)
        ack({
          ok: true,
          data: { token: entry.token, notice: entry.notice ?? null, snapshot: manager.snapshot(entry.code, entry.token) },
        })
        broadcast(entry.code)
      } catch (error) {
        fail(ack, error)
      }
    })

    socket.on('room:watch', async (payload: unknown, ack: Ack) => {
      if (typeof ack !== 'function') return
      try {
        const entry = manager.watch(readJoin(payload))
        await bind(socket, entry.token)
        ack({ ok: true, data: { token: entry.token, snapshot: manager.snapshot(entry.code, entry.token) } })
        broadcast(entry.code)
      } catch (error) {
        fail(ack, error)
      }
    })

    socket.on('room:reconnect', async (payload: unknown, ack: Ack) => {
      if (typeof ack !== 'function') return
      try {
        const body = asRecord(payload)
        const code = extractCode(typeof body?.code === 'string' ? body.code : '')
        const token = typeof body?.token === 'string' ? body.token : ''
        if (!code || !token) throw new RoomError('That seat expired. Join again.')
        const attached = manager.attach(token, socket.id)
        if (attached.code !== code) throw new RoomError('That seat expired. Join again.')
        replacePrevious(attached.previousSocketId)
        await socket.join(code)
        ack({ ok: true, data: { token, snapshot: manager.snapshot(code, token) } })
        broadcast(code)
      } catch (error) {
        fail(ack, error)
      }
    })

    socket.on('room:sit', async (_payload: unknown, ack: Ack) => {
      if (typeof ack !== 'function') return
      try {
        const token = manager.tokenForSocket(socket.id)
        if (!token) throw new RoomError('That seat expired. Join again.')
        const code = manager.sit(token)
        ack({ ok: true, data: { snapshot: manager.snapshot(code, token) } })
        broadcast(code)
      } catch (error) {
        fail(ack, error)
      }
    })

    socket.on('room:leave', async (_payload: unknown, ack: Ack) => {
      if (typeof ack !== 'function') return
      try {
        const token = manager.tokenForSocket(socket.id)
        if (!token) {
          ack({ ok: true, data: null })
          return
        }
        const code = manager.leave(token)
        if (code) await socket.leave(code)
        ack({ ok: true, data: null })
        if (code && manager.peek(code)) broadcast(code)
        else if (code) io.to(code).emit('room:closed')
      } catch (error) {
        fail(ack, error)
      }
    })

    socket.on('room:action', (payload: unknown, ack: Ack) => {
      if (typeof ack !== 'function') return
      try {
        const token = manager.tokenForSocket(socket.id)
        if (!token) throw new RoomError('That seat expired. Join again.')
        const result = manager.action(token, readAction(payload))
        if (result.kind === 'ribbon') {
          socket.to(result.code).emit('ribbon:frame', result.frame)
          ack({ ok: true, data: { accepted: true } })
          return
        }
        ack({ ok: true, data: { snapshot: manager.snapshot(result.code, token) } })
        broadcast(result.code)
      } catch (error) {
        fail(ack, error)
      }
    })

    socket.on('room:chat', (payload: unknown, ack: Ack) => {
      if (typeof ack !== 'function') return
      try {
        const token = manager.tokenForSocket(socket.id)
        if (!token) throw new RoomError('That seat expired. Join again.')
        const body = asRecord(payload)
        const code = manager.chat(token, typeof body?.text === 'string' ? body.text : '')
        ack({ ok: true, data: { snapshot: manager.snapshot(code, token) } })
        broadcast(code)
      } catch (error) {
        fail(ack, error)
      }
    })

    socket.on('room:rematch', (_payload: unknown, ack: Ack) => {
      if (typeof ack !== 'function') return
      try {
        const token = manager.tokenForSocket(socket.id)
        if (!token) throw new RoomError('That seat expired. Join again.')
        const code = manager.rematch(token)
        ack({ ok: true, data: { snapshot: manager.snapshot(code, token) } })
        broadcast(code)
      } catch (error) {
        fail(ack, error)
      }
    })

    socket.on('disconnect', () => {
      const code = manager.detach(socket.id)
      if (code && manager.peek(code)) broadcast(code)
    })
  })

  const timer = setInterval(() => {
    for (const code of manager.sweep()) broadcast(code)
  }, 200)
  timer.unref?.()

  return {
    manager,
    server,
    io,
    listen(port = 0, host = '0.0.0.0') {
      return new Promise((resolve) => {
        server.listen(port, host, () => {
          const address = server.address()
          resolve(typeof address === 'object' && address ? address.port : port)
        })
      })
    },
    close() {
      clearInterval(timer)
      return new Promise((resolve, reject) => {
        io.close()
        server.close((error) => (error ? reject(error) : resolve()))
      })
    },
  }
}
