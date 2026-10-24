import { apply, newMatch, startRound, view } from './engine.ts'
import type { Player, State } from './engine.ts'
import { chooseAction } from './ai.ts'
import { mount, renderGame, showMenu } from './ui.ts'

const HUMAN: Player = 0
const CPU: Player = 1

let state: State
let cpuTimer: number | undefined

function update() {
  renderGame(view(state, HUMAN))
  if (state.phase === 'playing' && state.turn === CPU) cpuTimer = window.setTimeout(cpuMove, 700 + Math.random() * 500)
}

function cpuMove() {
  const v = view(state, CPU)
  try {
    state = apply(state, CPU, chooseAction(v))
  } catch (err) {
    console.error(err) // never leave the match stuck on an AI bug
    state = apply(state, CPU, v.legal[0])
  }
  update()
}

function startMatch() {
  clearTimeout(cpuTimer)
  state = newMatch(Math.random)
  update()
}

mount(document.getElementById('app')!, {
  onStart: startMatch,
  onAction: (action) => {
    state = apply(state, HUMAN, action)
    update()
  },
  onNextRound: () => {
    state = startRound(state, Math.random)
    update()
  },
  onRematch: startMatch,
  onMenu: () => {
    clearTimeout(cpuTimer)
    showMenu()
  },
})
showMenu()
