import { other, sameCard } from './engine.ts'
import type { Action, GameEvent, Player, PlayerView, Trick } from './engine.ts'
import { SPRITE, backSvg, cardSvg } from './cards.ts'
import { ACTION_LABEL, CALL_LABEL, RULES_HTML, T, cardName, roundSummary, speech } from './texts.ts'

export type Handlers = {
  onStart(): void
  onAction(action: Action): void
  onNextRound(): void
  onRematch(): void
  onMenu(): void
}

type PlayEvent = Extract<GameEvent, { type: 'play' }>

let root: HTMLElement
let current: PlayerView | null = null
let lastRender = 0
let seen = { round: 0, plays: 0, bubbles: [null, null] as (string | null)[] }

export function mount(el: HTMLElement, h: Handlers) {
  root = el
  document.body.insertAdjacentHTML('afterbegin', SPRITE)
  root.addEventListener('click', (e) => {
    const target = (e.target as Element).closest<HTMLElement>('[data-do]')
    switch (target?.dataset.do) {
      case 'start': return h.onStart()
      case 'rules': return root.querySelector<HTMLDialogElement>('#rules')!.showModal()
      case 'next': return h.onNextRound()
      case 'rematch': return h.onRematch()
      case 'menu': return h.onMenu()
      case 'act': {
        // ponytail: time-based guard against a double tap landing on the freshly drawn table; per-render tokens if it misfires
        if (performance.now() - lastRender < 250) return
        const action = current?.legal[Number(target!.dataset.i)]
        if (action) h.onAction(action)
      }
    }
  })
}

export function showMenu() {
  current = null
  seen = { round: 0, plays: 0, bubbles: [null, null] }
  root.innerHTML = `
    <main class="menu">
      <h1>${T.title}</h1>
      <p>${T.subtitle}</p>
      <button class="primary" data-do="start">${T.play}</button>
      <button data-do="rules">${T.rules}</button>
      <dialog id="rules">${RULES_HTML}<form method="dialog"><button>${T.close}</button></form></dialog>
    </main>`
}

export function renderGame(v: PlayerView) {
  current = v
  lastRender = performance.now()
  const opp = other(v.me)
  const newRound = v.round !== seen.round
  const plays = v.log.filter((e): e is PlayEvent => e.type === 'play')
  const lastPlay = !newRound && plays.length > seen.plays ? plays[plays.length - 1] : undefined
  const bubbles = [bubbleText(v, 0), bubbleText(v, 1)]
  const dealCls = newRound ? ' deal' : ''
  const dealStyle = (k: number) => (newRound ? ` style="--k:${k}"` : '')

  const bubble = (p: Player, cls: string) => {
    const text = bubbles[p]
    const pop = text !== seen.bubbles[p] ? ' pop' : ''
    return `<div class="${cls}">${text ? `<span class="bubble${pop}">${text}</span>` : ''}</div>`
  }

  const slot = (trick: Trick | undefined, p: Player) => {
    const card = trick?.cards[p]
    if (!trick || !card) return '<div class="slot"></div>'
    const won = trick.winner === p ? ' won' : ''
    const enter = lastPlay && lastPlay.player === p && sameCard(lastPlay.card, card) ? ' enter' : ''
    return `<div class="slot${won}${enter}" role="img" aria-label="${cardName(card)}">${cardSvg(card)}</div>`
  }

  const tricks = [0, 1, 2]
    .map((i) => `<div class="trick"><span class="label">${T.trick[i]}</span>${slot(v.tricks[i], opp)}${slot(v.tricks[i], v.me)}</div>`)
    .join('')

  const backs = Array.from({ length: v.opponentHandSize }, (_, k) => `<div class="back${dealCls}"${dealStyle(k)}>${backSvg()}</div>`).join('')

  const hand = v.hand.map((card, k) => {
    const i = v.legal.findIndex((a) => a.type === 'play' && sameCard(a.card, card))
    const act = i < 0 ? 'disabled' : `data-do="act" data-i="${i}"`
    return `<button class="card-btn${dealCls}"${dealStyle(k)} ${act} aria-label="${cardName(card)}">${cardSvg(card)}</button>`
  }).join('')

  const buttons = v.legal.map((a, i) => {
    if (a.type === 'play') return ''
    const label = a.type === 'call' ? CALL_LABEL[a.call] : ACTION_LABEL[a.type]
    return `<button class="${a.type}" data-do="act" data-i="${i}">${label}</button>`
  }).join('')

  const thinking = v.phase === 'playing' && v.turn !== v.me ? `<span class="thinking">${T.thinking}</span>` : ''

  root.innerHTML = `
    <main class="table">
      <header class="top">
        <div class="opponent">
          <div class="opp-hand" role="img" aria-label="${T.cpu}: ${v.opponentHandSize}">${backs}</div>
          ${thinking}
          ${bubble(opp, 'bubble-row')}
        </div>
        ${scoreboard(v)}
      </header>
      <section class="tricks">${tricks}</section>
      ${bubble(v.me, 'bubble-row mine')}
      <section class="hand">${hand}</section>
      <nav class="actions">${buttons}</nav>
      ${overlay(v)}
    </main>`

  seen = { round: v.round, plays: plays.length, bubbles }
}

// A player's latest words since the last card hit the table
function bubbleText(v: PlayerView, p: Player): string | null {
  for (let i = v.log.length - 1; i >= 0; i--) {
    const e = v.log[i]
    if (e.type === 'play') return null
    if (e.player === p) {
      const text = speech(e, v.firstPlayer)
      if (text) return text
    }
  }
  return null
}

function overlay(v: PlayerView): string {
  if (v.phase === 'roundOver') {
    return `<div class="overlay"><div class="panel">
      <p>${roundSummary(v.log, v.me)}</p>
      <button class="primary" data-do="next">${T.nextRound}</button>
    </div></div>`
  }
  if (v.phase === 'matchOver') {
    const mine = v.score[v.me]
    const theirs = v.score[other(v.me)]
    return `<div class="overlay"><div class="panel">
      <h2>${v.winner === v.me ? T.won(mine, theirs) : T.lost(mine, theirs)}</h2>
      <p>${roundSummary(v.log, v.me)}</p>
      <button class="primary" data-do="rematch">${T.rematch}</button>
      <button data-do="menu">${T.menu}</button>
    </div></div>`
  }
  return ''
}

function scoreboard(v: PlayerView): string {
  const row = (p: Player, label: string) =>
    `<div class="score-row"><span>${label}</span><strong>${v.score[p]}</strong>${tally(v.score[p])}</div>`
  return `<div class="score">${row(v.me, T.you)}${row(other(v.me), T.cpu)}</div>`
}

// Fósforos: groups of five drawn as a square plus its diagonal, malas | buenas
function tally(n: number): string {
  const groups = (count: number) => [0, 1, 2].map((g) => group(Math.max(0, Math.min(5, count - g * 5)))).join('')
  return `<span class="tally" aria-hidden="true">${groups(Math.min(n, 15))}<i class="sep"></i>${groups(Math.max(0, n - 15))}</span>`
}

function group(sticks: number): string {
  const lines = ['M2 2H14', 'M14 2V14', 'M14 14H2', 'M2 14V2', 'M2 2L14 14'].slice(0, sticks)
  return `<svg viewBox="0 0 16 16" class="group">${lines.map((d) => `<path d="${d}"/>`).join('')}</svg>`
}
