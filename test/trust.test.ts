import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ID_PATTERN, KEY_LENGTH, NONCE_LENGTH, SIG_LENGTH, fingerprints, fromB64, idOf, newIdentity, newNonce, prove, toB64, verify } from '../src/trust.ts'

test('base64url goes there and back, and rejects anything else', () => {
  const bytes = new Uint8Array([0, 1, 250, 251, 252, 253, 254, 255])
  assert.deepEqual(fromB64(toB64(bytes)), bytes)
  assert.match(toB64(bytes), /^[A-Za-z0-9_-]+$/)
  assert.throws(() => fromB64('a+b/'))
})

test('the id is the hash of the public key', async () => {
  const me = await newIdentity()
  assert.equal(me.publicKey.length, KEY_LENGTH)
  assert.match(me.id, ID_PATTERN)
  assert.equal(me.id, await idOf(me.publicKey))
  assert.notEqual(me.id, (await newIdentity()).id)
  assert.equal(me.privateKey.extractable, false)
  assert.equal(newNonce().length, NONCE_LENGTH)
})

test('a proof verifies on the connection it was made for, and nowhere else', async () => {
  const me = await newIdentity()
  const other = await newIdentity()
  const nonce = newNonce()
  const sig = await prove(me, nonce, 'fp-me', 'fp-you')
  assert.equal(sig.length, SIG_LENGTH)
  // The verifier sees the same connection the other way around
  assert.equal(await verify(me.publicKey, sig, nonce, 'fp-you', 'fp-me'), true)
  assert.equal(await verify(me.publicKey, sig, nonce, 'fp-me', 'fp-you'), false)
  assert.equal(await verify(me.publicKey, sig, nonce, 'fp-you', 'fp-another'), false)
  assert.equal(await verify(me.publicKey, sig, newNonce(), 'fp-you', 'fp-me'), false)
  assert.equal(await verify(other.publicKey, sig, nonce, 'fp-you', 'fp-me'), false)
  assert.equal(await verify('not-a-key', sig, nonce, 'fp-you', 'fp-me'), false)
  assert.equal(await verify(me.publicKey, 'A'.repeat(SIG_LENGTH), nonce, 'fp-you', 'fp-me'), false)
})

test('fingerprints come out of the SDP sorted, and none is none', () => {
  const sdp = 'v=0\r\na=fingerprint:sha-256 AB:CD\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=fingerprint:sha-1 11:22\r\n'
  assert.equal(fingerprints(sdp), 'a=fingerprint:sha-1 11:22,a=fingerprint:sha-256 ab:cd')
  assert.equal(fingerprints('v=0\r\nm=application 9\r\n'), null)
  assert.equal(fingerprints(undefined), null)
})

test('prove rejects a nonce with | in it and empty fingerprints', async () => {
  const me = await newIdentity()
  await assert.rejects(() => prove(me, 'N|fpX' + 'A'.repeat(16), 'fpA', 'fpB'))
  await assert.rejects(() => prove(me, newNonce(), '', 'fpB'))
  await assert.rejects(() => prove(me, newNonce(), 'fpA', ''))
})

test('verify returns false for malformed inputs', async () => {
  const me = await newIdentity()
  const nonce = newNonce()
  const sig = await prove(me, nonce, 'fpA', 'fpB')
  assert.equal(await verify(me.publicKey, sig, nonce, '', 'fpB'), false)
  assert.equal(await verify(me.publicKey, sig, nonce, 'fpA', ''), false)
  assert.equal(await verify(me.publicKey, sig, 'short', 'fpA', 'fpB'), false)
  assert.equal(await verify(me.publicKey, 'short', nonce, 'fpA', 'fpB'), false)
  assert.equal(await verify('short', sig, nonce, 'fpA', 'fpB'), false)
})

test('fingerprints deduplicates and ignores malformed lines', () => {
  const sdp = 'v=0\r\na=fingerprint:sha-256 ab:cd\r\na=fingerprint:sha-256 ab:cd\r\na=fingerprint:sha-256 AB|CD\r\n'
  assert.equal(fingerprints(sdp), 'a=fingerprint:sha-256 ab:cd')
  const sdpMalformed = 'v=0\r\na=fingerprint:sha-256 AB|CD\r\n'
  assert.equal(fingerprints(sdpMalformed), null)
})
