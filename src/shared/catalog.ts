import type { GameId } from './types'

export interface GameCard {
  id: GameId
  name: string
  blurb: string
  players: string
  cpu: boolean
  clocks: boolean
}

export const GAMES: GameCard[] = [
  {
    id: 'connect4',
    name: 'Connect 4',
    blurb: 'Seven columns, six rows. Get four in a row before the other seat does.',
    players: '2 seats',
    cpu: true,
    clocks: false,
  },
  {
    id: 'chess',
    name: 'Chess',
    blurb: 'Full rules, a move list, and clocks when you want them. The CPU has an easy and a medium gear.',
    players: '2 seats',
    cpu: true,
    clocks: true,
  },
  {
    id: 'ribbon',
    name: 'Ribbon Rally',
    blurb: 'Move the cursor, or drag a finger. Your name rides with the car, and the colored ribbon fades so the floor stays clear.',
    players: 'Up to 8 drivers',
    cpu: false,
    clocks: false,
  },
]
