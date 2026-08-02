# LAUNCH CHECKLIST — $3030

**T-0: August 6, 2026 · 11:11 PM ET** (`2026-08-07T03:11:00Z`).
Confirmed by the artist 2026-07-27. The landing countdown targets exactly this, and
`npm run test:launch` drives the real page across the real boundary — 14 assertions at
T−3d, across T, and T+6h.

> August in New York is **EDT** (UTC−4), so "11:11 PM EST" resolves to 11:11 PM EDT =
> `03:11Z`. Verified against the tz database — no change needed to `index.html`.

> ⛔ **THIS FILE WAS STALE ON FIVE SETTLED FACTS UNTIL 2026-08-02 — including the token's
> name, on the one step that cannot be undone.** It is the document nobody opens until the
> night, which is precisely the class of surface this project keeps finding rotted. The
> corrections are marked ⚑ so the next reader can see what moved and when.

---

## ⚑ The one irreversible step

**The token's `name()` must read `ripmaster3030`. Its `symbol()` must read `3030`.**

⚑ **This file said `upperdeckripmaster3030` until 2026-08-02.** That name is retired.

⛔ **THE TOKEN AND THE STUDIO HAVE DIFFERENT NAMES, ON PURPOSE.** Settled by the artist
2026-08-02:

| | string |
| --- | --- |
| studio · domain · wordmark · every page | `ripmaster3030studios` |
| ERC-20 **`name()`** | **`ripmaster3030`** — no "studios" |
| ERC-20 **`symbol()`** | **`3030`** |

⚠ `ripmaster3030studios` **contains** `ripmaster3030`, so "close enough" is indistinguishable
from correct at a glance. `npm run test:name` asserts the **exact** string — a substring test
would happily pass the wrong one, and that is the single likeliest way the wrong name reaches
the CLI.

⚑ **You type it yourself.** This file used to say the deploy was *assisted — SuperRare deploys,
we do not self-deploy*. **That was wrong.** SuperRare's own Technical CLI Guide (Cohort 01)
says a whitelisted artist may use **either** the guided create flow **or** the Rare Protocol
CLI, and `name` and `symbol` are **positional arguments you type**:

```bash
rare liquid-edition deploy multicurve "ripmaster3030" "3030" \
  --curve-preset medium-demand \
  --description "A liquid trading-card game of psychedelic hyperfoil cartoon spirits." \
  --image ./media/site/mark-1024.png \
  --preview
```

This is **better** than the assisted path, because `--preview` prints the whole thing without
submitting. So:

1. Run it with `--preview`. **Read `name` and `symbol` back off the output, character by
   character.**
2. Only then run the same line with `--yes`.
3. After it lands and **before any announcement**, read `name()` off the deployed contract and
   compare again.

⛔ **Deploy from the exact wallet connected to the verified SuperRare account.** SuperRare's
golden rule: a burner or dev wallet forfeits association with the artist profile, and the drop
will not surface on superrare.com. This is not recoverable by redeploying the render contract.

⚠ **`--image` is the token's fallback metadata**, shown anywhere the render contract is not
consulted. It was pointed at `marquee-header.webp` until 2026-08-02 — a bitmap whose *pixels*
spell the retired studio name. Use the mark.

The Sepolia rehearsal token is frozen as `"Upperdeck Ripmaster 3030"` / `"UR3030"` — title case,
retired name. **That is the precedent.** Everything else on this page is recoverable; this is not.

---

## ⛔ The one number nobody has measured: P0

**`--preview` also settles this, for free, in the same command.**

`scripts/token-model.mjs` assumes the token opens at **1 RARE**, and the **$7 pack rests
entirely on that** — a pack is priced in *tokens* (350 at tier I), so its dollar price is just
350 × the token price. Two independent readings say the assumption is an order of magnitude low:

| source | opening price | a 350-token pack |
| --- | --- | --- |
| `token-model.mjs` assumption | 1 RARE ≈ $0.02 | **$7** |
| live Sepolia curve (`npm run preflight`, block 11,404,471) | **16.78 RARE** | **$93** |
| SuperRare's own worked example | ~$0.22 average | — |

⚠ The Sepolia curve is explicitly **uncalibrated** and its cap is 1,000,000, so it is not a
forecast. But it is the only real curve this project has ever had, and it points the same way as
SuperRare's example.

- [ ] **Run `--preview` at the real cap, put the printed P0 into `token-model.mjs`, and re-derive
      the pack schedule — BEFORE `$7` is published anywhere it can be quoted back at the studio.**

---

## Supply: 3,300,000 — and the two numbers that must always be quoted together

Settled by the artist 2026-08-02, reversing the 33,000,000 direction. Run `npm run model`;
`scripts/token-model.mjs` is the only source.

The pack burn is denominated in **tokens per pack** (350 → 1,200), so the four-tier total is a
fixed **1,014,375** at any cap. The cap only decides what fraction that is:

| cap | four-tier burn | % of mint | contraction | studio slug as % of surviving float |
| --- | --- | --- | --- | --- |
| 33,000,000 | 1,014,375 | 3.1% | 1.03× — none | ~3.2% |
| **3,300,000 ← settled** | 1,014,375 | **30.7%** | **1.44×** | ⛔ **44.4%** |

⛔ **These are the same arithmetic and may never be quoted apart.** The 50/50 split sends the
same number of tokens to the fire and to the studio, so any cap that makes the burn look material
makes the treasury look large by exactly that much. `token-model.mjs` refuses to print one
without the other.

⚠ It is **not** a 3× scarcity engine. Do not let anyone round 1.44× up.

---

## ⚑ No seasons — the schedule is TIERED

⚑ This file said "Season I" in its own title until 2026-08-02. There are no seasons. Four
**tiers** of dwindling allotment — 1,600 → 1,100 → 600 → 260 packs — and **a tier opens when the
one before it sells out, not on a date.** A season is a promise about time; a tier is a promise
about supply, equally honest whether it takes three weeks or three years. The 33 heroes are the
**genesis set**.

---

## Artist / SuperRare track

- [ ] `--preview` the deploy. Read `name`, `symbol` and the curve back. **Then** `--yes`.
- [ ] Deploy from the **SuperRare-linked wallet**.
- [ ] Re-read `name()` off the deployed contract before announcing.
- [ ] Put the printed P0 into `token-model.mjs` and re-derive the pack price.
- [ ] Repeat the render-contract step on mainnet: deploy, "Update Render Contract", confirm the
      token page renders the site in its media slot (proven on the dev environment 2026-07-27).
- [ ] Decide the deck question below.
- [ ] ⚠ **Ask SuperRare the four things their public docs still do not state:** the creator
      revenue model, the buy/sell fee split and who receives it, how the opening price is set,
      and the DEX graduation threshold + who owns the LP.

## Contracts we deploy ourselves

Neither is on-chain yet, and **both ship dark** — with their `chain-config` slots empty the site
degrades deliberately rather than pretending. That is safe, but it means **the site copy is ahead
of the code** until they land.

- [ ] **`PackSink`** — the atomic 50/50 splitter. Empty ⇒ every pack burns 100% and the studio is
      paid nothing, while the pages say half funds the studio. `node scripts/lens-cli.mjs
      deploy-sink`, then paste into `chain-config.contracts.packSink`.
      ⚠ Both constructor addresses are `immutable`. A wrong treasury is a redeploy, not a setting.
- [ ] **`Ripmaster3030Lens721`** — render-by-id + voucher mint. Empty ⇒ the collector seat door
      falls back to the local vault and marks itself `verified:false`. See `docs/DEPLOY-LENS.md`;
      Remix is the recommended route (the key never leaves MetaMask).
      ⚠ **Use a different wallet for the claim signer than the owner.** The signer is a hot key
      used all season; the owner can repoint every card.
      ⚠ Three strings freeze at deploy: the **EIP-712 domain** (part of every voucher digest — once
      one real voucher is signed it can never change), the lens **symbol** `3030L`, and the
      **byline compiled into the on-chain `animation_url` HTML**, which has no setter.
- [ ] `cards/hero/cids.json` holds **two placeholders**. Every hero's `image` is `ipfs://CID`.
      Pin the real art and paste the CIDs, or heroes mint pointing at nothing.

## Site track

- [ ] **Clean-slate the deck.** `cards/manifest.json` holds **196 placeholder cards**. Build the
      empty-deck path first; every consumer must survive zero cards — gallery, binder, pack rip,
      `card-powers`, and NEON RONIN's card-gated unlocks.
- [ ] **Mainnet flip.** `js/chain-config.js` is the single switch; `js/wallet.js` already picks
      `dev.superrare.co` vs `superrare.com` off `chainId`. Audit the stray Sepolia references in
      `riprocketer.html`, `deploy-render.html`, `js/card-powers.js`. Add a wrong-network guard.
- [ ] ⚑ **Re-point the WalletConnect project.** `walletConnectProjectId` is domain-allowlisted to
      **the retired domain**. It lives in a dashboard, so no test in this repo can catch it, and
      the failure mode is the worst kind: a collector on `ripmaster3030studios.com` gets a wallet
      warning that the site does not match the project — which is exactly the shape people are
      told to read as a phish. The site's WalletConnect `metadata` already declares the new name
      and domain, so **today they disagree.**
- [ ] **Smoke test on mainnet** — a real buy, a real rip, a real burn — before doors open.
- [ ] **Mobile on real hardware.** Never done. Phones will be most of the traffic arriving from a
      SuperRare token page.
- [ ] **Lift the gate.** `gate.js` is injected into every page and ships its password in page
      source. Decide remove-vs-veil, and rotate the password regardless.
- [ ] **Final copy + NFA pass** across the public pages against model v2.2.
- [ ] `npm test` green. Everything above that can be a test, is one.

---

## Explicitly deferred to post-launch

Named here so they don't quietly consume the runway:

- **Real-money wagering.** Needs escrow + anti-cheat + ideally an audit. The games ship as free
  play with the burns that are already real on-chain — which is the on-ethos version anyway:
  *the win is the having-done-it.*
- **Seat server verification.** Seats stay advisory; nothing of value depends on `seat.ok`, and
  `docs/SEATS.md` says so in as many words.
- **Section 9 stage-3 maps, NEON RONIN roster work, the layered-card routing** (`docs/REACHABILITY.md`
  R2). All good work, none of it launch-critical.

---

## The decision to make before day 7

**If the 100 handmade cards are not finished by Aug 6, what ships?**

Launching with the token live, the site live, and the deck marked *genesis set incoming* is a
legitimate and honest option. Launching with 196 placeholder cards presented as the deck is not —
it would undercut the one thing the project is actually about.

Decide this early, while it's a plan rather than a scramble.

---

## Launch-night runbook

0. `npm run preflight` — reads the chain with `eth_call` only, no key, no gas. Every reason to
   abort is knowable for free before anything is spent.
1. `--preview` the deploy. **Read `name` and `symbol` back. Stop if either is wrong.**
2. `--yes`. Read `name()` off the deployed contract. **Stop if it is wrong.**
3. Deploy + set the render contract; confirm the token page renders the site.
4. Deploy `PackSink` and the lens; paste all addresses into `js/chain-config.js`; push; confirm
   live. `RipWallet.hasSink()` should now report the split is real.
5. Smoke test: buy → rip → burn. Confirm `totalSupply` moves.
6. Lift the gate.
7. Countdown flips itself at `03:11Z` — no manual step. (Verified: `npm run test:launch` skews the
   clock to 20 s out and lets the page's own `setInterval` produce the flip.)
8. Announce.

**Rollback:** the site is a Vercel deploy from `main`, so any site-side mistake is one revert
away. The token is not. That asymmetry is why steps 1–2 get read back twice and steps 4–6 can
move fast.

---

*NFA. Experimental art token — it can go to zero. Keep the disclaimers loud.*
