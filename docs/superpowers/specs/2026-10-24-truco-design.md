# Truco — diseño v1

Fecha: 2026-10-24 · Estado: aprobado en conversación, pendiente de revisión escrita

## Objetivo

Truco argentino web, mano a mano contra la máquina, jugable en el navegador (desktop y celular) y
publicable en CrazyGames u otro portal (itch.io, dominio propio) con el mismo build. El motor de
reglas queda listo para reutilizarse en un futuro modo 1v1 online.

**Éxito:** alguien entra desde el portal, juega un partido completo a 30 sin leer instrucciones
externas, la máquina se siente como un rival humano (canta, miente a veces) y el juego nunca se traba.

## Alcance

**v1:** 1 jugador vs máquina · reglas a 30 sin flor · un nivel de IA (parametrizado) · castellano
rioplatense · adaptador CrazyGames (gameplay start/stop + anuncio midgame entre partidas).

**Fuera de v1:** 1v1 online, flor, niveles de dificultad elegibles, sonido, guardar partida a medias,
estadísticas, otros idiomas.

## Convenciones de código

- Identificadores y comentarios **en inglés**. Textos visibles al jugador **en castellano**, todos en
  `src/texts.ts`.
- Términos del truco sin traducción natural quedan como nombres propios: `envido`, `realEnvido`,
  `faltaEnvido`, `truco`, `retruco`, `valeCuatro`.
- Sin `enum` ni `namespace` (Node ejecuta TS solo con sintaxis borrable): usar uniones de strings.

Glosario:

| Castellano | Código |
|---|---|
| carta / palo / número | `Card` / `suit` / `rank` |
| espada, basto, oro, copa | `'swords' \| 'clubs' \| 'coins' \| 'cups'` |
| las 3 cartas de un jugador | `hand` |
| una mano (reparto de 3 bazas) | `round` |
| baza | `trick` |
| el mano | `firstPlayer` |
| parda | `tie` |
| tantos del envido | `envidoPoints` |
| canto | `call` |
| quiero / no quiero | `accept` / `decline` |
| subir | `raise` (un `call` del nivel siguiente) |
| tener el quiero | `raiseRights` |
| irse al mazo | `fold` |
| partido | `match` |

## Arquitectura

```
index.html        entrada; carga el SDK de CrazyGames
style.css         mesa, cartas, botones, layout responsive
src/
  engine.ts       reglas puras: mazo, estado, acciones, puntaje. Sin DOM.
  ai.ts           chooseAction(view, params, rng) → Action
  ui.ts           render(state) + cartas SVG + input
  texts.ts        textos en castellano
  portal.ts       adaptador CrazyGames (no-op fuera del portal)
  main.ts         loop de juego, turnos de la IA con delay
test/
  engine.test.ts
  ai.test.ts
```

**Flujo:** input (tap/click) → `Action` → `engine.apply(state, player, action)` → nuevo `State` →
`render(state)`. Si el turno es de la máquina, `main.ts` espera 0,7–1,2 s, llama a
`ai.chooseAction(engine.view(state, 1), params, rng)` y la acción entra por el mismo camino.

**Decisiones clave:**
- `engine.apply` es la única puerta para cambiar el estado; valida que la acción sea legal y del
  jugador en turno, y lanza error si no.
- La IA recibe `view(state, player)`: su mano, la mesa y el historial público. Nunca la mano rival.
  Es la misma vista que un servidor online mandaría a cada cliente.
- La aleatoriedad (mezcla, decisiones de la IA) entra como función `rng: () => number`. Producción usa
  `Math.random`; los tests un PRNG con semilla y/o manos fijadas directamente.

## Motor (`engine.ts`)

API pública (los nombres internos los define el plan):

```ts
type Suit = 'swords' | 'clubs' | 'coins' | 'cups'
type Card = { rank: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 10 | 11 | 12; suit: Suit }
type Player = 0 | 1                       // v1: 0 = humano, 1 = máquina
type EnvidoCall = 'envido' | 'realEnvido' | 'faltaEnvido'
type TrucoCall = 'truco' | 'retruco' | 'valeCuatro'
type Action =
  | { type: 'play'; card: Card }
  | { type: 'call'; call: EnvidoCall | TrucoCall }
  | { type: 'accept' }
  | { type: 'decline' }
  | { type: 'fold' }

newMatch(rng): State
startRound(state, rng): State             // reparte; alterna firstPlayer
apply(state, player, action): State       // lanza si es ilegal
legalActions(state, player): Action[]
view(state, player): PlayerView
cardPower(card): number                   // jerarquía del truco
envidoPoints(cards): number
```

El estado incluye: puntaje, `firstPlayer`, manos, bazas jugadas con su ganador, turno, nivel del
truco y `raiseRights`, cantos de envido de la mano, **pila de cantos pendientes** (un envido puede
apilarse sobre un truco sin responder; al resolverse se desapila y se vuelve a responder el truco),
fase (`playing` / `roundOver` / `matchOver`) y un **log de eventos** (cantos, respuestas, tantos
dichos, "son buenas", puntos anotados) que la UI usa para globos y el resumen de la mano.

## Reglas

**Mazo y jerarquía (de mayor a menor):** 1 espada > 1 basto > 7 espada > 7 oro > 3 > 2 >
1 copa/oro > 12 > 11 > 10 > 7 copa/basto > 6 > 5 > 4. Mazo de 40 (1–7, 10–12).

**Mano:** 3 cartas a cada uno; el mano alterna cada mano. El mano sale en la 1ª baza; luego sale
quien ganó la anterior, y tras una parda sale el mano. Gana la mano quien gane 2 bazas.

**Pardas:**
- 1ª parda → gana quien gane la 2ª; 2ª también parda → decide la 3ª; las tres pardas → gana el mano.
- 1ª ganada por X y 2ª parda → gana X (no se juega la 3ª).
- 1ª X, 2ª Y, 3ª parda → gana X.

**Envido:**
- Tantos: dos cartas del mismo palo = 20 + suma (figuras valen 0); si no, la carta más alta
  (figuras 0). Máximo 33.
- Se canta solo en la 1ª baza, en tu turno, antes de jugar tu carta. **El envido está primero:**
  ante un truco en la 1ª baza se puede responder envido. Con el truco ya querido, no hay envido.
- Escalada: envido → envido → real envido → falta envido; cada paso opcional, sin volver atrás,
  envido como máximo dos veces.
- **Quiero:** suma de todo lo cantado. **No quiero:** suma de todo menos el último canto, mínimo 1.
  Tabla completa (quiero / no quiero): E 2/1 · EE 4/2 · R 3/1 · ER 5/2 · EER 7/4 · F falta/1 ·
  EF falta/2 · EEF falta/4 · RF falta/3 · ERF falta/5 · EERF falta/7.
- **Falta envido:** si el que va ganando está en las malas (< 15), vale el partido; si no, vale lo
  que le falta al puntero para llegar a 30. Con el marcador empatado, el puntero es cualquiera de
  los dos (el valor es el mismo).
- Declaración: el mano dice sus tantos; el otro los dice solo si gana, si no "son buenas". Empate:
  gana el mano. El motor siempre declara los tantos reales (no se puede mentir el tanto).

**Truco:**
- Truco 2/1, retruco 3/2, vale cuatro 4/3 (quiero / no quiero). Sin truco, la mano vale 1.
- Se responde con quiero, no quiero o subiendo directamente.
- Solo sube quien tiene el quiero (`raiseRights`: quien aceptó la última apuesta). Se canta en tu
  turno, antes de jugar la carta.

**Irse al mazo:** en tu turno; el rival suma el valor actual del truco (1 si no se cantó). Si
estabas respondiendo un canto, ese canto cuenta como no quiero: ante un truco, el rival suma el valor
del no quiero; ante un envido, suma los puntos del no quiero del envido más el valor actual del
truco. No suma punto extra por envido no cantado.

**Fin del partido:** el primero en llegar a 30; se chequea apenas se anotan puntos (un envido puede
terminar el partido en mitad de una mano).

## IA (`ai.ts`)

`chooseAction(view, params, rng)`, con `params = { envidoBluff, trucoBluff, aggression, fish }`; cada rival
(Aristóteles Medio, Ramón Mentirón, John Bonachón) es un juego de valores en `PROFILES`.

- **Envido — cantar:** ≥ 30 → real envido o falta según el marcador; 27–29 → envido; menos →
  envido con probabilidad `envidoBluff` (el doble si el mano jugó sin cantar). Siendo mano con ≥ 28,
  con probabilidad `fish` se calla para dejar cantar y subir (salir a la pesca).
- **Envido — responder:** acepta si tantos ≥ 26 + 2 por escalón cantado (− 1 si es mano, ± según
  `aggression`); sube con ≥ 30 o de farol con probabilidad `envidoBluff / 3`; ante la falta considera
  si perderla le cuesta el partido.
- **Truco — chances:** Monte Carlo: reparte al rival manos compatibles con las cartas que mostró y
  los tantos que declaró (o su "son buenas"), y juega cada una con minimax a cartas vistas.
- **Truco — cantar/subir:** antes de su primera carta, solo de vez en cuando y con mano casi segura,
  nunca de farol; después, si las chances superan un umbral derivado de `aggression`, o de farol con
  probabilidad `trucoBluff`, escalada por cuán creíble es: sus chances vistas desde el rival, que solo
  conoce la mesa y los tantos declarados (si el envido que declaró delata su carta, casi no miente).
- **Truco — responder:** quiero / no quiero / subir según las chances. **Regla dura:** si un no
  quiero le da el partido al rival, siempre acepta.
- **Carta:** respondiendo, gana con la carta más baja que alcance; si no puede ganar, tira la más
  baja (o parda si conviene guardar una carta grande). Saliendo en 1ª, la del medio. Saliendo en
  2ª/3ª, la más alta si cierra la mano, si no la más baja.
- **Mazo:** la IA no se va al mazo por iniciativa propia en v1.

## Interfaz (`ui.ts`, `style.css`)

**Pantallas:** Inicio ("Jugar contra la máquina", "Cómo se juega" con resumen de reglas) · Mesa ·
Fin de partido ("¡Ganaste 30 a 24!", Revancha, Menú).

**Mesa (mobile vertical primero, centrada en desktop):** arriba los dorsos de la máquina, su globo
de diálogo y el tanteador con palitos de a 5 separando malas y buenas; al centro las bazas (1ª, 2ª,
3ª) con la carta de cada jugador; abajo tu mano y la botonera.

- La botonera muestra exactamente `legalActions(state, 0)`; ante un canto rival resalta Quiero /
  No quiero / subidas.
- Cartas y botones son `<button>`: click, touch y teclado (Tab + Enter) sin código extra.
- Cartas en SVG propio, estilo plano, sin arte de terceros (sin licencias que cumplir):
  - Los 4 palos y las 3 figuras (sota, caballo, rey) definidos una vez como `<symbol>` y
    reutilizados con `<use>`.
  - 1 a 7: los palos repetidos según el número, dispuestos como en la baraja española; el 1 con un
    palo grande.
  - 10/11/12: la figura ilustrada sosteniendo el palo de la carta, con el número en la esquina.
  - Dorso con patrón simple.
  - **Punto de control visual:** antes de armar la mesa se hace una galería con las 40 cartas y el
    dorso para revisar y ajustar el arte.
- Animaciones solo CSS: reparto escalonado, carta deslizándose a la mesa, globos de canto.
- Fin de cada mano: resumen ("Máquina +2 (truco querido) · Vos +2 (envido)") y botón
  "Siguiente mano".
- Layout con CSS grid, `100dvh`, cartas dimensionadas con `clamp()`; `user-select: none` y
  `touch-action: manipulation`.

## Portal y build

**`portal.ts`:**
- `index.html` carga el SDK v3 de CrazyGames. Si no carga o no estamos en CrazyGames, todo es no-op.
- `init()` al arrancar.
- `setPlaying(on)` → `gameplayStart` al iniciar partida / `gameplayStop` en menú y fin de partido.
- `midgameAd(): Promise<void>` al tocar Revancha; se resuelve al terminar, fallar o no existir el
  anuncio (un adblocker nunca puede trabar el botón).

**Requisitos CrazyGames verificados:** descarga inicial ≤ 20 MB para portada mobile, mouse + teclado +
touch, `user-select: none`, rutas relativas, `gameplayStart` obligatorio con SDK; anuncios solo con
gameplay start/stop integrados.

**Build:** `vite build` con `base: './'` → `dist/` → zip para subir. Dependencias de desarrollo:
solo `vite` y `typescript`.

## Errores

- `engine.apply` lanza ante una acción ilegal o fuera de turno (es un bug; los tests lo detectan).
- La UI solo ofrece acciones legales, así que el humano no puede provocarlo.
- Red de seguridad en `main.ts`: si la IA devuelve una acción ilegal, se registra el error y se
  juega la primera acción de `legalActions`, para que el partido nunca quede trabado.

## Tests

`node --test` (Node 24 ejecuta TS nativo) con `node:assert`, sin framework.

- `npm test`:
  - `engine.test.ts`: jerarquía, tantos, todas las pardas, los 11 casos de la tabla del envido,
    falta envido en malas y en buenas, solo sube quien tiene el quiero, el envido está primero,
    irse al mazo (incluido respondiendo un canto), fin del partido en mitad de una mano.
  - `ai.test.ts`: 2000 partidos IA vs IA con semillas (nunca acción ilegal, todos terminan) y
    escenarios: con 33 siempre quiere el envido; con 1 espada + 1 basto + 7 espada siempre quiere
    el truco; acepta cuando un no quiero le da el partido al rival.
- `npm run check`: `tsc --noEmit`.

## Futuro: 1v1 online (no es v1)

El motor corre sin cambios en Node. Un servidor WebSocket mantiene el `State`, valida con
`engine.apply` y manda a cada cliente solo su `view`. La UI reemplaza la llamada a la IA por mensajes
del servidor. CrazyGames ofrece links de invitación en su SDK para armar salas.
