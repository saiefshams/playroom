import { Chess, type Square } from 'chess.js'
import type { Finish, Promotion } from './types'

export interface ChessMoveRecord {
  san: string
  from: string
  to: string
}

export interface ChessState {
  fen: string
  turn: 'w' | 'b'
  inCheck: boolean
  lastMove: { from: string; to: string } | null
  history: ChessMoveRecord[]
}

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

export function createChess(): ChessState {
  return { fen: START, turn: 'w', inCheck: false, lastMove: null, history: [] }
}

export function chessTurnSeat(state: ChessState): 0 | 1 {
  return state.turn === 'w' ? 0 : 1
}

function isSquare(value: string): value is Square {
  return /^[a-h][1-8]$/.test(value)
}

function finishFor(chess: Chess): Finish | undefined {
  if (chess.isCheckmate()) {
    return { type: 'win', winnerSeat: chess.turn() === 'w' ? 1 : 0, reason: 'checkmate' }
  }
  if (chess.isStalemate()) return { type: 'draw', winnerSeat: null, reason: 'stalemate' }
  if (chess.isThreefoldRepetition()) return { type: 'draw', winnerSeat: null, reason: 'repetition' }
  if (chess.isInsufficientMaterial()) return { type: 'draw', winnerSeat: null, reason: 'material' }
  if (chess.isDrawByFiftyMoves()) return { type: 'draw', winnerSeat: null, reason: 'fifty' }
  if (chess.isDraw()) return { type: 'draw', winnerSeat: null, reason: 'draw' }
  return undefined
}

export function playChess(
  state: ChessState,
  from: string,
  to: string,
  promotion?: Promotion,
): { ok: true; state: ChessState; finish?: Finish } | { ok: false; error: string } {
  if (!isSquare(from) || !isSquare(to)) return { ok: false, error: 'That square is not on the board.' }
  let chess: Chess
  try {
    chess = new Chess(state.fen)
  } catch {
    return { ok: false, error: 'That move is not legal.' }
  }
  if (chess.isGameOver()) return { ok: false, error: 'The game is over.' }
  const piece = chess.get(from)
  const promoRank = chess.turn() === 'w' ? '8' : '1'
  const needsPromo = piece?.type === 'p' && to[1] === promoRank
  try {
    const move = chess.move({
      from,
      to,
      promotion: needsPromo ? (promotion ?? 'q') : undefined,
    })
    if (!move) return { ok: false, error: 'That move is not legal.' }
    const next: ChessState = {
      fen: chess.fen(),
      turn: chess.turn(),
      inCheck: chess.isCheck(),
      lastMove: { from: move.from, to: move.to },
      history: [...state.history, { san: move.san, from: move.from, to: move.to }].slice(-120),
    }
    return { ok: true, state: next, finish: finishFor(chess) }
  } catch {
    return { ok: false, error: 'That move is not legal.' }
  }
}
