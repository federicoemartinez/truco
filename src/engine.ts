export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 10 | 11 | 12
export type Card = { rank: Rank; suit: Suit }
export type Player = 0 | 1
export type Rng = () => number

// Suit names: use SUIT.x instead of string literals
export const SUIT = { swords: 'swords', clubs: 'clubs', coins: 'coins', cups: 'cups' } as const
export type Suit = (typeof SUIT)[keyof typeof SUIT]
export const SUITS: Suit[] = Object.values(SUIT)
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
  if (card.rank === 1 && card.suit === SUIT.swords) return 14
  if (card.rank === 1 && card.suit === SUIT.clubs) return 13
  if (card.rank === 7 && card.suit === SUIT.swords) return 12
  if (card.rank === 7 && card.suit === SUIT.coins) return 11
  return RANK_POWER[card.rank]
}

const envidoValue = (card: Card) => (card.rank >= 10 ? 0 : card.rank)
const envidoSum = (cards: Card[]) => cards.reduce((sum, card) => sum + envidoValue(card), cards.length > 1 ? 20 : 0)

// The cards that make up the envido: the best pair of the same suit, else the highest card
export function envidoCards(cards: Card[]): Card[] {
  let best = [cards.reduce((a, b) => (envidoValue(b) > envidoValue(a) ? b : a))]
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const pair = [cards[i], cards[j]]
      if (cards[i].suit === cards[j].suit && envidoSum(pair) > envidoSum(best)) best = pair
    }
  }
  return best
}

export const envidoPoints = (cards: Card[]) => envidoSum(envidoCards(cards))

// Call names: use CALL.x instead of string literals
export const CALL = {
  envido: 'envido',
  realEnvido: 'realEnvido',
  faltaEnvido: 'faltaEnvido',
  truco: 'truco',
  retruco: 'retruco',
  valeCuatro: 'valeCuatro',
} as const
export const ENVIDO_CALLS = [CALL.envido, CALL.realEnvido, CALL.faltaEnvido] as const // escalation order
export const TRUCO_CALLS = [CALL.truco, CALL.retruco, CALL.valeCuatro] as const // index = level - 1

export type Call = (typeof CALL)[keyof typeof CALL]
export type EnvidoCall = (typeof ENVIDO_CALLS)[number]
export type TrucoCall = (typeof TRUCO_CALLS)[number]

export type Action =
  | { type: 'play'; card: Card }
  | { type: 'call'; call: Call }
  | { type: 'accept' }
  | { type: 'decline' }
  | { type: 'fold' }

export type GameEvent =
  | { type: 'play'; player: Player; card: Card }
  | { type: 'call'; player: Player; call: Call; again?: true } // again: a truco asked once more after the envido
  | { type: 'accept'; player: Player }
  | { type: 'decline'; player: Player }
  | { type: 'fold'; player: Player }
  | { type: 'envidoPoints'; player: Player; points: number }
  | { type: 'sonBuenas'; player: Player }
  | { type: 'show'; player: Player; cards: Card[] } // the envido winner's unplayed envido cards, at the end
  | { type: 'score'; player: Player; points: number; reason: Reason }

export type Trick = { cards: [Card | null, Card | null]; winner: Player | 'tie' | null }

// Why points were scored: the envido, or winning the round (worth the truco level)
export const REASON = { envido: 'envido', round: 'round' } as const
export type Reason = (typeof REASON)[keyof typeof REASON]

// What a pending call is about
export const BET = { envido: 'envido', truco: 'truco' } as const
export type Bet = (typeof BET)[keyof typeof BET]
export type Pending = { kind: Bet; caller: Player }

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
  luck: Luck // how one player's cards are dealt, the whole match
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

// How lucky one player is with the cards: a difficulty the player picks for the CPU
export const LUCK = { cursed: 'cursed', unlucky: 'unlucky', balanced: 'balanced', lucky: 'lucky', blessed: 'blessed' } as const
export type LuckLevel = (typeof LUCK)[keyof typeof LUCK]
export const LUCK_LEVELS: LuckLevel[] = Object.values(LUCK) // worst to best
export type Luck = { player: Player; level: LuckLevel } | null

type Tier = (card: Card) => boolean
type Slot = [Tier, number] | undefined // undefined: a plain draw
const TOP_12: Tier = (card) => cardPower(card) >= 9 // the 4 bravas, the 3s and the 2s
const TOP_18: Tier = (card) => cardPower(card) >= 7 // through the 12s
const ENVIDO_TIER = 12 // the envido card is any of the 12 that leave the best (worst) envido, not always the best

// Each card lands in its tier with that chance, else outside it. The third card, with the envido chance,
// gives instead the best or worst envido. The extremes are meant to show at the table (a brava, a 3 or a 2
// in about 27% of the cursed hands and two of them in 66% of the blessed ones, against 67% and 21%); the
// middle levels are subtler. Tuned on AI vs AI matches to win about 3/27/48/67/96% of them
const LUCK_DEALS: Record<LuckLevel, { cards: Slot[]; envido: ['best' | 'worst', number] | null }> = {
  cursed: { cards: [[TOP_12, 0.12], [TOP_12, 0.12], [TOP_12, 0.12]], envido: ['worst', 0.5] },
  unlucky: { cards: [[TOP_12, 0.27], [TOP_12, 0.27], [TOP_12, 0.27]], envido: ['worst', 0.25] },
  balanced: { cards: [], envido: null },
  lucky: { cards: [[TOP_12, 0.5], [TOP_18, 0.5]], envido: ['best', 0.25] },
  blessed: { cards: [[TOP_12, 0.75], [TOP_12, 0.75]], envido: ['best', 0.45] },
}

// Takes the 3 cards out of the shuffled deck
function luckyHand(level: LuckLevel, deck: Card[], rng: Rng): Card[] {
  const { cards, envido } = LUCK_DEALS[level]
  const take = (i: number) => deck.splice(i, 1)[0]
  const pick = (slot: Slot) => {
    if (!slot) return 0
    const want = rng() < slot[1]
    return deck.findIndex((card) => slot[0](card) === want)
  }
  const hand = [take(pick(cards[0])), take(pick(cards[1]))]
  if (envido && rng() < envido[1]) {
    const best = envido[0] === 'best'
    const ranked = deck
      .map((card, i) => ({ card, i, points: envidoPoints([...hand, card]) }))
      .filter(({ card }) => best || !TOP_12(card)) // the 1s, 2s and 3s add little envido: no bravas as bad luck
      .sort((a, b) => (best ? b.points - a.points : a.points - b.points))
    hand.push(take(ranked[Math.floor(rng() * ENVIDO_TIER)].i))
  } else hand.push(take(pick(cards[2])))
  return hand
}

function deal(round: number, score: [number, number], firstPlayer: Player, luck: Luck, rng: Rng): State {
  const deck = shuffle(newDeck(), rng)
  const dealt: [Card[], Card[]] = [deck.slice(0, 3), deck.slice(3, 6)]
  if (luck && luck.level !== LUCK.balanced) {
    // The lucky hand goes first, so the other one is a plain draw from what's left, just as the AI assumes
    dealt[luck.player] = luckyHand(luck.level, deck, rng)
    dealt[other(luck.player)] = deck.slice(0, 3)
  }
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
    luck,
  }
}

export function newMatch(rng: Rng, luck: Luck = null): State {
  return deal(1, [0, 0], rng() < 0.5 ? 0 : 1, luck, rng)
}

export function startRound(state: State, rng: Rng): State {
  if (state.phase !== 'roundOver') throw new Error('startRound: the round is not over')
  return deal(state.round + 1, [state.score[0], state.score[1]], other(state.firstPlayer), state.luck, rng)
}

const ENVIDO_VALUE: Record<EnvidoCall, number> = { envido: 2, realEnvido: 3, faltaEnvido: 0 } // falta depends on the score

export const isEnvido = (c: Call): c is EnvidoCall => (ENVIDO_CALLS as readonly Call[]).includes(c)

export function legalActions(state: State, p: Player): Action[] {
  if (state.phase !== 'playing' || state.turn !== p) return []
  const actions: Action[] = []
  const top = state.pending.at(-1)
  if (top) {
    actions.push({ type: 'accept' }, { type: 'decline' })
    if (top.kind === BET.envido) {
      for (const name of ENVIDO_CALLS) if (canRaiseEnvido(state.envidoCalls, name)) actions.push({ type: 'call', call: name })
    } else {
      if (state.trucoLevel + 1 < 3) actions.push({ type: 'call', call: TRUCO_CALLS[state.trucoLevel + 1] })
      if (canStartEnvido(state, p)) for (const name of ENVIDO_CALLS) actions.push({ type: 'call', call: name })
    }
  } else {
    for (const card of state.hands[p]) actions.push({ type: 'play', card })
    if (canStartEnvido(state, p)) for (const name of ENVIDO_CALLS) actions.push({ type: 'call', call: name })
    if (state.trucoLevel < 3 && (state.raiseRights === null || state.raiseRights === p)) {
      actions.push({ type: 'call', call: TRUCO_CALLS[state.trucoLevel] })
    }
  }
  actions.push({ type: 'fold' })
  return actions
}

// First trick, before your card, nothing sung yet and no truco accepted ("el envido está primero")
function canStartEnvido(s: State, p: Player): boolean {
  return s.tricks.length === 1 && s.tricks[0].cards[p] === null &&
    s.envidoCalls.length === 0 && !s.envidoDone && s.trucoLevel === 0
}

// Envido may be repeated once; otherwise each call must outrank the previous one
function canRaiseEnvido(calls: EnvidoCall[], next: EnvidoCall): boolean {
  const last = calls[calls.length - 1]
  if (next === CALL.envido) return calls.length === 1 && last === CALL.envido
  return ENVIDO_CALLS.indexOf(next) > ENVIDO_CALLS.indexOf(last)
}

export function faltaPoints(score: [number, number], winner: Player): number {
  const leader = Math.max(...score)
  return leader < 15 ? WIN - score[winner] : WIN - leader
}

export function envidoAcceptedPoints(calls: EnvidoCall[], score: [number, number], winner: Player): number {
  if (calls[calls.length - 1] === CALL.faltaEnvido) return faltaPoints(score, winner)
  return calls.reduce((sum, c) => sum + ENVIDO_VALUE[c], 0)
}

// Everything but the last call, at least 1 (falta is always last)
export function envidoDeclinedPoints(calls: EnvidoCall[]): number {
  return Math.max(1, calls.slice(0, -1).reduce((sum, c) => sum + ENVIDO_VALUE[c], 0))
}

export function sameAction(a: Action, b: Action): boolean {
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
    case 'call': call(s, p, action.call); break
    case 'accept': accept(s, p); break
    case 'decline': decline(s, p); break
    case 'fold': fold(s, p); break
  }
  return s
}

function call(s: State, p: Player, c: Call) {
  s.log.push({ type: 'call', player: p, call: c })
  const top = s.pending.at(-1)
  if (!top) s.resumeTurn = p
  if (isEnvido(c)) {
    s.envidoCalls.push(c)
    if (top?.kind === BET.envido) top.caller = p
    else s.pending.push({ kind: BET.envido, caller: p }) // fresh, or on top of a truco
  } else if (top?.kind === BET.truco) {
    s.trucoLevel++ // raising accepts the bet on the table
    top.caller = p
  } else {
    s.pending.push({ kind: BET.truco, caller: p })
  }
  s.turn = other(p)
}

function accept(s: State, p: Player) {
  s.log.push({ type: 'accept', player: p })
  const top = s.pending.pop()!
  if (top.kind === BET.envido) {
    resolveEnvido(s)
    askTrucoAgain(s)
  } else {
    s.trucoLevel++
    s.raiseRights = p
  }
  resume(s)
}

function decline(s: State, p: Player) {
  s.log.push({ type: 'decline', player: p })
  const top = s.pending.pop()!
  if (top.kind === BET.truco) {
    endRound(s, top.caller)
    return
  }
  s.envidoDone = true
  award(s, top.caller, envidoDeclinedPoints(s.envidoCalls), REASON.envido)
  askTrucoAgain(s)
  resume(s)
}

// An envido sung over a truco is settled first; then the truco is asked again, so the answer has its question
function askTrucoAgain(s: State) {
  const top = s.pending.at(-1)
  if (top) s.log.push({ type: 'call', player: top.caller, call: TRUCO_CALLS[s.trucoLevel], again: true })
}

// The mano says its points; the pie only says them if they win ("son buenas" otherwise)
function resolveEnvido(s: State) {
  s.envidoDone = true
  const mano = s.firstPlayer
  const pie = other(mano)
  const manoPoints = envidoPoints(s.dealt[mano])
  const piePoints = envidoPoints(s.dealt[pie])
  s.log.push({ type: 'envidoPoints', player: mano, points: manoPoints })
  let winner = mano
  if (piePoints > manoPoints) {
    s.log.push({ type: 'envidoPoints', player: pie, points: piePoints })
    winner = pie
  } else {
    s.log.push({ type: 'sonBuenas', player: pie })
  }
  award(s, winner, envidoAcceptedPoints(s.envidoCalls, s.score, winner), REASON.envido)
  if (s.phase === 'matchOver') showEnvido(s)
}

// Whoever won a sung envido shows it at the end: the envido cards still in hand go face up
function showEnvido(s: State) {
  const declared = s.log.findLast((e) => e.type === 'envidoPoints') // the winner declares last
  if (!declared) return
  const p = declared.player
  const cards = envidoCards(s.dealt[p]).filter((card) => s.hands[p].some((h) => sameCard(h, card)))
  if (cards.length) s.log.push({ type: 'show', player: p, cards })
}

// After an answer: the next pending call is answered, or the interrupted play-turn resumes
function resume(s: State) {
  if (s.phase !== 'playing') return
  const top = s.pending.at(-1)
  s.turn = top ? other(top.caller) : s.resumeTurn
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
  trick.winner = trickWinner(a, b)
  const winner = roundWinner(s.tricks.map((t) => t.winner as Player | 'tie'), s.firstPlayer)
  if (winner !== null) {
    endRound(s, winner)
    return
  }
  s.tricks.push({ cards: [null, null], winner: null })
  s.turn = trick.winner === 'tie' ? s.firstPlayer : trick.winner
}

// a: player 0's card, b: player 1's
export function trickWinner(a: Card, b: Card): Player | 'tie' {
  const diff = cardPower(a) - cardPower(b)
  return diff > 0 ? 0 : diff < 0 ? 1 : 'tie'
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

function award(s: State, p: Player, points: number, reason: Reason) {
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
  award(s, winner, s.trucoLevel + 1, REASON.round)
  s.pending = []
  if (s.phase === 'playing') s.phase = 'roundOver'
  showEnvido(s)
}

function fold(s: State, p: Player) {
  s.log.push({ type: 'fold', player: p })
  if (s.pending.at(-1)?.kind === BET.envido) {
    s.envidoDone = true
    award(s, other(p), envidoDeclinedPoints(s.envidoCalls), REASON.envido)
  }
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
