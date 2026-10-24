import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SPRITE, backSvg, cardSvg } from '../src/cards.ts'
import { SUITS } from '../src/engine.ts'
import { c } from './helpers.ts'

const count = (text: string, needle: string) => text.split(needle).length - 1

test('number cards show as many suit symbols as their rank; the 1 shows one', () => {
  for (const suit of SUITS) {
    for (const rank of [1, 2, 3, 4, 5, 6, 7] as const) {
      assert.equal(count(cardSvg(c(rank, suit)), `href="#s-${suit}"`), rank, `${rank} ${suit}`)
    }
  }
})

test('figures use their own drawing and hold their suit', () => {
  for (const suit of SUITS) {
    for (const rank of [10, 11, 12] as const) {
      const svg = cardSvg(c(rank, suit))
      assert.equal(count(svg, `href="#f-${rank}"`), 1)
      assert.equal(count(svg, `href="#s-${suit}"`), 1)
    }
  }
})

test('the sprite defines every symbol the cards use', () => {
  for (const id of ['s-swords', 's-clubs', 's-coins', 's-cups', 'f-10', 'f-11', 'f-12', 'back-pattern']) {
    assert.ok(SPRITE.includes(`id="${id}"`), id)
  }
  assert.ok(backSvg().includes('url(#back-pattern)'))
})
