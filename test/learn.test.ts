import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CALL, SUIT, apply, seededRng, view } from '../src/engine.ts'
import type { Action, Card, Player, State } from '../src/engine.ts'
import { PRIOR_READ } from '../src/ai.ts'
import { fromSaved, learnFromRound, newNotebook, noteCall, readOf, toSaved } from '../src/learn.ts'
import type { Notebook } from '../src/learn.ts'
import { ACCEPT, FOLD, c, call, play, setup } from './helpers.ts'

const HUMAN: Player = 0
const CPU: Player = 1

// Plays the steps like main.ts does: the AI notes every human call before it is applied
function playRound(s: State, steps: [Player, Action][]): { s: State; nb: Notebook } {
  let nb = newNotebook()
  for (const [p, a] of steps) {
    if (p === HUMAN) nb = noteCall(nb, view(s, CPU), a)
    s = apply(s, p, a)
  }
  return { s, nb: learnFromRound(nb, view(s, CPU), seededRng(1)) }
}

const WEAK = [c(4, SUIT.swords), c(5, SUIT.clubs), c(6, SUIT.cups)]
const CPU_HAND = [c(3, SUIT.coins), c(4, SUIT.cups), c(12, SUIT.clubs)]

// Three tricks: the CPU takes the 1st, the human the 2nd, and the human sings truco leading the 3rd
const thirdTrickTruco = (last: Card): [Player, Action][] => [
  [0, play(c(4, SUIT.swords))], [1, play(c(3, SUIT.coins))],
  [1, play(c(4, SUIT.cups))], [0, play(c(5, SUIT.clubs))],
  [0, call(CALL.truco)], [1, ACCEPT], [0, play(last)], [1, play(c(12, SUIT.clubs))],
]

test('before seeing anything the read is the prior', () => {
  assert.deepEqual(readOf(newNotebook()), PRIOR_READ)
})

test('the read moves toward what was seen, smoothed by the prior', () => {
  const nb = { ...newNotebook(), trucoCalls: 4, trucoBluffs: 4 }
  assert.equal(readOf(nb).trucoBluff, (4 + 0.25 * 2) / 6)
})

test('an envido sung with 6 and declared is a lie seen', () => {
  const { nb } = playRound(setup(WEAK, CPU_HAND), [[0, call(CALL.envido)], [1, ACCEPT], [0, FOLD]])
  assert.deepEqual([nb.envidoCalls, nb.envidoBluffs], [1, 1])
})

test('an envido nobody declared teaches nothing', () => {
  const { nb } = playRound(setup(WEAK, CPU_HAND), [[0, call(CALL.envido)], [1, { type: 'decline' }], [0, FOLD]])
  assert.deepEqual([nb.envidoCalls, nb.envidoBluffs], [0, 0])
})

test('a truco sung with nothing, once its cards came to light, is a lie seen', () => {
  const { nb } = playRound(setup(WEAK, CPU_HAND, { envidoDone: true }), thirdTrickTruco(c(6, SUIT.cups)))
  assert.deepEqual([nb.trucoCalls, nb.trucoBluffs], [1, 1])
})

test('a truco sung with the ancho de espada is not a lie', () => {
  const human = [c(4, SUIT.swords), c(5, SUIT.clubs), c(1, SUIT.swords)]
  const { nb } = playRound(setup(human, CPU_HAND, { envidoDone: true }), thirdTrickTruco(c(1, SUIT.swords)))
  assert.deepEqual([nb.trucoCalls, nb.trucoBluffs], [1, 0])
})

test('a truco whose cards never came to light teaches nothing', () => {
  const { nb } = playRound(setup(WEAK, CPU_HAND, { envidoDone: true }), [[0, call(CALL.truco)], [1, { type: 'decline' }]])
  assert.deepEqual([nb.trucoCalls, nb.trucoBluffs, nb.pending.length], [0, 0, 0])
})

test('a retruco counts like a truco', () => {
  const { nb } = playRound(setup(WEAK, CPU_HAND, { envidoDone: true }), [
    [0, play(c(4, SUIT.swords))], [1, play(c(3, SUIT.coins))],
    [1, call(CALL.truco)], [0, call(CALL.retruco)], [1, ACCEPT], [1, play(c(4, SUIT.cups))], [0, play(c(5, SUIT.clubs))],
    [0, play(c(6, SUIT.cups))], [1, play(c(12, SUIT.clubs))],
  ])
  assert.deepEqual([nb.trucoCalls, nb.trucoBluffs], [1, 1])
})

test('an envido the human (pie) loses with "son buenas" is still counted once all cards are played', () => {
  // The human (pie) sings 6 and never gets to declare it: the mano's envido is higher, so the human
  // only says "son buenas". Its points only come to light once its three cards are played out
  const human = [c(4, SUIT.swords), c(1, SUIT.cups), c(6, SUIT.clubs)]
  const cpu = [c(2, SUIT.coins), c(5, SUIT.swords), c(3, SUIT.coins)]
  const { nb } = playRound(setup(human, cpu, { firstPlayer: 1, turn: 1, resumeTurn: 1 }), [
    [1, play(c(2, SUIT.coins))], [0, call(CALL.envido)], [1, ACCEPT],
    [0, play(c(4, SUIT.swords))], [1, play(c(5, SUIT.swords))], [0, play(c(1, SUIT.cups))],
    [0, play(c(6, SUIT.clubs))], [1, play(c(3, SUIT.coins))],
  ])
  assert.deepEqual([nb.envidoCalls, nb.envidoBluffs], [1, 1]) // 6 < 27
})

test('a human truco call whose hand only comes to light through the end-of-round show is counted', () => {
  // The human (mano) calls truco before playing a card, then wins the round 2-0: one of its envido
  // cards is never played, but it still comes to light as the shown envido winner's leftover card
  const human = [c(7, SUIT.clubs), c(6, SUIT.clubs), c(2, SUIT.swords)]
  const cpu = [c(4, SUIT.coins), c(5, SUIT.swords), c(3, SUIT.cups)]
  const { nb } = playRound(setup(human, cpu), [
    [0, call(CALL.envido)], [1, ACCEPT],
    [0, call(CALL.truco)], [1, ACCEPT],
    [0, play(c(2, SUIT.swords))], [1, play(c(4, SUIT.coins))],
    [0, play(c(7, SUIT.clubs))], [1, play(c(5, SUIT.swords))],
  ])
  assert.deepEqual([nb.trucoCalls, nb.trucoBluffs], [1, 1]) // counted thanks to the show, not to the plays alone
})

test('a saved notebook survives a reload; anything odd starts over', () => {
  const nb = { ...newNotebook(), trucoCalls: 5, trucoBluffs: 2, envidoCalls: 3, envidoBluffs: 1 }
  assert.deepEqual(fromSaved(toSaved(nb)), nb)
  assert.deepEqual(fromSaved(null), newNotebook())
  assert.deepEqual(fromSaved('not json'), newNotebook())
  assert.deepEqual(fromSaved('{"trucoCalls": -3, "trucoBluffs": "x"}'), newNotebook())
  assert.deepEqual(fromSaved('{"trucoCalls": 1, "trucoBluffs": 9}'), newNotebook())
})
