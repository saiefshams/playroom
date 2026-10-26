const NAME = 'playroom-name'
const COLOR = 'playroom-color'

function read(store: Storage, key: string): string | null {
  try {
    return store.getItem(key)
  } catch {
    return null
  }
}

function write(store: Storage, key: string, value: string): void {
  try {
    store.setItem(key, value)
  } catch {
    // Private browsing can reject storage. The room still works for this visit.
  }
}

export function loadName(): string {
  return read(localStorage, NAME) ?? ''
}

export function saveName(name: string): void {
  write(localStorage, NAME, name)
}

export function loadColor(): string | null {
  return read(localStorage, COLOR)
}

export function saveColor(color: string): void {
  write(localStorage, COLOR, color)
}

export function seatKey(code: string): string {
  return `playroom-seat:${code}`
}

export function loadSeat(code: string): string | null {
  return read(sessionStorage, seatKey(code))
}

export function saveSeat(code: string, token: string): void {
  write(sessionStorage, seatKey(code), token)
}

export function clearSeat(code: string): void {
  try {
    sessionStorage.removeItem(seatKey(code))
  } catch {
    // Ignore storage failures.
  }
}

export function loadNotice(): string {
  const notice = read(sessionStorage, 'playroom-notice') ?? ''
  try {
    sessionStorage.removeItem('playroom-notice')
  } catch {
    // Ignore storage failures.
  }
  return notice
}

export function saveNotice(notice: string): void {
  if (notice) write(sessionStorage, 'playroom-notice', notice)
}
