# The Arena Lobby — multiplayer presence & PvP

**What ships today:** a live lobby in `cards/battle.html` — you can see other
rippers online, seek a fight, call someone out, and slam your cards straight into
theirs. Cross-tab presence is **real** (open two tabs and they see each other); the
rest of the room is bots keeping it warm. Flip one adapter and the exact same UI
goes internet-wide with no other changes.

The stake is the thing the artist asked for: **cards + a real `$UR3030` burn**. You
each burn a token ante to enter (a real, signed, on-chain burn once the token is
live — practice chips until then), and the winner keeps or burns the loser's staked
cards. That's honest to the pure-Liquid-Edition architecture: there is no escrow
contract at launch, and you can't trustlessly *move* someone's cards — but **burning
is permissionless and real**, so the ante is a genuine on-chain event and the cards
change hands by site referee.

---

## The pieces

| File | Role |
|---|---|
| `cards/arena-net.js` | The net layer. Exposes `window.RipNet` behind a swappable **adapter**. Ships with `LocalNet` (BroadcastChannel presence + bots). |
| `cards/battle.html` | The lobby UI + PvP face-off. Talks **only** to `RipNet` — it never knows which adapter is live. |
| `api/*` (this doc) | The optional Vercel serverless + KV backend that a `KVNet` adapter calls to make the room global. Not built yet; fully specced below. |

### Identity is per-tab, on purpose
Two tabs of one browser share `localStorage`, so a stored id would make each tab
treat the other as *itself* and the lobby would show nobody. `arena-net.js` keeps the
**session id in `sessionStorage`** (unique per tab) and only the **handle** in
`localStorage` (your name persists across visits; a never-named tab gets its own
random gonzo handle). This is why the two-tab demo works.

---

## The `RipNet` API (what the UI depends on)

```js
RipNet.use(adapter)         // pick the transport; defaults to LocalNet()
RipNet.join({handle, balance, cards})   // announce/refresh yourself
RipNet.setStatus('idle' | 'seeking' | 'battling')
RipNet.setHandle('Raoul Duke')          // rename (persists to localStorage)
RipNet.me()                 // -> {id, handle, balance, cards, status}
RipNet.onLobby(cb)          // cb(players[]) on every roster change
RipNet.challenge(id)        // call someone out
RipNet.onChallenge(cb)      // cb({id, from:{id,handle}}) — someone called YOU
RipNet.accept(ch) / RipNet.decline(ch)
RipNet.onMatch(cb)          // cb({opponent, oppStack}) — GO: launch the face-off
```

A `players[]` entry: `{id, handle, balance, cards, status, wl?, bot?, me?}`.
`oppStack` is an optional array of `{rarity}` hints the arena resolves into real
deck cards; `null` means "unknown, pick a fair stack." **Any adapter that implements
these methods drops in with zero UI changes.**

---

## Going global: the `KVNet` adapter + Vercel KV backend

`LocalNet` is bounded to one device because BroadcastChannel is. To make the room
global, implement `KVNet` against three tiny serverless routes backed by
[Vercel KV](https://vercel.com/docs/storage/vercel-kv) (Upstash Redis). The site is
already on Vercel, so this is `api/` files + one KV store, nothing else.

### Data model (Redis keys, all short-TTL)
```
presence:<id>   -> JSON {id,handle,balance,cards,status,ts}   EX 20   (heartbeat)
lobby           -> SET of live ids  (or just SCAN presence:*)
inbox:<id>      -> LIST of events {type:'challenge'|'accept'|'decline'|'match', ...}
```
Presence is self-expiring: miss two heartbeats and you fall out of the room. No
cron, no cleanup job.

### Routes

**`POST /api/presence`** — heartbeat. Body `{id,handle,balance,cards,status}`.
`SET presence:<id> <json> EX 20`. Returns `{ok:true}`.

**`GET /api/lobby`** — the roster. `SCAN presence:*`, return the parsed values
(cap ~60, newest first). This is what `onLobby` renders.

**`GET /api/inbox?id=<id>`** — drain your events. `LPOP inbox:<id>` until empty,
return the list. Challenges, accepts, declines and match-gos all arrive here.

**`POST /api/challenge`** — `{from, to, cid}` → `RPUSH inbox:<to>` a
`{type:'challenge', from, cid}`. `accept`/`decline` are the same shape into
`inbox:<from>`. On accept, push a `{type:'match', opponent, oppStack}` to **both**
inboxes so each side fires `onMatch`.

> Poll `GET /api/lobby` and `GET /api/inbox` every ~2s (or upgrade to SSE/Upstash
> pub-sub later). At lobby scale that's trivial; KV free tier covers it.

### The adapter (skeleton — same shape as `LocalNet`)
```js
function KVNet({ base = '' } = {}) {
  const me = RipNet.me();
  const post = (p, b) => fetch(base + p, {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(b)});
  const get  = p => fetch(base + p).then(r => r.json());
  let lobbyCb, chalCb, matchCb, timer;
  const beat = () => post('/api/presence', me);
  async function poll() {
    lobbyCb && lobbyCb(await get('/api/lobby'));
    for (const ev of await get('/api/inbox?id=' + me.id)) {
      if (ev.type === 'challenge') chalCb && chalCb({id: ev.cid, from: ev.from});
      else if (ev.type === 'match') { me.status = 'battling'; matchCb && matchCb({opponent: ev.opponent, oppStack: ev.oppStack}); }
    }
  }
  return {
    join(p){ Object.assign(me, p); beat(); if(!timer) timer = setInterval(()=>{beat();poll();}, 2000); },
    setStatus(s){ me.status = s; beat(); },
    setHandle(h){ me.handle = h; beat(); },
    me: () => me,
    challenge(id){ const cid='c_'+Math.random().toString(36).slice(2); post('/api/challenge',{from:me,to:id,cid}); return cid; },
    accept(ch){ post('/api/accept',{from:me,to:ch.from.id,cid:ch.id}); },
    decline(ch){ post('/api/decline',{from:me,to:ch.from.id,cid:ch.id}); },
    onLobby(cb){ lobbyCb = cb; }, onChallenge(cb){ chalCb = cb; }, onMatch(cb){ matchCb = cb; },
    dispose(){ clearInterval(timer); },
  };
}
// go live in one line, at the bottom of battle.html:
//   RipNet.use(KVNet());
```

Everything above the `RipNet.use(...)` line — the whole lobby, the toast, the PvP
stake modal, the face-off — is untouched.

---

## The stake: cards + a real `$UR3030` burn

`anteBurn(amount)` in `battle.html` is the money hook:

- **Token live** (`RIPMASTER_CHAIN.contracts.liquidEdition` set + a wallet present):
  it asks the wallet to sign a real **`burn(uint256)`** (`ERC20Burnable`, selector
  `0x42966c68`) for the ante. Both sides burn to enter — the tokens are gone, feeding
  the edition's deflation. The winner still takes the cards.
- **Token not live yet** (address is zero, which it is on Sepolia until
  [`docs/TESTNET.md`](TESTNET.md) step 2): it burns **practice chips** (`urm_tokens`,
  this device only) and says so in plain language. Same UX, no chain.

This is deliberately not an escrow/pot transfer. In a pure Liquid Edition there is no
game contract to hold stakes, so a token *pot* can't be settled trustlessly — but a
*burn* can, because anyone can burn their own tokens. The burn is the real,
verifiable on-chain stake; the card swap is refereed by the site.

### Phase 2 — trustless cards (optional)
If we ever want the card swap itself to be trustless, that's the **`CardVault`**
escrow sketched in [`docs/LAUNCH-ARCHITECTURE.md`](LAUNCH-ARCHITECTURE.md): both
players deposit their staked companion-Lens tokens, a signed result releases them to
the winner. It's a Phase-2 add-on and is **not** required for the lobby to ship —
the burn ante already makes the stake real today.

---

## Status
- ✅ `arena-net.js` — `RipNet` + `LocalNet` (real cross-tab presence + bots)
- ✅ Lobby UI, seek toggle, challenge buttons, incoming-challenge toast
- ✅ PvP stake modal → opponent-labeled face-off → keep/burn spoils + burn ante
- ✅ Per-tab identity (sessionStorage) so two tabs are two players
- ⏳ `KVNet` + `api/presence|lobby|inbox|challenge|accept|decline` — specced here,
  build when we want the room to span devices
- ⏳ On-chain burn goes live automatically the moment `liquidEdition` is a real
  address (Sepolia, then mainnet)
