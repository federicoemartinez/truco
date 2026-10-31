import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CALL, SUIT, apply, legalActions, newMatch, seededRng, startRound, view } from '../src/engine.ts'
import type { PlayerView, State, Rng } from '../src/engine.ts'
import { NAME_MAX, cleanName, parseAction, parseMsg, parseView, markReady, legalMove, matchFromSaved, matchToSaved, newEvents, seat } from '../src/online.ts'
import type { Match } from '../src/online.ts'
import { KEY_LENGTH, NONCE_LENGTH } from '../src/trust.ts'
import { c, setup, play as playCard, FOLD, run } from './helpers.ts'

const json = <T>(x: T): T => JSON.parse(JSON.stringify(x))

// Every view the guest gets in a whole match of random legal moves
function guestViews(seed: number): PlayerView[] {
  const rng = seededRng(seed)
  let s: State = newMatch(rng)
  const views = [view(s, 1)]
  for (let i = 0; i < 2000 && s.phase !== 'matchOver'; i++) {
    if (s.phase === 'roundOver') s = startRound(s, rng)
    else {
      const legal = legalActions(s, s.turn)
      s = apply(s, s.turn, legal[Math.floor(rng() * legal.length)])
    }
    views.push(view(s, 1))
  }
  return views
}

test("every view a real match gives the guest reads back the same", () => {
  for (let seed = 1; seed <= 20; seed++) {
    for (const v of guestViews(seed)) assert.deepEqual(parseView(json(v)), json(v))
  }
})

test('a view with anything off is thrown away whole', () => {
  const v = json(guestViews(2)[5])
  const broken: ((v: any) => void)[] = [
    (v) => (v.hand[0].suit = '<img src=x onerror=alert(1)>'),
    (v) => (v.hand[0].rank = 8),
    (v) => (v.extra = 1),
    (v) => (v.score = [31, 0]),
    (v) => (v.score = [1, 2, 3]),
    (v) => (v.round = 0),
    (v) => (v.me = 0),
    (v) => (v.luck = { player: 1, level: 'blessed' }),
    (v) => (v.phase = 'won'),
    (v) => (v.hand = [v.hand[0], v.hand[0], v.hand[0], v.hand[0]]),
    (v) => (v.log = Array.from({ length: 65 }, () => ({ type: 'fold', player: 0 }))),
    (v) => (v.log = [{ type: 'call', player: 0, call: 'superTruco' }]),
    (v) => (v.log = [{ type: 'call', player: 0, call: CALL.truco, again: false }]),
    (v) => (v.log = [{ type: 'score', player: 0, points: 2, reason: '<b>' }]),
    (v) => (v.legal = [{ type: 'play', card: { rank: 1, suit: 'cups', x: 1 } }]),
    (v) => (v.tricks = []),
    (v) => (v.tricks = [{ cards: [null], winner: null }]),
    (v) => (v.opponentHandSize = 4),
    (v) => delete v.turn,
  ]
  for (const breakIt of broken) {
    const bad = json(v)
    breakIt(bad)
    assert.equal(parseView(bad), null, breakIt.toString())
  }
  assert.equal(parseView(null), null)
  assert.equal(parseView([]), null)
  assert.equal(parseView(JSON.parse('{"__proto__": {"me": 1}}')), null)
})

test('actions: only the five kinds, exactly', () => {
  const play = { type: 'play', card: c(1, SUIT.swords) }
  assert.deepEqual(parseAction(json(play)), play)
  assert.deepEqual(parseAction({ type: 'call', call: CALL.retruco }), { type: 'call', call: CALL.retruco })
  assert.deepEqual(parseAction({ type: 'fold' }), { type: 'fold' })
  assert.equal(parseAction({ type: 'fold', now: true }), null)
  assert.equal(parseAction({ type: 'call', call: 'flor' }), null)
  assert.equal(parseAction({ type: 'play', card: { rank: 9, suit: SUIT.cups } }), null)
  assert.equal(parseAction('fold'), null)
})

test('messages: known kinds and fields only', () => {
  const hello = { type: 'hello', key: 'k'.repeat(KEY_LENGTH), name: 'Juan', nonce: 'n'.repeat(NONCE_LENGTH) }
  assert.deepEqual(parseMsg(json(hello)), hello)
  assert.deepEqual(parseMsg({ type: 'ready' }), { type: 'ready' })
  assert.deepEqual(parseMsg({ type: 'action', action: { type: 'accept' } }), { type: 'action', action: { type: 'accept' } })
  assert.equal(parseMsg({ ...hello, key: 'short' }), null)
  assert.equal(parseMsg({ ...hello, admin: true }), null)
  assert.equal(parseMsg({ ...hello, name: 7 }), null)
  assert.equal(parseMsg({ type: 'proof', sig: 'x' }), null)
  assert.equal(parseMsg({ type: 'kick' }), null)
  assert.equal(parseMsg(JSON.parse('{"type": "ready", "__proto__": {}}')), null)
  assert.equal(parseMsg({ type: 'view', view: { me: 1 } }), null)
  assert.equal(parseMsg('ready'), null)
})

test('names: trimmed, no hidden characters, no longer than NAME_MAX', () => {
  assert.equal(cleanName('  Juan  '), 'Juan')
  assert.equal(cleanName('Ju‮an\u0000'), 'Juan')
  assert.equal(cleanName('​‮\u0007'), '') // nothing visible left: the table says "Tu amigo"
  assert.equal(cleanName('ñ'.repeat(40)).length, NAME_MAX)
  assert.equal(cleanName('😀'.repeat(30)), '😀'.repeat(NAME_MAX)) // whole characters, never half an emoji
})

const KEY = 'k'.repeat(KEY_LENGTH)
const OTHER_KEY = 'o'.repeat(KEY_LENGTH)
const match = (state: State): Match => ({ state, ready: [false, false], guestKey: KEY, guestName: 'Juan' })

test("the guest's chair: anyone with no match on, else only that match's guest", () => {
  assert.equal(seat(null, KEY), 'new')
  assert.equal(seat(KEY, KEY), 'resume')
  assert.equal(seat(KEY, OTHER_KEY), 'busy')
})

test('the next round deals only once both said so, and never mid-round', () => {
  const rng = seededRng(4)
  const playing = match(newMatch(rng))
  assert.equal(markReady(playing, 1, rng), playing) // a "next" in the middle of a round means nothing

  const over = match(run(setup([c(1, SUIT.swords)], [c(4, SUIT.cups)]), [[0, FOLD]]))
  assert.equal(over.state.phase, 'roundOver')
  const one = markReady(over, 1, rng)
  assert.equal(one.state, over.state)
  assert.deepEqual(one.ready, [false, true])
  const both = markReady(one, 0, rng)
  assert.equal(both.state.round, over.state.round + 1)
  assert.equal(both.state.phase, 'playing')
  assert.deepEqual(both.ready, [false, false])
  assert.equal(both.guestKey, KEY)
})

test('a rematch deals a fresh match at 0 to 0', () => {
  const rng = seededRng(5)
  const won = match({ ...newMatch(rng), phase: 'matchOver', winner: 0, score: [30, 12] })
  const again = markReady(markReady(won, 0, rng), 1, rng)
  assert.deepEqual(again.state.score, [0, 0])
  assert.equal(again.state.round, 1)
  assert.equal(again.state.luck, null)
})

test("the guest's move is the engine's own, or nothing", () => {
  const s = setup([c(1, SUIT.swords), c(4, SUIT.cups), c(5, SUIT.cups)], [c(7, SUIT.coins), c(6, SUIT.cups), c(2, SUIT.clubs)], { firstPlayer: 1 })
  const wanted = playCard(c(7, SUIT.coins))
  const move = legalMove(s, 1, wanted)
  assert.deepEqual(move, wanted)
  assert.notEqual(move, wanted) // the engine's object, not the one that came over the wire
  assert.equal(legalMove(s, 1, playCard(c(1, SUIT.swords))), null) // not their card
  assert.equal(legalMove(s, 0, playCard(c(1, SUIT.swords))), null) // not their turn
  assert.equal(legalMove(s, 1, { type: 'accept' }), null) // nothing to accept
})

test('the guest hears what it has not heard yet', () => {
  const [a, b] = guestViews(6).filter((v) => v.round === 1 && v.log.length > 0)
  assert.deepEqual(newEvents(null, a), a.log)
  assert.deepEqual(newEvents(a, b), b.log.slice(a.log.length))
  const nextRound = { ...b, round: 2, log: b.log.slice(0, 1) }
  assert.deepEqual(newEvents(b, nextRound), nextRound.log)
  const rematch = { ...b, round: 1, log: b.log.slice(0, 1) } // a match that ended in round 1, dealt again
  assert.deepEqual(newEvents(b, rematch), rematch.log)
})

test("the host's saved match comes back, and anything odd is no match", () => {
  const m = match(newMatch(seededRng(7)))
  assert.deepEqual(matchFromSaved(matchToSaved({ ...m, ready: [true, true] })), m) // "ready" isn't kept
  assert.equal(matchFromSaved(null), null)
  assert.equal(matchFromSaved('{oops'), null)
  assert.equal(matchFromSaved(JSON.stringify({ ...m, guestKey: 'short' })), null)
  assert.equal(matchFromSaved(JSON.stringify({ ...m, state: { ...m.state, phase: 'matchOver' } })), null)
  assert.equal(matchFromSaved(JSON.stringify({ ...m, guestName: 'Ju‮an' }))?.guestName, 'Juan')
})
