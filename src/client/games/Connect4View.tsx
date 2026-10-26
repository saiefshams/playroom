import { useEffect, useState, type CSSProperties } from 'react'
import { COLS, ROWS, type Connect4State } from '../../shared/connect4'
import type { Snapshot } from '../../shared/snapshot'

function landingRow(board: number[][], column: number): number {
  for (let row = ROWS - 1; row >= 0; row -= 1) {
    if (board[row][column] === 0) return row
  }
  return -1
}

export function Connect4View({ snap, onMove }: { snap: Snapshot; onMove: (column: number) => void }) {
  const state = snap.state as Connect4State
  const [hoverColumn, setHoverColumn] = useState<number | null>(null)
  const myTurn =
    snap.status === 'playing' &&
    snap.you.role === 'player' &&
    !state.winner &&
    !state.draw &&
    state.turn - 1 === snap.you.seatIndex
  const wins = new Set(state.line.map(([row, col]) => `${row},${col}`))

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!myTurn) return
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      const column = Number(event.key) - 1
      if (column >= 0 && column < COLS) onMove(column)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [myTurn, onMove])

  const dot = state.turn === 1 ? '#ff4d4d' : '#ffd23f'

  return (
    <div className="c4" data-testid="c4-board" style={{ ['--dot' as string]: dot }}>
      {Array.from({ length: COLS }, (_, column) => {
        const land = landingRow(state.board, column)
        return (
          <button
            key={column}
            type="button"
            data-testid={`col-${column}`}
            disabled={!myTurn}
            aria-label={`Drop in column ${column + 1}`}
            onClick={() => onMove(column)}
            onPointerEnter={() => setHoverColumn(column)}
            onPointerLeave={() => setHoverColumn((current) => (current === column ? null : current))}
            onFocus={() => setHoverColumn(column)}
            onBlur={() => setHoverColumn((current) => (current === column ? null : current))}
          >
            {Array.from({ length: ROWS }, (_, row) => {
              const cell = state.board[row][column]
              const fresh = state.last?.row === row && state.last.col === column
              const preview = myTurn && hoverColumn === column && cell === 0 && row === land
              return (
                <span
                  key={row}
                  className={`hole${cell === 1 ? ' p1' : ''}${cell === 2 ? ' p2' : ''}${wins.has(`${row},${column}`) ? ' win' : ''}${fresh ? ' fresh' : ''}${preview ? ' preview' : ''}`}
                  style={fresh ? ({ ['--from' as string]: String(row + 1) } as CSSProperties) : undefined}
                />
              )
            })}
          </button>
        )
      })}
    </div>
  )
}
