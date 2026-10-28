import { apply, newMatch, startRound, view } from './engine.ts'
import type { Action, Player, State } from './engine.ts'
import { PROFILES, chooseAction } from './ai.ts'
import type { Rival } from './ai.ts'
import { fromSaved, learnFromRound, noteCall, readOf, toSaved } from './learn.ts'
import type { Notebook } from './learn.ts'
import { mount, renderGame, showMenu } from './ui.ts'
import * as portal from './portal.ts'
import * as voice from './voice.ts'

const HUMAN: Player = 0
const CPU: Player = 1

let state: State
let rival: Rival
let cpuTimer: number | undefined

// What the CPU learned about the player outlives the match and the page (see learn.ts)
const NOTEBOOK_KEY = 'truco:notebook'
let notebook: Notebook = fromSaved(load())

function load(): string | null {
  try {
    return localStorage.getItem(NOTEBOOK_KEY)
  } catch {
    return null // storage blocked: learn within this page only
  }
}

function learn() {
  try {
    notebook = learnFromRound(notebook, view(state, CPU), Math.random)
  } catch (err) {
    console.error(err) // never leave the round-over screen stuck on a learning bug
    return
  }
  try {
    localStorage.setItem(NOTEBOOK_KEY, toSaved(notebook))
  } catch {
    // storage blocked or full: keep the notebook in memory
  }
}

function update() {
  if (state.phase !== 'playing') learn() // once per round: the next update comes after a new deal
  renderGame(view(state, HUMAN), rival)
  if (state.phase === 'matchOver') portal.setPlaying(false)
  if (state.phase === 'playing' && state.turn === CPU) cpuTimer = window.setTimeout(cpuMove, 700 + Math.random() * 500)
}

// Plays the action and says out loud whatever it made each player say
function act(p: Player, action: Action) {
  const before = state.log.length
  state = apply(state, p, action)
  voice.say(state.log.slice(before), state.firstPlayer, (who) => (who === HUMAN ? voice.PLAYER_VOICE : voice.VOICES[rival]))
}

const VOICE_WAIT_MAX = 5000 // ms; a clip that never loads can't stall the match

function cpuMove(waited = 0) {
  if (voice.busy() && waited < VOICE_WAIT_MAX) {
    cpuTimer = window.setTimeout(() => cpuMove(waited + 100), 100) // let the last words finish first
    return
  }
  const v = view(state, CPU)
  try {
    act(CPU, chooseAction(v, PROFILES[rival], Math.random, readOf(notebook)))
  } catch (err) {
    console.error(err) // never leave the match stuck on an AI bug
    act(CPU, v.legal[0])
  }
  update()
}

function startMatch() {
  clearTimeout(cpuTimer)
  voice.stop()
  state = newMatch(Math.random)
  notebook = { ...notebook, pending: [] } // calls noted in a round left halfway
  portal.setPlaying(true)
  update()
}

mount(document.getElementById('app')!, {
  onStart: (picked) => {
    voice.unlock()
    rival = picked
    startMatch()
  },
  onAction: (action) => {
    notebook = noteCall(notebook, view(state, CPU), action)
    act(HUMAN, action)
    update()
  },
  onNextRound: () => {
    state = startRound(state, Math.random)
    update()
  },
  onRematch: async () => {
    voice.stop() // no words over the ad
    await portal.midgameAd()
    startMatch()
  },
  onMenu: () => {
    clearTimeout(cpuTimer)
    voice.stop()
    portal.setPlaying(false)
    showMenu(notebook)
  },
})
showMenu(notebook)
portal.init()
