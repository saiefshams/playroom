import { useEffect, useState } from 'react'

let muted = false
try {
  muted = localStorage.getItem('playroom-mute') === '1'
} catch {
  muted = false
}

let ctx: AudioContext | null = null
const listeners = new Set<() => void>()

export function isMuted(): boolean {
  return muted
}

export function setMuted(next: boolean): void {
  muted = next
  try {
    localStorage.setItem('playroom-mute', next ? '1' : '0')
  } catch {
    // The toggle still applies for this visit.
  }
  listeners.forEach((fn) => fn())
}

export function useMute(): boolean {
  const [value, setValue] = useState(muted)
  useEffect(() => {
    const update = () => setValue(muted)
    listeners.add(update)
    return () => {
      listeners.delete(update)
    }
  }, [])
  return value
}

export function unlock(): void {
  const Context = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Context) return
  ctx = ctx ?? new Context()
  if (ctx.state === 'suspended') void ctx.resume()
}

export function play(kind: 'move' | 'win' | 'chat' | 'tick' | 'pop'): void {
  if (muted || !ctx || ctx.state !== 'running') return
  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  const tone = { move: 520, win: 660, chat: 740, tick: 880, pop: 180 }[kind]
  osc.type = kind === 'pop' ? 'triangle' : 'sine'
  osc.frequency.setValueAtTime(tone, now)
  if (kind === 'win') osc.frequency.exponentialRampToValueAtTime(990, now + 0.18)
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(kind === 'tick' ? 0.03 : 0.05, now + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + (kind === 'win' ? 0.28 : 0.12))
  osc.start(now)
  osc.stop(now + 0.3)
}
