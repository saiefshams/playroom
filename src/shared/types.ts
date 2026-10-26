export type GameId = 'connect4' | 'chess' | 'ribbon'

export type Difficulty = 'easy' | 'medium'

export type RoomStatus = 'lobby' | 'playing' | 'finished'

export type Promotion = 'q' | 'r' | 'b' | 'n'

export type FinishReason =
  | 'line'
  | 'checkmate'
  | 'resign'
  | 'timeout'
  | 'abandon'
  | 'stalemate'
  | 'repetition'
  | 'material'
  | 'fifty'
  | 'draw'

export interface Finish {
  type: 'win' | 'draw'
  winnerSeat: 0 | 1 | null
  reason: FinishReason
}

export type GameAction =
  | { type: 'connect4:drop'; column: number; asCpu?: boolean }
  | { type: 'chess:move'; from: string; to: string; promotion?: Promotion; asCpu?: boolean }
  | { type: 'resign'; asCpu?: boolean }
  | { type: 'ribbon:drive'; x: number; y: number; angle: number }

export interface PublicSeat {
  index: number
  name: string
  color: string | null
  connected: boolean
  isCpu: boolean
  isYou: boolean
  left: boolean
}

export interface ChatMessage {
  id: number
  name: string
  text: string
  at: number
}

export interface PublicClock {
  baseMs: number
  remaining: [number, number]
  activeSeat: number | null
  running: boolean
  turnStartedAt: number
}

export interface Viewer {
  role: 'player' | 'spectator'
  seatIndex: number | null
  name: string
}
