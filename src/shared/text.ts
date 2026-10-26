const CODE_IN_PATH = /\/room\/([A-Za-z0-9]{6})\/?(?:[?#].*)?$/

export function cleanName(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const name = input.replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16)
  return name.length > 0 ? name : null
}

export function cleanChat(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const text = input.replace(/[\u0000-\u001f]/g, ' ').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 200)
  return text.length > 0 ? text : null
}

export function cleanColor(input: unknown): string | null {
  if (typeof input !== 'string') return null
  return /^#[0-9a-fA-F]{6}$/.test(input) ? input.toLowerCase() : null
}

export function extractCode(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  const fromPath = trimmed.match(CODE_IN_PATH)
  if (fromPath) return fromPath[1].toUpperCase()
  if (/^[A-Za-z0-9]{6}$/.test(trimmed)) return trimmed.toUpperCase()
  return null
}

export const CLOCK_CHOICES = [
  { id: 'untimed', label: 'Untimed', ms: 0 },
  { id: '5+0', label: '5+0', ms: 5 * 60 * 1000 },
  { id: '10+0', label: '10+0', ms: 10 * 60 * 1000 },
] as const

export type ClockId = (typeof CLOCK_CHOICES)[number]['id']

export function clockMs(id: unknown): number | null {
  if (typeof id !== 'string') return null
  const found = CLOCK_CHOICES.find((choice) => choice.id === id)
  return found ? found.ms : null
}

export function formatClock(ms: number): string {
  const safe = Number.isFinite(ms) ? Math.max(0, ms) : 0
  const total = Math.ceil(safe / 1000 - 1e-9)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
