import { io } from 'socket.io-client'
import type { RibbonFrame } from '../shared/ribbon'
import type { Snapshot } from '../shared/snapshot'

export const socket = io({ autoConnect: false, transports: ['websocket', 'polling'] })

export const session: { code: string | null; token: string | null } = { code: null, token: null }

const snapshotListeners = new Set<(snap: Snapshot) => void>()
const frameListeners = new Set<(frame: RibbonFrame) => void>()
const closedListeners = new Set<() => void>()
const replacedListeners = new Set<() => void>()

let ignoringReplacement = false

socket.on('room:snapshot', (snap: Snapshot) => snapshotListeners.forEach((fn) => fn(snap)))
socket.on('ribbon:frame', (frame: RibbonFrame) => frameListeners.forEach((fn) => fn(frame)))
socket.on('room:closed', () => closedListeners.forEach((fn) => fn()))
socket.on('room:replaced', () => {
  if (ignoringReplacement) return
  replacedListeners.forEach((fn) => fn())
})

socket.io.on('reconnect', () => {
  if (!session.code || !session.token) return
  ignoringReplacement = true
  void request<{ snapshot: Snapshot }>('room:reconnect', { code: session.code, token: session.token })
    .then((data) => snapshotListeners.forEach((fn) => fn(data.snapshot)))
    .catch((error: Error) => {
      if (/expired|does not exist/i.test(error.message)) replacedListeners.forEach((fn) => fn())
    })
    .finally(() => {
      window.setTimeout(() => {
        ignoringReplacement = false
      }, 2000)
    })
})

export function onSnapshot(fn: (snap: Snapshot) => void): () => void {
  snapshotListeners.add(fn)
  return () => snapshotListeners.delete(fn)
}

export function onFrame(fn: (frame: RibbonFrame) => void): () => void {
  frameListeners.add(fn)
  return () => frameListeners.delete(fn)
}

export function onClosed(fn: () => void): () => void {
  closedListeners.add(fn)
  return () => closedListeners.delete(fn)
}

export function onReplaced(fn: () => void): () => void {
  replacedListeners.add(fn)
  return () => replacedListeners.delete(fn)
}

export function connectSocket(): void {
  if (!socket.connected) socket.connect()
}

export function sendRibbon(x: number, y: number, angle: number): void {
  connectSocket()
  socket.volatile.emit('room:action', { type: 'ribbon:drive', x, y, angle })
}

export function request<T>(event: string, payload: unknown): Promise<T> {
  connectSocket()
  return new Promise((resolve, reject) => {
    socket.timeout(10_000).emit(event, payload, (error: Error | null, body: { ok: true; data: T } | { ok: false; error: string }) => {
      if (error || !body) reject(new Error('No answer from the parlor. Try again.'))
      else if (!body.ok) reject(new Error(body.error))
      else resolve(body.data)
    })
  })
}
