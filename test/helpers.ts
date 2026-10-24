import { apply, newMatch, seededRng } from '../src/engine.ts'
import type { Action, Call, Card, Player, Rank, State, Suit } from '../src/engine.ts'

export const c = (rank: Rank, suit: Suit): Card => ({ rank, suit })
export const play = (card: Card): Action => ({ type: 'play', card })
export const call = (name: Call): Action => ({ type: 'call', call: name })
export const ACCEPT: Action = { type: 'accept' }
export const DECLINE: Action = { type: 'decline' }
export const FOLD: Action = { type: 'fold' }

export const has = (actions: Action[], action: Action) =>
  actions.some((a) => JSON.stringify(a) === JSON.stringify(action))

// A fresh round with fixed hands; player 0 is "el mano" unless overridden
export function setup(h0: Card[], h1: Card[], overrides: Partial<State> = {}): State {
  const first: Player = overrides.firstPlayer ?? 0
  return {
    ...newMatch(seededRng(1)),
    firstPlayer: first,
    turn: first,
    resumeTurn: first,
    dealt: [h0, h1],
    hands: [h0.slice(), h1.slice()],
    ...overrides,
  }
}

export function run(state: State, steps: [Player, Action][]): State {
  return steps.reduce((s, [p, a]) => apply(s, p, a), state)
}
