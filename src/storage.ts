// localStorage that never throws: blocked or full storage keeps things for this page only
export function load(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null // storage blocked: keep it within this page only
  }
}

export function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // storage blocked or full: keep it in memory
  }
}

export function drop(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    // storage blocked: nothing was kept
  }
}
