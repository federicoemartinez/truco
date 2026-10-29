import { LUCK_LEVELS, other, sameCard } from './engine.ts'
import type { Action, GameEvent, LuckLevel, Player, PlayerView, Trick } from './engine.ts'
import { SPRITE, backSvg, cardSvg } from './cards.ts'
import { ACTION_LABEL, CALL_LABEL, LUCK_LABEL, RIVALS, RULES_HTML, T, TRAIT_LABEL, cardName, knowledgeHtml, roundSummary, speech } from './texts.ts'
import type { Notebook } from './learn.ts'
import type { AiParams, Rival } from './ai.ts'
import { BRIGHT, RATE, TRAITS, pointOf, valueAt } from './custom.ts'
import type { Character } from './custom.ts'
import { isMuted, preview, toggleMute } from './voice.ts'

export type Handlers = {
  onStart(rival: Rival | Character): void
  onLuck(level: LuckLevel): void
  onAction(action: Action): void
  onNextRound(): void
  onRematch(): void
  onMenu(): void
}

type PlayEvent = Extract<GameEvent, { type: 'play' }>

let root: HTMLElement
let current: PlayerView | null = null
let rivalName = ''
let lastRender = 0
let seen = { round: 0, plays: 0, bubbles: [null, null] as (string | null)[] }
let draft: AiParams // the traits of the rival being built
let dragging: SVGElement | null = null

export function mount(el: HTMLElement, h: Handlers) {
  root = el
  document.body.insertAdjacentHTML('afterbegin', SPRITE)
  root.addEventListener('click', (e) => {
    // ponytail: time-based guard so a double tap can't hit whatever the new screen drew under the finger
    // (next card, round panel, Revancha); per-render tokens if it ever swallows real taps
    if (performance.now() - lastRender < 350) return
    const target = (e.target as Element).closest<HTMLElement>('[data-do]')
    switch (target?.dataset.do) {
      case 'start': return h.onStart(target!.dataset.rival as Rival)
      case 'rules': return root.querySelector<HTMLDialogElement>('#rules')!.showModal()
      case 'knows': return root.querySelector<HTMLDialogElement>('#knows')!.showModal()
      case 'custom': return root.querySelector<HTMLDialogElement>('#custom')!.showModal()
      case 'listen': return preview(built().voice)
      case 'play': {
        const rival = built()
        root.querySelector<HTMLDialogElement>('#custom')!.close()
        return h.onStart(rival)
      }
      case 'mute':
        toggleMute()
        target!.outerHTML = muteButton()
        return
      case 'quit':
        // Asks first: a stray tap shouldn't throw the match away
        target!.outerHTML = `<button class="quit confirm" data-do="menu">${T.quitConfirm}</button>`
        lastRender = performance.now() // a double tap can't confirm it at once
        return
      case 'next': return h.onNextRound()
      case 'rematch': return h.onRematch()
      case 'menu': return h.onMenu()
      case 'act': {
        const action = current?.legal[Number(target!.dataset.i)]
        if (action) h.onAction(action)
      }
    }
  })

  root.addEventListener('change', (e) => {
    const select = e.target as HTMLSelectElement
    if (select.id === 'luck') h.onLuck(select.value as LuckLevel)
  })

  // The hexagon's handles: dragged with a finger or the mouse, or moved with the arrow keys
  root.addEventListener('pointerdown', (e) => {
    dragging = (e.target as Element).closest<SVGElement>('.handle')
    if (!dragging) return
    dragging.setPointerCapture(e.pointerId)
    e.preventDefault() // no text selection or scrolling while dragging
  })
  root.addEventListener('pointermove', (e) => {
    if (!dragging) return
    const k = Number(dragging.dataset.k)
    const at = new DOMPoint(e.clientX, e.clientY).matrixTransform(dragging.ownerSVGElement!.getScreenCTM()!.inverse())
    setTrait(k, valueAt(k, at.x, at.y))
  })
  const drop = () => (dragging = null)
  root.addEventListener('pointerup', drop)
  root.addEventListener('pointercancel', drop)
  root.addEventListener('keydown', (e) => {
    const handle = (e.target as Element).closest<SVGElement>('.handle')
    const step = { ArrowUp: 0.05, ArrowRight: 0.05, ArrowDown: -0.05, ArrowLeft: -0.05, Home: -1, End: 1 }[e.key]
    if (!handle || step === undefined) return
    const k = Number(handle.dataset.k)
    setTrait(k, Math.min(1, Math.max(0, draft[TRAITS[k]] + step)))
    e.preventDefault()
  })
}

function setTrait(k: number, value: number) {
  draft[TRAITS[k]] = value
  const svg = root.querySelector('.hexagon')!
  svg.querySelector('.shape')!.setAttribute('points', ring((i) => draft[TRAITS[i]]))
  const handle = svg.querySelectorAll('.handle')[k]
  const [x, y] = pointOf(k, value)
  handle.setAttribute('cx', String(x))
  handle.setAttribute('cy', String(y))
  handle.setAttribute('aria-valuenow', String(Math.round(value * 100)))
}

// The rival as the builder dialog has it now
function built(): Character {
  const input = (id: string) => root.querySelector<HTMLInputElement>(`#${id}`)!
  return {
    name: input('custom-name').value.trim() || T.custom,
    params: { ...draft },
    voice: { rate: Number(input('custom-rate').value), bright: Number(input('custom-bright').value) },
  }
}

const ring = (value: (k: number) => number) => TRAITS.map((_, k) => pointOf(k, value(k)).join(',')).join(' ')

function hexagonSvg(p: AiParams): string {
  const grid = [1 / 3, 2 / 3, 1].map((v) => `<polygon class="grid" points="${ring(() => v)}"/>`).join('')
  const axes = TRAITS.map((_, k) => `<line class="grid" x1="0" y1="0" x2="${pointOf(k, 1)[0]}" y2="${pointOf(k, 1)[1]}"/>`).join('')
  const labels = TRAITS.map((t, k) => {
    const [x, y] = pointOf(k, 1).map((n) => n * 1.22)
    const side = Math.abs(x) > 1
    const words = TRAIT_LABEL[t].split(' ')
    // Labels on the sides go in two lines, so the hexagon fits a phone
    const half = Math.ceil(words.length / 2)
    const lines = side && words.length > 2 ? [words.slice(0, half), words.slice(half)] : [words]
    const anchor = !side ? 'middle' : x > 0 ? 'start' : 'end'
    const top = y - (lines.length - 1) * 7 + (side ? 4 : y > 0 ? 12 : -4)
    return `<text x="${x}" y="${top}" text-anchor="${anchor}">${lines.map((l, i) => `<tspan x="${x}" dy="${i ? 14 : 0}">${l.join(' ')}</tspan>`).join('')}</text>`
  }).join('')
  const handles = TRAITS.map((t, k) => {
    const [x, y] = pointOf(k, p[t])
    return `<circle class="handle" data-k="${k}" cx="${x}" cy="${y}" r="11" tabindex="0" role="slider" aria-label="${TRAIT_LABEL[t]}"
      aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(p[t] * 100)}"/>`
  }).join('')
  return `<svg class="hexagon" viewBox="-175 -135 350 270">${grid}${axes}<polygon class="shape" points="${ring((k) => p[TRAITS[k]])}"/>${labels}${handles}</svg>`
}

function builderHtml(c: Character): string {
  const knob = (id: string, label: string, range: { min: number; max: number }, step: number, value: number, low: string, high: string) =>
    `<label class="knob"><span>${low}</span><input type="range" id="${id}" aria-label="${label}" min="${range.min}" max="${range.max}" step="${step}" value="${value}"><span>${high}</span></label>`
  return `<dialog id="custom" class="builder">
    <h2>${T.custom}</h2>
    <label class="name">${T.name} <input id="custom-name" maxlength="24" placeholder="${T.custom}" value="${esc(c.name)}"></label>
    ${hexagonSvg(c.params)}
    <fieldset>
      <legend>${T.voice}</legend>
      ${knob('custom-rate', `${T.deep} – ${T.high}`, RATE, 0.01, c.voice.rate, T.deep, T.high)}
      ${knob('custom-bright', `${T.dull} – ${T.bright}`, BRIGHT, 1, c.voice.bright, T.dull, T.bright)}
      <button type="button" data-do="listen">${T.listen}</button>
    </fieldset>
    <div class="row"><button class="primary" data-do="play">${T.play}</button><form method="dialog"><button>${T.close}</button></form></div>
  </dialog>`
}

// The player's own rival name ends up in the page: never as markup
const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`)

export function showMenu(known: Notebook, custom: Character, luck: LuckLevel) {
  current = null
  draft = { ...custom.params }
  lastRender = performance.now()
  seen = { round: 0, plays: 0, bubbles: [null, null] }
  root.innerHTML = `
    <main class="menu">
      <h1>${T.title}</h1>
      <p>${T.subtitle}</p>
      <p>${T.chooseRival}</p>
      ${Object.entries(RIVALS).map(([id, r], k) => `<button class="rival${k === 0 ? ' primary' : ''}" data-do="start" data-rival="${id}">
        <strong>${r.name}</strong><small>${r.motto}</small></button>`).join('')}
      <button class="rival" data-do="custom"><strong>${esc(custom.name || T.custom)}</strong><small>${T.customMotto}</small></button>
      <label class="luck">${T.luck} <select id="luck">${LUCK_LEVELS.map((level) =>
        `<option value="${level}"${level === luck ? ' selected' : ''}>${LUCK_LABEL[level]}</option>`).join('')}</select></label>
      <button data-do="rules">${T.rules}</button>
      <button data-do="knows">${T.knows}</button>
      ${muteButton()}
      <dialog id="rules">${RULES_HTML}<form method="dialog"><button>${T.close}</button></form></dialog>
      <dialog id="knows">${knowledgeHtml(known)}<form method="dialog"><button>${T.close}</button></form></dialog>
      ${builderHtml(custom)}
    </main>`
}

export function renderGame(v: PlayerView, name: string) {
  current = v
  rivalName = esc(name)
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

  // Once the round is over, the envido the opponent won goes face up
  const show = v.phase === 'playing' ? undefined : v.log.find((e) => e.type === 'show' && e.player === opp)
  const faceUp = show?.type === 'show' ? show.cards : []
  const backs = faceUp.map((card) => `<div class="back shown" role="img" aria-label="${cardName(card)}">${cardSvg(card)}</div>`).join('') +
    Array.from({ length: v.opponentHandSize - faceUp.length }, (_, k) => `<div class="back${dealCls}"${dealStyle(k)}>${backSvg()}</div>`).join('')

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
          <div class="opp-hand" role="img" aria-label="${rivalName}: ${v.opponentHandSize}">${backs}</div>
          ${thinking}
          ${bubble(opp, 'bubble-row')}
        </div>
        <div class="controls">${muteButton()}<button class="quit" data-do="quit">${T.menu}</button></div>
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
  const said: string[] = []
  for (let i = v.log.length - 1; i >= 0; i--) {
    const e = v.log[i]
    if (e.type === 'play') break
    const text = e.player === p ? speech(e, v.firstPlayer) : null
    if (!text) continue
    said.unshift(text)
    // Answering an envido and declaring the points happen at once: keep the "¡Quiero!" before the points
    if (e.type !== 'envidoPoints' && e.type !== 'sonBuenas') break
  }
  return said.length ? said.join(' ') : null
}

function overlay(v: PlayerView): string {
  if (v.phase === 'roundOver') {
    return `<div class="overlay"><div class="panel">
      <p>${roundSummary(v.log, v.me, rivalName)}</p>
      <button class="primary" data-do="next">${T.nextRound}</button>
    </div></div>`
  }
  if (v.phase === 'matchOver') {
    const mine = v.score[v.me]
    const theirs = v.score[other(v.me)]
    return `<div class="overlay"><div class="panel">
      <h2>${v.winner === v.me ? T.won(mine, theirs) : T.lost(rivalName, mine, theirs)}</h2>
      <p>${roundSummary(v.log, v.me, rivalName)}</p>
      <button class="primary" data-do="rematch">${T.rematch}</button>
      <button data-do="menu">${T.menu}</button>
    </div></div>`
  }
  return ''
}

const muteButton = () =>
  `<button class="mute" data-do="mute" aria-label="${T.mute}" aria-pressed="${isMuted()}">${isMuted() ? '🔇' : '🔊'}</button>`

function scoreboard(v: PlayerView): string {
  const row = (p: Player, label: string) =>
    `<div class="score-row"><span>${label}</span><strong>${v.score[p]}</strong>${tally(v.score[p])}</div>`
  return `<div class="score">${row(v.me, T.you)}${row(other(v.me), rivalName)}</div>`
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
