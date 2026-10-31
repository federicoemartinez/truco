import { joinRoom } from '@trystero-p2p/nostr'
import type { Link, Msg } from './online.ts'
import { fingerprints } from './trust.ts'

const APP_ID = 'truco-federicoemartinez' // changing it splits players into tables that can't see each other
const MAX_BYTES = 64 * 1024 // a view is a couple of KB: anything bigger isn't ours

export type Net = Link & { leave(): void }

// The wire between the two phones: public Nostr relays only help them find each other, the game's
// messages go straight from one to the other over WebRTC. Each message is a JSON string
export function joinTable(roomId: string, on: {
  join(peer: string): void
  leave(peer: string): void
  message(peer: string, data: unknown): void
}): Net {
  const room = joinRoom({ appId: APP_ID, maxReceiveBytes: MAX_BYTES }, roomId)
  const wire = room.makeAction<string>('msg')
  room.onPeerJoin = (peer) => on.join(peer)
  room.onPeerLeave = (peer) => on.leave(peer)
  wire.onMessage = (text, { peerId }) => {
    if (typeof text !== 'string') return
    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      return // not one of ours
    }
    on.message(peerId, data)
  }
  return {
    send: (msg: Msg, peer: string) => wire.send(JSON.stringify(msg), { target: peer }),
    fingerprints(peer) {
      const pc = room.getPeers()[peer]
      const local = fingerprints(pc?.localDescription?.sdp)
      const remote = fingerprints(pc?.remoteDescription?.sdp)
      return local && remote ? { local, remote } : null
    },
    leave: () => void room.leave(),
  }
}
