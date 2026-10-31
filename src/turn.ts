import { drop, load, save } from './storage.ts'

// The player's own TURN relay, for when two phones can't reach each other directly (the same wifi, strict
// NATs). The game offers none: whoever needs one brings theirs, and it stays in this browser
export type Relay = { urls: string[]; username?: string; credential?: string }

const TURN_KEY = 'truco:turn'
const SERVERS_MAX = 8
const URLS_MAX = 8
const FIELD_MAX = 500
const URL_PATTERN = /^(turns?|stun):[^\s]{1,300}$/
const isTurn = (url: string) => /^turns?:/.test(url)

// What a provider hands out, pasted as JSON: one ICE server or a list of them. Rebuilt from checked
// parts, or null if anything is off or there is no TURN server in it
export function parseRelays(text: string): Relay[] | null {
  const x = readJson(text) ?? readJson(fromSnippet(text))
  if (x === null) return null
  const list = Array.isArray(x) ? x : [x]
  if (list.length === 0 || list.length > SERVERS_MAX) return null
  const relays: Relay[] = []
  for (const item of list) {
    const relay = parseRelay(item)
    if (!relay) return null
    relays.push(relay)
  }
  return relays.some((r) => r.urls.some(isTurn)) ? relays : null
}

function readJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

// Providers like Metered hand out JavaScript (`new RTCPeerConnection({ iceServers: [...] })`): its list,
// with the keys quoted and the trailing commas gone. Whatever comes out is checked like any paste
function fromSnippet(text: string): string {
  const list = text.slice(text.indexOf('['), text.lastIndexOf(']') + 1)
  return list.replace(/([{,]\s*)([A-Za-z_]\w*)\s*:/g, '$1"$2":').replace(/,(\s*[}\]])/g, '$1')
}

function parseRelay(x: unknown): Relay | null {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return null
  const o = x as Record<string, unknown>
  const urls = typeof o.urls === 'string' ? [o.urls] : o.urls
  if (!Array.isArray(urls) || urls.length === 0 || urls.length > URLS_MAX) return null
  if (!urls.every((url) => typeof url === 'string' && URL_PATTERN.test(url))) return null
  const field = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= FIELD_MAX
  if (!urls.some(isTurn)) return o.username === undefined && o.credential === undefined ? { urls } : null
  return field(o.username) && field(o.credential) ? { urls, username: o.username as string, credential: o.credential as string } : null
}

export const savedRelays = (): Relay[] => parseRelays(load(TURN_KEY) ?? '') ?? []
export const saveRelays = (relays: Relay[]) => save(TURN_KEY, JSON.stringify(relays))
export const forgetRelays = () => drop(TURN_KEY)
