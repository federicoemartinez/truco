import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CALL, REASON, SUIT } from '../src/engine.ts'
import type { GameEvent } from '../src/engine.ts'
import { cardName, roundSummary, speech } from '../src/texts.ts'
import { c } from './helpers.ts'

test('envido declarations read like at the table', () => {
  assert.equal(speech({ type: 'envidoPoints', player: 0, points: 27 }, 0), 'Tengo 27')
  assert.equal(speech({ type: 'envidoPoints', player: 1, points: 31 }, 0), '31 son mejores')
  assert.equal(speech({ type: 'sonBuenas', player: 1 }, 0), 'Son buenas')
  assert.equal(speech({ type: 'call', player: 1, call: CALL.retruco }, 0), '¡Quiero retruco!')
  assert.equal(speech({ type: 'play', player: 0, card: c(4, SUIT.cups) }, 0), null)
})

test('round summary lists who scored and why', () => {
  const log: GameEvent[] = [
    { type: 'score', player: 0, points: 2, reason: REASON.envido },
    { type: 'score', player: 1, points: 1, reason: REASON.round },
  ]
  assert.equal(roundSummary(log, 0), 'Vos +2 (envido) · Máquina +1 (mano)')
})

test('card names', () => {
  assert.equal(cardName(c(11, SUIT.coins)), 'Caballo de oro')
  assert.equal(cardName(c(1, SUIT.swords)), '1 de espada')
})
