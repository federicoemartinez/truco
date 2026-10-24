export type Suit = 'swords' | 'clubs' | 'coins' | 'cups'
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 10 | 11 | 12
export type Card = { rank: Rank; suit: Suit }
export type Player = 0 | 1
export type Rng = () => number

export const SUITS: Suit[] = ['swords', 'clubs', 'coins', 'cups']
export const RANKS: Rank[] = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12]

export const other = (p: Player): Player => (p === 0 ? 1 : 0)
export const sameCard = (a: Card, b: Card) => a.rank === b.rank && a.suit === b.suit

export function newDeck(): Card[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit })))
}

// Fisher–Yates
export function shuffle<T>(items: T[], rng: Rng): T[] {
  const a = items.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const t = a[i]
    a[i] = a[j]
    a[j] = t
  }
  return a
}

// mulberry32: tiny seeded PRNG so tests and fuzzing are reproducible
export function seededRng(seed: number): Rng {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const RANK_POWER: Record<Rank, number> = { 3: 10, 2: 9, 1: 8, 12: 7, 11: 6, 10: 5, 7: 4, 6: 3, 5: 2, 4: 1 }

// Truco hierarchy: higher beats lower, equal power is a tie (parda)
export function cardPower(card: Card): number {
  if (card.rank === 1 && card.suit === 'swords') return 14
  if (card.rank === 1 && card.suit === 'clubs') return 13
  if (card.rank === 7 && card.suit === 'swords') return 12
  if (card.rank === 7 && card.suit === 'coins') return 11
  return RANK_POWER[card.rank]
}

export function envidoPoints(cards: Card[]): number {
  const value = (card: Card) => (card.rank >= 10 ? 0 : card.rank)
  let best = Math.max(...cards.map(value))
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      if (cards[i].suit === cards[j].suit) best = Math.max(best, 20 + value(cards[i]) + value(cards[j]))
    }
  }
  return best
}
