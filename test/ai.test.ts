import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CALL, SUIT, apply, newMatch, seededRng, startRound, view } from '../src/engine.ts'
import { DEFAULT_PARAMS, chooseAction } from '../src/ai.ts'
import { ACCEPT, DECLINE, c, call, play, run, setup } from './helpers.ts'

const WEAK = [c(4, SUIT.swords), c(5, SUIT.clubs), c(6, SUIT.cups)]

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
  const s = run(setup(WEAK, [c(7, SUIT.swords), c(6, SUIT.swords), c(4, SUIT.cups)]), [[0, call(CALL.envido)]])
  for (let seed = 1; seed <= 200; seed++) {
    assert.notDeepEqual(chooseAction(view(s, 1), DEFAULT_PARAMS, seededRng(seed)), DECLINE)
  }
})

test('with ancho de espada, ancho de basto and 7 de espada the AI always wants the truco', () => {
  const s = run(setup(WEAK, [c(1, SUIT.swords), c(1, SUIT.clubs), c(7, SUIT.swords)], { envidoDone: true }), [[0, call(CALL.truco)]])
  for (let seed = 1; seed <= 200; seed++) {
    const a = chooseAction(view(s, 1), DEFAULT_PARAMS, seededRng(seed))
    assert.ok(a.type === 'accept' || (a.type === 'call' && a.call === CALL.retruco), JSON.stringify(a))
  }
})

test('the AI accepts when a no quiero would hand over the match', () => {
  const strong = [c(1, SUIT.swords), c(1, SUIT.clubs), c(7, SUIT.swords)]
  const s = run(setup(strong, WEAK, { envidoDone: true, score: [29, 0] }), [[0, call(CALL.truco)]])
  for (let seed = 1; seed <= 200; seed++) {
    const a = chooseAction(view(s, 1), DEFAULT_PARAMS, seededRng(seed))
    assert.ok(a.type === 'accept' || (a.type === 'call' && a.call === CALL.retruco), JSON.stringify(a))
  }
})

test('with two 4s left after losing the first trick the AI does not want the vale cuatro', () => {
  const human = [c(11, SUIT.swords), c(7, SUIT.swords), c(12, SUIT.cups)]
  const cpu = [c(4, SUIT.clubs), c(4, SUIT.cups), c(5, SUIT.coins)]
  const s = run(setup(human, cpu, { envidoDone: true, trucoLevel: 2, raiseRights: 0, score: [10, 15] }), [
    [0, play(c(11, SUIT.swords))], [1, play(c(4, SUIT.clubs))], [0, call(CALL.valeCuatro)],
  ])
  for (let seed = 1; seed <= 200; seed++) {
    assert.deepEqual(chooseAction(view(s, 1), DEFAULT_PARAMS, seededRng(seed)), DECLINE)
  }
})

test('the AI reads the last card from the envido the human declared', () => {
  // The human sang 33 (7 and 6 de copa) and already played the 7: the last card is the 6 de copa,
  // which the AI's 7 de basto beats for sure
  const human = [c(7, SUIT.cups), c(6, SUIT.cups), c(3, SUIT.clubs)]
  const cpu = [c(5, SUIT.coins), c(1, SUIT.cups), c(7, SUIT.clubs)]
  const s = run(setup(human, cpu), [
    [0, call(CALL.envido)], [1, ACCEPT],
    [0, play(c(3, SUIT.clubs))], [1, play(c(5, SUIT.coins))],
    [0, play(c(7, SUIT.cups))], [1, play(c(1, SUIT.cups))],
  ])
  for (let seed = 1; seed <= 200; seed++) {
    assert.deepEqual(chooseAction(view(s, 1), DEFAULT_PARAMS, seededRng(seed)), call(CALL.truco))
  }
})
