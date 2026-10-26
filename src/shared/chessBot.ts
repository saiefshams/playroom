import { Chess, type Move } from 'chess.js'
import type { Difficulty, Promotion } from './types'

const VALUE: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 }

const PAWN = [
  0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0,
  0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0,
]

const KNIGHT = [
  -50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20,
  20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50,
  -40, -30, -30, -30, -30, -40, -50,
]

export interface ChessPick {
  from: string
  to: string
  promotion?: Promotion
}

function evaluate(chess: Chess): number {
  if (chess.isCheckmate()) return chess.turn() === 'w' ? -100_000 : 100_000
  if (chess.isDraw()) return 0
  let score = 0
  const board = chess.board()
  for (let rank = 0; rank < 8; rank += 1) {
    for (let file = 0; file < 8; file += 1) {
      const piece = board[rank][file]
      if (!piece || piece.type === 'k') continue
      const index = rank * 8 + file
      const tableIndex = piece.color === 'w' ? index : index ^ 56
      const placement = piece.type === 'p' ? PAWN[tableIndex] : piece.type === 'n' ? KNIGHT[tableIndex] : 0
      const total = (VALUE[piece.type] ?? 0) + (placement ?? 0)
      score += piece.color === 'w' ? total : -total
    }
  }
  return score
}

function moveScore(move: Move): number {
  let score = 0
  if (move.captured) score += 10 * (VALUE[move.captured] ?? 0) - (VALUE[move.piece] ?? 0)
  if (move.promotion) score += 800
  return score
}

function play(chess: Chess, move: Move): void {
  chess.move({ from: move.from, to: move.to, promotion: move.promotion })
}

function minimax(chess: Chess, depth: number, alpha: number, beta: number, deadline: number): number | null {
  if (Date.now() > deadline) return null
  if (depth === 0 || chess.isGameOver()) return evaluate(chess)
  const moves = chess.moves({ verbose: true }).sort((a, b) => moveScore(b) - moveScore(a))
  const white = chess.turn() === 'w'
  let best = white ? -Infinity : Infinity
  for (const move of moves) {
    if (Date.now() > deadline) return null
    play(chess, move)
    const score = minimax(chess, depth - 1, alpha, beta, deadline)
    chess.undo()
    if (score == null) return null
    if (white) {
      if (score > best) best = score
      if (best > alpha) alpha = best
    } else {
      if (score < best) best = score
      if (best < beta) beta = best
    }
    if (beta <= alpha) break
  }
  return best
}

function searchRoot(chess: Chess, moves: Move[], depth: number, deadline: number): Move | null {
  const white = chess.turn() === 'w'
  let bestMove: Move | null = null
  let bestScore = white ? -Infinity : Infinity
  let alpha = -Infinity
  let beta = Infinity
  for (const move of moves) {
    if (Date.now() > deadline) return bestMove
    play(chess, move)
    const score = depth === 1 ? evaluate(chess) : minimax(chess, depth - 1, alpha, beta, deadline)
    chess.undo()
    if (score == null) return bestMove
    if (white ? score > bestScore : score < bestScore) {
      bestScore = score
      bestMove = move
      if (white) alpha = Math.max(alpha, bestScore)
      else beta = Math.min(beta, bestScore)
    }
  }
  return bestMove
}

function toPick(move: Move): ChessPick {
  const promotion = move.promotion
  if (promotion === 'q' || promotion === 'r' || promotion === 'b' || promotion === 'n') {
    return { from: move.from, to: move.to, promotion }
  }
  return { from: move.from, to: move.to }
}

export function pickChessMove(fen: string, difficulty: Difficulty, budgetMs = difficulty === 'easy' ? 250 : 500): ChessPick | null {
  let chess: Chess
  try {
    chess = new Chess(fen)
  } catch {
    return null
  }
  if (chess.isGameOver()) return null
  const legal = chess.moves({ verbose: true })
  if (legal.length === 0) return null

  if (difficulty === 'easy') {
    const white = chess.turn() === 'w'
    const scored = legal.map((move) => {
      play(chess, move)
      const score = evaluate(chess)
      chess.undo()
      return { move, score }
    })
    scored.sort((a, b) => (white ? b.score - a.score : a.score - b.score))
    const best = scored[0].score
    const band = scored.filter((entry) => Math.abs(entry.score - best) <= 80)
    const pool = band.length > 0 ? band : scored
    return toPick(pool[Math.floor(Math.random() * pool.length)].move)
  }

  const deadline = Date.now() + budgetMs
  const ordered = [...legal].sort((a, b) => moveScore(b) - moveScore(a))
  let chosen = ordered[0]
  for (let depth = 1; depth <= 3; depth += 1) {
    if (Date.now() > deadline) break
    const found = searchRoot(chess, ordered, depth, deadline)
    if (!found) break
    chosen = found
    const index = ordered.findIndex(
      (move) => move.from === found.from && move.to === found.to && move.promotion === found.promotion,
    )
    if (index > 0) {
      const [next] = ordered.splice(index, 1)
      ordered.unshift(next)
    }
  }
  return toPick(chosen)
}
