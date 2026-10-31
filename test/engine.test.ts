import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BET, CALL, ENVIDO_CALLS, LUCK, LUCK_LEVELS, REASON, SUIT, apply, cardPower, envidoAcceptedPoints, envidoCards, envidoDeclinedPoints, envidoPoints,
  faltaPoints, legalActions, newDeck, newMatch, other, roundWinner, seededRng, shuffle, startRound, view,
} from '../src/engine.ts'
import type { EnvidoCall, LuckLevel } from '../src/engine.ts'
import { ACCEPT, DECLINE, FOLD, c, call, has, play, run, setup } from './helpers.ts'

test('the deck has 40 distinct cards without 8s and 9s', () => {
  const deck = newDeck()
  assert.equal(deck.length, 40)
  assert.equal(new Set(deck.map((k) => `${k.rank}-${k.suit}`)).size, 40)
  assert.ok(deck.every((k) => k.rank <= 7 || k.rank >= 10))
})

test('cardPower follows the truco hierarchy', () => {
  const order = [
    c(1, SUIT.swords), c(1, SUIT.clubs), c(7, SUIT.swords), c(7, SUIT.coins), c(3, SUIT.cups), c(2, SUIT.coins),
    c(1, SUIT.cups), c(12, SUIT.swords), c(11, SUIT.clubs), c(10, SUIT.coins), c(7, SUIT.cups), c(6, SUIT.swords),
    c(5, SUIT.clubs), c(4, SUIT.coins),
  ]
  for (let i = 1; i < order.length; i++) {
    assert.ok(cardPower(order[i - 1]) > cardPower(order[i]), `${JSON.stringify(order[i - 1])} > ${JSON.stringify(order[i])}`)
  }
  assert.equal(cardPower(c(1, SUIT.cups)), cardPower(c(1, SUIT.coins)))
  assert.equal(cardPower(c(7, SUIT.cups)), cardPower(c(7, SUIT.clubs)))
  assert.equal(cardPower(c(3, SUIT.swords)), cardPower(c(3, SUIT.cups)))
})

test('envidoPoints: 20 plus the pair of the same suit, figures count 0', () => {
  assert.equal(envidoPoints([c(7, SUIT.swords), c(6, SUIT.swords), c(4, SUIT.cups)]), 33)
  assert.equal(envidoPoints([c(12, SUIT.coins), c(11, SUIT.coins), c(1, SUIT.cups)]), 20)
  assert.equal(envidoPoints([c(10, SUIT.coins), c(5, SUIT.coins), c(7, SUIT.cups)]), 25)
  assert.equal(envidoPoints([c(7, SUIT.cups), c(6, SUIT.cups), c(5, SUIT.cups)]), 33)
})

test('envidoPoints without a pair is the highest card, figures count 0', () => {
  assert.equal(envidoPoints([c(4, SUIT.swords), c(6, SUIT.clubs), c(5, SUIT.cups)]), 6)
  assert.equal(envidoPoints([c(10, SUIT.swords), c(11, SUIT.clubs), c(12, SUIT.coins)]), 0)
})

test('shuffle is a reproducible permutation', () => {
  const a = shuffle(newDeck(), seededRng(7))
  const b = shuffle(newDeck(), seededRng(7))
  assert.deepEqual(a, b)
  assert.notDeepEqual(a, newDeck())
  assert.equal(new Set(a.map((k) => `${k.rank}-${k.suit}`)).size, 40)
})

const MANO = [c(1, SUIT.swords), c(4, SUIT.cups), c(5, SUIT.cups)]
const PIE = [c(3, SUIT.coins), c(6, SUIT.clubs), c(7, SUIT.cups)]

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
  s = run(s, [[0, play(c(1, SUIT.swords))], [1, play(c(3, SUIT.coins))]])
  assert.equal(s.tricks[0].winner, 0)
  assert.equal(s.turn, 0)
  s = run(s, [[0, play(c(4, SUIT.cups))], [1, play(c(6, SUIT.clubs))]])
  assert.equal(s.tricks[1].winner, 1)
  assert.equal(s.turn, 1)
  s = run(s, [[1, play(c(7, SUIT.cups))], [0, play(c(5, SUIT.cups))]])
  assert.equal(s.phase, 'roundOver')
  assert.deepEqual(s.score, [0, 1])
})

test('after a tied trick the mano leads', () => {
  let s = setup([c(3, SUIT.swords), c(4, SUIT.cups), c(5, SUIT.cups)], [c(3, SUIT.cups), c(6, SUIT.clubs), c(7, SUIT.cups)], { firstPlayer: 1 })
  s = run(s, [[1, play(c(3, SUIT.cups))], [0, play(c(3, SUIT.swords))]])
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

test('every luck deals 6 different cards, and the next round keeps it', () => {
  const rng = seededRng(5)
  for (const level of LUCK_LEVELS) {
    for (let i = 0; i < 200; i++) {
      const s = newMatch(rng, { player: 1, level })
      const all = [...s.hands[0], ...s.hands[1]].map((k) => `${k.rank}-${k.suit}`)
      assert.equal(new Set(all).size, 6)
    }
    const s = newMatch(rng, { player: 1, level })
    assert.deepEqual(startRound(run(s, [[s.turn, FOLD]]), rng).luck, { player: 1, level })
  }
})

test('the luckier the level, the stronger the lucky hand, at the truco and at the envido', () => {
  const rng = seededRng(6)
  const averages = LUCK_LEVELS.map((level) => {
    let power = 0
    let envido = 0
    for (let i = 0; i < 4000; i++) {
      const hand = newMatch(rng, { player: 1, level }).dealt[1]
      power += hand.reduce((sum, k) => sum + cardPower(k), 0)
      envido += envidoPoints(hand)
    }
    return { level, power, envido }
  })
  for (let k = 1; k < averages.length; k++) {
    assert.ok(averages[k].power > averages[k - 1].power, `${averages[k].level} truco`)
    assert.ok(averages[k].envido > averages[k - 1].envido, `${averages[k].level} envido`)
  }
})

test('the extremes show: a brava, a 3 or a 2 is rare when cursed, and comes in pairs when blessed', () => {
  const rng = seededRng(8)
  const share = (level: LuckLevel, atLeast: number) => {
    let n = 0
    for (let i = 0; i < 4000; i++) if (newMatch(rng, { player: 1, level }).dealt[1].filter((k) => cardPower(k) >= 9).length >= atLeast) n++
    return n / 4000
  }
  assert.ok(share(LUCK.cursed, 1) < 0.35) // about 27%, against 67% balanced
  assert.ok(share(LUCK.balanced, 1) > 0.6)
  assert.ok(share(LUCK.blessed, 2) > 0.55) // about 66%, against 21% balanced
  assert.ok(share(LUCK.balanced, 2) < 0.3)
})

test('balanced luck deals just like no luck', () => {
  assert.deepEqual(newMatch(seededRng(7), { player: 1, level: LUCK.balanced }).dealt, newMatch(seededRng(7)).dealt)
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
  assert.throws(() => apply(s, 0, play(c(12, SUIT.coins))), /Illegal/)
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

const STRONG = [c(1, SUIT.swords), c(1, SUIT.clubs), c(4, SUIT.cups)]
const WEAK = [c(4, SUIT.coins), c(5, SUIT.coins), c(6, SUIT.cups)]

test('truco accepted: the round is worth 2 and the accepter holds the quiero', () => {
  let s = run(setup(STRONG, WEAK), [[0, call(CALL.truco)]])
  assert.equal(s.turn, 1)
  assert.ok(has(legalActions(s, 1), ACCEPT))
  assert.ok(has(legalActions(s, 1), DECLINE))
  assert.ok(has(legalActions(s, 1), call(CALL.retruco)))
  assert.ok(!has(legalActions(s, 1), play(WEAK[0])))
  s = run(s, [[1, ACCEPT]])
  assert.equal(s.trucoLevel, 1)
  assert.equal(s.raiseRights, 1)
  assert.equal(s.turn, 0)
  assert.ok(!has(legalActions(s, 0), call(CALL.retruco)))
  s = run(s, [[0, play(STRONG[0])]])
  assert.ok(has(legalActions(s, 1), call(CALL.retruco)))
  s = run(s, [[1, play(WEAK[0])], [0, play(STRONG[1])], [1, play(WEAK[1])]])
  assert.equal(s.phase, 'roundOver')
  assert.deepEqual(s.score, [2, 0])
})

test('declining the truco gives the caller 1 and ends the round', () => {
  const s = run(setup(STRONG, WEAK), [[0, call(CALL.truco)], [1, DECLINE]])
  assert.deepEqual(s.score, [1, 0])
  assert.equal(s.phase, 'roundOver')
})

test('answering truco with retruco accepts the truco; declining the retruco pays 2', () => {
  let s = run(setup(STRONG, WEAK), [[0, call(CALL.truco)], [1, call(CALL.retruco)]])
  assert.equal(s.trucoLevel, 1)
  assert.equal(s.turn, 0)
  s = run(s, [[0, DECLINE]])
  assert.deepEqual(s.score, [0, 2])
})

test('after a direct raise only the one who accepted may raise again', () => {
  let s = run(setup(STRONG, WEAK), [[0, call(CALL.truco)], [1, call(CALL.retruco)], [0, ACCEPT]])
  assert.equal(s.trucoLevel, 2)
  assert.equal(s.raiseRights, 0)
  assert.equal(s.turn, 0)
  assert.ok(has(legalActions(s, 0), call(CALL.valeCuatro)))
  s = run(s, [[0, play(STRONG[0])]])
  assert.ok(!legalActions(s, 1).some((a) => a.type === 'call'))
})

test('vale cuatro is the top bet', () => {
  let s = run(setup(STRONG, WEAK), [[0, call(CALL.truco)], [1, call(CALL.retruco)], [0, call(CALL.valeCuatro)]])
  assert.ok(!legalActions(s, 1).some((a) => a.type === 'call'))
  s = run(s, [[1, ACCEPT]])
  assert.equal(s.trucoLevel, 3)
  assert.ok(!legalActions(s, 0).some((a) => a.type === 'call'))
})

test('folding while facing a retruco pays 2', () => {
  const s = run(setup(STRONG, WEAK), [[0, call(CALL.truco)], [1, call(CALL.retruco)], [0, FOLD]])
  assert.deepEqual(s.score, [0, 2])
})

test('after answering, the turn goes back to whoever was about to play', () => {
  const s = run(setup(STRONG, WEAK), [[0, play(STRONG[2])], [1, call(CALL.truco)], [0, ACCEPT]])
  assert.equal(s.turn, 1)
  assert.equal(s.raiseRights, 0)
})

test('points stop at 30 and the match ends', () => {
  let s = setup(WEAK, STRONG, { score: [0, 28] })
  s = run(s, [[0, call(CALL.truco)], [1, call(CALL.retruco)], [0, call(CALL.valeCuatro)], [1, ACCEPT]])
  s = run(s, [[0, play(WEAK[0])], [1, play(STRONG[0])], [1, play(STRONG[1])], [0, play(WEAK[1])]])
  assert.deepEqual(s.score, [0, 30])
  assert.equal(s.phase, 'matchOver')
  assert.equal(s.winner, 1)
  assert.deepEqual(s.log.at(-1), { type: 'score', player: 1, points: 2, reason: REASON.round })
  assert.deepEqual(legalActions(s, 0), [])
  assert.deepEqual(legalActions(s, 1), [])
})

test('envido points table (quiero / no quiero)', () => {
  const table: [EnvidoCall[], number | 'falta', number][] = [
    [[CALL.envido], 2, 1],
    [[CALL.envido, CALL.envido], 4, 2],
    [[CALL.realEnvido], 3, 1],
    [[CALL.envido, CALL.realEnvido], 5, 2],
    [[CALL.envido, CALL.envido, CALL.realEnvido], 7, 4],
    [[CALL.faltaEnvido], 'falta', 1],
    [[CALL.envido, CALL.faltaEnvido], 'falta', 2],
    [[CALL.envido, CALL.envido, CALL.faltaEnvido], 'falta', 4],
    [[CALL.realEnvido, CALL.faltaEnvido], 'falta', 3],
    [[CALL.envido, CALL.realEnvido, CALL.faltaEnvido], 'falta', 5],
    [[CALL.envido, CALL.envido, CALL.realEnvido, CALL.faltaEnvido], 'falta', 7],
  ]
  for (const [calls, accepted, declined] of table) {
    const score: [number, number] = [20, 10]
    const expected = accepted === 'falta' ? faltaPoints(score, 1) : accepted
    assert.equal(envidoAcceptedPoints(calls, score, 1), expected, `${calls} quiero`)
    assert.equal(envidoDeclinedPoints(calls), declined, `${calls} no quiero`)
  }
})

test('falta envido: the match in malas, the leader\'s missing points in buenas', () => {
  assert.equal(faltaPoints([10, 5], 1), 25)
  assert.equal(faltaPoints([10, 5], 0), 20)
  assert.equal(faltaPoints([20, 10], 1), 10)
  assert.equal(faltaPoints([20, 10], 0), 10)
  assert.equal(faltaPoints([18, 18], 0), 12)
})

const MANO_27 = [c(7, SUIT.cups), c(10, SUIT.cups), c(4, SUIT.swords)]
const PIE_27 = [c(7, SUIT.coins), c(12, SUIT.coins), c(3, SUIT.clubs)]
const PIE_33 = [c(6, SUIT.swords), c(7, SUIT.swords), c(4, SUIT.cups)]
const isEnvidoAction = (a: { type: string; call?: string }) =>
  a.type === 'call' && (ENVIDO_CALLS as readonly string[]).includes(a.call!)

test('envido accepted: the mano declares, the pie says son buenas, the mano wins ties', () => {
  const s = run(setup(MANO_27, PIE_27), [[0, call(CALL.envido)], [1, ACCEPT]])
  assert.deepEqual(s.log.slice(2), [
    { type: 'envidoPoints', player: 0, points: 27 },
    { type: 'sonBuenas', player: 1 },
    { type: 'score', player: 0, points: 2, reason: REASON.envido },
  ])
  assert.deepEqual(s.score, [2, 0])
  assert.equal(s.turn, 0)
  assert.equal(s.phase, 'playing')
  assert.ok(!legalActions(s, 0).some(isEnvidoAction))
})

test('a pie with better points declares them and wins', () => {
  const s = run(setup(MANO_27, PIE_33), [[0, call(CALL.envido)], [1, call(CALL.realEnvido)], [0, ACCEPT]])
  assert.ok(s.log.some((e) => e.type === 'envidoPoints' && e.player === 1 && e.points === 33))
  assert.deepEqual(s.score, [0, 5])
  assert.equal(s.turn, 0)
})

test('declining an envido pays the caller', () => {
  const s = run(setup(MANO_27, PIE_33), [[0, call(CALL.envido)], [1, call(CALL.envido)], [0, DECLINE]])
  assert.deepEqual(s.score, [0, 2])
  assert.equal(s.turn, 0)
})

test('envido escalation only goes up, with envido repeated at most once', () => {
  let s = run(setup(MANO_27, PIE_27), [[0, call(CALL.envido)]])
  assert.deepEqual(legalActions(s, 1).filter(isEnvidoAction), [call(CALL.envido), call(CALL.realEnvido), call(CALL.faltaEnvido)])
  assert.ok(!has(legalActions(s, 1), call(CALL.truco)))
  s = run(s, [[1, call(CALL.envido)]])
  assert.deepEqual(legalActions(s, 0).filter(isEnvidoAction), [call(CALL.realEnvido), call(CALL.faltaEnvido)])
  s = run(s, [[0, call(CALL.realEnvido)]])
  assert.deepEqual(legalActions(s, 1).filter(isEnvidoAction), [call(CALL.faltaEnvido)])
  s = run(s, [[1, call(CALL.faltaEnvido)]])
  assert.deepEqual(legalActions(s, 0), [ACCEPT, DECLINE, FOLD])
})

test('envido only in the first trick and before playing your card', () => {
  let s = setup(MANO_27, PIE_27)
  assert.ok(has(legalActions(s, 0), call(CALL.envido)))
  s = run(s, [[0, play(MANO_27[0])]])
  assert.ok(has(legalActions(s, 1), call(CALL.envido)))
  const afterTruco = run(s, [[1, call(CALL.truco)]])
  assert.ok(!legalActions(afterTruco, 0).some(isEnvidoAction))
  s = run(s, [[1, play(PIE_27[0])]])
  assert.ok(!legalActions(s, s.turn).some(isEnvidoAction))
})

test('el envido está primero: envido over a truco, then the truco is answered', () => {
  let s = run(setup(MANO_27, PIE_33), [[0, call(CALL.truco)]])
  assert.ok(has(legalActions(s, 1), call(CALL.envido)))
  s = run(s, [[1, call(CALL.envido)]])
  assert.equal(s.turn, 0)
  s = run(s, [[0, ACCEPT]])
  assert.deepEqual(s.score, [0, 2])
  assert.equal(s.turn, 1)
  assert.equal(s.pending.at(-1)?.kind, BET.truco)
  assert.ok(!legalActions(s, 1).some(isEnvidoAction))
  s = run(s, [[1, ACCEPT]])
  assert.equal(s.trucoLevel, 1)
  assert.equal(s.turn, 0)
})

test('once the envido is settled, whoever sang the truco asks it again', () => {
  const sung = { type: 'call', player: 0, call: CALL.truco, again: true }
  assert.deepEqual(run(setup(MANO_27, PIE_33), [[0, call(CALL.truco)], [1, call(CALL.envido)], [0, ACCEPT]]).log.at(-1), sung)
  assert.deepEqual(run(setup(MANO_27, PIE_33), [[0, call(CALL.truco)], [1, call(CALL.envido)], [0, DECLINE]]).log.at(-1), sung)
  const raised = run(setup(MANO_27, PIE_33), [[0, call(CALL.truco)], [1, call(CALL.retruco)], [0, call(CALL.valeCuatro)]])
  assert.equal(raised.log.filter((e) => e.type === 'call' && e.again).length, 0) // no envido in between: nothing to repeat
})

test('no envido once the truco is accepted', () => {
  const s = run(setup(MANO_27, PIE_33), [[0, call(CALL.truco)], [1, ACCEPT]])
  assert.ok(!legalActions(s, 0).some(isEnvidoAction))
  assert.ok(!legalActions(run(s, [[0, play(MANO_27[0])]]), 1).some(isEnvidoAction))
})

test('folding while facing an envido pays the declined envido plus the round', () => {
  const s = run(setup(MANO_27, PIE_33), [[0, call(CALL.envido)], [1, call(CALL.realEnvido)], [0, FOLD]])
  assert.deepEqual(s.score, [0, 3])
  assert.equal(s.phase, 'roundOver')
})

test('envidoCards: the pair that scores, else the highest card', () => {
  assert.deepEqual(envidoCards(PIE_33), [c(6, SUIT.swords), c(7, SUIT.swords)])
  assert.deepEqual(envidoCards([c(4, SUIT.swords), c(6, SUIT.clubs), c(5, SUIT.cups)]), [c(6, SUIT.clubs)])
  assert.deepEqual(envidoCards([c(7, SUIT.cups), c(6, SUIT.cups), c(5, SUIT.cups)]), [c(7, SUIT.cups), c(6, SUIT.cups)])
})

const shown = (log: { type: string }[]) => log.filter((e) => e.type === 'show')

test('the envido winner shows the envido cards still in hand when the round ends', () => {
  const s = run(setup(MANO_27, PIE_33), [[0, call(CALL.envido)], [1, ACCEPT], [0, play(c(4, SUIT.swords))], [1, play(c(7, SUIT.swords))], [1, FOLD]])
  assert.deepEqual(shown(s.log), [{ type: 'show', player: 1, cards: [c(6, SUIT.swords)] }])
})

test('nothing to show after a no quiero; whoever said son buenas shows nothing', () => {
  assert.deepEqual(shown(run(setup(MANO_27, PIE_33), [[0, call(CALL.envido)], [1, DECLINE], [0, FOLD]]).log), [])
  const s = run(setup(MANO_27, PIE_27), [[0, call(CALL.envido)], [1, ACCEPT], [0, FOLD]])
  assert.deepEqual(shown(s.log), [{ type: 'show', player: 0, cards: [c(7, SUIT.cups), c(10, SUIT.cups)] }])
})

test('an envido that ends the match is shown too', () => {
  const MANO_33 = [c(7, SUIT.swords), c(6, SUIT.swords), c(4, SUIT.cups)]
  const s = run(setup(MANO_33, PIE_27, { score: [28, 0] }), [[0, call(CALL.envido)], [1, ACCEPT]])
  assert.equal(s.phase, 'matchOver')
  assert.deepEqual(shown(s.log), [{ type: 'show', player: 0, cards: [c(7, SUIT.swords), c(6, SUIT.swords)] }])
})

test('folding while an envido sits on a truco pays the envido plus 1', () => {
  const s = run(setup(MANO_27, PIE_33), [[0, call(CALL.truco)], [1, call(CALL.envido)], [0, FOLD]])
  assert.deepEqual(s.score, [0, 2])
})

test('an envido can end the match mid-round, even with a truco waiting', () => {
  const MANO_33 = [c(7, SUIT.swords), c(6, SUIT.swords), c(4, SUIT.cups)]
  const s = run(setup(MANO_33, PIE_27, { score: [28, 0] }), [[0, call(CALL.truco)], [1, call(CALL.envido)], [0, ACCEPT]])
  assert.deepEqual(s.score, [30, 0])
  assert.equal(s.phase, 'matchOver')
  assert.equal(s.winner, 0)
  assert.deepEqual(s.pending, [])
  assert.deepEqual(legalActions(s, 0), [])
  assert.deepEqual(legalActions(s, 1), [])
})

test('falta envido in malas wins the match', () => {
  const MANO_33 = [c(7, SUIT.swords), c(6, SUIT.swords), c(4, SUIT.cups)]
  const s = run(setup(MANO_33, PIE_27, { score: [10, 5] }), [[0, call(CALL.faltaEnvido)], [1, ACCEPT]])
  assert.deepEqual(s.score, [30, 5])
  assert.equal(s.phase, 'matchOver')
})

test('random legal play keeps the engine consistent', () => {
  for (let seed = 1; seed <= 1000; seed++) {
    const rng = seededRng(seed)
    let s = newMatch(rng)
    for (let steps = 0; s.phase !== 'matchOver'; steps++) {
      assert.ok(steps < 5000, `match ${seed} did not finish`)
      if (s.phase === 'roundOver') {
        s = startRound(s, rng)
        continue
      }
      const legal = legalActions(s, s.turn)
      assert.ok(legal.length > 0, `no moves in match ${seed}`)
      assert.deepEqual(legalActions(s, other(s.turn)), [])
      s = apply(s, s.turn, legal[Math.floor(rng() * legal.length)])
      for (const p of [0, 1] as const) {
        assert.equal(s.hands[p].length + s.tricks.filter((t) => t.cards[p]).length, 3)
        assert.ok(s.score[p] <= 30)
      }
    }
    assert.equal(Math.max(...s.score), 30)
  }
})
