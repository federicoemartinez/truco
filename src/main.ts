import { apply, newMatch, startRound, view } from './engine.ts'
import type { Player, State } from './engine.ts'
import { PROFILES, chooseAction } from './ai.ts'
import type { Rival } from './ai.ts'
import { mount, renderGame, showMenu } from './ui.ts'
import * as portal from './portal.ts'

const HUMAN: Player = 0
const CPU: Player = 1

let state: State
let rival: Rival
let cpuTimer: number | undefined

function update() {
  renderGame(view(state, HUMAN), rival)
  if (state.phase === 'matchOver') portal.setPlaying(false)
  if (state.phase === 'playing' && state.turn === CPU) cpuTimer = window.setTimeout(cpuMove, 700 + Math.random() * 500)
}

function cpuMove() {
  const v = view(state, CPU)
  try {
    state = apply(state, CPU, chooseAction(v, PROFILES[rival]))
  } catch (err) {
    console.error(err) // never leave the match stuck on an AI bug
    state = apply(state, CPU, v.legal[0])
  }
  update()
}

function startMatch() {
  clearTimeout(cpuTimer)
  state = newMatch(Math.random)
  portal.setPlaying(true)
  update()
}

mount(document.getElementById('app')!, {
  onStart: (picked) => {
    rival = picked
    startMatch()
  },
  onAction: (action) => {
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
