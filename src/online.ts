import { BET, CALL, ENVIDO_CALLS, RANKS, REASON, SUITS, WIN, legalActions, newMatch, sameAction, startRound } from './engine.ts'
import type { Action, Card, GameEvent, Pending, Player, PlayerView, Rng, State, Trick } from './engine.ts'
import { KEY_LENGTH, NONCE_LENGTH, SIG_LENGTH, isB64, newNonce, prove, verify } from './trust.ts'
import type { Identity } from './trust.ts'

// What the two phones say to each other (see docs/superpowers/specs/2026-10-31-online-design.md)
export type Msg =
  | { type: 'hello'; key: string; name: string; nonce: string } // base64url; both ways, on every join
  | { type: 'proof'; sig: string } // base64url
  | { type: 'busy' } // host → someone who isn't this match's guest
  | { type: 'view'; view: PlayerView } // host → guest
  | { type: 'action'; action: Action } // guest → host
  | { type: 'ready' } // "Siguiente mano" or "Revancha"
  | { type: 'bye' } // left the match on purpose
export type Hello = Extract<Msg, { type: 'hello' }>

export const NAME_MAX = 24
const SENT_NAME_MAX = 200 // longer than any honest name, cut to NAME_MAX anyway
const LOG_MAX = 64 // a round has far fewer events
const ROUND_MAX = 999
const LEGAL_MAX = 12

// Everything below reads what the other phone sent: never trust it. Each parser builds a fresh object
// out of checked parts, or returns null for anything off by a single field
type Obj = Record<string, unknown>

const typeOf = (x: unknown) => (typeof x === 'object' && x !== null ? (x as Obj).type : undefined)

// A plain object with exactly these keys, plus any of the optional ones
function shape(x: unknown, keys: string[], optional: string[] = []): Obj | null {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return null
  if (Object.keys(x).some((k) => !keys.includes(k) && !optional.includes(k))) return null
  return keys.every((k) => Object.hasOwn(x, k)) ? (x as Obj) : null
}

const int = (x: unknown, min: number, max: number): x is number => Number.isInteger(x) && (x as number) >= min && (x as number) <= max
const oneOf = <T>(x: unknown, values: readonly T[]): x is T => values.includes(x as T)
const isPlayer = (x: unknown): x is Player => x === 0 || x === 1

// Every item parsed, or null if one fails or there are too many
function list<T>(x: unknown, max: number, item: (y: unknown) => T | null): T[] | null {
  if (!Array.isArray(x) || x.length > max) return null
  const out: T[] = []
  for (const y of x) {
    const parsed = item(y)
    if (parsed === null) return null
    out.push(parsed)
  }
  return out
}

// No control or invisible formatting characters (they can flip the text around), at most NAME_MAX
// whole characters
export function cleanName(name: string): string {
  return Array.from(name.replace(/\p{C}/gu, '').trim()).slice(0, NAME_MAX).join('').trim()
}

const CALLS = Object.values(CALL)
const REASONS = Object.values(REASON)
const BETS = Object.values(BET)
const PHASES = ['playing', 'roundOver', 'matchOver'] as const

function parseCard(x: unknown): Card | null {
  const o = shape(x, ['rank', 'suit'])
  return o && oneOf(o.rank, RANKS) && oneOf(o.suit, SUITS) ? { rank: o.rank, suit: o.suit } : null
}

export function parseAction(x: unknown): Action | null {
  const t = typeOf(x)
  switch (t) {
    case 'play': {
      const o = shape(x, ['type', 'card'])
      const card = o && parseCard(o.card)
      return card ? { type: t as 'play', card } : null
    }
    case 'call': {
      const o = shape(x, ['type', 'call'])
      return o && oneOf(o.call, CALLS) ? { type: t as 'call', call: o.call } : null
    }
    case 'accept': case 'decline': case 'fold':
      return shape(x, ['type']) ? { type: t as 'accept' | 'decline' | 'fold' } : null
    default:
      return null
  }
}

function parseEvent(x: unknown): GameEvent | null {
  const t = typeOf(x)
  switch (t) {
    case 'play': {
      const o = shape(x, ['type', 'player', 'card'])
      const card = o && parseCard(o.card)
      return o && card && isPlayer(o.player) ? { type: t as 'play', player: o.player, card } : null
    }
    case 'call': {
      const o = shape(x, ['type', 'player', 'call'], ['again'])
      if (!o || !isPlayer(o.player) || !oneOf(o.call, CALLS)) return null
      if (!Object.hasOwn(o, 'again')) return { type: t as 'call', player: o.player, call: o.call }
      return o.again === true ? { type: t as 'call', player: o.player, call: o.call, again: true } : null
    }
    case 'accept': case 'decline': case 'fold': case 'sonBuenas': {
      const o = shape(x, ['type', 'player'])
      return o && isPlayer(o.player) ? { type: t as 'accept' | 'decline' | 'fold' | 'sonBuenas', player: o.player } : null
    }
    case 'envidoPoints': {
      const o = shape(x, ['type', 'player', 'points'])
      return o && isPlayer(o.player) && int(o.points, 0, 33) ? { type: t as 'envidoPoints', player: o.player, points: o.points } : null
    }
    case 'show': {
      const o = shape(x, ['type', 'player', 'cards'])
      const cards = o && list(o.cards, 3, parseCard)
      return o && cards && isPlayer(o.player) ? { type: t as 'show', player: o.player, cards } : null
    }
    case 'score': {
      const o = shape(x, ['type', 'player', 'points', 'reason'])
      return o && isPlayer(o.player) && int(o.points, 0, WIN) && oneOf(o.reason, REASONS)
        ? { type: t as 'score', player: o.player, points: o.points, reason: o.reason } : null
    }
    default:
      return null
  }
}

function parseTrick(x: unknown): Trick | null {
  const o = shape(x, ['cards', 'winner'])
  const raw = o?.cards
  if (!o || !Array.isArray(raw) || raw.length !== 2) return null
  const cards = raw.map((card) => (card === null ? null : parseCard(card)))
  if (cards.some((card, i) => card === null && raw[i] !== null)) return null
  const winner = o.winner
  if (!(winner === null || winner === 'tie' || isPlayer(winner))) return null
  return { cards: [cards[0], cards[1]], winner }
}

function parsePending(x: unknown): Pending | null {
  const o = shape(x, ['kind', 'caller'])
  return o && oneOf(o.kind, BETS) && isPlayer(o.caller) ? { kind: o.kind, caller: o.caller } : null
}

const VIEW_KEYS = ['round', 'score', 'firstPlayer', 'tricks', 'turn', 'resumeTurn', 'pending', 'trucoLevel', 'raiseRights',
  'envidoCalls', 'envidoDone', 'phase', 'winner', 'log', 'luck', 'me', 'hand', 'dealt', 'opponentHandSize', 'legal']

// The guest's view of the table (me: 1, no luck), as the host's engine makes it
export function parseView(x: unknown): PlayerView | null {
  const o = shape(x, VIEW_KEYS)
  if (!o) return null
  const score = list(o.score, 2, (s) => (int(s, 0, WIN) ? s : null))
  const tricks = list(o.tricks, 3, parseTrick)
  const pending = list(o.pending, 3, parsePending)
  const envidoCalls = list(o.envidoCalls, 4, (call) => (oneOf(call, ENVIDO_CALLS) ? call : null))
  const log = list(o.log, LOG_MAX, parseEvent)
  const hand = list(o.hand, 3, parseCard)
  const dealt = list(o.dealt, 3, parseCard)
  const legal = list(o.legal, LEGAL_MAX, parseAction)
  if (!score || score.length !== 2 || !tricks?.length || !pending || !envidoCalls || !log || !hand || !dealt || !legal) return null
  if (!int(o.round, 1, ROUND_MAX) || !isPlayer(o.firstPlayer) || !isPlayer(o.turn) || !isPlayer(o.resumeTurn)) return null
  if (!int(o.trucoLevel, 0, 3) || !(o.raiseRights === null || isPlayer(o.raiseRights)) || typeof o.envidoDone !== 'boolean') return null
  if (!oneOf(o.phase, PHASES) || !(o.winner === null || isPlayer(o.winner)) || o.luck !== null || o.me !== 1) return null
  if (!int(o.opponentHandSize, 0, 3)) return null
  return {
    round: o.round, score: [score[0], score[1]], firstPlayer: o.firstPlayer, tricks, turn: o.turn, resumeTurn: o.resumeTurn,
    pending, trucoLevel: o.trucoLevel, raiseRights: o.raiseRights, envidoCalls, envidoDone: o.envidoDone, phase: o.phase,
    winner: o.winner, log, luck: null, me: 1, hand, dealt, opponentHandSize: o.opponentHandSize, legal,
  }
}

export function parseMsg(x: unknown): Msg | null {
  const t = typeOf(x)
  switch (t) {
    case 'hello': {
      const o = shape(x, ['type', 'key', 'name', 'nonce'])
      return o && isB64(o.key, KEY_LENGTH) && typeof o.name === 'string' && o.name.length <= SENT_NAME_MAX && isB64(o.nonce, NONCE_LENGTH)
        ? { type: t as 'hello', key: o.key, name: cleanName(o.name), nonce: o.nonce } : null
    }
    case 'proof': {
      const o = shape(x, ['type', 'sig'])
      return o && isB64(o.sig, SIG_LENGTH) ? { type: t as 'proof', sig: o.sig } : null
    }
    case 'busy': case 'ready': case 'bye':
      return shape(x, ['type']) ? { type: t as 'busy' | 'ready' | 'bye' } : null
    case 'action': {
      const o = shape(x, ['type', 'action'])
      const action = o && parseAction(o.action)
      return action ? { type: t as 'action', action } : null
    }
    case 'view': {
      const o = shape(x, ['type', 'view'])
      const view = o && parseView(o.view)
      return view ? { type: t as 'view', view } : null
    }
    default:
      return null
  }
}

// The host's match against a friend: the state, who already said "next", and who the guest is
export type Match = { state: State; ready: [boolean, boolean]; guestKey: string; guestName: string }

// Who gets the guest's chair: anyone while no match is on, else only that match's guest
export function seat(guestKey: string | null, key: string): 'new' | 'resume' | 'busy' {
  if (guestKey === null) return 'new'
  return key === guestKey ? 'resume' : 'busy'
}

// A player's "next" at the end of a round or match; once both said it, the next deal (a new match
// after the last round)
export function markReady(m: Match, p: Player, rng: Rng): Match {
  if (m.state.phase === 'playing') return m // a "next" in the middle of a round means nothing
  const ready: [boolean, boolean] = [m.ready[0], m.ready[1]]
  ready[p] = true
  if (!ready[0] || !ready[1]) return { ...m, ready }
  const state = m.state.phase === 'matchOver' ? newMatch(rng) : startRound(m.state, rng)
  return { ...m, state, ready: [false, false] }
}

// The engine's own copy of the move the guest asked for, or null if they can't make it now: nothing the
// other phone built goes into the state
export function legalMove(state: State, p: Player, wanted: Action): Action | null {
  return legalActions(state, p).find((a) => sameAction(a, wanted)) ?? null
}

// What the guest hasn't heard yet: the events since its last view, or the whole log of a new deal
export function newEvents(prev: PlayerView | null, next: PlayerView): GameEvent[] {
  if (!prev || prev.round !== next.round || next.log.length < prev.log.length) return next.log
  return next.log.slice(prev.log.length)
}

export const matchToSaved = (m: Match) => JSON.stringify({ state: m.state, guestKey: m.guestKey, guestName: m.guestName })

// The host's match in play, from this phone's own storage; anything odd and there is none
export function matchFromSaved(raw: string | null): Match | null {
  try {
    const o = JSON.parse(raw ?? 'null')
    if (!isB64(o?.guestKey, KEY_LENGTH) || typeof o.guestName !== 'string') return null
    if (o.state?.phase !== 'playing' && o.state?.phase !== 'roundOver') return null
    return { state: o.state, ready: [false, false], guestKey: o.guestKey, guestName: cleanName(o.guestName) }
  } catch {
    return null
  }
}

// What the gate needs from the network: net.ts gives the real one, tests wire two fakes together
export type Link = {
  send(msg: Msg, peer: string): Promise<void> | void
  fingerprints(peer: string): { local: string; remote: string } | null
}

export type Gate = {
  join(peer: string): Promise<void>
  leave(peer: string): Promise<void>
  receive(peer: string, data: unknown): Promise<void>
}

type Peer = { nonce: string; hello?: Hello; verified: boolean }

// Lets a peer's messages through only once it proved it holds the key it claims, on this very connection.
// One message at a time, in order: a view sent right after a proof waits until the proof is checked
export function createGate(me: Identity, name: () => string, link: Link, on: {
  verified(peer: string, hello: Hello): Promise<void> | void
  message(peer: string, msg: Msg): void
}): Gate {
  const peers = new Map<string, Peer>()
  let queue = Promise.resolve()
  const enqueue = (job: () => Promise<void> | void) => (queue = queue.then(job).catch((err) => console.warn(err)))

  // Introduces ourselves to a peer the first time we hear of it
  const greet = (peer: string): Peer => {
    let p = peers.get(peer)
    if (!p) {
      p = { nonce: newNonce(), verified: false }
      peers.set(peer, p)
      void link.send({ type: 'hello', key: me.publicKey, name: name(), nonce: p.nonce }, peer)
    }
    return p
  }

  async function handle(peer: string, data: unknown) {
    const msg = parseMsg(data)
    if (!msg) return
    const p = greet(peer)
    const fp = link.fingerprints(peer)
    if (msg.type === 'hello') {
      if (p.hello || !fp) return // one introduction per connection
      p.hello = msg
      await link.send({ type: 'proof', sig: await prove(me, msg.nonce, fp.local, fp.remote) }, peer)
    } else if (msg.type === 'proof') {
      if (!p.hello || p.verified || !fp) return
      if (!(await verify(p.hello.key, msg.sig, p.nonce, fp.local, fp.remote))) return
      p.verified = true
      await on.verified(peer, p.hello)
    } else if (p.verified) on.message(peer, msg)
  }

  return {
    join: (peer) => enqueue(() => void greet(peer)),
    leave: (peer) => enqueue(() => void peers.delete(peer)),
    receive: (peer, data) => enqueue(() => handle(peer, data)),
  }
}
