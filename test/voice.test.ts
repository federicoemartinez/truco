import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { CALL, SUIT } from '../src/engine.ts'
import type { GameEvent } from '../src/engine.ts'
import { clipName } from '../src/voice.ts'
import { c } from './helpers.ts'

const ENVIDO_POINTS = [0, 1, 2, 3, 4, 5, 6, 7, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33]

test('everything a player can say has its clip, and every clip is said', () => {
  const said: GameEvent[] = [
    ...Object.values(CALL).map((call): GameEvent => ({ type: 'call', player: 0, call })),
    { type: 'accept', player: 0 },
    { type: 'decline', player: 0 },
    { type: 'fold', player: 0 },
    { type: 'sonBuenas', player: 1 },
    // The mano declares any points; the pie only declares when it beats them, so never 0
    ...ENVIDO_POINTS.map((points): GameEvent => ({ type: 'envidoPoints', player: 0, points })),
    ...ENVIDO_POINTS.filter((p) => p > 0).map((points): GameEvent => ({ type: 'envidoPoints', player: 1, points })),
  ]
  for (const e of said) assert.ok(existsSync(`public/voice/${clipName(e, 0)}.mp3`), JSON.stringify(e))
  assert.equal(readdirSync('public/voice').length, said.length)
})

test('playing a card is silent', () => {
  assert.equal(clipName({ type: 'play', player: 0, card: c(4, SUIT.cups) }, 0), null)
})
