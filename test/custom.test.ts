import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_PARAMS } from '../src/ai.ts'
import { TRAITS, fromSaved, newCharacter, pointOf, valueAt } from '../src/custom.ts'

test('a trait value survives the trip to the hexagon and back', () => {
  for (let k = 0; k < TRAITS.length; k++) {
    for (const v of [0, 0.25, 0.5, 1]) {
      const [x, y] = pointOf(k, v)
      assert.ok(Math.abs(valueAt(k, x, y) - v) < 1e-9, `${TRAITS[k]} ${v}`)
    }
  }
})

test('dragging past the center or the edge stops at 0 and 1', () => {
  const [x, y] = pointOf(1, 1)
  assert.equal(valueAt(1, x * 3, y * 3), 1)
  assert.equal(valueAt(1, -x, -y), 0)
})

test('a saved character comes back as it was; anything broken falls back to the defaults', () => {
  const c = { name: 'El Tío', params: { ...DEFAULT_PARAMS, trucoBluff: 0.9, reads: 1 }, voice: { rate: 0.9, bright: -6 } }
  assert.deepEqual(fromSaved(JSON.stringify(c)), c)
  assert.deepEqual(fromSaved(null), newCharacter())
  assert.deepEqual(fromSaved('not json'), newCharacter())
  const odd = fromSaved('{"name": 7, "params": {"trucoBluff": 5, "fish": "x"}, "voice": {"rate": 99}}')
  assert.equal(odd.name, '')
  assert.equal(odd.params.trucoBluff, 1)
  assert.equal(odd.params.fish, DEFAULT_PARAMS.fish)
  assert.equal(odd.voice.rate, 1.2)
  assert.equal(odd.voice.bright, 0)
})
