import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CALL, REASON, SUIT } from '../src/engine.ts'
import type { GameEvent } from '../src/engine.ts'
import { cardName, knowledgeHtml, roundSummary, speech } from '../src/texts.ts'
import { newNotebook } from '../src/learn.ts'
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
  assert.equal(roundSummary(log, 0, 'Ramón Mentirón'), 'Vos +2 (envido) · Ramón Mentirón +1 (mano)')
})

test('card names', () => {
  assert.equal(cardName(c(11, SUIT.coins)), 'Caballo de oro')
  assert.equal(cardName(c(1, SUIT.swords)), '1 de espada')
})

test('what Bruno knows of the player: plain counts, and how sure he is', () => {
  assert.match(knowledgeHtml(newNotebook()), /Todavía no te vio cantar nada/)
  assert.doesNotMatch(knowledgeHtml(newNotebook()), /Truco/)
  const known = knowledgeHtml({ ...newNotebook(), trucoCalls: 4, trucoBluffs: 4, envidoCalls: 1, envidoBluffs: 0 })
  assert.match(known, /Truco:<\/strong> te vio cantar 4 veces y mentiste en 4\./)
  assert.match(known, /Envido:<\/strong> te vio cantar 1 vez y no mentiste\./)
  assert.doesNotMatch(known, /%|conociendo/)
  const early = knowledgeHtml({ ...newNotebook(), trucoCalls: 2, trucoBluffs: 1 })
  assert.match(early, /Envido:<\/strong> todavía no te vio cantar\./)
  assert.match(early, /Todavía te está conociendo/)
})
