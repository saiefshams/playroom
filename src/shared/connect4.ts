import type { Finish } from './types'

export const COLS = 7
export const ROWS = 6

export interface Connect4State {
  board: number[][]
  turn: 1 | 2
  winner: 0 | 1 | 2
  line: [number, number][]
  last: { row: number; col: number } | null
  draw: boolean
  history: { seat: number; column: number; row: number }[]
}

const DIRS: [number, number][] = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
]

export function createConnect4(): Connect4State {
  return {
    board: Array.from({ length: ROWS }, () => Array<number>(COLS).fill(0)),
    turn: 1,
    winner: 0,
    line: [],
    last: null,
    draw: false,
    history: [],
  }
}

export function findLine(board: number[][], row: number, col: number): [number, number][] | null {
  const player = board[row]?.[col]
  if (!player) return null
  for (const [dr, dc] of DIRS) {
    const cells: [number, number][] = [[row, col]]
    for (const sign of [1, -1]) {
      for (let step = 1; step < 4; step += 1) {
        const nextRow = row + dr * step * sign
        const nextCol = col + dc * step * sign
        if (board[nextRow]?.[nextCol] !== player) break
        cells.push([nextRow, nextCol])
      }
    }
    if (cells.length >= 4) return cells
  }
  return null
}

export function dropDisc(
  state: Connect4State,
  column: number,
  seat: number,
): { ok: true; state: Connect4State; finish?: Finish } | { ok: false; error: string } {
  if (state.winner || state.draw) return { ok: false, error: 'The game is over.' }
  if (!Number.isInteger(column) || column < 0 || column >= COLS) return { ok: false, error: 'Choose a column.' }
  if (seat !== 0 && seat !== 1) return { ok: false, error: 'That seat cannot play.' }
  const player = (seat + 1) as 1 | 2
  if (player !== state.turn) return { ok: false, error: 'It is not your turn.' }

  let row = -1
  for (let cursor = ROWS - 1; cursor >= 0; cursor -= 1) {
    if (state.board[cursor][column] === 0) {
      row = cursor
      break
    }
  }
  if (row < 0) return { ok: false, error: 'That column is full.' }

  const board = state.board.map((line) => line.slice())
  board[row][column] = player
  const line = findLine(board, row, column)
  const winner = line ? player : 0
  const draw = !line && board.every((cells) => cells.every((cell) => cell !== 0))
  const next: Connect4State = {
    board,
    turn: player === 1 ? 2 : 1,
    winner,
    line: line ?? [],
    last: { row, col: column },
    draw,
    history: [...state.history, { seat, column, row }],
  }
  if (winner) return { ok: true, state: next, finish: { type: 'win', winnerSeat: seat as 0 | 1, reason: 'line' } }
  if (draw) return { ok: true, state: next, finish: { type: 'draw', winnerSeat: null, reason: 'draw' } }
  return { ok: true, state: next }
}

const ORDER = [3, 2, 4, 1, 5, 0, 6]
const WEIGHTS = [0, 1, 6, 24, 1000]

function pack(board: number[][]): Int8Array {
  const packed = new Int8Array(ROWS * COLS)
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) packed[row * COLS + col] = board[row][col]
  }
  return packed
}

function landing(packed: Int8Array, col: number): number {
  for (let row = ROWS - 1; row >= 0; row -= 1) {
    if (packed[row * COLS + col] === 0) return row
  }
  return -1
}

function winsPacked(packed: Int8Array, row: number, col: number, player: number): boolean {
  for (const [dr, dc] of DIRS) {
    let count = 1
    for (const sign of [1, -1]) {
      for (let step = 1; step < 4; step += 1) {
        const nextRow = row + dr * step * sign
        const nextCol = col + dc * step * sign
        if (nextRow < 0 || nextRow >= ROWS || nextCol < 0 || nextCol >= COLS) break
        if (packed[nextRow * COLS + nextCol] !== player) break
        count += 1
      }
    }
    if (count >= 4) return true
  }
  return false
}

function evaluatePacked(packed: Int8Array, me: number): number {
  const opp = me === 1 ? 2 : 1
  let score = 0
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const cell = packed[row * COLS + col]
      if (!cell) continue
      const bonus = col === 3 ? 4 : col === 2 || col === 4 ? 2 : 0
      score += cell === me ? bonus : -bonus
    }
  }
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      for (const [dr, dc] of DIRS) {
        let mine = 0
        let theirs = 0
        let valid = true
        for (let step = 0; step < 4; step += 1) {
          const nextRow = row + dr * step
          const nextCol = col + dc * step
          if (nextRow >= ROWS || nextCol < 0 || nextCol >= COLS) {
            valid = false
            break
          }
          const value = packed[nextRow * COLS + nextCol]
          if (value === me) mine += 1
          else if (value === opp) theirs += 1
        }
        if (!valid || (mine > 0 && theirs > 0)) continue
        if (mine) score += WEIGHTS[mine]
        else if (theirs) score -= WEIGHTS[theirs]
      }
    }
  }
  return score
}

function negamax(packed: Int8Array, depth: number, alpha: number, beta: number, me: number, nodes: { n: number }): number {
  nodes.n += 1
  if (nodes.n > 80_000 || depth === 0) return evaluatePacked(packed, me)
  const opp = me === 1 ? 2 : 1
  let best = -Infinity
  let any = false
  for (const col of ORDER) {
    const row = landing(packed, col)
    if (row < 0) continue
    any = true
    packed[row * COLS + col] = me
    let score: number
    if (winsPacked(packed, row, col, me)) score = 100_000 + depth
    else score = -negamax(packed, depth - 1, -beta, -alpha, opp, nodes)
    packed[row * COLS + col] = 0
    if (score > best) best = score
    if (best > alpha) alpha = best
    if (alpha >= beta) break
  }
  return any ? best : 0
}

export function pickConnect4Move(
  state: Connect4State,
  difficulty: 'easy' | 'medium',
  rng: () => number = Math.random,
): number | null {
  if (state.winner || state.draw) return null
  const packed = pack(state.board)
  const me = state.turn
  const legal = ORDER.filter((col) => landing(packed, col) >= 0)
  if (legal.length === 0) return null

  for (const col of legal) {
    const row = landing(packed, col)
    packed[row * COLS + col] = me
    const win = winsPacked(packed, row, col, me)
    packed[row * COLS + col] = 0
    if (win) return col
  }

  if (difficulty === 'easy' && rng() < 0.45) {
    const index = Math.floor(rng() * legal.length) % legal.length
    return legal[index]
  }

  const depth = difficulty === 'medium' ? 5 : 2
  const opp = me === 1 ? 2 : 1
  let bestCol = legal[0]
  let bestScore = -Infinity
  for (const col of legal) {
    const row = landing(packed, col)
    packed[row * COLS + col] = me
    const score = -negamax(packed, depth - 1, -Infinity, Infinity, opp, { n: 0 })
    packed[row * COLS + col] = 0
    if (score > bestScore) {
      bestScore = score
      bestCol = col
    }
  }
  return bestCol
}
