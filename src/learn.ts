import { envidoPoints, isEnvido, other, sameCard } from './engine.ts'
import type { Action, Card, PlayerView, Rng } from './engine.ts'
import { PRIOR_READ, lastStand, winChance } from './ai.ts'
import type { Read } from './ai.ts'

// What the AI has seen of its rival. Only public information: the cards the rival played or showed,
// and the envido they declared
export type Notebook = {
  trucoCalls: number // rival truco calls and raises whose cards came to light
  trucoBluffs: number // ...made when losing was likelier than winning, as the rival saw it
  envidoCalls: number // rival envido calls whose points came to light
  envidoBluffs: number // ...with fewer than 27 points
  pending: PlayerView[] // the AI's view right before each rival truco call of this round
}

export const newNotebook = (): Notebook => ({ trucoCalls: 0, trucoBluffs: 0, envidoCalls: 0, envidoBluffs: 0, pending: [] })

const PRIOR_WEIGHT = 2 // the prior counts as this many calls, so a single hand doesn't swing the read

export function readOf(nb: Notebook): Read {
  const rate = (lies: number, calls: number, prior: number) => (lies + prior * PRIOR_WEIGHT) / (calls + PRIOR_WEIGHT)
  return {
    trucoBluff: rate(nb.trucoBluffs, nb.trucoCalls, PRIOR_READ.trucoBluff),
    envidoBluff: rate(nb.envidoBluffs, nb.envidoCalls, PRIOR_READ.envidoBluff),
  }
}

// Right before the rival's action is applied: keep the AI's view when it is a truco call or raise,
// unless the rival had nothing to lose by it
export function noteCall(nb: Notebook, seenByAi: PlayerView, action: Action): Notebook {
  if (action.type !== 'call' || isEnvido(action.call) || lastStand(seenByAi, other(seenByAi.me))) return nb
  return { ...nb, pending: [...nb.pending, seenByAi] }
}

// Once the round is over, with the AI's view of it: count the rival's calls whose cards came to light,
// or whose last card the deck gave away
export function learnFromRound(nb: Notebook, done: PlayerView, rng: Rng): Notebook {
  const rival = other(done.me)
  const played = done.tricks.flatMap((t) => t.cards[rival] ?? [])
  const show = done.log.find((e) => e.type === 'show' && e.player === rival)
  const revealed = [...played, ...(show?.type === 'show' ? show.cards : [])]
  const next = { ...nb, pending: [] }

  const sangEnvido = done.log.some((e) => e.type === 'call' && e.player === rival && isEnvido(e.call))
  const declared = done.log.find((e) => e.type === 'envidoPoints' && e.player === rival)
  const points = declared?.type === 'envidoPoints' ? declared.points : revealed.length === 3 ? envidoPoints(revealed) : undefined
  if (sangEnvido && points !== undefined) {
    next.envidoCalls++
    if (points < 27) next.envidoBluffs++
  }

  const folded = done.log.some((e) => e.type === 'fold' && e.player === rival)
  for (const seen of nb.pending) {
    const playedThen = seen.tricks.flatMap((t) => t.cards[rival] ?? [])
    const handThen = revealed.filter((card) => !playedThen.some((p) => sameCard(p, card)))
    if (handThen.length !== seen.opponentHandSize) {
      // Unseen cards teach nothing, except one: sung on their last card with ours already down, then the
      // deck. A card that won (or tied in their favor) would have been played, so they knew it lost
      if (folded && seen.opponentHandSize === 1 && seen.tricks.at(-1)?.cards[seen.me]) {
        next.trucoCalls++
        next.trucoBluffs++
      }
      continue
    }
    next.trucoCalls++
    if (winChance(asSeenByRival(seen, handThen, playedThen), rng) < 0.5) next.trucoBluffs++
  }
  return next
}

// The rival's own view at that moment, now that we know the cards they held
function asSeenByRival(seen: PlayerView, hand: Card[], played: Card[]): PlayerView {
  return { ...seen, me: other(seen.me), hand, dealt: [...played, ...hand], opponentHandSize: seen.hand.length, legal: [] }
}

// What survives a reload: the counts, not this round's pending calls
export const toSaved = ({ pending, ...counts }: Notebook) => JSON.stringify(counts)

// Anything stored can be stale or tampered with: keep only sane counts, else start over
export function fromSaved(json: string | null): Notebook {
  const nb = newNotebook()
  try {
    const saved = JSON.parse(json ?? '{}')
    for (const key of ['trucoCalls', 'trucoBluffs', 'envidoCalls', 'envidoBluffs'] as const) {
      const n = saved?.[key]
      if (Number.isInteger(n) && n >= 0) nb[key] = n
    }
  } catch {
    return nb
  }
  if (nb.trucoBluffs > nb.trucoCalls || nb.envidoBluffs > nb.envidoCalls) return newNotebook()
  return nb
}
