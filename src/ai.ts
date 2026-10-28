import {
  BET, CALL, cardPower, envidoDeclinedPoints, envidoPoints, faltaPoints, isEnvido, newDeck, other, roundWinner, sameCard, shuffle, trickWinner,
} from './engine.ts'
import type { Action, Call, Card, Player, PlayerView, Rng } from './engine.ts'

// envidoBluff: chance of singing envido without points; trucoBluff: chance per turn of a truco or raise
// without the cards; aggression: lowers the bar to call and accept; fish: chance of hiding a good
// envido as mano, to raise when the pie sings it; slowplay: chance of keeping quiet with a good hand
// ("hacerse el muerto") so the rival sings truco and we raise; reads: how much it trusts what it learned
// about the rival (0 ignores it; only Bruno reads)
export type AiParams = { envidoBluff: number; trucoBluff: number; aggression: number; fish: number; slowplay: number; reads: number }
export const DEFAULT_PARAMS: AiParams = { envidoBluff: 0.09, trucoBluff: 0.35, aggression: 0.5, fish: 0.4, slowplay: 0.1, reads: 0 }

// How often the rival lies, as far as the AI could tell (see learn.ts); before seeing anything, the prior
export type Read = { trucoBluff: number; envidoBluff: number }
export const PRIOR_READ: Read = { trucoBluff: 0.25, envidoBluff: 0.3 }

// The rivals to pick from; names and mottos live in texts.ts
export const PROFILES = {
  aristoteles: DEFAULT_PARAMS,
  ramon: { envidoBluff: 0.35, trucoBluff: 1, aggression: 0.75, fish: 0.1, slowplay: 0.5, reads: 0 }, // lies a lot and wants everything
  john: { envidoBluff: 0.01, trucoBluff: 0.1, aggression: 0.25, fish: 0, slowplay: 0.05, reads: 0 }, // if he sings envido, he has it
  bruno: { ...DEFAULT_PARAMS, reads: 1 }, // Aristóteles who learns how much you lie
} satisfies Record<string, AiParams>
export type Rival = keyof typeof PROFILES

export function chooseAction(v: PlayerView, params: AiParams = DEFAULT_PARAMS, rng: Rng = Math.random, read: Read = PRIOR_READ): Action {
  const top = v.pending.at(-1)
  if (top?.kind === BET.envido) return respondEnvido(v, params, rng, read)
  if (top?.kind === BET.truco) return respondTruco(v, params, rng, read)
  return callEnvido(v, params, rng, true) ?? callTruco(v, params, rng) ?? chooseCard(v)
}

function find(v: PlayerView, type: Action['type'], name?: Call): Action | undefined {
  return v.legal.find((a) => a.type === type && (a.type !== 'call' || a.call === name))
}

const trucoCall = (v: PlayerView) => v.legal.find((a) => a.type === 'call' && !isEnvido(a.call))

function callEnvido(v: PlayerView, params: AiParams, rng: Rng, mayFish: boolean): Action | undefined {
  if (!find(v, 'call', CALL.envido)) return undefined
  const points = envidoPoints(v.dealt)
  const behind = v.score[other(v.me)] - v.score[v.me]
  const mano = v.firstPlayer === v.me
  // Salir a la pesca: as mano with a good envido, stay quiet so the pie sings it and we raise
  if (mayFish && mano && points >= 28 && rng() < params.fish) return undefined
  if (points >= 30) return find(v, 'call', points >= 32 || behind >= 10 ? CALL.faltaEnvido : CALL.realEnvido)
  if (points >= 27) return find(v, 'call', CALL.envido)
  // A mano who played without singing is likely short of points: the best moment to lie
  const manoPassed = !mano && v.tricks[0].cards[other(v.me)] !== null
  if (rng() < params.envidoBluff * (manoPassed ? 2 : 1)) return find(v, 'call', CALL.envido)
  return undefined
}

function respondEnvido(v: PlayerView, params: AiParams, rng: Rng, read: Read): Action {
  const points = envidoPoints(v.dealt)
  const opp = other(v.me)
  const calls = v.envidoCalls
  if (points >= 30 || rng() < params.envidoBluff / 3) {
    const raise = find(v, 'call', CALL.realEnvido) ?? (points >= 32 ? find(v, 'call', CALL.faltaEnvido) : undefined)
    if (raise) return raise
  }
  const declineLosesMatch = v.score[opp] + envidoDeclinedPoints(calls) >= 30
  const isFalta = calls[calls.length - 1] === CALL.faltaEnvido
  const faltaCostsMatch = v.score[opp] + faltaPoints(v.score, opp) >= 30
  // A rival who lies a lot gets called more; one who never lies, less
  const distrust = Math.round(6 * params.reads * (read.envidoBluff - PRIOR_READ.envidoBluff))
  const threshold = isFalta
    ? (faltaCostsMatch ? 30 : 28)
    : 26 + 2 * (calls.length - 1) - Math.round(4 * (params.aggression - 0.5)) - distrust
  const manoBonus = v.firstPlayer === v.me ? 1 : 0 // the mano wins ties
  if (declineLosesMatch || points >= threshold - manoBonus) return find(v, 'accept')!
  return find(v, 'decline')!
}

function callTruco(v: PlayerView, params: AiParams, rng: Rng): Action | undefined {
  const raise = trucoCall(v)
  if (!raise) return undefined
  // Hardly anyone sings truco before playing a card: even with a sure hand it pays to wait for the first
  // trick, so only now and then, and never as a bluff
  if (v.tricks.length === 1 && v.tricks[0].cards[v.me] === null) {
    return rng() < 0.25 && winChance(v, rng) >= 0.9 - 0.2 * params.aggression ? raise : undefined
  }
  if (winChance(v, rng) >= 0.7 - 0.2 * params.aggression) return rng() < params.slowplay ? undefined : raise
  return bluffs(v, params, rng) ? raise : undefined
}

function respondTruco(v: PlayerView, params: AiParams, rng: Rng, read: Read): Action {
  const envido = callEnvido(v, params, rng, false) // el envido está primero
  if (envido) return envido
  const chance = winChance(v, rng)
  const raise = trucoCall(v)
  if (raise && (chance >= 0.85 - 0.2 * params.aggression || bluffs(v, params, rng))) return raise
  const declineLosesMatch = v.score[other(v.me)] + v.trucoLevel + 1 >= 30
  const distrust = params.reads * (read.trucoBluff - PRIOR_READ.trucoBluff) // see respondEnvido
  if (declineLosesMatch || chance >= 0.5 - 0.2 * params.aggression - 0.4 * distrust) return find(v, 'accept')!
  return find(v, 'decline')!
}

const SAMPLES = 60

// Chance of taking the round: deal every hand that fits what was shown and said, and play each one
// out with both hands face up. Seen by 'me' only the rival's cards are hidden; seen by the 'rival'
// ours are too, so it is how strong we look from across the table
export function winChance(v: PlayerView, rng: Rng, seenBy: 'me' | 'rival' = 'me'): number {
  const opp = other(v.me)
  const onTable = v.tricks.flatMap((t) => t.cards.filter((card) => card !== null))
  const known = seenBy === 'me' ? [...onTable, ...v.hand] : onTable
  const pool = newDeck().filter((card) => !known.some((seen) => sameCard(seen, card)))
  const results = v.tricks.slice(0, -1).map((t) => t.winner as Player | 'tie')
  const table = v.tricks[v.tricks.length - 1].cards
  const turn = v.pending.length ? v.resumeTurn : v.turn // whose card is next
  let wins = 0
  let n = 0
  for (let i = 0; i < SAMPLES; i++) {
    const hands: [Card[], Card[]] = [[], []]
    const theirs = draw(pool, v.opponentHandSize, fitsWhatWasSaid(v, opp), rng)
    if (!theirs) continue
    hands[opp] = theirs
    if (seenBy === 'me') {
      hands[v.me] = v.hand
    } else {
      const ours = draw(pool.filter((card) => !theirs.includes(card)), v.hand.length, fitsWhatWasSaid(v, v.me), rng)
      if (!ours) continue
      hands[v.me] = ours
    }
    n++
    if (playout(hands, results, table, turn, v.firstPlayer) === v.me) wins++
  }
  return n ? wins / n : 0.5
}

// ponytail: rejection sampling; a rare declared envido may yield few samples, enumerate the hands if that shows
function draw(pool: Card[], size: number, fits: (hand: Card[]) => boolean, rng: Rng): Card[] | undefined {
  for (let tries = 0; tries < 50; tries++) {
    const hand = shuffle(pool, rng).slice(0, size)
    if (fits(hand)) return hand
  }
  return undefined
}

// A player's unplayed cards must add up to the envido they declared; after a "son buenas", to no
// more than what the mano declared
function fitsWhatWasSaid(v: PlayerView, p: Player): (hand: Card[]) => boolean {
  const shown = v.tricks.flatMap((t) => t.cards[p] ?? [])
  const declared: (number | undefined)[] = [undefined, undefined]
  let sonBuenas = false
  for (const e of v.log) {
    if (e.type === 'envidoPoints') declared[e.player] = e.points
    if (e.type === 'sonBuenas' && e.player === p) sonBuenas = true
  }
  const exact = declared[p]
  const cap = sonBuenas ? declared[other(p)] : undefined
  return (hand) => {
    const points = envidoPoints([...shown, ...hand])
    return exact !== undefined ? points === exact : cap === undefined || points <= cap
  }
}

// A bluff only works if the rival can't tell we are weak: the weaker we look from their side,
// the less we lie
function bluffs(v: PlayerView, params: AiParams, rng: Rng): boolean {
  const r = rng()
  return r < params.trucoBluff && r < params.trucoBluff * Math.min(1, winChance(v, rng, 'rival') / 0.5)
}

// Who takes the round when both play their best seeing every card (minimax over at most 3 cards each)
function playout(hands: [Card[], Card[]], results: (Player | 'tie')[], table: [Card | null, Card | null], turn: Player, first: Player): Player {
  const decided = roundWinner(results, first)
  if (decided !== null) return decided
  for (const card of hands[turn]) {
    const rest: [Card[], Card[]] = [hands[0], hands[1]]
    rest[turn] = hands[turn].filter((h) => h !== card)
    const t: [Card | null, Card | null] = [table[0], table[1]]
    t[turn] = card
    let winner: Player
    if (t[0] && t[1]) {
      const won = trickWinner(t[0], t[1])
      winner = playout(rest, [...results, won], [null, null], won === 'tie' ? first : won, first)
    } else {
      winner = playout(rest, results, t, other(turn), first)
    }
    if (winner === turn) return turn
  }
  return other(turn)
}

function chooseCard(v: PlayerView): Action {
  const play = (card: Card): Action => ({ type: 'play', card })
  const weakestFirst = [...v.hand].sort((a, b) => cardPower(a) - cardPower(b))
  const trickIndex = v.tricks.length - 1
  const oppCard = v.tricks[trickIndex].cards[other(v.me)]
  if (oppCard) {
    // Lost whatever we play: go to the deck rather than show the card (a won envido is still shown)
    const results = v.tricks.slice(0, -1).map((t) => t.winner as Player | 'tie')
    const losesRound = (card: Card) =>
      roundWinner([...results, v.me === 0 ? trickWinner(card, oppCard) : trickWinner(oppCard, card)], v.firstPlayer) === other(v.me)
    if (v.hand.every(losesRound)) return find(v, 'fold')!
    const target = cardPower(oppCard)
    const winning = weakestFirst.find((card) => cardPower(card) > target)
    if (winning) return play(winning)
    // Tie the first trick if that keeps a 3 or better for later
    const tying = weakestFirst.find((card) => cardPower(card) === target)
    if (tying && trickIndex === 0 && weakestFirst.some((card) => card !== tying && cardPower(card) >= 10)) return play(tying)
    return play(weakestFirst[0])
  }
  if (trickIndex === 0) return play(weakestFirst[Math.floor(weakestFirst.length / 2)])
  // Leading a later trick means we won or tied the first: our best card closes the round
  return play(weakestFirst[weakestFirst.length - 1])
}
