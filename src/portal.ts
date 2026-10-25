// Thin CrazyGames SDK v3 layer: a no-op anywhere else (other portals, own domain, blocked script)
type Sdk = {
  init(): Promise<void>
  environment: 'local' | 'crazygames' | 'disabled'
  game: { gameplayStart(): void; gameplayStop(): void }
  ad: { requestAd(type: 'midgame', callbacks: { adFinished(): void; adError(error: unknown): void }): void }
}

const sdk = (): Sdk | undefined => (window as unknown as { CrazyGames?: { SDK: Sdk } }).CrazyGames?.SDK
let enabled = false
let ready: Promise<void> = Promise.resolve()

export function init(): Promise<void> {
  ready = (async () => {
    const s = sdk()
    if (!s) return
    try {
      await s.init()
      enabled = s.environment !== 'disabled' // outside CrazyGames every SDK call throws
    } catch (err) {
      console.warn('CrazyGames SDK unavailable', err)
    }
  })()
  return ready
}

// Waits for init, so a match started right away still reports gameplayStart
export async function setPlaying(on: boolean) {
  await ready
  if (!enabled) return
  try {
    if (on) sdk()!.game.gameplayStart()
    else sdk()!.game.gameplayStop()
  } catch (err) {
    console.warn(err)
  }
}

// Always resolves (ad shown, failed or blocked), so a rematch can never get stuck
export function midgameAd(): Promise<void> {
  if (!enabled) return Promise.resolve()
  return new Promise((resolve) => {
    try {
      sdk()!.ad.requestAd('midgame', { adFinished: () => resolve(), adError: () => resolve() })
    } catch {
      resolve()
    }
  })
}
