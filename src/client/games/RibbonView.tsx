import { useEffect, useRef } from 'react'
import { TRAIL_MS, type RibbonState } from '../../shared/ribbon'
import type { Snapshot } from '../../shared/snapshot'
import { onFrame, sendRibbon } from '../net'

interface Trail {
  x: number
  y: number
  seenAt: number
}

interface Remote {
  x: number
  y: number
  angle: number
  tx: number
  ty: number
  tangle: number
  trail: Trail[]
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, width, height, radius)
  else ctx.rect(x, y, width, height)
}

function typing(): boolean {
  const element = document.activeElement
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
}

export function RibbonView({ snap }: { snap: Snapshot }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const snapRef = useRef(snap)
  snapRef.current = snap
  const local = useRef({ x: 0.5, y: 0.5, angle: -Math.PI / 2, trail: [] as Trail[], ready: false })
  const remotes = useRef(new Map<number, Remote>())
  const known = useRef('')
  const lastSend = useRef(0)

  useEffect(() => {
    const state = snap.state as RibbonState
    const key = state.drivers.map((driver) => driver.seatIndex).join(',')
    if (key === known.current) return
    known.current = key
    const skew = Date.now() - snap.serverNow
    const mine = snap.you.seatIndex
    for (const driver of state.drivers) {
      if (driver.seatIndex === mine) {
        if (!local.current.ready) {
          local.current = {
            x: driver.x,
            y: driver.y,
            angle: driver.angle,
            trail: driver.trail.map((point) => ({ x: point.x, y: point.y, seenAt: point.t + skew })),
            ready: true,
          }
        }
      } else if (!remotes.current.has(driver.seatIndex)) {
        remotes.current.set(driver.seatIndex, {
          x: driver.x,
          y: driver.y,
          angle: driver.angle,
          tx: driver.x,
          ty: driver.y,
          tangle: driver.angle,
          trail: driver.trail.map((point) => ({ x: point.x, y: point.y, seenAt: point.t + skew })),
        })
      }
    }
    for (const seat of [...remotes.current.keys()]) {
      if (!state.drivers.some((driver) => driver.seatIndex === seat)) remotes.current.delete(seat)
    }
  }, [snap])

  useEffect(() => {
    return onFrame((frame) => {
      if (frame.seatIndex === snapRef.current.you.seatIndex) return
      const skew = Date.now() - frame.serverNow
      let remote = remotes.current.get(frame.seatIndex)
      if (!remote) {
        remote = { x: frame.x, y: frame.y, angle: frame.angle, tx: frame.x, ty: frame.y, tangle: frame.angle, trail: [] }
        remotes.current.set(frame.seatIndex, remote)
      }
      remote.tx = frame.x
      remote.ty = frame.y
      remote.tangle = frame.angle
      remote.trail.push({ x: frame.x, y: frame.y, seenAt: frame.t + skew })
    })
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let frameId = 0
    const paintCar = (
      ctx: CanvasRenderingContext2D,
      width: number,
      height: number,
      seatIndex: number,
      x: number,
      y: number,
      angle: number,
      trail: Trail[],
      now: number,
    ) => {
      const seat = snapRef.current.seats.find((item) => item.index === seatIndex)
      const color = seat?.color ?? '#f5c542'
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.lineWidth = Math.max(5, Math.min(width, height) / 90)
      for (let index = 1; index < trail.length; index += 1) {
        const alpha = 1 - (now - trail[index].seenAt) / TRAIL_MS
        if (alpha <= 0) continue
        ctx.globalAlpha = alpha * 0.9
        ctx.strokeStyle = color
        ctx.beginPath()
        ctx.moveTo(trail[index - 1].x * width, trail[index - 1].y * height)
        ctx.lineTo(trail[index].x * width, trail[index].y * height)
        ctx.stroke()
      }
      ctx.globalAlpha = 1
      const px = x * width
      const py = y * height
      ctx.save()
      ctx.translate(px, py)
      ctx.rotate(angle)
      ctx.fillStyle = color
      roundRect(ctx, -18, -10, 36, 20, 6)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      roundRect(ctx, 4, -6, 8, 12, 2)
      ctx.fill()
      ctx.restore()
      const label = seat?.name ?? 'Driver'
      ctx.font = '600 13px "Segoe UI", sans-serif'
      ctx.textAlign = 'center'
      const textWidth = ctx.measureText(label).width
      ctx.fillStyle = 'rgba(16,18,16,0.86)'
      roundRect(ctx, px - textWidth / 2 - 7, py - 38, textWidth + 14, 18, 9)
      ctx.fill()
      ctx.fillStyle = '#f4f1e8'
      ctx.fillText(label, px, py - 25)
    }

    const draw = () => {
      frameId = requestAnimationFrame(draw)
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      if (width < 2 || height < 2) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const pixelWidth = Math.floor(width * dpr)
      const pixelHeight = Math.floor(height * dpr)
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth
        canvas.height = pixelHeight
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = '#141714'
      ctx.fillRect(0, 0, width, height)
      ctx.strokeStyle = 'rgba(243,241,234,0.05)'
      ctx.lineWidth = 1
      for (let x = 0; x < width; x += 56) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, height)
        ctx.stroke()
      }
      for (let y = 0; y < height; y += 56) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
        ctx.stroke()
      }
      const now = Date.now()
      for (const [seat, remote] of remotes.current) {
        remote.x += (remote.tx - remote.x) * 0.35
        remote.y += (remote.ty - remote.y) * 0.35
        remote.angle += (remote.tangle - remote.angle) * 0.35
        remote.trail = remote.trail.filter((point) => now - point.seenAt < TRAIL_MS)
        paintCar(ctx, width, height, seat, remote.x, remote.y, remote.angle, remote.trail, now)
      }
      const me = snapRef.current.you
      if (me.role === 'player' && me.seatIndex != null) {
        local.current.trail = local.current.trail.filter((point) => now - point.seenAt < TRAIL_MS)
        paintCar(ctx, width, height, me.seatIndex, local.current.x, local.current.y, local.current.angle, local.current.trail, now)
      }
      canvas.dataset.localX = local.current.x.toFixed(3)
      canvas.dataset.localY = local.current.y.toFixed(3)
      canvas.dataset.peerCount = String(remotes.current.size)
      const peer = remotes.current.values().next().value as Remote | undefined
      if (peer) canvas.dataset.peerX = peer.x.toFixed(3)
    }
    frameId = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frameId)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let touching = false
    const pointFrom = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      return {
        x: clamp((event.clientX - rect.left) / rect.width),
        y: clamp((event.clientY - rect.top) / rect.height),
      }
    }
    const driveLocal = (x: number, y: number) => {
      if (snapRef.current.you.role !== 'player') return
      const car = local.current
      const dx = x - car.x
      const dy = y - car.y
      if (Math.hypot(dx, dy) > 0.002) car.angle = Math.atan2(dy, dx)
      car.x = x
      car.y = y
      car.ready = true
      const now = Date.now()
      const previous = car.trail[car.trail.length - 1]
      if (!previous || Math.hypot(x - previous.x, y - previous.y) >= 0.004) car.trail.push({ x, y, seenAt: now })
      if (now - lastSend.current < 100) return
      lastSend.current = now
      sendRibbon(x, y, car.angle)
    }
    const onMove = (event: PointerEvent) => {
      if (typing()) return
      const point = pointFrom(event)
      if (event.pointerType === 'mouse') driveLocal(point.x, point.y)
      else if (touching) driveLocal(point.x, point.y)
    }
    const onDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') return
      if (event.target instanceof Element && event.target.closest('[data-interactive]')) return
      touching = true
      const point = pointFrom(event)
      driveLocal(point.x, point.y)
    }
    const onUp = () => {
      touching = false
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [])

  return <canvas ref={canvasRef} data-testid="ribbon-floor" aria-label="Ribbon Rally floor" />
}
