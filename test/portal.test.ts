import { test } from 'node:test'
import assert from 'node:assert/strict'

// Fake CrazyGames SDK whose init() resolves only when the test says so
const calls: string[] = []
let finishInit = () => {}
Object.assign(globalThis, {
  window: {
    CrazyGames: {
      SDK: {
        environment: 'crazygames',
        init: () => new Promise<void>((resolve) => (finishInit = resolve)),
        game: { gameplayStart: () => calls.push('start'), gameplayStop: () => calls.push('stop') },
        ad: { requestAd: () => calls.push('ad') },
      },
    },
  },
})
const portal = await import('../src/portal.ts')

test('a match started before the SDK finished init still reports gameplayStart', async () => {
  const ready = portal.init()
  const playing = portal.setPlaying(true)
  finishInit()
  await ready
  await playing
  assert.deepEqual(calls, ['start'])
})
