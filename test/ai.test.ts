import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CALL, SUIT, apply, newMatch, seededRng, startRound, view } from '../src/engine.ts'
import { DEFAULT_PARAMS, PROFILES, chooseAction } from '../src/ai.ts'
import { ACCEPT, DECLINE, c, call, play, run, setup } from './helpers.ts'

const WEAK = [c(4, SUIT.swords), c(5, SUIT.clubs), c(6, SUIT.cups)]

test('200 AI vs AI matches across the rivals: never an illegal move, always finished', () => {
  const rivals = Object.values(PROFILES)
  for (let seed = 1; seed <= 200; seed++) {
    const rng = seededRng(seed)
    const params = [rivals[seed % rivals.length], rivals[(seed + 1) % rivals.length]]
    let s = newMatch(rng)
    for (let steps = 0; s.phase !== 'matchOver'; steps++) {
      assert.ok(steps < 5000, `match ${seed} did not finish`)
      s = s.phase === 'roundOver'
        ? startRound(s, rng)
        : apply(s, s.turn, chooseAction(view(s, s.turn), params[s.turn], rng))
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
    assert.deepEqual(chooseAction(view(s, 1), { ...DEFAULT_PARAMS, slowplay: 0 }, seededRng(seed)), call(CALL.truco))
  }
})

test('as mano with 33 the AI sometimes keeps quiet to fish, and raises when the pie sings', () => {
  const s = setup(WEAK, [c(7, SUIT.swords), c(6, SUIT.swords), c(4, SUIT.cups)], { firstPlayer: 1, turn: 1, resumeTurn: 1 })
  const quiet = Array.from({ length: 200 }, (_, seed) => chooseAction(view(s, 1), DEFAULT_PARAMS, seededRng(seed))).filter((a) => a.type === 'play').length
  assert.ok(quiet > 40 && quiet < 120, `kept quiet ${quiet} of 200`)
  const fished = run(s, [[1, play(c(4, SUIT.cups))], [0, call(CALL.envido)]])
  for (let seed = 1; seed <= 50; seed++) {
    const a = chooseAction(view(fished, 1), DEFAULT_PARAMS, seededRng(seed))
    assert.ok(a.type === 'call', JSON.stringify(a))
  }
})

test('the AI lies about the envido more after the mano played without singing', () => {
  const always = (x: number) => () => x // between envidoBluff and twice it
  const asMano = setup(WEAK, [c(4, SUIT.coins), c(5, SUIT.cups), c(6, SUIT.clubs)], { firstPlayer: 1, turn: 1, resumeTurn: 1 })
  assert.equal(chooseAction(view(asMano, 1), DEFAULT_PARAMS, always(0.15)).type, 'play')
  const asPie = run(setup(WEAK, [c(4, SUIT.coins), c(5, SUIT.cups), c(6, SUIT.clubs)]), [[0, play(c(4, SUIT.swords))]])
  assert.deepEqual(chooseAction(view(asPie, 1), DEFAULT_PARAMS, always(0.15)), call(CALL.envido))
})

test('the AI hardly lies in the truco when its declared envido gives its last card away', () => {
  const human = [c(3, SUIT.swords), c(12, SUIT.coins), c(5, SUIT.clubs)]
  const cpu = [c(7, SUIT.cups), c(6, SUIT.cups), c(2, SUIT.clubs)] // 33: after the 7, the 6 de copa is left
  const tricks: [0 | 1, ReturnType<typeof play>][] = [
    [0, play(c(3, SUIT.swords))], [1, play(c(7, SUIT.cups))],
    [0, play(c(5, SUIT.clubs))], [1, play(c(2, SUIT.clubs))],
  ]
  const liar = { ...DEFAULT_PARAMS, trucoBluff: 1 }
  const lies = (s: ReturnType<typeof setup>) =>
    Array.from({ length: 100 }, (_, seed) => chooseAction(view(s, 1), liar, seededRng(seed))).filter((a) => a.type === 'call').length
  const hidden = run(setup(human, cpu), tricks)
  const givenAway = run(setup(human, cpu), [[0, call(CALL.envido)], [1, ACCEPT], ...tricks])
  assert.ok(lies(hidden) > 80 && lies(givenAway) < 50, `lied ${lies(hidden)} vs ${lies(givenAway)} of 100`)
})

test('slowplaying, the AI keeps quiet with a sure hand so the rival sings the truco', () => {
  const strong = [c(1, SUIT.swords), c(1, SUIT.clubs), c(7, SUIT.swords)]
  const s = run(setup(WEAK, strong, { envidoDone: true }), [[0, play(c(4, SUIT.swords))], [1, play(c(7, SUIT.swords))]])
  for (let seed = 1; seed <= 50; seed++) {
    assert.deepEqual(chooseAction(view(s, 1), { ...DEFAULT_PARAMS, slowplay: 0 }, seededRng(seed)), call(CALL.truco))
    assert.equal(chooseAction(view(s, 1), { ...DEFAULT_PARAMS, slowplay: 1 }, seededRng(seed)).type, 'play')
  }
})
