import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseRelays } from '../src/turn.ts'

test("one server, as rstream gives it: its extra fields don't come along", () => {
  const pasted = JSON.stringify({
    username: 'v1:1793486796:api:-:d4d0',
    credential: 'efanHA8Try3AZ=',
    urls: ['turn:aws-global-1.c.rstream.io:3478?transport=udp', 'turns:aws-global-1.c.rstream.io:5349?transport=tcp'],
    ttl: 3600,
  })
  assert.deepEqual(parseRelays(pasted), [{
    urls: ['turn:aws-global-1.c.rstream.io:3478?transport=udp', 'turns:aws-global-1.c.rstream.io:5349?transport=tcp'],
    username: 'v1:1793486796:api:-:d4d0',
    credential: 'efanHA8Try3AZ=',
  }])
})

test('a list of servers, as Metered gives it, STUN ones without credentials', () => {
  const pasted = JSON.stringify([
    { urls: 'stun:stun.relay.metered.ca:80' },
    { urls: 'turn:global.relay.metered.ca:80', username: 'u', credential: 'c' },
  ])
  assert.deepEqual(parseRelays(pasted), [
    { urls: ['stun:stun.relay.metered.ca:80'] },
    { urls: ['turn:global.relay.metered.ca:80'], username: 'u', credential: 'c' },
  ])
})

test("Metered's code snippet, pasted as it comes", () => {
  const pasted = `var myPeerConnection = new RTCPeerConnection({
  iceServers: [
      {
        urls: "stun:stun.relay.metered.ca:80",
      },
      {
        urls: "turn:global.relay.metered.ca:80",
        username: "abc123",
        credential: "Tg+Ut/x=",
      },
      {
        urls: "turns:global.relay.metered.ca:443?transport=tcp",
        username: "abc123",
        credential: "Tg+Ut/x=",
      },
  ],
});`
  assert.deepEqual(parseRelays(pasted), [
    { urls: ['stun:stun.relay.metered.ca:80'] },
    { urls: ['turn:global.relay.metered.ca:80'], username: 'abc123', credential: 'Tg+Ut/x=' },
    { urls: ['turns:global.relay.metered.ca:443?transport=tcp'], username: 'abc123', credential: 'Tg+Ut/x=' },
  ])
})

test('anything else is no server at all', () => {
  const turn = { urls: 'turn:relay.example:3478', username: 'u', credential: 'c' }
  const bad = [
    '',
    'not json',
    '42',
    'null',
    '[]',
    JSON.stringify({ urls: 'stun:stun.example:3478' }), // only STUN: nothing to relay through
    JSON.stringify({ urls: 'turn:relay.example:3478' }), // a TURN server always asks for credentials
    JSON.stringify({ ...turn, urls: 'https://relay.example' }),
    JSON.stringify({ ...turn, urls: 'turn:relay example' }),
    JSON.stringify({ ...turn, urls: [] }),
    JSON.stringify({ ...turn, username: 7 }),
    JSON.stringify({ ...turn, credential: 'x'.repeat(501) }),
    JSON.stringify({ ...turn, urls: 'turn:' + 'x'.repeat(301) }),
    JSON.stringify(Array.from({ length: 9 }, () => turn)),
    JSON.stringify([turn, 'turn:relay.example']),
  ]
  for (const text of bad) assert.equal(parseRelays(text), null, text)
})
