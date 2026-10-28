import { DEFAULT_PARAMS } from './ai.ts'
import type { AiParams } from './ai.ts'
import type { Voice } from './voice.ts'

// A rival the player builds: any mix of the AI's traits and any voice. The four presets fit it too (see main.ts)
export type Character = { name: string; params: AiParams; voice: Voice }

// Clockwise around the hexagon from the top
export const TRAITS = ['envidoBluff', 'trucoBluff', 'aggression', 'fish', 'slowplay', 'reads'] as const satisfies readonly (keyof AiParams)[]
export const RATE = { min: 0.85, max: 1.2 } // slower is deeper, see voice.ts
export const BRIGHT = { min: -12, max: 12 }

export const newCharacter = (): Character => ({ name: '', params: { ...DEFAULT_PARAMS }, voice: { rate: 1, bright: 0 } })

// The hexagon is drawn around (0, 0): a trait at 0 sits near the center, at 1 on the edge
export const RADIUS = 90
const INNER = 10 // so the six handles at 0 don't pile up on the same spot
const axis = (k: number) => (Math.PI / 3) * k - Math.PI / 2

export function pointOf(k: number, value: number): [number, number] {
  const r = INNER + value * (RADIUS - INNER)
  return [Math.cos(axis(k)) * r, Math.sin(axis(k)) * r]
}

// Where a dragged handle lands: the drag point projected on its axis
export function valueAt(k: number, x: number, y: number): number {
  const along = x * Math.cos(axis(k)) + y * Math.sin(axis(k))
  return clamp((along - INNER) / (RADIUS - INNER), 0, 1)
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

// Anything stored can be stale or tampered with: keep each sane field, default the rest
export function fromSaved(json: string | null): Character {
  const c = newCharacter()
  let saved
  try {
    saved = JSON.parse(json ?? '{}')
  } catch {
    return c
  }
  const num = (n: unknown, fallback: number, min: number, max: number) =>
    typeof n === 'number' && Number.isFinite(n) ? clamp(n, min, max) : fallback
  if (typeof saved?.name === 'string') c.name = saved.name
  for (const t of TRAITS) c.params[t] = num(saved?.params?.[t], c.params[t], 0, 1)
  c.voice.rate = num(saved?.voice?.rate, c.voice.rate, RATE.min, RATE.max)
  c.voice.bright = num(saved?.voice?.bright, c.voice.bright, BRIGHT.min, BRIGHT.max)
  return c
}
