import type { Card, Rank, Suit } from '../src/engine.ts'

export const c = (rank: Rank, suit: Suit): Card => ({ rank, suit })
