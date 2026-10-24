import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apply, cardPower, envidoPoints, newDeck, newMatch, roundWinner, seededRng, shuffle, startRound, view } from '../src/engine.ts'
import { FOLD, c, play, run, setup } from './helpers.ts'

test('the deck has 40 distinct cards without 8s and 9s', () => {
  const deck = newDeck()
  assert.equal(deck.length, 40)
  assert.equal(new Set(deck.map((k) => `${k.rank}-${k.suit}`)).size, 40)
  assert.ok(deck.every((k) => k.rank <= 7 || k.rank >= 10))
})

test('cardPower follows the truco hierarchy', () => {
  const order = [
    c(1, 'swords'), c(1, 'clubs'), c(7, 'swords'), c(7, 'coins'), c(3, 'cups'), c(2, 'coins'),
    c(1, 'cups'), c(12, 'swords'), c(11, 'clubs'), c(10, 'coins'), c(7, 'cups'), c(6, 'swords'),
    c(5, 'clubs'), c(4, 'coins'),
  ]
  for (let i = 1; i < order.length; i++) {
    assert.ok(cardPower(order[i - 1]) > cardPower(order[i]), `${JSON.stringify(order[i - 1])} > ${JSON.stringify(order[i])}`)
  }
  assert.equal(cardPower(c(1, 'cups')), cardPower(c(1, 'coins')))
  assert.equal(cardPower(c(7, 'cups')), cardPower(c(7, 'clubs')))
  assert.equal(cardPower(c(3, 'swords')), cardPower(c(3, 'cups')))
})

test('envidoPoints: 20 plus the pair of the same suit, figures count 0', () => {
  assert.equal(envidoPoints([c(7, 'swords'), c(6, 'swords'), c(4, 'cups')]), 33)
  assert.equal(envidoPoints([c(12, 'coins'), c(11, 'coins'), c(1, 'cups')]), 20)
  assert.equal(envidoPoints([c(10, 'coins'), c(5, 'coins'), c(7, 'cups')]), 25)
  assert.equal(envidoPoints([c(7, 'cups'), c(6, 'cups'), c(5, 'cups')]), 33)
})

test('envidoPoints without a pair is the highest card, figures count 0', () => {
  assert.equal(envidoPoints([c(4, 'swords'), c(6, 'clubs'), c(5, 'cups')]), 6)
  assert.equal(envidoPoints([c(10, 'swords'), c(11, 'clubs'), c(12, 'coins')]), 0)
})

test('shuffle is a reproducible permutation', () => {
  const a = shuffle(newDeck(), seededRng(7))
  const b = shuffle(newDeck(), seededRng(7))
  assert.deepEqual(a, b)
  assert.notDeepEqual(a, newDeck())
  assert.equal(new Set(a.map((k) => `${k.rank}-${k.suit}`)).size, 40)
})

const MANO = [c(1, 'swords'), c(4, 'cups'), c(5, 'cups')]
const PIE = [c(3, 'coins'), c(6, 'clubs'), c(7, 'cups')]

test('newMatch deals 3 different cards to each player', () => {
  const s = newMatch(seededRng(3))
  const all = [...s.hands[0], ...s.hands[1]].map((k) => `${k.rank}-${k.suit}`)
  assert.equal(new Set(all).size, 6)
  assert.deepEqual(s.score, [0, 0])
  assert.equal(s.round, 1)
  assert.equal(s.turn, s.firstPlayer)
})

test('the mano leads; the higher card takes the trick and leads the next one', () => {
  let s = setup(MANO, PIE)
  s = run(s, [[0, play(c(1, 'swords'))], [1, play(c(3, 'coins'))]])
  assert.equal(s.tricks[0].winner, 0)
  assert.equal(s.turn, 0)
  s = run(s, [[0, play(c(4, 'cups'))], [1, play(c(6, 'clubs'))]])
  assert.equal(s.tricks[1].winner, 1)
  assert.equal(s.turn, 1)
  s = run(s, [[1, play(c(7, 'cups'))], [0, play(c(5, 'cups'))]])
  assert.equal(s.phase, 'roundOver')
  assert.deepEqual(s.score, [0, 1])
})

test('after a tied trick the mano leads', () => {
  let s = setup([c(3, 'swords'), c(4, 'cups'), c(5, 'cups')], [c(3, 'cups'), c(6, 'clubs'), c(7, 'cups')], { firstPlayer: 1 })
  s = run(s, [[1, play(c(3, 'cups'))], [0, play(c(3, 'swords'))]])
  assert.equal(s.tricks[0].winner, 'tie')
  assert.equal(s.turn, 1)
})

test('pardas decide the round as in the spec', () => {
  assert.equal(roundWinner([0, 0], 1), 0)
  assert.equal(roundWinner([1, 0], 0), null)
  assert.equal(roundWinner([1, 0, 1], 0), 1)
  assert.equal(roundWinner(['tie', 1], 0), 1)
  assert.equal(roundWinner(['tie', 'tie'], 0), null)
  assert.equal(roundWinner(['tie', 'tie', 0], 1), 0)
  assert.equal(roundWinner(['tie', 'tie', 'tie'], 1), 1)
  assert.equal(roundWinner([0, 'tie'], 1), 0)
  assert.equal(roundWinner([0, 1, 'tie'], 1), 0)
  assert.equal(roundWinner([1, 0, 'tie'], 0), 1)
})

test('startRound keeps the score, counts rounds and alternates the mano', () => {
  const s = run(setup(MANO, PIE), [[0, FOLD]])
  const next = startRound(s, seededRng(2))
  assert.equal(next.firstPlayer, 1)
  assert.equal(next.turn, 1)
  assert.deepEqual(next.score, [0, 1])
  assert.equal(next.round, s.round + 1)
  assert.equal(next.hands[0].length, 3)
  assert.equal(next.log.length, 0)
})

test('startRound refuses while the round is being played', () => {
  assert.throws(() => startRound(setup(MANO, PIE), seededRng(2)))
})

test('folding gives the opponent the round', () => {
  const s = run(setup(MANO, PIE), [[0, FOLD]])
  assert.deepEqual(s.score, [0, 1])
  assert.equal(s.phase, 'roundOver')
})

test('apply rejects out-of-turn moves and cards not in hand, without mutating', () => {
  const s = setup(MANO, PIE)
  const before = JSON.stringify(s)
  assert.throws(() => apply(s, 1, play(PIE[0])), /Illegal/)
  assert.throws(() => apply(s, 0, play(c(12, 'coins'))), /Illegal/)
  apply(s, 0, play(MANO[0]))
  assert.equal(JSON.stringify(s), before)
})

test('view shows only your own cards and your legal actions', () => {
  const s = setup(MANO, PIE)
  const v = view(s, 1)
  assert.equal('hands' in v, false)
  assert.deepEqual(v.hand, PIE)
  assert.deepEqual(v.dealt, PIE)
  assert.equal(v.opponentHandSize, 3)
  assert.deepEqual(v.legal, [])
  assert.ok(!JSON.stringify(v).includes('{"rank":1,"suit":"swords"}'), 'the mano\'s 1 de espada leaked')
})
