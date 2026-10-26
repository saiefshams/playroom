import type { Finish, GameId } from './types'

export interface StatusSeat {
  index: number
  name: string
  isCpu: boolean
}

export function describeStatus(input: {
  gameId: GameId
  status: 'lobby' | 'playing' | 'finished'
  you: { role: 'player' | 'spectator'; seatIndex: number | null }
  seats: StatusSeat[]
  result: Finish | null
  turnSeat: number | null
  inCheck: boolean
  driverCount: number
}): string {
  const watching = input.you.role === 'spectator'
  if (input.gameId === 'ribbon') {
    const base =
      input.driverCount <= 1
        ? 'The floor is open. Your ribbon fades after 3.5s.'
        : `${input.driverCount} drivers on the floor. Ribbons fade after 3.5s.`
    return watching ? `Watching. ${base}` : base
  }

  if (input.status === 'finished' && input.result) {
    if (input.result.type === 'draw') {
      if (input.result.reason === 'stalemate') return 'Stalemate.'
      if (input.result.reason === 'repetition') return 'Draw by repetition.'
      if (input.result.reason === 'material') return 'Draw by material.'
      if (input.result.reason === 'fifty') return 'Draw by the fifty-move rule.'
      return 'Draw.'
    }
    const winner = input.seats.find((seat) => seat.index === input.result?.winnerSeat)
    const name = winner?.name ?? 'Someone'
    if (input.result.reason === 'timeout') return `${name} wins on time.`
    if (input.result.reason === 'resign' || input.result.reason === 'abandon') {
      const other = input.seats.find((seat) => seat.index !== input.result?.winnerSeat)
      const verb = input.result.reason === 'abandon' ? 'left' : 'resigned'
      return other ? `${name} wins. ${other.name} ${verb}.` : `${name} wins.`
    }
    if (input.result.reason === 'checkmate') return `${name} wins by checkmate.`
    return `${name} wins.`
  }

  if (input.status === 'lobby') return watching ? 'Waiting for players.' : 'Waiting for an opponent.'

  const seat = input.seats.find((item) => item.index === input.turnSeat)
  let line = 'Waiting.'
  if (seat?.isCpu) line = 'CPU is thinking.'
  else if (input.turnSeat != null && input.turnSeat === input.you.seatIndex) line = input.inCheck ? 'Your turn. Check.' : 'Your turn.'
  else if (seat) line = input.inCheck ? `${seat.name}'s turn. Check.` : `${seat.name}'s turn.`
  return watching ? `Watching. ${line}` : line
}
