// Slow: is learning worth it? Run with `npm run test:sim`
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apply, newMatch, seededRng, startRound, view } from '../../src/engine.ts'
import { PROFILES, chooseAction } from '../../src/ai.ts'
import type { AiParams } from '../../src/ai.ts'
import { learnFromRound, newNotebook, noteCall, readOf } from '../../src/learn.ts'

const MATCHES = Number(process.env.LEARN_MATCHES ?? 600)

// One of our rivals (player 1) against an opponent (player 0) over many matches, keeping what it learned
// from one match to the next like main.ts does. Share of matches won, after a first fifth spent learning
function winRate(me: AiParams, rival: AiParams): number {
  let nb = newNotebook()
  let won = 0
  for (let seed = 1; seed <= MATCHES; seed++) {
    const rng = seededRng(seed)
    let s = newMatch(rng)
    nb = { ...nb, pending: [] }
    while (true) {
      if (s.phase !== 'playing') {
        nb = learnFromRound(nb, view(s, 1), rng)
        if (s.phase === 'matchOver') break
        s = startRound(s, rng)
        continue
      }
      const p = s.turn
      const a = p === 1 ? chooseAction(view(s, 1), me, rng, readOf(nb)) : chooseAction(view(s, 0), rival, rng)
      if (p === 0) nb = noteCall(nb, view(s, 1), a)
      s = apply(s, p, a)
    }
    if (s.winner === 1 && seed > MATCHES / 5) won++
  }
  return won / (MATCHES - MATCHES / 5)
}

// Reading pays against a liar. An honest rival hardly lies, so there is little to learn: reading only
// mustn't hurt, within the noise of these matches (about 3 in 100)
test('Bruno, who reads, wins at least 5 more matches in 100 than Aristóteles against a liar, and no fewer against an honest one', () => {
  for (const [name, edge] of [['ramon', 0.05], ['john', -0.03]] as const) {
    const reading = winRate(PROFILES.bruno, PROFILES[name])
    const blind = winRate(PROFILES.aristoteles, PROFILES[name])
    console.log(name, { reading, blind })
    assert.ok(reading - blind >= edge, `against ${name}: ${reading.toFixed(3)} reading vs ${blind.toFixed(3)} blind`)
  }
})
