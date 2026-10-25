import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CALL, apply, newMatch, seededRng, startRound, view } from '../src/engine.ts'
import { DEFAULT_PARAMS, chooseAction } from '../src/ai.ts'
import { DECLINE, c, call, run, setup } from './helpers.ts'

const WEAK = [c(4, 'swords'), c(5, 'clubs'), c(6, 'cups')]

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

test('with 33 the AI never declines an envido', () => {
  const s = run(setup(WEAK, [c(7, 'swords'), c(6, 'swords'), c(4, 'cups')]), [[0, call(CALL.envido)]])
  for (let seed = 1; seed <= 200; seed++) {
    assert.notDeepEqual(chooseAction(view(s, 1), DEFAULT_PARAMS, seededRng(seed)), DECLINE)
  }
})

test('with ancho de espada, ancho de basto and 7 de espada the AI always wants the truco', () => {
  const s = run(setup(WEAK, [c(1, 'swords'), c(1, 'clubs'), c(7, 'swords')], { envidoDone: true }), [[0, call(CALL.truco)]])
  for (let seed = 1; seed <= 200; seed++) {
    const a = chooseAction(view(s, 1), DEFAULT_PARAMS, seededRng(seed))
    assert.ok(a.type === 'accept' || (a.type === 'call' && a.call === CALL.retruco), JSON.stringify(a))
  }
})

test('the AI accepts when a no quiero would hand over the match', () => {
  const strong = [c(1, 'swords'), c(1, 'clubs'), c(7, 'swords')]
  const s = run(setup(strong, WEAK, { envidoDone: true, score: [29, 0] }), [[0, call(CALL.truco)]])
  for (let seed = 1; seed <= 200; seed++) {
    const a = chooseAction(view(s, 1), DEFAULT_PARAMS, seededRng(seed))
    assert.ok(a.type === 'accept' || (a.type === 'call' && a.call === CALL.retruco), JSON.stringify(a))
  }
})
