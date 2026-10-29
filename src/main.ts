import { LUCK, LUCK_LEVELS, apply, newMatch, startRound, view } from './engine.ts'
import type { Action, LuckLevel, Player, State } from './engine.ts'
import { PROFILES, chooseAction } from './ai.ts'
import { fromSaved as characterFromSaved } from './custom.ts'
import type { Character } from './custom.ts'
import { fromSaved, learnFromRound, noteCall, readOf, toSaved } from './learn.ts'
import type { Notebook } from './learn.ts'
import { mount, renderGame, showMenu } from './ui.ts'
import * as portal from './portal.ts'
import { RIVALS } from './texts.ts'
import * as voice from './voice.ts'

const HUMAN: Player = 0
const CPU: Player = 1

let state: State
let rival: Character
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

function load(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null // storage blocked: keep it within this page only
  }
}

function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // storage blocked or full: keep it in memory
  }
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
  if (state.phase === 'matchOver') portal.setPlaying(false)
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
    act(CPU, chooseAction(v, rival.params, Math.random, readOf(notebook)))
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
  portal.setPlaying(true)
  update()
}

mount(document.getElementById('app')!, {
  onStart: (picked) => {
    voice.unlock()
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
    showMenu(notebook, custom, luck)
  },
})
showMenu(notebook, custom, luck)
portal.init()
