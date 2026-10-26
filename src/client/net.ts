import { io } from 'socket.io-client'
import type { RibbonFrame } from '../shared/ribbon'
import type { Snapshot } from '../shared/snapshot'

export const socket = io({ autoConnect: false, transports: ['websocket', 'polling'] })

export const session: { code: string | null; token: string | null } = { code: null, token: null }

const snapshotListeners = new Set<(snap: Snapshot) => void>()
const frameListeners = new Set<(frame: RibbonFrame) => void>()
const closedListeners = new Set<() => void>()
const replacedListeners = new Set<() => void>()

socket.on('room:snapshot', (snap: Snapshot) => snapshotListeners.forEach((fn) => fn(snap)))
socket.on('ribbon:frame', (frame: RibbonFrame) => frameListeners.forEach((fn) => fn(frame)))
socket.on('room:closed', () => closedListeners.forEach((fn) => fn()))
socket.on('room:replaced', () => replacedListeners.forEach((fn) => fn()))

socket.io.on('reconnect', () => {
  if (!session.code || !session.token) return
  void request<{ snapshot: Snapshot }>('room:reconnect', { code: session.code, token: session.token }).catch(() => {
    replacedListeners.forEach((fn) => fn())
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
