import { REASON } from './engine.ts'
import type { Call, Card, GameEvent, Player, Suit } from './engine.ts'
import type { Rival } from './ai.ts'

export const T = {
  title: 'Truco',
  subtitle: 'Mano a mano contra la máquina',
  chooseRival: 'Elegí tu rival',
  rules: 'Cómo se juega',
  close: 'Cerrar',
  you: 'Vos',
  thinking: 'Pensando…',
  nextRound: 'Siguiente mano',
  rematch: 'Revancha',
  menu: 'Menú',
  won: (mine: number, theirs: number) => `¡Ganaste ${mine} a ${theirs}!`,
  lost: (rival: string, mine: number, theirs: number) => `Ganó ${rival} ${theirs} a ${mine}`,
  trick: ['1ª', '2ª', '3ª'],
}

export const RIVALS: Record<Rival, { name: string; motto: string }> = {
  aristoteles: { name: 'Aristóteles Medio', motto: 'Ni mucho ni poco' },
  ramon: { name: 'Ramón Mentirón', motto: 'Miente como respira' },
  john: { name: 'John Bonachón', motto: 'Si canta, es porque tiene' },
}

const SUIT_NAME: Record<Suit, string> = { swords: 'espada', clubs: 'basto', coins: 'oro', cups: 'copa' }
const FIGURE_NAME: Partial<Record<number, string>> = { 10: 'Sota', 11: 'Caballo', 12: 'Rey' }

export const cardName = (card: Card) => `${FIGURE_NAME[card.rank] ?? card.rank} de ${SUIT_NAME[card.suit]}`

export const ACTION_LABEL = { accept: 'Quiero', decline: 'No quiero', fold: 'Me voy al mazo' }

export const CALL_LABEL: Record<Call, string> = {
  envido: 'Envido',
  realEnvido: 'Real envido',
  faltaEnvido: 'Falta envido',
  truco: 'Truco',
  retruco: 'Quiero retruco',
  valeCuatro: 'Quiero vale cuatro',
}

// What a player says out loud for an event; null for events nobody says
export function speech(e: GameEvent, firstPlayer: Player): string | null {
  switch (e.type) {
    case 'call': return `¡${CALL_LABEL[e.call]}!`
    case 'accept': return '¡Quiero!'
    case 'decline': return 'No quiero'
    case 'fold': return 'Me voy al mazo'
    case 'envidoPoints': return e.player === firstPlayer ? `Tengo ${e.points}` : `${e.points} son mejores`
    case 'sonBuenas': return 'Son buenas'
    default: return null
  }
}

export function roundSummary(log: GameEvent[], me: Player, rival: string): string {
  return log
    .flatMap((e) => (e.type === 'score' ? [`${e.player === me ? T.you : rival} +${e.points} (${e.reason === REASON.envido ? 'envido' : 'mano'})`] : []))
    .join(' · ')
}

export const RULES_HTML = `
<h2>Cómo se juega</h2>
<p>Truco argentino mano a mano, a 30 puntos: 15 malas y 15 buenas. En cada mano se reparten 3 cartas
y se juegan hasta 3 bazas; gana la mano quien gane 2.</p>
<h3>Las cartas, de mayor a menor</h3>
<p>1 de espada · 1 de basto · 7 de espada · 7 de oro · 3 · 2 · 1 de copa y de oro · 12 · 11 · 10 ·
7 de copa y de basto · 6 · 5 · 4</p>
<h3>Envido</h3>
<p>Solo en la primera baza, antes de jugar tu carta. Dos cartas del mismo palo suman 20 más sus números
(las figuras valen 0). Envido vale 2, real envido 3 y falta envido lo que le falta al que va ganando
(si está en las malas, el partido). Si no querés, el que cantó se lleva lo anterior, mínimo 1.</p>
<h3>Truco</h3>
<p>Truco vale 2, retruco 3 y vale cuatro 4. Si no querés, el otro se lleva lo que valía antes. Solo
puede subir quien dijo "quiero" la última vez. Si te cantan truco en la primera baza, podés cantar
envido primero.</p>
<h3>Irse al mazo</h3>
<p>Abandonás la mano y el rival se lleva lo que está en juego.</p>`
