// Slow: thousands of AI matches. Run with `npm run test:sim`, not part of `npm test`
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CALL, apply, envidoPoints, isEnvido, newMatch, seededRng, startRound, view } from '../../src/engine.ts'
import type { State } from '../../src/engine.ts'
import { DEFAULT_PARAMS, PROFILES, chooseAction } from '../../src/ai.ts'
import type { AiParams, Rival } from '../../src/ai.ts'

test('2000 AI vs AI matches: never an illegal move, always finished', () => {
  for (let seed = 1; seed <= 2000; seed++) {
    const rng = seededRng(seed)
    let s = newMatch(rng)
    for (let steps = 0; s.phase !== 'matchOver'; steps++) {
      assert.ok(steps < 5000, `match ${seed} did not finish`)
      s = s.phase === 'roundOver'
        ? startRound(s, rng)
        : apply(s, s.turn, chooseAction(view(s, s.turn), DEFAULT_PARAMS, rng))
    }
    assert.equal(Math.max(...s.score), 30)
  }
})

// How a rival plays against Aristóteles: shares of its envido calls that are lies, of its
// good envidos it keeps quiet as mano, and of its trucos sung before its own first card
function habits(params: AiParams, matches = 150) {
  const rng = seededRng(42)
  const n = { envidos: 0, lies: 0, goodAsMano: 0, fished: 0, trucos: 0, early: 0 }
  for (let m = 0; m < matches; m++) {
    let s: State = newMatch(rng)
    while (s.phase !== 'matchOver') {
      if (s.phase === 'roundOver') { s = startRound(s, rng); continue }
      const p = s.turn
      const v = view(s, p)
      const a = chooseAction(v, p === 0 ? params : DEFAULT_PARAMS, rng)
      if (p === 0) {
        const sings = a.type === 'call' && isEnvido(a.call)
        const points = envidoPoints(v.dealt)
        if (sings && !v.pending.length) {
          n.envidos++
          if (points < 27) n.lies++
        }
        const fresh = v.legal.some((l) => l.type === 'call' && l.call === CALL.envido) && !v.pending.length && s.tricks[0].cards[1] === null
        if (fresh && v.firstPlayer === 0 && points >= 28) {
          n.goodAsMano++
          if (!sings) n.fished++
        }
        if (a.type === 'call' && a.call === CALL.truco) {
          n.trucos++
          if (s.tricks.length === 1 && s.tricks[0].cards[0] === null) n.early++
        }
      }
      s = apply(s, p, a)
    }
  }
  return { lies: n.lies / n.envidos, fished: n.fished / n.goodAsMano, early: n.early / n.trucos }
}

test('each rival has its own character', () => {
  const h = Object.fromEntries(Object.entries(PROFILES).map(([id, params]) => [id, habits(params)])) as Record<Rival, ReturnType<typeof habits>>
  console.table(h)
  assert.ok(h.ramon.lies > h.aristoteles.lies && h.aristoteles.lies > h.john.lies, 'Ramón lies the most, John the least')
  assert.ok(h.john.lies < 0.07, 'when John sings, he has it')
  assert.equal(h.john.fished, 0, 'John never fishes')
  assert.ok(h.aristoteles.fished > h.ramon.fished, 'Aristóteles fishes more than Ramón')
  for (const [id, x] of Object.entries(h)) assert.ok(x.early < 0.25, `${id} sings ${Math.round(x.early * 100)}% of his trucos before his first card`)
})
