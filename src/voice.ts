import type { GameEvent, Player } from './engine.ts'
import type { Rival } from './ai.ts'

// One recorded voice (docs/guion-grabacion.md) played back differently per player:
// speed and pitch move together on purpose, so a slower clip is also a deeper voice
export type Voice = { rate: number; bright: number } // playback speed; treble boost in dB

export const PLAYER_VOICE: Voice = { rate: 0.98, bright: -12 }
export const VOICES: Record<Rival, Voice> = {
  aristoteles: { rate: 1, bright: 0 },
  ramon: { rate: 0.89, bright: -12 },
  john: { rate: 1.15, bright: 12 },
  bruno: { rate: 1, bright: 12 },
}

// The clip of what speech() says for an event; null for events nobody says
export function clipName(e: GameEvent, firstPlayer: Player): string | null {
  switch (e.type) {
    case 'call': return e.call
    case 'accept': case 'decline': case 'fold': case 'sonBuenas': return e.type
    case 'envidoPoints': return `${e.player === firstPlayer ? 'points' : 'better'}-${String(e.points).padStart(2, '0')}`
    default: return null
  }
}

const MUTED_KEY = 'truco:muted'
let muted = readMuted()
let ctx: AudioContext | undefined
let queue = Promise.resolve()
let generation = 0 // bumped by stop(): clips queued before it stay quiet
let playing: AudioBufferSourceNode | undefined
const clips = new Map<string, Promise<AudioBuffer>>()

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === '1'
  } catch {
    return false
  }
}

export const isMuted = () => muted

export function toggleMute() {
  muted = !muted
  if (muted) stop()
  try {
    localStorage.setItem(MUTED_KEY, muted ? '1' : '0')
  } catch {
    // storage blocked: remember it for this page only
  }
}

// Browsers keep audio locked until the first tap: call it from a click
export function unlock() {
  ctx ??= new AudioContext()
  void ctx.resume()
}

export function stop() {
  generation++
  playing?.stop()
}

// Says the events one after another, each in its speaker's voice
export function say(events: GameEvent[], firstPlayer: Player, voiceOf: (p: Player) => Voice) {
  if (muted || !ctx) return
  for (const e of events) {
    const name = clipName(e, firstPlayer)
    if (!name) continue
    const buffer = load(name) // fetch now, play in turn
    const gen = generation
    queue = queue
      .then(async () => {
        if (gen === generation) await play(await buffer, voiceOf(e.player))
      })
      .catch(console.warn) // a missing clip skips that line, never the rest
  }
}

function load(name: string): Promise<AudioBuffer> {
  let clip = clips.get(name)
  if (!clip) {
    clip = fetch(`voice/${name}.mp3`).then((r) => r.arrayBuffer()).then((b) => ctx!.decodeAudioData(b))
    clip.catch(() => clips.delete(name)) // retry on the next say
    clips.set(name, clip)
  }
  return clip
}

function play(buffer: AudioBuffer, voice: Voice): Promise<void> {
  const source = new AudioBufferSourceNode(ctx!, { buffer, playbackRate: voice.rate })
  const treble = new BiquadFilterNode(ctx!, { type: 'highshelf', frequency: 2500, gain: voice.bright })
  source.connect(treble).connect(ctx!.destination)
  playing = source
  return new Promise((resolve) => {
    source.onended = () => resolve()
    source.start()
  })
}
