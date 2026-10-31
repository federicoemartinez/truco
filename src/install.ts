// Android Chrome's own "install app" dialog, opened from a menu button instead of its banner.
// Chrome fires beforeinstallprompt only where installing is possible: not on iPhone, not once installed
type InstallPrompt = Event & { prompt(): Promise<void> }

let held: InstallPrompt | null = null

export function initInstall(onChange: () => void) {
  if (window.top !== window) return // inside someone else's iframe: their page, not ours to install
  if (!matchMedia('(pointer: coarse)').matches) return // a computer: a landscape window, where the game looks bad
  navigator.serviceWorker?.register('./sw.js').catch((err) => console.warn(err)) // undefined over plain http
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // no banner of Chrome's own: the menu button offers it
    held = e as InstallPrompt
    onChange()
  })
  window.addEventListener('appinstalled', () => {
    held = null
    onChange()
  })
}

export const canInstall = () => held !== null

// A held prompt works once: drop it first, so a dismissed dialog doesn't leave a dead button behind.
// Chrome fires beforeinstallprompt again later if installing is still possible
export async function install() {
  const prompt = held
  held = null
  await prompt?.prompt()
}
