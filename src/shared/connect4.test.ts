import { describe, expect, test } from 'vitest'
import { COLS, createConnect4, dropDisc, findLine, pickConnect4Move, ROWS } from './connect4'

describe('connect 4', () => {
  test('starts with seven columns and six rows', () => {
    const state = createConnect4()
    expect(state.board).toHaveLength(ROWS)
    expect(state.board[0]).toHaveLength(COLS)
    expect(state.turn).toBe(1)
  })

  test('drops onto the lowest open cell and rejects a full column', () => {
    let state = createConnect4()
    const first = dropDisc(state, 3, 0)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.state.board[5][3]).toBe(1)
    expect(first.state.turn).toBe(2)
    state = first.state
    for (let fill = 0; fill < 6; fill += 1) {
      const seat = state.turn === 1 ? 0 : 1
      const next = dropDisc(state, 0, seat)
      expect(next.ok).toBe(true)
      if (next.ok) state = next.state
    }
    const blocked = dropDisc(state, 0, state.turn === 1 ? 0 : 1)
    expect(blocked.ok).toBe(false)
  })

  test('rejects the wrong seat, a finished board, and a column off the side', () => {
    const state = createConnect4()
    expect(dropDisc(state, 1, 1).ok).toBe(false)
    expect(dropDisc(state, -1, 0).ok).toBe(false)
    expect(dropDisc(state, 7, 0).ok).toBe(false)
    const won = dropDisc({ ...state, winner: 1 }, 0, 0)
    expect(won.ok).toBe(false)
  })

  test('detects horizontal, vertical, and diagonal lines', () => {
    const board = Array.from({ length: 6 }, () => Array<number>(7).fill(0))
    board[5][0] = 1
    board[5][1] = 1
    board[5][2] = 1
    board[5][3] = 1
    expect(findLine(board, 5, 3)?.length).toBeGreaterThanOrEqual(4)

    const vertical = Array.from({ length: 6 }, () => Array<number>(7).fill(0))
    vertical[5][2] = 2
    vertical[4][2] = 2
    vertical[3][2] = 2
    vertical[2][2] = 2
    expect(findLine(vertical, 2, 2)).toHaveLength(4)

    const diagonal = Array.from({ length: 6 }, () => Array<number>(7).fill(0))
    diagonal[5][0] = 1
    diagonal[4][1] = 1
    diagonal[3][2] = 1
    diagonal[2][3] = 1
    expect(findLine(diagonal, 2, 3)).toHaveLength(4)
  })

  test('a vertical stack of four ends the game', () => {
    let state = createConnect4()
    const script = [
      [0, 0],
      [1, 1],
      [0, 0],
      [1, 1],
      [0, 0],
      [1, 1],
      [0, 0],
    ] as const
    let finish
    for (const [column, seat] of script) {
      const next = dropDisc(state, column, seat)
      expect(next.ok).toBe(true)
      if (!next.ok) return
      state = next.state
      finish = next.finish
    }
    expect(finish).toEqual({ type: 'win', winnerSeat: 0, reason: 'line' })
    expect(state.history).toHaveLength(7)
  })

  test('the medium CPU takes a win and blocks a threat', () => {
    const win = createConnect4()
    win.board[5][0] = 1
    win.board[4][0] = 1
    win.board[3][0] = 1
    expect(pickConnect4Move(win, 'medium', () => 0)).toBe(0)
    expect(pickConnect4Move(win, 'easy', () => 0)).toBe(0)

    const block = createConnect4()
    block.board[5][1] = 2
    block.board[4][1] = 2
    block.board[3][1] = 2
    expect(pickConnect4Move(block, 'medium')).toBe(1)
  })

  test('easy and medium both return a legal opening move', () => {
    const state = createConnect4()
    expect(pickConnect4Move(state, 'easy', () => 0)).toBeGreaterThanOrEqual(0)
    const started = Date.now()
    const medium = pickConnect4Move(state, 'medium')
    expect(medium).toBeGreaterThanOrEqual(0)
    expect(medium).toBeLessThan(7)
    expect(Date.now() - started).toBeLessThan(400)
  })
})
