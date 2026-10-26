import { Chess } from 'chess.js'
import { describe, expect, test } from 'vitest'
import { pickChessMove } from './chessBot'
import { chessTurnSeat, createChess, playChess } from './chessRules'

describe('chess rules', () => {
  test('rejects an illegal move and accepts the opening', () => {
    const start = createChess()
    expect(playChess(start, 'e2', 'e5').ok).toBe(false)
    const played = playChess(start, 'e2', 'e4')
    expect(played.ok).toBe(true)
    if (!played.ok) return
    expect(played.state.history[0].san).toBe('e4')
    expect(played.state.turn).toBe('b')
    expect(chessTurnSeat(played.state)).toBe(1)
  })

  test("plays fool's mate", () => {
    let state = createChess()
    let finish
    for (const [from, to] of [
      ['f2', 'f3'],
      ['e7', 'e5'],
      ['g2', 'g4'],
      ['d8', 'h4'],
    ] as const) {
      const next = playChess(state, from, to)
      expect(next.ok).toBe(true)
      if (!next.ok) return
      state = next.state
      finish = next.finish
    }
    expect(finish).toEqual({ type: 'win', winnerSeat: 1, reason: 'checkmate' })
    expect(playChess(state, 'a2', 'a3').ok).toBe(false)
  })

  test('castles, captures en passant, and promotes', () => {
    const castle = playChess(
      { fen: 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', turn: 'w', inCheck: false, lastMove: null, history: [] },
      'e1',
      'g1',
    )
    expect(castle.ok).toBe(true)
    if (castle.ok) expect(castle.state.fen.startsWith('r3k2r/8/8/8/8/8/8/R4RK1')).toBe(true)

    const passant = playChess(
      { fen: 'k7/8/8/3pP3/8/8/8/7K w - d6 0 1', turn: 'w', inCheck: false, lastMove: null, history: [] },
      'e5',
      'd6',
    )
    expect(passant.ok).toBe(true)
    if (passant.ok) expect(passant.state.history[0].san).toBe('exd6')

    const queen = playChess(
      { fen: '8/P7/8/8/8/8/8/k1K5 w - - 0 1', turn: 'w', inCheck: false, lastMove: null, history: [] },
      'a7',
      'a8',
      'n',
    )
    expect(queen.ok).toBe(true)
    if (queen.ok) expect(queen.state.history[0].san).toContain('N')
  })

  test('recognizes stalemate after the position is already drawn', () => {
    const chess = new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')
    expect(chess.isStalemate()).toBe(true)
  })

  test('medium finds mate in one and stays inside a time budget', () => {
    const mate = pickChessMove('6k1/5ppp/8/8/8/8/8/4Q1K1 w - - 0 1', 'medium', 800)
    expect(mate).toMatchObject({ from: 'e1', to: 'e8' })

    const started = Date.now()
    const opening = pickChessMove(createChess().fen, 'medium', 500)
    expect(opening?.from).toMatch(/^[a-h][1-8]$/)
    expect(opening?.to).toMatch(/^[a-h][1-8]$/)
    expect(Date.now() - started).toBeLessThan(1200)
    const legal = new Chess()
    expect(legal.moves({ verbose: true }).some((move) => move.from === opening?.from && move.to === opening?.to)).toBe(true)
  })

  test('easy returns a legal move and does not move from a finished game', () => {
    const easy = pickChessMove(createChess().fen, 'easy', 200)
    const chess = new Chess()
    expect(chess.moves({ verbose: true }).some((move) => move.from === easy?.from && move.to === easy?.to)).toBe(true)
    expect(pickChessMove('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', 'medium')).toBeNull()
  })
})
