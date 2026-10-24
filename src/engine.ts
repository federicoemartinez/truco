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

export type EnvidoCall = 'envido' | 'realEnvido' | 'faltaEnvido'
export type TrucoCall = 'truco' | 'retruco' | 'valeCuatro'
export type Call = EnvidoCall | TrucoCall

export type Action =
  | { type: 'play'; card: Card }
  | { type: 'call'; call: Call }
  | { type: 'accept' }
  | { type: 'decline' }
  | { type: 'fold' }

export type GameEvent =
  | { type: 'play'; player: Player; card: Card }
  | { type: 'call'; player: Player; call: Call }
  | { type: 'accept'; player: Player }
  | { type: 'decline'; player: Player }
  | { type: 'fold'; player: Player }
  | { type: 'envidoPoints'; player: Player; points: number }
  | { type: 'sonBuenas'; player: Player }
  | { type: 'score'; player: Player; points: number; reason: 'envido' | 'round' }

export type Trick = { cards: [Card | null, Card | null]; winner: Player | 'tie' | null }
export type Pending = { kind: 'envido' | 'truco'; caller: Player }

export type State = {
  round: number // 1-based, within the match
  score: [number, number]
  firstPlayer: Player // "el mano": leads the first trick and wins ties
  dealt: [Card[], Card[]] // the 3 cards each player got, for envido
  hands: [Card[], Card[]] // cards not played yet
  tricks: Trick[] // the last one is in progress
  turn: Player // who must act now
  resumeTurn: Player // whose play-turn resumes once every call is answered
  pending: Pending[] // unanswered calls; an envido can sit on top of a truco
  trucoLevel: number // accepted bet: 0 none, 1 truco, 2 retruco, 3 vale cuatro
  raiseRights: Player | null // who may raise the truco next; null: anyone
  envidoCalls: EnvidoCall[]
  envidoDone: boolean
  phase: 'playing' | 'roundOver' | 'matchOver'
  winner: Player | null
  log: GameEvent[] // this round's events, for the UI
}

// What one player may know: never the opponent's cards
export type PlayerView = Omit<State, 'dealt' | 'hands'> & {
  me: Player
  hand: Card[]
  dealt: Card[]
  opponentHandSize: number
  legal: Action[]
}

export const WIN = 30

function deal(round: number, score: [number, number], firstPlayer: Player, rng: Rng): State {
  const deck = shuffle(newDeck(), rng)
  const dealt: [Card[], Card[]] = [deck.slice(0, 3), deck.slice(3, 6)]
  return {
    round,
    score,
    firstPlayer,
    dealt,
    hands: [dealt[0].slice(), dealt[1].slice()],
    tricks: [{ cards: [null, null], winner: null }],
    turn: firstPlayer,
    resumeTurn: firstPlayer,
    pending: [],
    trucoLevel: 0,
    raiseRights: null,
    envidoCalls: [],
    envidoDone: false,
    phase: 'playing',
    winner: null,
    log: [],
  }
}

export function newMatch(rng: Rng): State {
  return deal(1, [0, 0], rng() < 0.5 ? 0 : 1, rng)
}

export function startRound(state: State, rng: Rng): State {
  if (state.phase !== 'roundOver') throw new Error('startRound: the round is not over')
  return deal(state.round + 1, [state.score[0], state.score[1]], other(state.firstPlayer), rng)
}

export function legalActions(state: State, p: Player): Action[] {
  if (state.phase !== 'playing' || state.turn !== p) return []
  const actions: Action[] = state.hands[p].map((card) => ({ type: 'play', card }))
  actions.push({ type: 'fold' })
  return actions
}

function sameAction(a: Action, b: Action): boolean {
  if (a.type === 'play' && b.type === 'play') return sameCard(a.card, b.card)
  if (a.type === 'call' && b.type === 'call') return a.call === b.call
  return a.type === b.type
}

// The only way to change the state: validates, then works on a copy
export function apply(state: State, p: Player, action: Action): State {
  if (!legalActions(state, p).some((a) => sameAction(a, action))) {
    throw new Error(`Illegal action by player ${p}: ${JSON.stringify(action)}`)
  }
  const s = structuredClone(state)
  switch (action.type) {
    case 'play': play(s, p, action.card); break
    case 'fold': fold(s, p); break
  }
  return s
}

function play(s: State, p: Player, card: Card) {
  s.log.push({ type: 'play', player: p, card })
  s.hands[p] = s.hands[p].filter((c) => !sameCard(c, card))
  const trick = s.tricks[s.tricks.length - 1]
  trick.cards[p] = card
  const [a, b] = trick.cards
  if (!a || !b) {
    s.turn = other(p)
    return
  }
  const diff = cardPower(a) - cardPower(b)
  trick.winner = diff > 0 ? 0 : diff < 0 ? 1 : 'tie'
  const winner = roundWinner(s.tricks.map((t) => t.winner as Player | 'tie'), s.firstPlayer)
  if (winner !== null) {
    endRound(s, winner)
    return
  }
  s.tricks.push({ cards: [null, null], winner: null })
  s.turn = trick.winner === 'tie' ? s.firstPlayer : trick.winner
}

// results: winners of the completed tricks, in order
export function roundWinner(results: (Player | 'tie')[], firstPlayer: Player): Player | null {
  const wins = (p: Player) => results.filter((r) => r === p).length
  if (wins(0) === 2) return 0
  if (wins(1) === 2) return 1
  const [first, second, third] = results
  if (results.length === 2) {
    if (first === 'tie' && second !== 'tie') return second // 1st tied: the 2nd decides
    if (first !== 'tie' && second === 'tie') return first // 2nd tied: the 1st decides
  }
  if (results.length === 3) {
    if (third !== 'tie') return third
    return first !== 'tie' ? first : firstPlayer
  }
  return null
}

function award(s: State, p: Player, points: number, reason: 'envido' | 'round') {
  if (s.phase === 'matchOver') return
  const added = Math.min(WIN - s.score[p], points)
  s.score[p] += added
  s.log.push({ type: 'score', player: p, points: added, reason })
  if (s.score[p] === WIN) {
    s.phase = 'matchOver'
    s.winner = p
    s.pending = []
  }
}

function endRound(s: State, winner: Player) {
  award(s, winner, s.trucoLevel + 1, 'round')
  s.pending = []
  if (s.phase === 'playing') s.phase = 'roundOver'
}

function fold(s: State, p: Player) {
  s.log.push({ type: 'fold', player: p })
  endRound(s, other(p))
}

export function view(state: State, me: Player): PlayerView {
  const { dealt, hands, ...pub } = structuredClone(state)
  return {
    ...pub,
    me,
    hand: hands[me],
    dealt: dealt[me],
    opponentHandSize: hands[other(me)].length,
    legal: legalActions(state, me),
  }
}
