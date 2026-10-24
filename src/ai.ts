import { cardPower, envidoDeclinedPoints, envidoPoints, faltaPoints, isEnvido, other } from './engine.ts'
import type { Action, Call, Card, PlayerView, Rng } from './engine.ts'

// bluff: chance of calling with a bad hand; aggression: lowers the bar to call and accept truco
export type AiParams = { bluff: number; aggression: number }
export const DEFAULT_PARAMS: AiParams = { bluff: 0.15, aggression: 0.5 }

export function chooseAction(v: PlayerView, params: AiParams = DEFAULT_PARAMS, rng: Rng = Math.random): Action {
  const top = v.pending.at(-1)
  if (top?.kind === 'envido') return respondEnvido(v)
  if (top?.kind === 'truco') return respondTruco(v, params, rng)
  return callEnvido(v, params, rng, true) ?? callTruco(v, params, rng) ?? chooseCard(v)
}

function find(v: PlayerView, type: Action['type'], name?: Call): Action | undefined {
  return v.legal.find((a) => a.type === type && (a.type !== 'call' || a.call === name))
}

const trucoCall = (v: PlayerView) => v.legal.find((a) => a.type === 'call' && !isEnvido(a.call))

function callEnvido(v: PlayerView, params: AiParams, rng: Rng, maySandbag: boolean): Action | undefined {
  if (!find(v, 'call', 'envido')) return undefined
  const points = envidoPoints(v.dealt)
  const behind = v.score[other(v.me)] - v.score[v.me]
  // As mano with a great envido, sometimes stay quiet so the opponent calls and we raise
  if (maySandbag && points >= 31 && v.firstPlayer === v.me && rng() < 0.3) return undefined
  if (points >= 30) return find(v, 'call', points >= 32 || behind >= 10 ? 'faltaEnvido' : 'realEnvido')
  if (points >= 27 || rng() < params.bluff) return find(v, 'call', 'envido')
  return undefined
}

function respondEnvido(v: PlayerView): Action {
  const points = envidoPoints(v.dealt)
  const opp = other(v.me)
  const calls = v.envidoCalls
  if (points >= 31) {
    const raise = find(v, 'call', 'realEnvido') ?? (points >= 32 ? find(v, 'call', 'faltaEnvido') : undefined)
    if (raise) return raise
  }
  const declineLosesMatch = v.score[opp] + envidoDeclinedPoints(calls) >= 30
  const isFalta = calls[calls.length - 1] === 'faltaEnvido'
  const faltaCostsMatch = v.score[opp] + faltaPoints(v.score, opp) >= 30
  const threshold = isFalta ? (faltaCostsMatch ? 30 : 28) : 26 + 2 * (calls.length - 1)
  const manoBonus = v.firstPlayer === v.me ? 1 : 0 // the mano wins ties
  if (declineLosesMatch || points >= threshold - manoBonus) return find(v, 'accept')!
  return find(v, 'decline')!
}

function callTruco(v: PlayerView, params: AiParams, rng: Rng): Action | undefined {
  const raise = trucoCall(v)
  if (!raise) return undefined
  if (handStrength(v) >= 0.7 - 0.2 * params.aggression || rng() < params.bluff) return raise
  return undefined
}

function respondTruco(v: PlayerView, params: AiParams, rng: Rng): Action {
  const envido = callEnvido(v, params, rng, false) // el envido está primero
  if (envido) return envido
  const strength = handStrength(v)
  const raise = trucoCall(v)
  if (raise && (strength >= 0.85 - 0.2 * params.aggression || rng() < params.bluff / 2)) return raise
  const declineLosesMatch = v.score[other(v.me)] + v.trucoLevel + 1 >= 30
  if (declineLosesMatch || strength >= 0.55 - 0.2 * params.aggression) return find(v, 'accept')!
  return find(v, 'decline')!
}

// 0..1 estimate of taking the round, from the cards still ours and how the tricks went
function handStrength(v: PlayerView): number {
  const opp = other(v.me)
  const current = v.tricks[v.tricks.length - 1]
  const onTable = current.cards[v.me]
  const powers = [...v.hand, ...(onTable ? [onTable] : [])].map(cardPower).sort((a, b) => b - a)
  if (powers.length === 0) return 0
  const best = powers[0] / 14
  const avg = powers.reduce((a, b) => a + b, 0) / powers.length / 14
  let strength = 0.6 * best + 0.4 * avg
  const done = v.tricks.filter((t) => t.winner !== null)
  strength += 0.25 * (done.filter((t) => t.winner === v.me).length - done.filter((t) => t.winner === opp).length)
  const oppCard = current.cards[opp]
  if (oppCard && !onTable) strength += powers[0] > cardPower(oppCard) ? 0.1 : -0.2
  return Math.min(1, Math.max(0, strength))
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
