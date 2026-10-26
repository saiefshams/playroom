import type { ChessState } from './chessRules'
import type { Connect4State } from './connect4'
import type { RibbonState } from './ribbon'
import type { ChatMessage, Difficulty, Finish, GameId, PublicClock, PublicSeat, RoomStatus, Viewer } from './types'

export interface Snapshot {
  code: string
  gameId: GameId
  status: RoomStatus
  version: number
  serverNow: number
  seats: PublicSeat[]
  you: Viewer
  spectatorCount: number
  chat: ChatMessage[]
  clock: PublicClock | null
  cpu: { seatIndex: number; difficulty: Difficulty } | null
  result: Finish | null
  rematchSeats: number[]
  state: Connect4State | ChessState | RibbonState
  statusLine: string
}
