# Truco online 1v1 contra un amigo — diseño

Acordado en el chat el 2026-10-31. Rama `feat/online`, que sale de `feat/pwa-install`: se apoya en el
menú sin CrazyGames y con el botón de instalar.

## Objetivo

Dos amigos juegan un partido completo a 30, cada uno en su celu, sin servidor propio: el juego sigue
siendo un sitio estático en GitHub Pages. La invitación es un link que se pasa por QR o WhatsApp.

Éxito: dos celus juegan un partido entero con voces, siguiente mano, revancha, vuelta al menú, y se
recuperan si cualquiera de los dos se corta o recarga.

## Fuera de alcance

- Más de dos jugadores, espectadores, chat.
- Servidor TURN: si los dos están detrás de un NAT simétrico, no conectan. Se agrega solo si las pruebas
  entre celus lo piden.
- Evitar que el anfitrión vea las cartas del invitado (tiene el `State`). Entre amigos no importa.
- Que el link abra la app instalada en lugar del navegador.

## Arquitectura

El anfitrión (quien invita) es el jugador 0 y tiene el `State`: valida con el motor y le manda al
invitado solo `view(state, 1)`. El invitado (jugador 1) no corre el motor: dibuja la vista que recibe y
manda acciones. Quién es mano lo sigue sorteando el motor.

El canal es WebRTC P2P con [Trystero](https://github.com/dmotz/trystero) (`@trystero-p2p/nostr`): los
relays públicos de Nostr solo se usan para encontrarse; los datos del juego van directo entre los celus.

| Archivo | Qué hace | Tests |
|---|---|---|
| `src/net.ts` (nuevo) | Envuelve Trystero: `joinTable(roomId, handlers)` → `{ send, leave }`; avisa `onJoin`, `onLeave`, `onMessage`, y da las huellas DTLS de la conexión con cada peer. Único archivo que importa Trystero. | no (WebRTC) |
| `src/trust.ts` (nuevo) | Identidad: claves ECDSA, id de sala, prueba y verificación de identidad, huellas DTLS del SDP. | `test/trust.test.ts` |
| `src/online.ts` (nuevo) | Lógica pura: `Msg`, `parseMsg`, `parseView`, quién se sienta, "listos los dos", eventos nuevos para la voz, saneado de nombres, partida guardada. | `test/online.test.ts` |
| `src/main.ts` | `mode: 'cpu' \| 'host' \| 'guest'`. El modo contra la IA no cambia. | — |
| `src/ui.ts`, `src/texts.ts` | Botón del menú, salas del anfitrión y del invitado, avisos en la mesa. | `test/texts.test.ts` si suma textos con lógica |
| `index.html` | Content-Security-Policy. | — |

Dependencias nuevas, empaquetadas por Vite: `@trystero-p2p/nostr` y `qrcode-generator`.

`public/sala.html` (el spike) se borra.

## Identidad

- Cada jugador tiene un par de claves **ECDSA P-256** generado con Web Crypto la primera vez. La privada
  es **no extraíble** y se guarda como `CryptoKey` en **IndexedDB** (`truco` / `keys`): ni un XSS
  puede llevársela, solo usarla mientras la página está abierta.
- El id de un jugador es `base64url(SHA-256(clave pública cruda))`.
- **La sala de un jugador es su id**, siempre la misma: `…/truco/?sala=<id>`. El link de invitación
  sirve para siempre.
- El rol sale de la sala, no de la URL que uno tenga abierta: `sala === miId` → anfitrión; si no, invitado.
- El nombre se guarda en `localStorage` (`truco:name`).

### Prueba de identidad

Al conectarse, cada lado manda `hello` con su clave pública, su nombre y un nonce aleatorio de 16 bytes.
Al recibir el `hello` del otro, responde `proof`: la firma ECDSA (SHA-256) de

```
"truco-v1" | nonce del otro | huella DTLS local | huella DTLS remota
```

donde las huellas son las líneas `a=fingerprint:` de `localDescription` y `remoteDescription` de esa
`RTCPeerConnection` (cada conexión tiene su propio certificado). El que verifica arma el mismo texto con
las huellas al revés (su remota es la local del otro).

Atar la firma a las huellas DTLS impide reenviarla: alguien en el medio que reenvíe el nonce al
verdadero anfitrión recibe una firma sobre *su* conexión con él, que no coincide con la conexión con la
víctima. Atar la firma solo a los peer ids de Trystero no alcanza: esos ids los elige cada cliente.

Un peer es **verificado** cuando su `proof` valida con la clave de su `hello`. Además:

- El invitado solo acepta como anfitrión una clave cuyo id sea igual a la sala.
- El anfitrión reconoce al invitado por su clave: retomar un partido exige la misma clave.
- Antes de estar verificado, de un peer solo se aceptan `hello` y `proof`; todo lo demás se descarta.
- Si no hay huellas (la conexión no está o el SDP no las trae), no se verifica.

## Protocolo

Mensajes por una acción de Trystero, en JSON:

```ts
type Msg =
  | { type: 'hello'; key: string; name: string; nonce: string } // base64url; both ways, on every join
  | { type: 'proof'; sig: string }                               // base64url
  | { type: 'busy' }                                             // host → a verified stranger
  | { type: 'view'; view: PlayerView }                           // host → guest
  | { type: 'action'; action: Action }                           // guest → host
  | { type: 'ready' }                                            // "Siguiente mano" / "Revancha"
  | { type: 'bye' }                                              // left the match on purpose
```

### Quién se sienta (anfitrión, al verificar a alguien)

- Sin partida guardada → es el invitado: `newMatch(rng, null)` (sin suerte de dificultad), se guarda su
  clave y su nombre, se le manda la vista.
- Partida guardada y misma clave → se retoma: se reenvía la vista.
- Partida guardada y otra clave → `busy`. La misma clave que ya está sentada (una recarga antes de
  que el anfitrión note el corte) retoma y reemplaza la conexión vieja.

### Jugadas

El anfitrión no usa el objeto `action` que llega: busca en `legalActions(state, 1)` la acción
equivalente y aplica *esa*. Si no hay ninguna, descarta el mensaje. Así ningún objeto armado por el otro
entra al `State`.

En modo online no hay "suerte" de dificultad, ni libreta de la IA (`learn`, `noteCall`), ni espera a que
termine la voz del rival: cada celu dice lo suyo.

### Siguiente mano y revancha

El anfitrión anota quién mandó `ready` (el suyo es local). Con los dos: `startRound` (o `newMatch` si el
partido terminó) y manda la vista nueva. Al retomar, las marcas se reinician.

### Voz del invitado

Hace sonar los eventos nuevos de `log`: desde el largo del `log` anterior si es la misma mano, desde 0 si
cambió (`round` distinto). Su voz es `PLAYER_VOICE`; la del amigo, `VOICES.aristoteles` (el clip sin
modificar). En el anfitrión es igual: el amigo suena como Aristóteles.

### Partida guardada

El anfitrión guarda `{ state, guestKey, guestName }` en `localStorage` (`truco:online`) en cada
cambio. Se borra cuando termina el partido, al recibir `bye` o al abandonar.

## Pantallas

**Menú:** botón **"Jugar con un amigo"** debajo de los rivales; si hay partida guardada, en su lugar
**"Seguir el partido con {nombre}"**.

**Sala del anfitrión:** campo de nombre, "Mandale este link:", QR del link, el link, **[Compartir]**
(`navigator.share`; si no está, **[Copiar]** con `navigator.clipboard`), "Esperando a tu amigo…",
**[Volver]**. Cuando entra el amigo, pasa directo a la mesa.

**Sala del invitado** (al abrir `?sala=`): "Te invitaron a jugar al truco", campo de nombre, **[Entrar]**
(el toque destraba el audio), "Conectando…". Si recibe `busy`: "Esa sala está ocupada" e **[Ir al menú]**.
Si el `?sala=` no tiene la forma de un id (43 caracteres base64url), muestra el menú.

**Mesa:** la de siempre, con el nombre del amigo como rival. `renderGame` recibe un `notice` opcional:

- `waiting`: tras tocar Siguiente mano o Revancha, el botón pasa a "Esperando a {nombre}…" deshabilitado.
- `paused`: el otro se fue sin `bye`: "{nombre} se desconectó. Esperando que vuelva…" con
  **[Abandonar]**. Se va solo cuando vuelve y se verifica.
- `left`: llegó `bye`: "{nombre} dejó el partido" con **[Menú]**.

Menú → ¿Abandonar? manda `bye`. El anfitrión borra la partida guardada; el invitado saca `?sala=` de la
URL (`history.replaceState`) para no volver a entrar al recargar.

## Cortes

- El otro se va sin `bye` (Trystero avisa `onPeerLeave`) → `paused`. El anfitrión no procesa nada mientras.
- Vuelve → los dos se mandan `hello` y `proof` de nuevo; verificado, el anfitrión reenvía la vista.
- Recarga el invitado → su URL conserva `?sala=`: ve su sala, toca Entrar, sigue.
- Recarga el anfitrión → el menú le ofrece "Seguir el partido con {nombre}" → abre su sala y espera a
  que vuelva la misma clave.

## Seguridad

Todo lo que llega por el canal es **no confiable**: puede mandarlo el amigo con un cliente modificado o
cualquiera que tenga el link.

- **Forma de los mensajes:** `parseMsg` acepta solo las formas exactas de `Msg` (tipos de cada campo,
  sin campos de más); cualquier otra cosa se descarta. Trystero limita el tamaño con `maxReceiveBytes`
  (64 KB).
- **La vista del invitado:** `parseView` valida cada campo antes de que llegue a `innerHTML`: palos en
  `SUITS`, números en `RANKS`, cantos en `CALL`, tipos de evento y fases conocidos, jugadores 0 o 1,
  enteros en rango (`score` 0–30, `round` ≥ 1, `trucoLevel` 0–3, puntos de envido 0–33), largos acotados
  (hasta 3 cartas por mano, 3 bazas, `log` hasta 64 eventos), `legal` reconstruido solo con acciones
  válidas. La vista que se dibuja es la que arma `parseView`, no el objeto recibido.
- **Nombres:** se recortan a 24 caracteres, se les sacan los caracteres de control y siempre se muestran
  con `esc()`.
- **Jugadas:** ver *Jugadas*: solo entran al `State` acciones de `legalActions`.
- **Suplantación:** ver *Prueba de identidad*.
- **Content-Security-Policy** en `index.html` (Pages no deja poner headers; el `<meta>` sí sirve):
  `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;
  connect-src 'self' wss:; object-src 'none'; base-uri 'none'; form-action 'none'`.
  `'unsafe-inline'` de estilos hace falta por los `style="--k:…"` de la mesa. Si el servidor de
  desarrollo de Vite necesita `ws://localhost:*` para HMR, se suma solo ahí.
- **Sala con extraños:** el anfitrión atiende a un solo invitado; al resto, `busy`. Los ids de sala no
  se pueden adivinar (256 bits).

## Tests

- `test/trust.test.ts` (Web Crypto de Node): el id sale de la clave; una prueba válida verifica; una
  prueba con huellas de otra conexión no verifica; una firma de otra clave no verifica; un nonce
  distinto no verifica; extracción de huellas de un SDP (varias líneas, ninguna).
- `test/online.test.ts`: `parseMsg` rechaza tipos desconocidos, campos de más, tipos equivocados y
  `__proto__`; `parseView` acepta `view(state, 1)` de partidos reales (con semilla) y rechaza palo
  inventado, HTML en un campo, números fuera de rango y listas demasiado largas; quién se sienta (nuevo,
  retoma, `busy`); "listos los dos"; eventos nuevos para la voz (misma mano, mano nueva); saneado de
  nombres; una acción del invitado se resuelve contra `legalActions` y una inventada se descarta.
- Prueba manual: dos pestañas en `localhost`, y después dos celus con datos móviles una vez publicado.
