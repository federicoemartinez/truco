import type { Card, Rank, Suit } from './engine.ts'

export const SUIT_COLOR: Record<Suit, string> = { swords: '#2f5d9e', clubs: '#2e7d32', coins: '#b8860b', cups: '#c0392b' }

const SKIN = '#f2c9a0'
const eyes = (cx: number, cy: number) =>
  `<circle cx="${cx - 3.5}" cy="${cy}" r="1.2" fill="#333"/><circle cx="${cx + 3.5}" cy="${cy}" r="1.2" fill="#333"/>`

const SUIT_SYMBOLS = `
<symbol id="s-coins" viewBox="0 0 40 40">
  <circle cx="20" cy="20" r="17" fill="#e8b931" stroke="#9a6b00" stroke-width="2"/>
  <circle cx="20" cy="20" r="10" fill="none" stroke="#9a6b00" stroke-width="2"/>
  <circle cx="20" cy="20" r="3" fill="#9a6b00"/>
</symbol>
<symbol id="s-cups" viewBox="0 0 40 40">
  <path d="M8 5H32C32 17 27 23 20 23C13 23 8 17 8 5Z" fill="#d1453b" stroke="#7a1f19" stroke-width="2"/>
  <rect x="17.5" y="23" width="5" height="9" fill="#e8b931" stroke="#9a6b00"/>
  <path d="M10 37Q20 29 30 37Z" fill="#e8b931" stroke="#9a6b00" stroke-width="1.5"/>
</symbol>
<symbol id="s-swords" viewBox="0 0 40 40">
  <path d="M20 1L24 7V26H16V7Z" fill="#9db9df" stroke="#2b4a78" stroke-width="1.5"/>
  <rect x="9" y="26" width="22" height="4" rx="2" fill="#e8b931" stroke="#9a6b00"/>
  <rect x="17.5" y="30" width="5" height="6" fill="#7a4a1f"/>
  <circle cx="20" cy="37.5" r="2.3" fill="#e8b931" stroke="#9a6b00"/>
</symbol>
<symbol id="s-clubs" viewBox="0 0 40 40">
  <path d="M16 38L13 9C12 2 28 2 27 9L24 38Z" fill="#a0703c" stroke="#5a3a17" stroke-width="1.5"/>
  <circle cx="16" cy="16" r="1.8" fill="#5a3a17"/>
  <circle cx="23" cy="24" r="1.8" fill="#5a3a17"/>
  <path d="M26 12Q33 9 35 14Q29 16 26 12Z" fill="#4c9a3f"/>
  <path d="M14 22Q7 19 5 24Q11 26 14 22Z" fill="#4c9a3f"/>
</symbol>`

// Drawn once in a 70x110 box; clothes use currentColor so each suit tints them
const FIGURE_SYMBOLS = `
<symbol id="f-10" viewBox="0 0 70 110">
  <rect x="26" y="78" width="7" height="25" fill="#5b4636"/>
  <rect x="37" y="78" width="7" height="25" fill="#5b4636"/>
  <ellipse cx="29" cy="104" rx="6" ry="3" fill="#2b2b2b"/>
  <ellipse cx="41" cy="104" rx="6" ry="3" fill="#2b2b2b"/>
  <path d="M20 40Q35 34 50 40L54 82Q35 88 16 82Z" fill="currentColor"/>
  <rect x="18" y="60" width="34" height="4" fill="#e8b931"/>
  <path d="M20 42L12 66L17 68L24 48Z" fill="currentColor"/>
  <circle cx="14" cy="68" r="3.5" fill="${SKIN}"/>
  <path d="M50 42L60 56L56 60L47 49Z" fill="currentColor"/>
  <circle cx="59" cy="58" r="3.5" fill="${SKIN}"/>
  <path d="M27 38Q35 46 43 38L41 35Q35 40 29 35Z" fill="#fff"/>
  <circle cx="35" cy="26" r="10" fill="${SKIN}"/>
  <path d="M25 26Q25 14 35 14Q45 14 45 26Q42 19 35 19Q28 19 25 26Z" fill="#7a4a1f"/>
  <path d="M23 18Q35 5 47 18Z" fill="currentColor"/>
  <path d="M44 15Q54 5 58 9Q50 11 46 17Z" fill="#e8b931"/>
  ${eyes(35, 27)}
  <path d="M32 32Q35 34 38 32" stroke="#a0522d" fill="none"/>
</symbol>
<symbol id="f-11" viewBox="0 0 70 110">
  <path d="M12 68Q2 78 6 92Q9 80 14 72Z" fill="#3e2611"/>
  <rect x="15" y="78" width="5" height="24" fill="#6d4421"/>
  <rect x="22" y="78" width="5" height="24" fill="#6d4421"/>
  <rect x="40" y="78" width="5" height="24" fill="#6d4421"/>
  <rect x="47" y="78" width="5" height="24" fill="#6d4421"/>
  <rect x="15" y="100" width="5" height="3" fill="#2b2b2b"/>
  <rect x="22" y="100" width="5" height="3" fill="#2b2b2b"/>
  <rect x="40" y="100" width="5" height="3" fill="#2b2b2b"/>
  <rect x="47" y="100" width="5" height="3" fill="#2b2b2b"/>
  <ellipse cx="33" cy="72" rx="22" ry="11" fill="#8b5a2b"/>
  <path d="M48 68L58 46Q62 40 67 44L68 50L61 52L56 72Z" fill="#8b5a2b"/>
  <path d="M55 47Q52 56 50 66L53 66Q55 56 58 47Z" fill="#3e2611"/>
  <circle cx="62" cy="46" r="1" fill="#000"/>
  <rect x="24" y="60" width="18" height="10" rx="2" fill="currentColor"/>
  <path d="M27 38L41 38L42 62L26 62Z" fill="currentColor"/>
  <path d="M30 60L36 60L36 80L31 80Z" fill="#5b4636"/>
  <path d="M40 40L52 30L54 34L42 45Z" fill="currentColor"/>
  <circle cx="54" cy="31" r="3" fill="${SKIN}"/>
  <circle cx="34" cy="29" r="8" fill="${SKIN}"/>
  <path d="M25 25Q34 13 43 25Z" fill="currentColor"/>
  ${eyes(34, 30)}
</symbol>
<symbol id="f-12" viewBox="0 0 70 110">
  <path d="M18 42Q35 36 52 42L58 102L12 102Z" fill="currentColor"/>
  <rect x="12" y="100" width="46" height="5" rx="2" fill="#fff"/>
  <rect x="32" y="48" width="6" height="52" fill="#fff" opacity=".85"/>
  <path d="M50 46L60 62L56 65L47 52Z" fill="currentColor"/>
  <circle cx="59" cy="64" r="3.5" fill="${SKIN}"/>
  <path d="M20 40Q35 50 50 40L50 46Q35 56 20 46Z" fill="#fff"/>
  <circle cx="35" cy="27" r="10" fill="${SKIN}"/>
  <path d="M25 28Q26 44 35 46Q44 44 45 28Q40 36 35 36Q30 36 25 28Z" fill="#9a9a9a"/>
  <path d="M24 20V9L29.5 15L35 6L40.5 15L46 9V20Z" fill="#e8b931" stroke="#9a6b00"/>
  ${eyes(35, 26)}
</symbol>`

// Not display:none: some browsers stop painting patterns defined inside a hidden <svg>
export const SPRITE = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<pattern id="back-pattern" width="12" height="12" patternUnits="userSpaceOnUse">
  <rect width="12" height="12" fill="#1f3a68"/><path d="M6 0L12 6L6 12L0 6Z" fill="#2c5491"/>
</pattern>${SUIT_SYMBOLS}${FIGURE_SYMBOLS}</defs></svg>`

// Pip centers on the 100x150 card, laid out like the Spanish deck
const PIPS: Partial<Record<Rank, [number, number][]>> = {
  2: [[50, 45], [50, 105]],
  3: [[50, 40], [50, 75], [50, 110]],
  4: [[32, 45], [68, 45], [32, 105], [68, 105]],
  5: [[32, 45], [68, 45], [50, 75], [32, 105], [68, 105]],
  6: [[32, 40], [68, 40], [32, 75], [68, 75], [32, 110], [68, 110]],
  7: [[32, 40], [68, 40], [50, 57], [32, 75], [68, 75], [32, 110], [68, 110]],
}

// Where each figure holds its suit: x, y, size on the card
const HELD: Record<10 | 11 | 12, [number, number, number]> = { 10: [59, 59, 22], 11: [58, 32, 20], 12: [60, 63, 22] }

const use = (id: string, x: number, y: number, size: number) =>
  `<use href="#${id}" x="${x}" y="${y}" width="${size}" height="${size}"/>`

export function cardSvg(card: Card): string {
  const color = SUIT_COLOR[card.suit]
  const suit = `s-${card.suit}`
  let art: string
  if (card.rank >= 10) {
    const [x, y, size] = HELD[card.rank as 10 | 11 | 12]
    art = `<use href="#f-${card.rank}" x="17" y="20" width="66" height="104" color="${color}"/>${use(suit, x, y, size)}`
  } else if (card.rank === 1) {
    art = use(suit, 21, 46, 58)
  } else {
    art = PIPS[card.rank]!.map(([cx, cy]) => use(suit, cx - 12, cy - 12, 24)).join('')
  }
  const corner = `<text x="9" y="22" font-size="17" font-weight="700" font-family="Georgia, serif" fill="${color}">${card.rank}</text>`
  return `<svg class="card" viewBox="0 0 100 150" aria-hidden="true">
<rect x="1" y="1" width="98" height="148" rx="8" fill="#fffdf6" stroke="#c9b98f" stroke-width="2"/>
<rect x="6" y="6" width="88" height="138" rx="5" fill="none" stroke="#e3d6b0"/>
${art}${corner}<g transform="rotate(180 50 75)">${corner}</g></svg>`
}

export function backSvg(): string {
  return `<svg class="card" viewBox="0 0 100 150" aria-hidden="true">
<rect x="1" y="1" width="98" height="148" rx="8" fill="#1f3a68" stroke="#0f1f3a" stroke-width="2"/>
<rect x="8" y="8" width="84" height="134" rx="4" fill="url(#back-pattern)" stroke="#e8b931" stroke-width="1.5"/></svg>`
}
