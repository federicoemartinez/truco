import {
  BET, CALL, cardPower, envidoDeclinedPoints, envidoPoints, faltaPoints, isEnvido, newDeck, other, roundWinner, sameCard, shuffle, trickWinner,
} from './engine.ts'
import type { Action, Call, Card, Player, PlayerView, Rng } from './engine.ts'

// bluff: chance of lying with a bad hand; aggression: lowers the bar to call and accept;
// fish: chance of hiding a good envido as mano, to raise when the pie sings it
export type AiParams = { bluff: number; aggression: number; fish: number }
export const DEFAULT_PARAMS: AiParams = { bluff: 0.15, aggression: 0.5, fish: 0.4 }

export function chooseAction(v: PlayerView, params: AiParams = DEFAULT_PARAMS, rng: Rng = Math.random): Action {
  const top = v.pending.at(-1)
  if (top?.kind === BET.envido) return respondEnvido(v, params, rng)
  if (top?.kind === BET.truco) return respondTruco(v, params, rng)
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
  if (rng() < params.bluff * (manoPassed ? 2 : 1)) return find(v, 'call', CALL.envido)
  return undefined
}

function respondEnvido(v: PlayerView, params: AiParams, rng: Rng): Action {
  const points = envidoPoints(v.dealt)
  const opp = other(v.me)
  const calls = v.envidoCalls
  if (points >= 30 || rng() < params.bluff / 3) {
    const raise = find(v, 'call', CALL.realEnvido) ?? (points >= 32 ? find(v, 'call', CALL.faltaEnvido) : undefined)
    if (raise) return raise
  }
  const declineLosesMatch = v.score[opp] + envidoDeclinedPoints(calls) >= 30
  const isFalta = calls[calls.length - 1] === CALL.faltaEnvido
  const faltaCostsMatch = v.score[opp] + faltaPoints(v.score, opp) >= 30
  const threshold = isFalta ? (faltaCostsMatch ? 30 : 28) : 26 + 2 * (calls.length - 1) - Math.round(4 * (params.aggression - 0.5))
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
  if (winChance(v, rng) >= 0.7 - 0.2 * params.aggression || rng() < params.bluff / 3) return raise
  return undefined
}

function respondTruco(v: PlayerView, params: AiParams, rng: Rng): Action {
  const envido = callEnvido(v, params, rng, false) // el envido está primero
  if (envido) return envido
  const chance = winChance(v, rng)
  const raise = trucoCall(v)
  if (raise && (chance >= 0.85 - 0.2 * params.aggression || rng() < params.bluff / 3)) return raise
  const declineLosesMatch = v.score[other(v.me)] + v.trucoLevel + 1 >= 30
  if (declineLosesMatch || chance >= 0.5 - 0.2 * params.aggression) return find(v, 'accept')!
  return find(v, 'decline')!
}

const SAMPLES = 60

// Chance of taking the round: deal the opponent every hand that fits the cards they showed and the envido
// they declared, and play each one out with both hands face up
function winChance(v: PlayerView, rng: Rng): number {
  const opp = other(v.me)
  const shown = v.tricks.flatMap((t) => t.cards[opp] ?? [])
  const pool = newDeck().filter((card) => ![...v.dealt, ...shown].some((seen) => sameCard(seen, card)))
  let declared: number | undefined
  let sonBuenas = false
  for (const e of v.log) {
    if (e.player !== opp) continue
    if (e.type === 'envidoPoints') declared = e.points
    if (e.type === 'sonBuenas') sonBuenas = true // the pie concedes: no more than our points
  }
  const mine = envidoPoints(v.dealt)
  const fits = (hand: Card[]) => {
    const points = envidoPoints([...shown, ...hand])
    return declared !== undefined ? points === declared : !sonBuenas || points <= mine
  }
  const results = v.tricks.slice(0, -1).map((t) => t.winner as Player | 'tie')
  const table = v.tricks[v.tricks.length - 1].cards
  const turn = v.pending.length ? v.resumeTurn : v.turn // whose card is next
  let wins = 0
  let n = 0
  // ponytail: rejection sampling; a rare declared envido may yield few samples, enumerate the hands if that shows
  for (let tries = 0; n < SAMPLES && tries < SAMPLES * 50; tries++) {
    const hand = shuffle(pool, rng).slice(0, v.opponentHandSize)
    if (!fits(hand)) continue
    n++
    const hands: [Card[], Card[]] = [[], []]
    hands[v.me] = v.hand
    hands[opp] = hand
    if (playout(hands, results, table, turn, v.firstPlayer) === v.me) wins++
  }
  return n ? wins / n : 0.5
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
