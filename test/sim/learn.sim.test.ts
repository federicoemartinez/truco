// Slow: is learning worth it? Run with `npm run test:sim`
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apply, newMatch, seededRng, startRound, view } from '../../src/engine.ts'
import { PROFILES, chooseAction } from '../../src/ai.ts'
import type { AiParams } from '../../src/ai.ts'
import { learnFromRound, newNotebook, noteCall, readOf } from '../../src/learn.ts'

const MATCHES = Number(process.env.LEARN_MATCHES ?? 600)

// Aristóteles (player 1) against a rival (player 0) over many matches, keeping what it learned from one
// match to the next like main.ts does. Share of matches won, after a first fifth spent learning
function winRate(rival: AiParams, reads: number): number {
  const me = { ...PROFILES.aristoteles, reads }
  let nb = newNotebook()
  let won = 0
  for (let seed = 1; seed <= MATCHES; seed++) {
    const rng = seededRng(seed)
    let s = newMatch(rng)
    nb = { ...nb, pending: [] }
    while (s.phase !== 'matchOver') {
      if (s.phase === 'roundOver') {
        nb = learnFromRound(nb, view(s, 1), rng)
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

test('reading the rival wins Aristóteles at least 5 more matches in 100, against a liar and an honest one', () => {
  for (const name of ['ramon', 'john'] as const) {
    const reading = winRate(PROFILES[name], 1)
    const blind = winRate(PROFILES[name], 0)
    console.log(name, { reading, blind })
    assert.ok(reading - blind >= 0.05, `against ${name}: ${reading.toFixed(3)} reading vs ${blind.toFixed(3)} blind`)
  }
})
