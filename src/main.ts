import { LUCK, LUCK_LEVELS, apply, newMatch, startRound, view } from './engine.ts'
import type { Action, LuckLevel, Player, State } from './engine.ts'
import { PROFILES, chooseAction } from './ai.ts'
import { fromSaved as characterFromSaved } from './custom.ts'
import type { Character } from './custom.ts'
import { fromSaved, learnFromRound, noteCall, readOf, toSaved } from './learn.ts'
import type { Notebook } from './learn.ts'
import { mount, refreshInstall, renderGame, showGuestLobby, showMenu } from './ui.ts'
import { initInstall } from './install.ts'
import { RIVALS } from './texts.ts'
import * as voice from './voice.ts'
import { load, save } from './storage.ts'
import * as friend from './friend.ts'
import { ID_PATTERN, loadIdentity } from './trust.ts'
import type { Identity } from './trust.ts'

const HUMAN: Player = 0
const CPU: Player = 1

let state: State
let rival: Character
let peeks = false // Arnaldo plays seeing the player's cards
let cpuTimer: number | undefined

// What the CPU learned about the player outlives the match and the page (see learn.ts)
const NOTEBOOK_KEY = 'truco:notebook'
let notebook: Notebook = fromSaved(load(NOTEBOOK_KEY))

// The rival the player built, kept for the next visit
const CUSTOM_KEY = 'truco:custom'
let custom: Character = characterFromSaved(load(CUSTOM_KEY))

// How lucky the CPU is with the cards: the difficulty the player picked last
const LUCK_KEY = 'truco:luck'
const savedLuck = load(LUCK_KEY)
let luck: LuckLevel = LUCK_LEVELS.find((level) => level === savedLuck) ?? LUCK.balanced

// Against a friend instead of the CPU (see friend.ts)
let online = false
let identity: Promise<Identity> | undefined
const me = () => (identity ??= loadIdentity())

// A friend's invitation: ?sala=<their id>
const room = new URLSearchParams(location.search).get('sala')
const invited = room !== null && ID_PATTERN.test(room)

const menu = () => showMenu(notebook, custom, luck, friend.savedMatch()?.guestName ?? null)

// From a tap: the voices unlock now, before waiting for the keys
async function playFriend(guestOf: string | null) {
  clearTimeout(cpuTimer)
  voice.stop()
  voice.unlock()
  online = true
  const id = await me()
  if (guestOf && guestOf !== id.id) friend.guest(id, guestOf)
  else friend.host(id) // our own link opens our own room
}

function learn() {
  try {
    notebook = learnFromRound(notebook, view(state, CPU), state.dealt[HUMAN], Math.random) // the round is over: peeking is fair
  } catch (err) {
    console.error(err) // never leave the round-over screen stuck on a learning bug
    return
  }
  save(NOTEBOOK_KEY, toSaved(notebook))
}

function update() {
  if (state.phase !== 'playing') learn() // once per round: the next update comes after a new deal
  renderGame(view(state, HUMAN), rival.name)
  if (state.phase === 'playing' && state.turn === CPU) cpuTimer = window.setTimeout(cpuMove, 700 + Math.random() * 500)
}

// Plays the action and says out loud whatever it made each player say
function act(p: Player, action: Action) {
  const before = state.log.length
  state = apply(state, p, action)
  voice.say(state.log.slice(before), state.firstPlayer, (who) => (who === HUMAN ? voice.PLAYER_VOICE : rival.voice))
}

const VOICE_WAIT_MAX = 5000 // ms; a clip that never loads can't stall the match

function cpuMove(waited = 0) {
  if (voice.busy() && waited < VOICE_WAIT_MAX) {
    cpuTimer = window.setTimeout(() => cpuMove(waited + 100), 100) // let the last words finish first
    return
  }
  const v = view(state, CPU)
  try {
    const peek = peeks ? { dealt: state.dealt[HUMAN], hand: state.hands[HUMAN] } : undefined
    act(CPU, chooseAction(v, rival.params, Math.random, readOf(notebook), peek))
  } catch (err) {
    console.error(err) // never leave the match stuck on an AI bug
    act(CPU, v.legal[0])
  }
  update()
}

function startMatch() {
  clearTimeout(cpuTimer)
  voice.stop()
  state = newMatch(Math.random, { player: CPU, level: luck })
  notebook = { ...notebook, pending: [] } // calls noted in a round left halfway
  update()
}

mount(document.getElementById('app')!, {
  onStart: (picked) => {
    voice.unlock()
    peeks = picked === 'arnaldo'
    if (typeof picked === 'string') {
      rival = { name: RIVALS[picked].name, params: PROFILES[picked], voice: voice.VOICES[picked] }
    } else {
      rival = custom = picked
      save(CUSTOM_KEY, JSON.stringify(custom))
    }
    startMatch()
  },
  onLuck: (level) => {
    luck = level
    save(LUCK_KEY, luck)
  },
  onAction: (action) => {
    if (online) return friend.action(action)
    notebook = noteCall(notebook, view(state, CPU), action)
    act(HUMAN, action)
    update()
  },
  onNextRound: () => {
    if (online) return friend.nextRound()
    state = startRound(state, Math.random)
    update()
  },
  onRematch: () => (online ? friend.nextRound() : startMatch()),
  onMenu: () => {
    clearTimeout(cpuTimer)
    voice.stop()
    if (online) {
      online = false
      void friend.quit()
      history.replaceState(null, '', location.pathname) // no invitation left in the address bar
    }
    menu()
  },
  onFriend: () => void playFriend(null),
  onEnter: (name) => {
    friend.setName(name)
    showGuestLobby(name, 'connecting')
    void playFriend(room)
  },
  onName: friend.setName,
})
if (invited) showGuestLobby(friend.myName(), 'idle')
else menu()
initInstall(refreshInstall)
