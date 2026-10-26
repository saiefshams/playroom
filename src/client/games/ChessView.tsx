import { Chess, type Square } from 'chess.js'
import { useMemo, useRef, useState } from 'react'
import type { ChessState } from '../../shared/chessRules'
import type { Promotion } from '../../shared/types'
import type { Snapshot } from '../../shared/snapshot'
import { Piece } from './Pieces'

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8']

export function ChessView({
  snap,
  onMove,
}: {
  snap: Snapshot
  onMove: (from: string, to: string, promotion?: Promotion) => void
}) {
  const state = snap.state as ChessState
  const chess = useMemo(() => new Chess(state.fen), [state.fen])
  const placement = useMemo(() => {
    const map = new Map<string, string>()
    for (const rank of chess.board()) {
      for (const cell of rank) {
        if (cell) map.set(cell.square, `${cell.color}${cell.type}`)
      }
    }
    return map
  }, [chess])
  const [selected, setSelected] = useState<string | null>(null)
  const [pending, setPending] = useState<{ from: string; to: string } | null>(null)
  const origin = useRef<{ x: number; y: number; square: string } | null>(null)
  const flipped = snap.you.seatIndex === 1
  const files = flipped ? [...FILES].reverse() : FILES
  const ranks = flipped ? [...RANKS] : [...RANKS].reverse()
  const myColor = snap.you.seatIndex === 1 ? 'b' : 'w'
  const canMove = snap.status === 'playing' && snap.you.role === 'player' && state.turn === myColor
  const targets = new Set<string>(
    selected && canMove ? chess.moves({ square: selected as Square, verbose: true }).map((move) => move.to) : [],
  )

  function attempt(from: string, to: string) {
    const options = chess.moves({ square: from as Square, verbose: true }).filter((move) => move.to === to)
    if (options.length === 0) {
      const piece = placement.get(to)
      setSelected(piece?.startsWith(myColor) ? to : null)
      return
    }
    if (options.some((move) => move.promotion)) {
      setPending({ from, to })
      setSelected(null)
      return
    }
    setSelected(null)
    onMove(from, to)
  }

  function tap(square: string) {
    if (!canMove) return
    if (!selected) {
      const piece = placement.get(square)
      if (piece?.startsWith(myColor)) setSelected(square)
      return
    }
    if (square === selected) {
      setSelected(null)
      return
    }
    attempt(selected, square)
  }

  const played = state.history.length > 0
  const sideNote =
    snap.you.role !== 'player'
      ? 'White is at the bottom and moves first.'
      : snap.you.seatIndex === 1
        ? played
          ? 'You have black.'
          : 'You have black. White moves first.'
        : played
          ? 'You have white.'
          : 'You have white, so you move first.'

  return (
    <div className="chess-wrap">
      <p className="side-note">{sideNote}</p>
      <div className="chess" data-testid="chess-board" role="grid" aria-label="Chess board">
        {ranks.flatMap((rank) =>
          files.map((file) => {
            const square = `${file}${rank}`
            const piece = placement.get(square) ?? ''
            const dark = (FILES.indexOf(file) + Number(rank)) % 2 === 1
            const last = state.lastMove?.from === square || state.lastMove?.to === square
            const checking = state.inCheck && piece[1] === 'k' && piece[0] === state.turn
            return (
              <button
                key={square}
                type="button"
                role="gridcell"
                data-testid={`sq-${square}`}
                data-square={square}
                data-piece={piece}
                aria-label={square}
                className={[dark ? 'dark' : 'light', last ? 'last' : '', selected === square ? 'selected' : '', targets.has(square) ? 'target' : '', checking ? 'check' : ''].filter(Boolean).join(' ')}
                onPointerDown={(event) => {
                  if (!canMove) return
                  origin.current = { x: event.clientX, y: event.clientY, square }
                  event.currentTarget.setPointerCapture(event.pointerId)
                }}
                onPointerUp={(event) => {
                  const start = origin.current
                  origin.current = null
                  if (!start || !canMove) return
                  const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8
                  const hit = moved ? document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-square]') : null
                  const target = hit?.getAttribute('data-square') ?? start.square
                  if (!moved) tap(target)
                  else if (target !== start.square) attempt(start.square, target)
                }}
              >
                {piece && <Piece code={piece} />}
                {file === files[0] && <span className="coord rank">{rank}</span>}
                {rank === ranks[ranks.length - 1] && <span className="coord file">{file}</span>}
              </button>
            )
          }),
        )}
      </div>
      {pending && (
        <div className="promo" data-testid="promotion" role="group" aria-label="Choose a promotion">
          {(['q', 'r', 'b', 'n'] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              className="btn ghost"
              data-testid={`promo-${kind}`}
              onClick={() => {
                onMove(pending.from, pending.to, kind)
                setPending(null)
              }}
            >
              <Piece code={`${myColor}${kind}`} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
