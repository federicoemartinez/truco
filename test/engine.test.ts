import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cardPower, envidoPoints, newDeck, seededRng, shuffle } from '../src/engine.ts'
import { c } from './helpers.ts'

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
