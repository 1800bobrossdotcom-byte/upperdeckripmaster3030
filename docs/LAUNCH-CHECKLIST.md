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
rare liquid-edition deploy multicurve "ripmaster3030" "3030" --preview --chain mainnet --total-supply 3030000 --curve-preset low-demand --description "A card and game studio on SuperRare Liquid Editions. 100 handmade cards (33 hero 1/1s, 67 field lenses) and six playable cabinets. Half of every pack burns, half funds the studio. The token burns so the art can live. Not financial advice, who gives a rip." --image ./media/site/mark-1024.png
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

## The four addresses, and which key is hot

⛔ **Read this before you paste anything.** Four distinct wallets, and mixing two of them is either
permanent or expensive.

| wallet | role | key | fixable? |
| --- | --- | --- | --- |
| `0x8455cF296e1265b494605207e97884813De21950` | **treasury** — packs, rake, arcade fee | **COLD (Ledger)**, signs nothing | ⛔ `immutable` in PackSink — redeploy |
| `0x432D71bA14D2602B566dD9e3e098E24859d166c9` | **deploys the edition**, owns the lens | HOT, by necessity | ⛔ deploy wallet is permanent for profile association |
| `0x42A6baD4Ba3e6A3Ac5E14935F55Ee1ACfBCeb049` | **claim signer** — signs hero vouchers | HOT, used all season | ✅ `setClaimSigner` |
| `0x5C3bc6dD6d5b9913d267527275dD95ceB235d89F` | Sepolia rehearsals | testnet only | n/a |

⚑ **The treasury signs NOTHING** — `_split()` pushes to it and `flush()` is permissionless — which
is why cold costs the mechanism nothing.
⛔ **The claim signer MUST be an EOA.** The contract verifies with `ECDSA.recover`; a Safe or any
contract wallet reverts every claim with `BadSignature()`.
⛔ **Deploy the edition from the SuperRare-account wallet or the drop never associates with the
artist profile.** That one is not fixed by redeploying anything else.

---

## ✅ P0 IS MEASURED — and it changed the preset and the pack price

⚠ **MEASURED AT 3,300,000 — AND THE CAP IS NOW 3,030,000, SO RE-READ IT.** Whether the CLI's
opening price moves with the cap is not something to reason out; read it off `--preview` at the
real cap before `--yes`. Everything below, including tier I = 125 tokens, is provisional until then.

**Settled 2026-08-06** off SuperRare's live mainnet CLI previews at the then-current supply.
This section used to say P0 was the one number nobody had measured. It is measured now, and the
prediction it made — "an order of magnitude low" — was right: the answer is **4×**.

| | |
| --- | --- |
| preset | **`low-demand`** ⚠ **not `medium-demand`** — the command above was changed |
| initial RARE liquidity | **0** |
| creator allocation | **0** |
| **opens at** | **≈ $0.08 per $3030** |

⛔ **THE PACK IS PRICED IN DOLLARS NOW — $10 / $12 / $15 / $20 by tier.** ✅ Approved by the
artist 2026-08-06. At the measured open, **tier I is 125 $3030** — 62.5 burned, 62.5 to the
studio. The token count for tiers II–IV is worked out from the **live price on the day that tier
opens** and then **locked for that tier**.

⛔ **DO NOT PUBLISH A BURN PERCENTAGE.** Holding the old 30.7% would need ~570 tokens a pack ≈
**$46**. The site reports **live burn** (`maxTotalSupply() − totalSupply()`) and the live studio
total instead. Full record: `docs/PACK-PRICING.md`.

- [ ] Run `--preview` at the real cap and **confirm the printed opening price is still ≈$0.08**
      before `--yes`. If it has moved materially, `docs/PACK-PRICING.md` is re-derived first —
      the tier-I token count is the number the site will charge.

✅ **The reserve seed is 0, and that is settled too.** Two documents recorded a ~10,000 RARE seed;
the model printed 0. **Zero is right** — there is no bid below spot on day one, so the first
seller walks the curve down alone. Say it plainly; do not let a collector discover it.

---

## Supply: 3,030,000

⛔ **CHANGED ON LAUNCH DAY, 2026-08-06** — artist: *"mainnet plan should be 3,030,000 tokens
$3030"*. The supply and the ticker are now the same number, which is the version of this decision
that explains itself to a stranger. It also returns to the figure the project started from, before
the 33,000,000 detour and the 3,300,000 correction.

Run `npm run model`; `scripts/token-model.mjs` is the **only** declaration, and `npm run test:name`
reads the cap out of it to check every deploy command and every public page. There is deliberately
no second copy of this number anywhere.

⛔ **`maxTotalSupply` IS FROZEN AT DEPLOY.** `--total-supply 3030000` must be on the command line;
the CLI's silent default is **1,000,000**, which is exactly how the Sepolia edition ended up with a
cap nobody chose.

⚠ **The old cap table that lived here has been removed.** Every figure in it (1,014,375 burned,
30.7%, 1.44×, 44.4%) assumed a **$0.02** token and a fixed **350–1,200** tokens per pack. Both
assumptions are dead. The reasoning that picked 3.3M still stands and is kept in
`docs/STATE-OF-PLAY.md` as history.

⛔ **The one rule that survives unchanged: the burn and the studio slug are the same arithmetic
and may never be quoted apart.** The 50/50 split sends the same number of tokens to the fire and
to the studio. `token-model.mjs` still refuses to print one without the other.

⚠ It is **not** a scarcity engine, and nothing here should be sold as one.

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
      paid nothing, while the pages say half funds the studio. Full sequence: **runbook step 4**.
      ⚠ Both constructor addresses are `immutable`. A wrong treasury is a redeploy, not a setting.
      ⚑ **Blocked on the edition** — `token` is the edition address, so this cannot be deployed to
      mainnet until the edition is. On Sepolia it can be rehearsed today.
      ⚑ `node scripts/lens-cli.mjs sink-check` answers every reason to abort **with no key and no
      gas**, including the one nothing used to check: whether the token can actually `burn`.
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
4. **`PackSink` — four steps, and it CANNOT start before step 2.** Its `token` argument is the
   edition and it is `immutable`, so until the edition exists there is nothing to point it at.
   ⚑ The gap is not dangerous, only work: the site is still on Sepolia at this point, so **no one
   can buy a pack in the window between the edition landing and the sink landing.**
   - 4a. `node scripts/lens-cli.mjs sink-check` — **no key, no gas.** Proves the token has
     bytecode, that it really exposes `burn(uint256)` (PackSink calls it inside `_split`; a token
     without it bricks the contract forever), that the treasury is an EOA, and that both match
     `chain-config`. Do this BEFORE holding a key.
   - 4b. Deploy. **Remix is the recommended route** — `contracts/PackSink.sol` has *zero* imports,
     so unlike the lens there is nothing to flatten: paste the file, solc **0.8.24 + optimizer 200
     runs**, Injected Provider, constructor `(token, treasury)`. ~2,000 bytes, 0 warnings.
     CLI alternative: `node scripts/lens-cli.mjs deploy-sink` (refuses to run if either argument
     disagrees with `chain-config`; `--force` to override deliberately).
   - 4c. `node scripts/lens-cli.mjs sink --at 0x…` — keyless read-back of both `immutable` args.
     ⚠ **Read them. This is the last moment either one can be wrong for free.**
   - 4d. Paste into `chain-config.contracts.packSink`. That ONE edit turns the split on site-wide;
     `RipWallet.hasSink()` then reports it as real.
   Then the lens, per `docs/DEPLOY-LENS.md`. Push; confirm live.
   ⛔ **`npm run test:name` FAILS if `network` is `mainnet` while `packSink` is empty**, so this
   cannot be silently skipped — the pages state the 50/50 split as fact, and an empty slot means
   every pack burns 100% with the studio paid nothing. Deploy it, or change the copy. Shipping
   resolves neither.
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
