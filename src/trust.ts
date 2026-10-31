// Who is who at an online table. Every player has an ECDSA key pair made on their phone; the private
// key can sign but never be read out. A player's id is the hash of their public key, and their room is
// their id, so whoever opens a room can prove it's theirs
export type Identity = { id: string; publicKey: string; privateKey: CryptoKey } // publicKey: raw, base64url

const ALGO = { name: 'ECDSA', namedCurve: 'P-256' } as const
const SIGN = { name: 'ECDSA', hash: 'SHA-256' } as const
const PROOF_TAG = 'truco-v1' // a signature for this game and this version only

// Lengths in base64url: a raw P-256 key is 65 bytes, a nonce 16, an id (SHA-256) 32, a signature 64
export const KEY_LENGTH = 87
export const NONCE_LENGTH = 22
export const SIG_LENGTH = 86
export const ID_PATTERN = /^[A-Za-z0-9_-]{43}$/

export const isB64 = (x: unknown, length: number): x is string =>
  typeof x === 'string' && x.length === length && /^[A-Za-z0-9_-]+$/.test(x)

export function toB64(bytes: ArrayBuffer | Uint8Array): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromB64(s: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('not base64url')
  return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0))
}

export async function idOf(publicKey: string): Promise<string> {
  return toB64(await crypto.subtle.digest('SHA-256', fromB64(publicKey)))
}

export async function newIdentity(): Promise<Identity> {
  const pair = await crypto.subtle.generateKey(ALGO, false, ['sign', 'verify']) // the public half is always readable
  const publicKey = toB64(await crypto.subtle.exportKey('raw', pair.publicKey))
  return { id: await idOf(publicKey), publicKey, privateKey: pair.privateKey }
}

export const newNonce = () => toB64(crypto.getRandomValues(new Uint8Array(16)))

// The DTLS certificate fingerprints in an SDP, sorted and deduplicated. Every WebRTC connection
// gets its own certificate, so they name one connection: a proof signed over them can't be replayed on another
export function fingerprints(sdp: string | undefined): string | null {
  const matches = (sdp ?? '').match(/^a=fingerprint:[a-z0-9-]+ [0-9a-f:]+$/gim)
  if (!matches) return null
  const deduped = Array.from(new Set(matches.map((line) => line.trim().toLowerCase()))).sort()
  return deduped.length ? deduped.join(',') : null
}

const proofText = (nonce: string, signerLocal: string, signerRemote: string) =>
  new TextEncoder().encode([PROOF_TAG, nonce, signerLocal, signerRemote].join('|'))

// "I hold this key, on this connection": a signature over the other side's nonce and both fingerprints
export async function prove(me: Identity, theirNonce: string, local: string, remote: string): Promise<string> {
  if (!isB64(theirNonce, NONCE_LENGTH)) throw new Error('nonce must be base64url')
  if (!local || !remote) throw new Error('fingerprints must be non-empty')
  return toB64(await crypto.subtle.sign(SIGN, me.privateKey, proofText(theirNonce, local, remote)))
}

// Checks a proof; the signer's local fingerprint is the verifier's remote one
export async function verify(publicKey: string, sig: string, myNonce: string, local: string, remote: string): Promise<boolean> {
  if (!isB64(publicKey, KEY_LENGTH) || !isB64(sig, SIG_LENGTH) || !isB64(myNonce, NONCE_LENGTH) || !local || !remote) return false
  try {
    const key = await crypto.subtle.importKey('raw', fromB64(publicKey), ALGO, false, ['verify'])
    return await crypto.subtle.verify(SIGN, key, fromB64(sig), proofText(myNonce, remote, local))
  } catch {
    return false // not a key, not base64url: not them
  }
}

const DB = 'truco'
const STORE = 'keys'
const ME = 'me'

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

// This phone's identity: made once and kept in IndexedDB, which stores the key itself (not its bytes),
// so the page can use it but nothing can copy it out
export async function loadIdentity(): Promise<Identity> {
  try {
    const open = indexedDB.open(DB, 1)
    open.onupgradeneeded = () => open.result.createObjectStore(STORE)
    const db = await request(open)
    const stored: { publicKey: string; privateKey: CryptoKey } | undefined = await request(db.transaction(STORE).objectStore(STORE).get(ME))
    if (stored) return { ...stored, id: await idOf(stored.publicKey) }
    const fresh = await newIdentity()
    await request(db.transaction(STORE, 'readwrite').objectStore(STORE).put({ publicKey: fresh.publicKey, privateKey: fresh.privateKey }, ME))
    return fresh
  } catch (err) {
    console.warn(err) // no IndexedDB (some private windows): an identity for this page only
    return newIdentity()
  }
}
