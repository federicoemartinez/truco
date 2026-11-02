// Debug only (branch debug/ios-cards): the dev server plus the endpoints repro.html calls, answered with the
// booted iOS Simulator; run with `vite --config repro.vite.config.mjs` on a macOS runner
import { defineConfig } from 'vite'
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const simctl = (...args) => execFileSync('xcrun', ['simctl', ...args])
const sleep = (s) => execFileSync('sleep', [String(s)])

const ENDPOINTS = {
  shot: ({ name, ...info }) => {
    writeFileSync(`shots/${name}.json`, JSON.stringify(info))
    simctl('io', 'booted', 'screenshot', `shots/${name}.png`)
  },
  away: () => {
    simctl('launch', 'booted', 'com.apple.Preferences')
    sleep(2)
    simctl('launch', 'booted', 'com.apple.mobilesafari')
    sleep(1)
  },
  done: () => writeFileSync('shots/done', ''),
}

export default defineConfig({
  plugins: [{
    name: 'repro-endpoints',
    configureServer(server) {
      for (const [path, run] of Object.entries(ENDPOINTS)) {
        server.middlewares.use(`/${path}`, (req, res) => {
          let body = ''
          req.on('data', (chunk) => (body += chunk))
          req.on('end', () => {
            run(JSON.parse(body || '{}'))
            res.end('ok')
          })
        })
      }
    },
  }],
})
