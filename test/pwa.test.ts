import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url))

// Width and height from a PNG's IHDR chunk, right after the 8-byte signature and the chunk header
function pngSize(bytes: Buffer): [number, number] {
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG')
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]
}

test('the manifest makes the game installable from its own subfolder', () => {
  const m = JSON.parse(read('public/manifest.webmanifest').toString())
  assert.equal(m.name, 'Truco')
  assert.equal(m.display, 'standalone')
  for (const url of [m.start_url, m.scope, ...m.icons.map((i: { src: string }) => i.src)]) {
    assert.ok(!url.startsWith('/'), `${url}: relative, the game lives under /truco/`)
  }
  for (const size of [192, 512]) {
    const icons = m.icons.filter((i: { sizes: string }) => i.sizes === `${size}x${size}`)
    assert.deepEqual(icons.map((i: { purpose: string }) => i.purpose).sort(), ['any', 'maskable'])
    for (const icon of icons) {
      assert.equal(icon.type, 'image/png')
      assert.deepEqual(pngSize(read(`public/${icon.src}`)), [size, size])
    }
  }
})

test('the page links the manifest and the theme color', () => {
  const html = read('index.html').toString()
  assert.match(html, /<link rel="manifest" href="\.\/manifest\.webmanifest" \/>/)
  assert.match(html, /<meta name="theme-color" content="#1d6b45" \/>/)
})
