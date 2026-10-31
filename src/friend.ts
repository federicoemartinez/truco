import { apply, newMatch, view } from './engine.ts'
import type { Action, Player, PlayerView } from './engine.ts'
import { createGate, legalMove, markReady, matchFromSaved, matchToSaved, newEvents, seat } from './online.ts'
import type { Gate, Hello, Match, Msg } from './online.ts'
import { joinTable } from './net.ts'
import type { Net } from './net.ts'
import { idOf } from './trust.ts'
import type { Identity } from './trust.ts'
import { drop, load, save } from './storage.ts'
import { renderGame, showGuestLobby, showHostLobby } from './ui.ts'
import type { Notice } from './ui.ts'
import { T } from './texts.ts'
import * as voice from './voice.ts'

// Playing a friend: the host (player 0) keeps the match and checks every move; the guest (player 1)
// draws what the host sends and asks to play. See docs/superpowers/specs/2026-10-31-online-design.md
const HOST: Player = 0
const GUEST: Player = 1
const FRIEND_VOICE = voice.VOICES.aristoteles // the clip as it was recorded
const voiceOf = (me: Player) => (who: Player) => (who === me ? voice.PLAYER_VOICE : FRIEND_VOICE)

const NAME_KEY = 'truco:name'
const MATCH_KEY = 'truco:online'

export const myName = () => load(NAME_KEY) ?? ''
export const setName = (name: string) => save(NAME_KEY, name)
export const savedMatch = () => matchFromSaved(load(MATCH_KEY))

// Fire-and-forget sends: the channel can close mid-send, and nothing here awaits the result
const tell = (msg: Msg, to: string) => void Promise.resolve(net?.send(msg, to)).catch((err) => console.warn(err))

let net: Net | null = null
let gate: Gate | null = null
let role: 'host' | 'guest' = 'host'
let peer: string | null = null // the other phone, once it proved who it is
let friendName = ''
let notice: Notice = null
let started = false // the table was on screen: leaving now ends the match
let match: Match | null = null // host only
let roomId = '' // guest only
let seen: PlayerView | null = null // guest only: the last view drawn

function connect(me: Identity, room: string) {
  leave()
  const n = joinTable(room, {
    join: (p) => void (net === n && gate?.join(p)),
    leave: (p) => {
      if (net !== n) return
      void gate?.leave(p)
      if (p === peer) lost()
    },
    message: (p, data) => void (net === n && gate?.receive(p, data)),
  })
  net = n
  gate = createGate(me, myName, n, { verified, message })
}

function leave() {
  net?.leave()
  net = null
  gate = null
  peer = null
}

async function verified(p: string, hello: Hello) {
  if (role === 'guest') {
    if ((await idOf(hello.key)) !== roomId) return // only the room's owner hosts it
    peer = p
    friendName = hello.name || T.someone
    notice = null // back from a drop: the host forgot who said "next", so nobody waits
    draw()
    return
  }
  switch (seat(match?.guestKey ?? null, hello.key)) {
    case 'busy':
      tell({ type: 'busy' }, p)
      return
    case 'new':
      match = { state: newMatchState(), ready: [false, false], guestKey: hello.key, guestName: hello.name }
      break
    case 'resume':
      match = { ...match!, ready: [false, false], guestName: hello.name }
  }
  peer = p
  friendName = hello.name || T.someone
  notice = null
  update()
}

function message(p: string, msg: Msg) {
  if (p !== peer) return
  if (role === 'host') {
    if (!match) return
    if (msg.type === 'action') {
      const action = legalMove(match.state, GUEST, msg.action)
      if (!action) return
      act(GUEST, action)
      update()
    } else if (msg.type === 'ready') next(GUEST)
    else if (msg.type === 'bye') friendLeft()
    return
  }
  if (msg.type === 'view') {
    const v = msg.view
    voice.say(newEvents(seen, v), v.firstPlayer, voiceOf(GUEST))
    if (notice === 'waiting' && (seen?.round !== v.round || seen?.phase !== v.phase)) notice = null
    seen = v
    draw()
  } else if (msg.type === 'busy') {
    leave()
    showGuestLobby(myName(), 'busy')
  } else if (msg.type === 'bye') friendLeft()
}

// The friend's phone dropped without saying goodbye: wait for it
function lost() {
  peer = null
  if (!started || notice === 'left') return
  notice = 'paused'
  draw()
}

function friendLeft() {
  notice = 'left'
  if (role === 'host') drop(MATCH_KEY)
  else history.replaceState(null, '', location.pathname) // reloading shouldn't knock on this table again
  leave()
  draw()
}

function draw() {
  const v = role === 'host' ? match && view(match.state, HOST) : seen
  if (!v) return
  started = true
  renderGame(v, friendName, notice)
}

// Host: keep the match, show it, send the guest its view
function update() {
  const m = match!
  if (m.state.phase === 'matchOver') drop(MATCH_KEY)
  else save(MATCH_KEY, matchToSaved(m))
  draw()
  if (peer) tell({ type: 'view', view: view(m.state, GUEST) }, peer)
}

function act(p: Player, action: Action) {
  const m = match!
  const before = m.state.log.length
  m.state = apply(m.state, p, action)
  voice.say(m.state.log.slice(before), m.state.firstPlayer, voiceOf(HOST))
}

function next(p: Player) {
  const before = match!
  match = markReady(before, p, Math.random)
  if (match.state !== before.state) {
    notice = null
    update()
  } else if (p === HOST) {
    notice = 'waiting'
    draw()
  }
}

const newMatchState = () => newMatch(Math.random) // no luck between friends


// Opens this phone's own room and waits for the friend (or for the guest of the saved match)
export function host(me: Identity) {
  role = 'host'
  match = savedMatch()
  notice = null
  started = false
  connect(me, me.id)
  showHostLobby(`${location.origin}${location.pathname}?sala=${me.id}`, myName(), match?.guestName ?? null)
}

export function guest(me: Identity, room: string) {
  role = 'guest'
  roomId = room
  seen = null
  notice = null
  started = false
  connect(me, room)
}

export function action(a: Action) {
  if (!peer || notice) return // nobody to play against right now
  if (role === 'guest') tell({ type: 'action', action: a }, peer)
  else if (match) {
    act(HOST, a)
    update()
  }
}

export function nextRound() {
  if (!peer || notice) return
  if (role === 'host') return next(HOST)
  tell({ type: 'ready' }, peer)
  notice = 'waiting'
  draw()
}

// Leaving the table on purpose: tell the friend, and a match left halfway is over. Leaving the lobby
// before playing keeps a saved match for later
export async function quit() {
  if (peer) {
    try {
      await net?.send({ type: 'bye' }, peer)
    } catch (err) {
      console.warn(err) // still leaving the table either way
    }
  }
  if (started && role === 'host') drop(MATCH_KEY)
  leave()
  match = null
  seen = null
}
