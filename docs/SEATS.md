# SEATS — three doors, one lobby

*How a wallet earns the right to play other people. Implementation: `js/session.js`
(`window.RipSession`). Config: `holderMin`, `contracts.lens721`, `baseRpcs` in
`js/chain-config.js`.*

---

## The idea

Anyone arriving at $3030 — from the SuperRare token page, from the site, from a link —
should be able to sit down and play, whether they hold the token, hold a card, or hold
neither and just want to drop a coin in. All three produce the same thing:

| Door | Proof | Chain read | Cost |
|---|---|---|---|
| **A · holder** | `$3030.balanceOf ≥ holderMin` | token chain | free |
| **B · collector** | `lens721.balanceOf ≥ 1` | token chain | free |
| **C · visitor** | an arcade-fee receipt paid to the coin box | Base | the fee |

A **seat** is the result. Matchmaking never asks which door you came through — that is the
entire point. A holder, a collector and a paying visitor land in one lobby and play each
other.

## The split everything rests on

> **Entry is a read-only problem. Stakes are a custody problem.**

Proving you hold something is a handful of `eth_call`s: no contract, no escrow, no audit,
and it works across chains because **each door reads its own chain over a public RPC**
rather than whatever chain the wallet happens to be pointed at. A wallet sitting on Base
can prove a mainnet $3030 balance without being asked to switch networks.

Holding a pot is a different job entirely, and it lives in the Phase-2 escrow contract.
`session.js` deliberately only does entry — that is why it ships now and the pot does not.

## ⚠ A seat is advisory until there is a server

There is no backend. The SIWE (EIP-4361) signature is produced and stored, but **nothing
verifies it server-side**, and every door's result is computed in a browser the player
controls. That is fine for opening a lobby and shaping UI. It is **not** enough to settle a
wager — a determined player can hand themselves a seat.

`seat.siwe` deliberately carries the full message, signature and nonce so a server can
verify them later. Until that exists, **no real value should depend on `seat.ok`.**

The one door that already resists tampering is the visitor door: `RipEth`'s credit count
lives in `localStorage` and is trivially editable, so the seat re-reads the **transaction
receipts** on Base and only opens when a payment actually landed in the coin box. Editing
your ledger to 99 credits buys nothing. (A freshly-sent payment reads as unverified for the
few seconds before it is mined — that is correct, not a bug.)

## Seat shape

```js
{
  ok: false,            // has an open door AND a signature
  address, door,        // door: 'holder' | 'collector' | 'visitor' | null (best open door)
  siwe: { message, signature, nonce, address, chainId, issuedAt, expiresAt },
  doors: {
    holder:    { open, configured, balance, need },
    collector: { open, configured, count, verified },
    visitor:   { open, configured, plays, verified },
  },
}
```

`configured: false` means that door's contract address isn't set yet. The lens 721 is
Phase-2, so until it's deployed the collector door falls back to the **local vault** and
reports `verified: false` — a `localStorage` array is not proof of ownership and the data
model says so rather than quietly pretending otherwise.

## Using it

```js
RipSession.signIn();            // connect → SIWE sign → check doors → seat
RipSession.get();               // current seat, synchronous, never null
RipSession.refresh();           // re-check doors for the current address
RipSession.on(seat => {...});   // seat changes
RipSession.mountBadge('seatBox');
```

Section 9 is the reference integration (`#seatBox`, mounted next to the arena lobby).
**Practice stays open to everyone** — a seat is what lets you be *matched against people*,
not what lets you play at all.

## Anti-sybil

`holderMin` exists so seats can't be farmed by splitting dust across wallets. It is read
only — never spent, never burned.

The stronger fix is **Lovebeing**, the holder-bound lens: one per wallet, non-transferable,
non-burnable. That is already an account primitive; if it becomes the player passport,
seating collapses to a single check. Not decided — see `CLAUDE.md`.

## What this does not do yet

- **No server verification of SIWE** — the next slice, and the gate on anything with money in it.
- **No stake escrow.** Pots remain Phase-2. Per the design: cards are the universal
  cross-door stake (single-chain 721 moves); money stakes stay same-chain side-pots, since
  mainnet $3030, mainnet cards and Base ETH cannot share one pot without a bridge or
  someone taking custody.
- **No anti-cheat.** Results are still client-computed. Wagering real value on a
  client-reported score is exploitable; that needs server-authoritative simulation or
  replay verification first.
- **SuperRare embed.** `walletConnectProjectId` is domain-allowlisted to
  upperdeckripmaster3030.com, so WalletConnect will likely refuse inside a superrare.com
  iframe. Widen the allowlist before the embed can seat anyone. Working rule:
  **embed = identity + play; the full site = money.**

*NFA. Experimental art token — it can go to zero.*
