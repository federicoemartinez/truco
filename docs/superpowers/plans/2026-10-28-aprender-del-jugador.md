# Aprender del jugador — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la máquina lleve la cuenta de cuánto miente el jugador, en el truco y en el envido, con lo que se ve en la mesa, y que lo use para querer más contra un mentiroso y menos contra uno honesto, recordándolo entre partidos.

**Architecture:** Un módulo nuevo y puro, `src/learn.ts`, lleva un "cuaderno" con contadores: cantos del jugador cuyas cartas salieron a la luz y cuántos de esos eran mentira. Al terminar cada mano, convierte lo visto en observaciones, y `readOf` lo resume en un `Read` (tasas de mentira suavizadas hacia un prior). `ai.ts` recibe ese `Read` como cuarto argumento de `chooseAction` y corre sus umbrales de "quiero" en truco y envido, escalados por un parámetro nuevo de cada rival, `reads`. `main.ts` alimenta el cuaderno y lo guarda en `localStorage`.

**Tech Stack:** TypeScript 7 + Vite 8, tests con `node --test` (Node 24 ejecuta TS nativo). Sin dependencias nuevas.

**Punto de partida:** la rama `feat/learn-from-player`, creada desde `master` después del PR #5. Ya incluye los rivales, la simulación del truco (`winChance`) y el irse al mazo con una carta perdida.

**Spec:** no hay un spec aparte: este plan es el diseño. Lo acordado en la conversación del 2026-10-27 y lo medido con un prototipo está en "Contexto y mediciones". El spec general del juego es `docs/superpowers/specs/2026-10-24-truco-design.md` (sección "IA").

## Contexto y mediciones

Antes de escribir este plan, todo el código de abajo se prototipó en un worktree descartable: compila, pasa sus tests y se midió con la simulación. Resultados (Aristóteles = jugador 1, el rival = jugador 0, mismas semillas):

| Contra | Sin leer (`reads: 0`) | Leyendo, aprende en un solo partido | Leyendo, cuaderno conservado entre partidos | Conociendo la tasa real (cota) |
|---|---|---|---|---|
| Ramón Mentirón | 58,5% | ~60% | **70,0%** | 67,8% |
| John Bonachón | 41,5% | ~44% | **51,9%** | 51,8% |

Conclusiones que fijan el diseño:

- El mecanismo sirve: sabiendo cuánto miente el rival, Aristóteles gana ~10 partidos más de cada 100.
- En un solo partido salen a la luz muy pocas mentiras: por eso **el cuaderno se conserva entre partidos** (`localStorage`). Con eso alcanza la cota.
- `PRIOR_WEIGHT = 2` aprende más rápido que 4: en sesiones de 5 partidos sumó +3 puntos contra Ramón y +4 contra John, contra +1,5 con 4.
- Hay un solo cuaderno para el jugador, compartido por los tres rivales: lo que se aprende es del jugador, no del rival, y así se aprende el triple de rápido. Cada rival lo usa según su `reads`:
  - Aristóteles, 1: lo usa todo.
  - Ramón, 0.3: es impulsivo y casi no presta atención.
  - John, 0: "Bonachón" no desconfía de nadie.

**Qué cuenta como mentira** (la misma vara que usa `test:sim` para los rivales):

- **Truco:** un truco, retruco o vale cuatro del jugador es mentira si, con las cartas que él tenía en ese momento y lo que él sabía, era más probable perder que ganar (`winChance < 0.5` desde su lado). Solo se cuenta si todas las cartas que tenía en ese momento salieron a la luz después: jugadas, o mostradas por ganar el envido. Si se fue al mazo o no quisieron, no se aprende nada.
- **Envido:** un envido, real envido o falta envido del jugador es mentira si sus tantos eran menos de 27. Solo cuenta si los tantos se supieron: los declaró, o jugó las tres cartas.

**Juego limpio:** la máquina aprende solo de información pública. Nunca mira `State.dealt` ni `State.hands`; trabaja con `PlayerView` del CPU y con el log.

## Global Constraints

- Sin dependencias nuevas: solo `vite` y `typescript` como `devDependencies`.
- Identificadores y comentarios en inglés. Texto visible al jugador, en castellano rioplatense y dentro de `src/texts.ts`. Este plan no agrega texto visible.
- Node ejecuta `.ts` quitando tipos: imports con extensión `.ts`, `import type` para tipos, sin `enum`, `namespace` ni parameter properties.
- Estilo: 2 espacios, comillas simples, sin punto y coma.
- Constantes con nombre en vez de strings sueltos del dominio (`CALL.truco`, `SUIT.cups`, `BET.truco`).
- El jugador humano es `0` y la máquina es `1`.
- `npm test` tiene que seguir siendo rápido (~5 s). Lo lento va en `test/sim/` y corre con `npm run test:sim`. El CI de PRs (`.github/workflows/ci.yml`) corre `check`, `test`, `test:sim` y `build`; la compuerta de la Task 4 le suma ~2,5 minutos.
- `npm run check` solo revisa los tipos de `src/`. Los tests no se chequean con `tsc`, así que hay que correrlos.

## Review Focus

1. **Una mano abandonada a la mitad** (el jugador vuelve al menú con un truco anotado y empieza otro partido). Lo anotado de esa mano no debe contarse en la mano siguiente. `startMatch` vacía `pending`; se verifica a mano en la Task 3, paso 5.
2. **Orden de inicialización de `main.ts`.** `NOTEBOOK_KEY` tiene que declararse antes de `let notebook = fromSaved(load())`. Al revés, la página tira `ReferenceError` al cargar y ni `tsc` ni `vite build` lo detectan. Se verifica en el navegador en la Task 3, paso 5.
3. **`localStorage` bloqueado, corrupto o adulterado** (modo privado, JSON roto, números negativos, más mentiras que cantos). El juego no se rompe y el cuaderno arranca de cero. Test en la Task 2 (`fromSaved`); los `try/catch` van en la Task 3.
4. **Un retruco del jugador** (responde un truco de la máquina subiendo) cuenta igual que un truco. Test en la Task 2.
5. **John (`reads: 0`) juega exactamente igual que antes**, lea lo que lea. Test en la Task 1.

---

### Task 1: La lectura del rival entra en las decisiones

**Files:**
- Modify: `src/ai.ts` (tipos y perfiles arriba de todo; `chooseAction`, `respondEnvido`, `respondTruco`)
- Modify: `docs/superpowers/specs/2026-10-24-truco-design.md` (sección "IA")
- Test: `test/ai.test.ts`

**Interfaces:**
- Consumes: nada nuevo.
- Produces:
  - `export type Read = { trucoBluff: number; envidoBluff: number }`
  - `export const PRIOR_READ: Read = { trucoBluff: 0.25, envidoBluff: 0.3 }`
  - `AiParams` gana `reads: number`.
  - `chooseAction(v, params?, rng?, read: Read = PRIOR_READ): Action`
  - `winChance(v, rng, seenBy?)` ya está exportada y la usa la Task 2.

- [ ] **Step 1: Escribir el test que falla**

En `test/ai.test.ts`, agregar `PRIOR_READ` al import de `../src/ai.ts`:

```ts
import { DEFAULT_PARAMS, PRIOR_READ, PROFILES, chooseAction } from '../src/ai.ts'
```

Y al final del archivo:

```ts
// Fresh deals where the human (mano) opens with a truco; how often the AI answers quiero or more
function answersTruco(params: typeof DEFAULT_PARAMS, read: { trucoBluff: number; envidoBluff: number }): number {
  let wants = 0
  for (let seed = 1; seed <= 300; seed++) {
    const dealt = newMatch(seededRng(seed))
    const s = run({ ...dealt, firstPlayer: 0, turn: 0, resumeTurn: 0, envidoDone: true }, [[0, call(CALL.truco)]])
    if (chooseAction(view(s, 1), params, seededRng(seed), read).type !== 'decline') wants++
  }
  return wants
}

test('the AI calls a liar more and an honest rival less, as much as it reads', () => {
  const liar = { trucoBluff: 0.6, envidoBluff: 0.6 }
  const honest = { trucoBluff: 0.02, envidoBluff: 0.02 }
  const [lied, prior, straight] = [liar, PRIOR_READ, honest].map((read) => answersTruco(DEFAULT_PARAMS, read))
  assert.ok(lied > prior + 15 && prior > straight + 10, `${lied} / ${prior} / ${straight} of 300`)
  const blind = { ...DEFAULT_PARAMS, reads: 0 }
  assert.equal(answersTruco(blind, liar), answersTruco(blind, honest))
})
```

- [ ] **Step 2: Correrlo y ver que falla**

Run: `node --test --test-name-pattern="calls a liar" test/ai.test.ts`
Expected: FAIL. `PRIOR_READ` no existe todavía (`undefined`), así que el `.map` llama a `chooseAction` con `read` indefinido. Con el código viejo `read` se ignora, las tres cuentas dan igual y la aserción `lied > prior + 15` falla.

- [ ] **Step 3: Implementar**

En `src/ai.ts`, reemplazar el comentario, `AiParams` y `DEFAULT_PARAMS` del principio por:

```ts
// envidoBluff: chance of singing envido without points; trucoBluff: chance per turn of a truco or raise
// without the cards; aggression: lowers the bar to call and accept; fish: chance of hiding a good
// envido as mano, to raise when the pie sings it; slowplay: chance of keeping quiet with a good hand
// ("hacerse el muerto") so the rival sings truco and we raise; reads: how much it trusts what it learned
// about the rival (0 ignores it)
export type AiParams = { envidoBluff: number; trucoBluff: number; aggression: number; fish: number; slowplay: number; reads: number }
export const DEFAULT_PARAMS: AiParams = { envidoBluff: 0.09, trucoBluff: 0.35, aggression: 0.5, fish: 0.4, slowplay: 0.1, reads: 1 }

// How often the rival lies, as far as the AI could tell (see learn.ts); before seeing anything, the prior
export type Read = { trucoBluff: number; envidoBluff: number }
export const PRIOR_READ: Read = { trucoBluff: 0.25, envidoBluff: 0.3 }
```

En `PROFILES`, agregar `reads` a Ramón y a John. Aristóteles es `DEFAULT_PARAMS` y ya tiene `reads: 1`:

```ts
  ramon: { envidoBluff: 0.35, trucoBluff: 1, aggression: 0.75, fish: 0.1, slowplay: 0.5, reads: 0.3 }, // lies a lot and wants everything
  john: { envidoBluff: 0.01, trucoBluff: 0.1, aggression: 0.25, fish: 0, slowplay: 0.05, reads: 0 }, // if he sings envido, he has it
```

`chooseAction` pasa a recibir y propagar `read`:

```ts
export function chooseAction(v: PlayerView, params: AiParams = DEFAULT_PARAMS, rng: Rng = Math.random, read: Read = PRIOR_READ): Action {
  const top = v.pending.at(-1)
  if (top?.kind === BET.envido) return respondEnvido(v, params, rng, read)
  if (top?.kind === BET.truco) return respondTruco(v, params, rng, read)
  return callEnvido(v, params, rng, true) ?? callTruco(v, params, rng) ?? chooseCard(v)
}
```

En `respondEnvido`, la firma pasa a `function respondEnvido(v: PlayerView, params: AiParams, rng: Rng, read: Read): Action {` y la línea `const threshold = ...` se reemplaza por:

```ts
  // A rival who lies a lot gets called more; one who never lies, less
  const distrust = Math.round(6 * params.reads * (read.envidoBluff - PRIOR_READ.envidoBluff))
  const threshold = isFalta
    ? (faltaCostsMatch ? 30 : 28)
    : 26 + 2 * (calls.length - 1) - Math.round(4 * (params.aggression - 0.5)) - distrust
```

En `respondTruco`, la firma pasa a `function respondTruco(v: PlayerView, params: AiParams, rng: Rng, read: Read): Action {` y la línea del accept se reemplaza por:

```ts
  const distrust = params.reads * (read.trucoBluff - PRIOR_READ.trucoBluff) // see respondEnvido
  if (declineLosesMatch || chance >= 0.5 - 0.2 * params.aggression - 0.4 * distrust) return find(v, 'accept')!
```

Con `read = PRIOR_READ`, `distrust` vale 0, así que todos los tests existentes siguen igual.

- [ ] **Step 4: Correr y ver que pasa**

Run: `node --test --test-name-pattern="calls a liar" test/ai.test.ts && npm test && npm run check`
Expected: PASS, todos los tests y el typecheck limpio.

- [ ] **Step 5: Actualizar el spec**

En `docs/superpowers/specs/2026-10-24-truco-design.md`, en la sección "IA", después del bullet "**Truco — responder:**", agregar:

```markdown
- **Lectura del rival:** `chooseAction` recibe un `Read` (cuánto miente el rival en truco y envido,
  ver `learn.ts`). Contra un mentiroso baja el umbral de quiero, contra uno honesto lo sube, en
  proporción a `reads` (Aristóteles 1, Ramón 0.3, John 0: Bonachón no desconfía).
```

- [ ] **Step 6: Commit**

```bash
git add src/ai.ts test/ai.test.ts docs/superpowers/specs/2026-10-24-truco-design.md
git commit -m "feat(ai): call a lying rival more and an honest one less, as much as each rival reads"
```

---

### Task 2: El cuaderno — qué aprende la máquina de cada mano

**Files:**
- Create: `src/learn.ts`
- Test: `test/learn.test.ts`

**Interfaces:**
- Consumes (Task 1): `Read`, `PRIOR_READ`, `winChance(v: PlayerView, rng: Rng, seenBy?: 'me' | 'rival'): number` desde `./ai.ts`.
- Produces (las usan las Tasks 3 y 4):
  - `type Notebook = { trucoCalls: number; trucoBluffs: number; envidoCalls: number; envidoBluffs: number; pending: PlayerView[] }`
  - `newNotebook(): Notebook`
  - `readOf(nb: Notebook): Read`
  - `noteCall(nb: Notebook, seenByAi: PlayerView, action: Action): Notebook`: se llama justo **antes** de aplicar la acción del jugador.
  - `learnFromRound(nb: Notebook, done: PlayerView, rng: Rng): Notebook`: se llama con la vista del CPU de la mano terminada.
  - `toSaved(nb: Notebook): string` y `fromSaved(json: string | null): Notebook`.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `test/learn.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CALL, SUIT, apply, seededRng, view } from '../src/engine.ts'
import type { Action, Card, Player, State } from '../src/engine.ts'
import { PRIOR_READ } from '../src/ai.ts'
import { fromSaved, learnFromRound, newNotebook, noteCall, readOf, toSaved } from '../src/learn.ts'
import type { Notebook } from '../src/learn.ts'
import { ACCEPT, FOLD, c, call, play, setup } from './helpers.ts'

const HUMAN: Player = 0
const CPU: Player = 1

// Plays the steps like main.ts does: the AI notes every human call before it is applied
function playRound(s: State, steps: [Player, Action][]): { s: State; nb: Notebook } {
  let nb = newNotebook()
  for (const [p, a] of steps) {
    if (p === HUMAN) nb = noteCall(nb, view(s, CPU), a)
    s = apply(s, p, a)
  }
  return { s, nb: learnFromRound(nb, view(s, CPU), seededRng(1)) }
}

const WEAK = [c(4, SUIT.swords), c(5, SUIT.clubs), c(6, SUIT.cups)]
const CPU_HAND = [c(3, SUIT.coins), c(4, SUIT.cups), c(12, SUIT.clubs)]

// Three tricks: the CPU takes the 1st, the human the 2nd, and the human sings truco leading the 3rd
const thirdTrickTruco = (last: Card): [Player, Action][] => [
  [0, play(c(4, SUIT.swords))], [1, play(c(3, SUIT.coins))],
  [1, play(c(4, SUIT.cups))], [0, play(c(5, SUIT.clubs))],
  [0, call(CALL.truco)], [1, ACCEPT], [0, play(last)], [1, play(c(12, SUIT.clubs))],
]

test('before seeing anything the read is the prior', () => {
  assert.deepEqual(readOf(newNotebook()), PRIOR_READ)
})

test('the read moves toward what was seen, smoothed by the prior', () => {
  const nb = { ...newNotebook(), trucoCalls: 4, trucoBluffs: 4 }
  assert.equal(readOf(nb).trucoBluff, (4 + 0.25 * 2) / 6)
})

test('an envido sung with 6 and declared is a lie seen', () => {
  const { nb } = playRound(setup(WEAK, CPU_HAND), [[0, call(CALL.envido)], [1, ACCEPT], [0, FOLD]])
  assert.deepEqual([nb.envidoCalls, nb.envidoBluffs], [1, 1])
})

test('an envido nobody declared teaches nothing', () => {
  const { nb } = playRound(setup(WEAK, CPU_HAND), [[0, call(CALL.envido)], [1, { type: 'decline' }], [0, FOLD]])
  assert.deepEqual([nb.envidoCalls, nb.envidoBluffs], [0, 0])
})

test('a truco sung with nothing, once its cards came to light, is a lie seen', () => {
  const { nb } = playRound(setup(WEAK, CPU_HAND, { envidoDone: true }), thirdTrickTruco(c(6, SUIT.cups)))
  assert.deepEqual([nb.trucoCalls, nb.trucoBluffs], [1, 1])
})

test('a truco sung with the ancho de espada is not a lie', () => {
  const human = [c(4, SUIT.swords), c(5, SUIT.clubs), c(1, SUIT.swords)]
  const { nb } = playRound(setup(human, CPU_HAND, { envidoDone: true }), thirdTrickTruco(c(1, SUIT.swords)))
  assert.deepEqual([nb.trucoCalls, nb.trucoBluffs], [1, 0])
})

test('a truco whose cards never came to light teaches nothing', () => {
  const { nb } = playRound(setup(WEAK, CPU_HAND, { envidoDone: true }), [[0, call(CALL.truco)], [1, { type: 'decline' }]])
  assert.deepEqual([nb.trucoCalls, nb.trucoBluffs, nb.pending.length], [0, 0, 0])
})

test('a retruco counts like a truco', () => {
  const { nb } = playRound(setup(WEAK, CPU_HAND, { envidoDone: true }), [
    [0, play(c(4, SUIT.swords))], [1, play(c(3, SUIT.coins))],
    [1, call(CALL.truco)], [0, call(CALL.retruco)], [1, ACCEPT], [1, play(c(4, SUIT.cups))], [0, play(c(5, SUIT.clubs))],
    [0, play(c(6, SUIT.cups))], [1, play(c(12, SUIT.clubs))],
  ])
  assert.deepEqual([nb.trucoCalls, nb.trucoBluffs], [1, 1])
})

test('a saved notebook survives a reload; anything odd starts over', () => {
  const nb = { ...newNotebook(), trucoCalls: 5, trucoBluffs: 2, envidoCalls: 3, envidoBluffs: 1 }
  assert.deepEqual(fromSaved(toSaved(nb)), nb)
  assert.deepEqual(fromSaved(null), newNotebook())
  assert.deepEqual(fromSaved('not json'), newNotebook())
  assert.deepEqual(fromSaved('{"trucoCalls": -3, "trucoBluffs": "x"}'), newNotebook())
  assert.deepEqual(fromSaved('{"trucoCalls": 1, "trucoBluffs": 9}'), newNotebook())
})
```

- [ ] **Step 2: Correrlos y ver que fallan**

Run: `node --test test/learn.test.ts`
Expected: FAIL con `Cannot find module '.../src/learn.ts'`.

- [ ] **Step 3: Implementar**

Crear `src/learn.ts`:

```ts
import { envidoPoints, isEnvido, other, sameCard } from './engine.ts'
import type { Action, Card, PlayerView, Rng } from './engine.ts'
import { PRIOR_READ, winChance } from './ai.ts'
import type { Read } from './ai.ts'

// What the AI has seen of its rival. Only public information: the cards the rival played or showed,
// and the envido they declared
export type Notebook = {
  trucoCalls: number // rival truco calls and raises whose cards came to light
  trucoBluffs: number // ...made when losing was likelier than winning, as the rival saw it
  envidoCalls: number // rival envido calls whose points came to light
  envidoBluffs: number // ...with fewer than 27 points
  pending: PlayerView[] // the AI's view right before each rival truco call of this round
}

export const newNotebook = (): Notebook => ({ trucoCalls: 0, trucoBluffs: 0, envidoCalls: 0, envidoBluffs: 0, pending: [] })

const PRIOR_WEIGHT = 2 // the prior counts as this many calls, so a single hand doesn't swing the read

export function readOf(nb: Notebook): Read {
  const rate = (lies: number, calls: number, prior: number) => (lies + prior * PRIOR_WEIGHT) / (calls + PRIOR_WEIGHT)
  return {
    trucoBluff: rate(nb.trucoBluffs, nb.trucoCalls, PRIOR_READ.trucoBluff),
    envidoBluff: rate(nb.envidoBluffs, nb.envidoCalls, PRIOR_READ.envidoBluff),
  }
}

// Right before the rival's action is applied: keep the AI's view when it is a truco call or raise
export function noteCall(nb: Notebook, seenByAi: PlayerView, action: Action): Notebook {
  if (action.type !== 'call' || isEnvido(action.call)) return nb
  return { ...nb, pending: [...nb.pending, seenByAi] }
}

// Once the round is over, with the AI's view of it: count the rival's calls whose cards came to light
export function learnFromRound(nb: Notebook, done: PlayerView, rng: Rng): Notebook {
  const rival = other(done.me)
  const played = done.tricks.flatMap((t) => t.cards[rival] ?? [])
  const show = done.log.find((e) => e.type === 'show' && e.player === rival)
  const revealed = [...played, ...(show?.type === 'show' ? show.cards : [])]
  const next = { ...nb, pending: [] }

  const sangEnvido = done.log.some((e) => e.type === 'call' && e.player === rival && isEnvido(e.call))
  const declared = done.log.find((e) => e.type === 'envidoPoints' && e.player === rival)
  const points = declared?.type === 'envidoPoints' ? declared.points : revealed.length === 3 ? envidoPoints(revealed) : undefined
  if (sangEnvido && points !== undefined) {
    next.envidoCalls++
    if (points < 27) next.envidoBluffs++
  }

  for (const seen of nb.pending) {
    const playedThen = seen.tricks.flatMap((t) => t.cards[rival] ?? [])
    const handThen = revealed.filter((card) => !playedThen.some((p) => sameCard(p, card)))
    if (handThen.length !== seen.opponentHandSize) continue // some of their cards never came to light
    next.trucoCalls++
    if (winChance(asSeenByRival(seen, handThen, playedThen), rng) < 0.5) next.trucoBluffs++
  }
  return next
}

// The rival's own view at that moment, now that we know the cards they held
function asSeenByRival(seen: PlayerView, hand: Card[], played: Card[]): PlayerView {
  return { ...seen, me: other(seen.me), hand, dealt: [...played, ...hand], opponentHandSize: seen.hand.length, legal: [] }
}

// What survives a reload: the counts, not this round's pending calls
export const toSaved = ({ pending, ...counts }: Notebook) => JSON.stringify(counts)

// Anything stored can be stale or tampered with: keep only sane counts, else start over
export function fromSaved(json: string | null): Notebook {
  const nb = newNotebook()
  try {
    const saved = JSON.parse(json ?? '{}')
    for (const key of ['trucoCalls', 'trucoBluffs', 'envidoCalls', 'envidoBluffs'] as const) {
      const n = saved?.[key]
      if (Number.isInteger(n) && n >= 0) nb[key] = n
    }
  } catch {
    return nb
  }
  if (nb.trucoBluffs > nb.trucoCalls || nb.envidoBluffs > nb.envidoCalls) return newNotebook()
  return nb
}
```

Por qué funciona `asSeenByRival`: `winChance` en modo `'me'` usa `v.hand` como cartas propias y reparte al otro entre las que no se ven. Al armar la vista del jugador con su mano real de ese momento, la máquina calcula las chances que **él** veía cuando cantó, no las que ve ella.

- [ ] **Step 4: Correr y ver que pasan**

Run: `node --test test/learn.test.ts && npm test && npm run check`
Expected: PASS (9 tests en `learn.test.ts`), suite completa en verde y typecheck limpio.

- [ ] **Step 5: Commit**

```bash
git add src/learn.ts test/learn.test.ts
git commit -m "feat(learn): a notebook of the player's lies, from what comes to light at the table"
```

---

### Task 3: Conectar el cuaderno al juego y recordarlo entre partidos

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes (Task 2): `fromSaved`, `learnFromRound`, `noteCall`, `readOf`, `toSaved`, `Notebook` desde `./learn.ts`. De la Task 1, el cuarto argumento de `chooseAction`.
- Produces: nada para otras tasks.

`main.ts` toca el DOM y no tiene tests unitarios. La lógica testeable ya está en `learn.ts`; esta task se verifica con el juego corriendo (paso 5).

- [ ] **Step 1: Imports**

Después de `import type { Rival } from './ai.ts'`:

```ts
import { fromSaved, learnFromRound, noteCall, readOf, toSaved } from './learn.ts'
import type { Notebook } from './learn.ts'
```

- [ ] **Step 2: Estado y persistencia**

Después de `let cpuTimer: number | undefined`, en este orden. `NOTEBOOK_KEY` va **antes** de `notebook`; si no, `load()` lee la constante antes de que exista y la página tira `ReferenceError` al cargar.

```ts
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
```

- [ ] **Step 3: Alimentarlo y usarlo**

Al principio de `update()`:

```ts
function update() {
  if (state.phase !== 'playing') learn() // once per round: the next update comes after a new deal
  renderGame(view(state, HUMAN), rival)
```

En `cpuMove`, la jugada de la máquina pasa a usar lo aprendido:

```ts
    state = apply(state, CPU, chooseAction(v, PROFILES[rival], Math.random, readOf(notebook)))
```

En `startMatch`, después de `state = newMatch(Math.random)`:

```ts
  notebook = { ...notebook, pending: [] } // calls noted in a round left halfway
```

En el handler `onAction`, antes de aplicar la acción del jugador:

```ts
  onAction: (action) => {
    notebook = noteCall(notebook, view(state, CPU), action)
    state = apply(state, HUMAN, action)
    update()
  },
```

- [ ] **Step 4: Typecheck, tests y build**

Run: `npm run check && npm test && npm run build`
Expected: todo en verde.

- [ ] **Step 5: Probarlo en el navegador**

Run: `npm run dev -- --host` y abrir la URL que imprime.

1. Abrir la consola del navegador y recargar: no tiene que haber errores. Esto cubre el Review Focus 2.
2. Elegir Aristóteles y jugar una mano entera cantando truco con cartas malas, jugando todas las cartas.
3. En la consola: `localStorage.getItem('truco:notebook')`. Tiene que mostrar `trucoCalls` ≥ 1 y no tener `pending`.
4. Recargar la página y repetir el paso 3: los números siguen ahí.
5. Cantar truco y, antes de que termine la mano, volver al menú. Empezar otro partido y jugar una mano sin cantar nada. Los contadores no tienen que subir por el truco de la mano abandonada. Esto cubre el Review Focus 1.
6. En una ventana privada con el storage bloqueado, el juego tiene que andar igual.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts
git commit -m "feat: the CPU keeps a notebook of the player's lies across matches"
```

---

### Task 4: Compuerta de simulación — ¿vale la pena?

**Files:**
- Create: `test/sim/learn.sim.test.ts`

**Interfaces:**
- Consumes: `PROFILES`, `chooseAction` (Task 1); `learnFromRound`, `newNotebook`, `noteCall`, `readOf` (Task 2).
- Produces: nada.

- [ ] **Step 1: Escribir el test**

Crear `test/sim/learn.sim.test.ts`:

```ts
// Slow: is learning worth it? Run with `npm run test:sim`
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apply, newMatch, seededRng, startRound, view } from '../../src/engine.ts'
import { PROFILES, chooseAction } from '../../src/ai.ts'
import type { AiParams } from '../../src/ai.ts'
import { learnFromRound, newNotebook, noteCall, readOf } from '../../src/learn.ts'

const MATCHES = Number(process.env.LEARN_MATCHES ?? 600)

// Aristóteles (player 1) against a rival (player 0) over many matches, keeping what it learned from one
// match to the next like main.ts does. Share of matches won, after a first fifth spent learning
function winRate(rival: AiParams, reads: number): number {
  const me = { ...PROFILES.aristoteles, reads }
  let nb = newNotebook()
  let won = 0
  for (let seed = 1; seed <= MATCHES; seed++) {
    const rng = seededRng(seed)
    let s = newMatch(rng)
    nb = { ...nb, pending: [] }
    while (s.phase !== 'matchOver') {
      if (s.phase === 'roundOver') {
        nb = learnFromRound(nb, view(s, 1), rng)
        s = startRound(s, rng)
        continue
      }
      const p = s.turn
      const a = p === 1 ? chooseAction(view(s, 1), me, rng, readOf(nb)) : chooseAction(view(s, 0), rival, rng)
      if (p === 0) nb = noteCall(nb, view(s, 1), a)
      s = apply(s, p, a)
    }
    if (s.winner === 1 && seed > MATCHES / 5) won++
  }
  return won / (MATCHES - MATCHES / 5)
}

test('reading the rival wins Aristóteles at least 5 more matches in 100, against a liar and an honest one', () => {
  for (const name of ['ramon', 'john'] as const) {
    const reading = winRate(PROFILES[name], 1)
    const blind = winRate(PROFILES[name], 0)
    console.log(name, { reading, blind })
    assert.ok(reading - blind >= 0.05, `against ${name}: ${reading.toFixed(3)} reading vs ${blind.toFixed(3)} blind`)
  }
})
```

- [ ] **Step 2: Correrlo**

Run: `npm run test:sim` (tarda ~2,5 minutos en total)
Expected: PASS. En el prototipo dio Ramón 0,700 leyendo contra 0,585 a ciegas, y John 0,519 contra 0,415. El test de carácter de los rivales (`ai.sim.test.ts`) también tiene que seguir pasando.

**Si esta compuerta falla** (la mejora queda por debajo de 0,05 contra alguno de los dos), no se ajustan umbrales a ciegas hasta que pase. Hay que parar y reportar los números al usuario. Lo más probable es que alguna task se haya apartado del plan; comparar el código con este documento.

- [ ] **Step 3: Commit**

```bash
git add test/sim/learn.sim.test.ts
git commit -m "test(sim): learning the player's lies wins Aristóteles ~10 more matches in 100"
```

---

## Fuera de alcance (ideas medidas o pensadas, no pedidas)

- **Mostrar que te conoce:** por ejemplo, un "Aristóteles ya te tiene calado" en el menú después de N observaciones. Es texto de UI nuevo y conviene que lo decida el usuario.
- **Aprender de cartas a medio revelar:** hoy solo cuenta un truco si todas las cartas del jugador salieron a la luz. Promediando sobre las cartas que faltan aprendería más rápido. Hacerlo solo si las sesiones cortas (5 partidos) muestran que hace falta.
- **Un cuaderno por rival:** hoy es uno solo para el jugador. Separarlo haría que cada rival "te conozca" por su cuenta, pero aprende tres veces más lento.
- **Usar la lectura para el propio farol** (mentirle menos a quien siempre quiere): es otra palanca, con su propia medición.
