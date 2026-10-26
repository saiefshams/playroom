import { useEffect } from 'react'
import type { ChessState } from '../../shared/chessRules'
import type { Connect4State } from '../../shared/connect4'
import type { Snapshot } from '../../shared/snapshot'
import { request } from '../net'

function turnSeat(snap: Snapshot): number | null {
  if (snap.status !== 'playing') return null
  if (snap.gameId === 'connect4') {
    const state = snap.state as Connect4State
    if (state.winner || state.draw) return null
    return state.turn - 1
  }
  if (snap.gameId === 'chess') return (snap.state as ChessState).turn === 'w' ? 0 : 1
  return null
}

export function useCpu(snap: Snapshot | null): void {
  const version = snap?.version
  const status = snap?.status
  const gameId = snap?.gameId
  const cpuSeat = snap?.cpu?.seatIndex
  const role = snap?.you.role

  useEffect(() => {
    if (!snap || !snap.cpu || snap.status !== 'playing' || snap.you.role !== 'player') return
    if (turnSeat(snap) !== snap.cpu.seatIndex) return
    let cancel = false
    const delay = snap.cpu.difficulty === 'easy' ? 420 : 680
    const handle = window.setTimeout(() => {
      void (async () => {
        if (cancel) return
        try {
          if (snap.gameId === 'connect4') {
            const { pickConnect4Move } = await import('../../shared/connect4')
            const column = pickConnect4Move(snap.state as Connect4State, snap.cpu?.difficulty ?? 'medium')
            if (column == null || cancel) return
            await request('room:action', { type: 'connect4:drop', column, asCpu: true })
          } else if (snap.gameId === 'chess') {
            const { pickChessMove } = await import('../../shared/chessBot')
            const move = pickChessMove((snap.state as ChessState).fen, snap.cpu?.difficulty ?? 'medium')
            if (!move || cancel) return
            await request('room:action', { type: 'chess:move', ...move, asCpu: true })
          }
        } catch {
          // A newer snapshot will correct the table if this move lost the race.
        }
      })()
    }, delay)
    return () => {
      cancel = true
      window.clearTimeout(handle)
    }
  }, [snap, version, status, gameId, cpuSeat, role])
}
