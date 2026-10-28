import { apply, newMatch, startRound, view } from './engine.ts'
import type { Player, State } from './engine.ts'
import { PROFILES, chooseAction } from './ai.ts'
import type { Rival } from './ai.ts'
import { fromSaved, learnFromRound, noteCall, readOf, toSaved } from './learn.ts'
import type { Notebook } from './learn.ts'
import { mount, renderGame, showMenu } from './ui.ts'
import * as portal from './portal.ts'

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
  notebook = learnFromRound(notebook, view(state, CPU), Math.random)
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

function cpuMove() {
  const v = view(state, CPU)
  try {
    state = apply(state, CPU, chooseAction(v, PROFILES[rival], Math.random, readOf(notebook)))
  } catch (err) {
    console.error(err) // never leave the match stuck on an AI bug
    state = apply(state, CPU, v.legal[0])
  }
  update()
}

function startMatch() {
  clearTimeout(cpuTimer)
  state = newMatch(Math.random)
  notebook = { ...notebook, pending: [] } // calls noted in a round left halfway
  portal.setPlaying(true)
  update()
}

mount(document.getElementById('app')!, {
  onStart: (picked) => {
    rival = picked
    startMatch()
  },
  onAction: (action) => {
    notebook = noteCall(notebook, view(state, CPU), action)
    state = apply(state, HUMAN, action)
    update()
  },
  onNextRound: () => {
    state = startRound(state, Math.random)
    update()
  },
  onRematch: async () => {
    await portal.midgameAd()
    startMatch()
  },
  onMenu: () => {
    clearTimeout(cpuTimer)
    portal.setPlaying(false)
    showMenu()
  },
})
showMenu()
portal.init()
