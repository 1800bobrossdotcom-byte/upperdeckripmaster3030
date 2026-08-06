# ripmaster3030studios — STATE OF PLAY

**Written 2026-08-05. Launch target: 2026-08-06, 11:11 PM ET (`2026-08-07T03:11:00Z`).**
**Prepared for an outside audit.** Everything here is either measured or explicitly flagged as an
assumption. Where a number is unverified, it says so — that is the most useful thing this document
can do.

> **NFA.** $3030 is an experimental art token. It can go to zero. Nothing in this document is
> financial advice, and nothing here should be read as legal or tax guidance — the funding and
> vesting section is a menu of *mechanisms* with trade-offs, not a recommendation, and anything
> touching securities, tax or jurisdiction needs a professional who is not me.

---

## 0 · THE ONE-PARAGRAPH VERSION

A card-and-game studio launching an ERC-20 SuperRare **Liquid Edition** (`$3030`) whose tokens are
burned to rip packs of trading cards, and whose cards are **lenses** — ERC-721 renders driven by
live on-chain state. The site is built: nine public pages, four arcade cabinets, a 100-card deck
model, a working generative card press, a Sepolia dress rehearsal that has already proven a real
buy-and-burn end to end. **The creative surface is deliberately unfinished and shipping as open
studio.** What must be finished is the token, the lenses and the contracts — and of those, two
contracts are written, tested and **not yet deployed**, and one economic input (the opening price)
has never been measured.

---

## 1 · WHAT MUST BE RIGHT vs WHAT IS ALLOWED TO BE ROUGH

A standing directive, and it is load-bearing for reading everything below:

> Work like we don't have a deadline. The **only** things that must ship finished are the
> **contract, the lenses and the token functionality.** Everything creative is **open studio, work
> in progress** — agreed with SuperRare.

So: an unfinished game is on-plan. An unmeasured opening price is not.

---

## 2 · SITE STRUCTURE

**Front door** `index.html` — marquee, rigged 3D wordmark, countdown, tier strip, the rite, a
"what is this" facts panel. Links: the deck, the folder, the arena, the arcade, and the four
generated documents.

| surface | what it is | state |
| --- | --- | --- |
| `cards/` (**the deck**) | 196 placeholder cards, rarity-laddered, burn-to-vote rarity court | ⚠ placeholders; clean-slate pending |
| `cards/binder.html` (**the folder**) | nine-pocket binder you turn; pull a card into a starfield 3D viewer | built |
| `cards/market.html` | vault + listings, local-only testnet prototype | built, local storage only |
| `cards/battle.html` | card duel with wager reveal | built |
| `cards/field.html` | **cards 34–100**, the 67 generative field lenses | **new** |
| `cards/proof.html` | **PLATE PROOF** — card 1 of the 33, a disposable prototype | **new** |
| `arcade.html` | the cabinet menu | built |
| `whitepaper` · `tokenomics` · `audit` · `artist` | generated documents (+ PDF deck) | built, regenerated from the model |
| `superrare.html` / `cabinet.html` | what a token's `animation_url` frames — **wallet-free by rule** | built, proven on Sepolia |

**Pre-launch gate** is ON site-wide (`gate.js`) and is a **soft veil** — it runs client-side. Use
platform deployment protection for anything that genuinely must not be reached.

**Reachability is machine-checked** (`npm run test:reach`, 182 assertions). It walks from the home
page and asserts every surface is within three clicks — added after a real failure where the deck
rendered 197 cards and carried exactly one link out.

---

## 3 · MECHANICS

### The token loop
Buy `$3030` on the SuperRare curve → **rip a pack** → **50% of the pack burns, 50% funds the
studio** → you get cards. Burns are permanent; supply only falls.

⚑ The split **cannot** be two client-side transactions. A wallet can sign the burn and reject the
transfer, leaving a collector's tokens destroyed, the studio unpaid and no pack owed — and no
ordering fixes it, because there is no atomicity between two signatures. Hence **`PackSink.sol`**:
no owner, no admin, no upgrade, no pause, both addresses `immutable`, holds nothing between calls,
1,773 bytes. With no external audit, *"small enough to read in one sitting"* is the entire safety
argument.

### The deck — 100 cards
- **33 hero 1/1s** (cards 1–33): 11 SuperRare auctions + 11 gacha pack-claims + **11 earned
  titles**.
- **67 field lenses** (cards 34–100): render-only, no mint.
- **Lovebeing**: holder-bound, one per wallet, non-transferable, non-burnable.

⛔ **The earned tier cannot be self-serve.** Every score in this project lives in `localStorage`, so
a player with devtools can claim any run in seconds — and a hero 1/1 is real value. The fix was
already built: `claimHero()` mints only against an EIP-712 voucher, so a **human decides and the
chain enforces it.** That inverts the problem usefully — because a person verifies before signing,
the criteria can be arbitrarily hard and need not be machine-checkable. Nothing keys on holding,
ripping or burning *more*: a balance is borrowable for one block, a feat is not.

### Staking = the lens reads your balance
No staking contract, no emissions, nothing to drain. `tierOfHolder()` reads the owner's `$3030` and
the render changes: **Ash · Spark · Ember · Flame · Inferno**, anchored on the launch pack (125 / 1,250 /
12,500 / 125,000 — one pack, ten, a hundred, a thousand). **The art acknowledges you; it does not
pay you.** SuperRare's own docs name holder balances as a documented render input.

### The games — four cabinets
| cabinet | what it is |
| --- | --- |
| **THE CITY** | 3.84 km generated city, streamed. Three modes in one world: **animal** (bird/squirrel/cat/dog — invincible observers), **dogfight** (jets), **section 9** (ground firefight). Drivable cars. The hook: **a photograph you take becomes a card.** |
| **RIP ROCKETER** | vertical shooter; its 25-token launch fee goes 100% to the treasury |
| **CLOUD RACER** | racer |
| **THE ARENA** | card duel |

⚑ **The invincible animal is what makes three modes share one world.** A mellow game and a tactical
shooter cannot coexist as peers; they can if the animal is a **witness** — it cannot be hurt,
targeted or armed, so a firefight two streets over becomes *weather*. Enforced structurally: the
target list is built in one place and reads a `targetable` flag, so an animal is absent *before*
teams are considered. **A photograph of someone else's war is a better card than a kill count.**

Games wager `$3030` + cards into a pot; a ~10% rake burns (real, on-chain); the podium takes
50/30/20. Cards transfer, never burn in-game. **Real pot escrow is Phase-2.**

### Three doors into one lobby (`docs/SEATS.md`)
**A** holder (balance) · **B** collector (owns a lens) · **C** visitor (paid arcade fee). Entry is
**read-only** — each door reads its own chain over a public RPC — so it needs no contract and ships
now. ⚠ **A seat is advisory**: nothing verifies it server-side, so no real value may depend on it
until a backend does.

---

## 4 · THE CARD PRESS (new, and the most concrete thing built this week)

A card is a **seed**, not a file. `js/hero-card.js` turns a seed into a specific permanent card, so
the whole field is 67 numbers and 67 names and re-paints itself when the deck's art changes.

**The card is a four-colour separation of a composition made out of the deck itself.** Each ink is
laid down at its own registration and screened at its own angle (15/75/0/45), so the
mis-registration and the moiré don't get *applied* — they **fall out of printing one picture four
times with the plates slightly wrong.** Ink multiplies the paper's reflectance and never adds,
which is the one line keeping it a card rather than a screen.

- **PBR material**: bare stock (rough, directional paper fibre), ink film (smoother — a wet film
  dries flatter than the paper under it), a spot varnish that fills the tooth as well as smoothing
  it, and a **metallic** die edge with a diffraction grating as its reflectance.
- **The animation lives in Z and loops.** Nothing slides across the picture plane; the layer stack
  travels *through* the card's thickness and once per revolution it lands flat and the print
  resolves. The loop is measured continuous across the seam, not merely equal at its ends.
- **Frames are set from type** — border sorts, the way a printer actually makes a border — from the
  same 68-glyph alphabet of committed outlines that sets the name. **Rarity picks the family, the
  seed picks the frame**, so no two cards share a border and the tier is readable off the edge.
- **"Glow" is foil, not light.** An emissive glitch makes it a screen; a rare card carries more
  metal, so its border is dark until you turn it and then it flares.
- **No font ships and none is named** — a 1/1's permanent artwork must not depend on what the
  collector has installed.
- **It is a live lens**: burn / price / depth read over a public RPC, read-only, **never a wallet**.

35 measurements guard it (`npm run test:hero`), each proved to bite by deliberately breaking the
thing it measures.

⚠ **Open, and the artist's**: the burn end state reads as *a worse print* rather than a card that
has been through something; where the figure sits is authorship, not a seed; and the 33 names.

---

## 5 · THE ECONOMY — live numbers from `npm run model`

**Supply 3,300,000. Opens ≈$0.08/token — MEASURED on the mainnet preview (low-demand preset, zero
initial RARE liquidity, no creator allocation), not assumed.** ⚠ M = 10 is still an assumption.

⛔ **The pack is priced in DOLLARS and no burn percentage is published.** The token count is
re-derived from the live price when each tier opens and then locked for that tier, so only tier I's
is knowable today. Full reasoning: `docs/PACK-PRICING.md`.

| tier | packs | price | $3030/pack | burned | → studio |
| --- | --- | --- | --- | --- | --- |
| I | 1,600 | **$10** | **125** | 62.5 | 62.5 |
| II | 1,100 | $12 | set at open | half | half |
| III | 600 | $15 | set at open | half | half |
| IV | 260 | $20 | set at open | half | half |

⚠ **The old schedule (350–1,200 tokens, a 30.7% burn) is dead.** It assumed a $0.02 token; at the
measured $0.08 open, 350 tokens is a **$28** pack. Holding the old burn figure would need ~570
tokens a pack — about **$46** — which SuperRare and this repo's own model derived independently and
agreed on to the cent.

**A tier opens when the previous one SELLS OUT — not on a date.** That is a promise about supply,
not about time, and it is honest whether it takes three weeks or three years. A "season" would owe
the public a drop every year forever.

### ⛔ The cost is the mirror image of the benefit and must never be quoted separately
The 50/50 split sends **the same number of tokens** to the fire and to the studio. Any cap that
makes the burn look material makes the treasury look large **by exactly the same arithmetic.**

| cap | four-tier burn | % of mint | contraction | studio as % of surviving float |
| --- | --- | --- | --- | --- |
| 33,000,000 | 1,014,375 | 3.1% | 1.03× — none | ~3.2% |
| **3,300,000 ← settled** | ⚠ see below | *not published* | *not published* | *read live* |

⚠ **This table is HISTORY — it is why 3.3M was chosen, and every figure in it assumed a $0.02
token.** At the measured $0.08 the four-tier burn is a fraction of 1,014,375, and no percentage is
published at all. Kept because the reasoning that picked the cap still stands. Price
risk is small (dumping the slug moves spot ~−6.8%); **concentration risk is the opposite of small.**
It is 1.44×, not a 3× scarcity engine — reaching 3× needs ~618 tokens/pack against today's ~285.

**Treasury** `0x5C3b…d89F`. Rip Rocketer's flat 25-token launch fee goes **100%** to the treasury —
one address, one operation, a plain transfer, no contract needed. Reach for a contract when there
is something to make **atomic**, not by habit.

---

## 6 · ✅ P0 IS MEASURED — and this section's own prediction was right

**Resolved 2026-08-06.** SuperRare ran the live mainnet CLI previews against the full 3,300,000
supply and recommends the **low-demand** preset, **zero initial RARE liquidity**, **no creator
allocation**. It opens at **≈$0.08 per $3030**, with 30% of supply in the gentlest $0.08–$0.16 band.

⚑ **This section predicted "an order of magnitude above the assumed $0.02" from two independent
data points, and it was right** — the answer is **4×**. The pack schedule really was resting on the
one number nobody had measured.

**What it cost:** the 350–1,200 token pack amounts are dead. At $0.08 a 350-token pack is **$28**,
not $7. Packs are priced in **dollars** now — $10 / $12 / $15 / $20 — with the token count derived
at each tier open and locked for that tier.

⛔ **And no burn percentage is published any more.** Holding the old 30.7% would need ~570 tokens a
pack ≈ **$46**. SuperRare derived that from the preview; this repo's model derives the same figure
from the other direction (1,014,375 ÷ 3,560 packs ÷ 0.50 = 570.0 gross tokens, × $0.08 = $45.60).
The site publishes **live burn and studio totals** read from the chain instead of a forecast.
Full record: `docs/PACK-PRICING.md`.

✅ **The reserve-seed contradiction is settled too.** Two documents recorded a ~10,000 RARE seed at
deploy while the model printed reserve = **0**. **Zero was right** — there is no bid below spot on
day one, so the first seller walks the curve down alone. That is a real property of this launch and
should be said out loud rather than discovered.

---

## 7 · STUDIO FUNDING & VESTING — options, not decisions

**Nothing here is decided.** The treasury takes 50% of every pack and 5% of every game rake by
construction, so the studio is revenue-funded rather than pre-funded; there is no allocation, no
round, no team tokens. The open question is what discipline, if any, the studio puts on **its own**
tokens — and the reason it matters is §5: at settlement the treasury is **44.4% of surviving
float**, which is the single most legitimate thing a sceptic can point at.

Four mechanisms, with what each actually buys:

**A · Nothing.** Fastest, most honest about being a small studio, no machinery to get wrong. Cost:
the 44.4% sits there unexplained and every price conversation returns to it.

**B · A public, unenforced policy.** A written commitment — e.g. *no more than X% of the treasury
sold per quarter, published in advance* — with the treasury address public so anyone can check.
Costs nothing, requires no contract, and its whole value is that it is **falsifiable**: an
unenforced promise you can verify against a block explorer is worth more than an enforced one
nobody can read. ⚠ Its weakness is equally plain: it is enforced only by reputation.

**C · A timelock contract.** Treasury receipts flow into a contract that releases on a schedule
(cliff + linear). Enforced by the chain, verifiable by anyone. ⚠ Costs: another contract to write,
review and get right **with no external audit**, and an admin surface that PackSink was deliberately
designed not to have. If it is built, it should inherit PackSink's constraints — no owner, no
upgrade, immutable beneficiary — or it becomes the most attackable thing in the system.

**D · Release keyed to delivery rather than time.** Tokens unlock as *tiers sell out* or as the 33
are minted — the studio is paid as the promise is kept. ⚑ This is the one that best matches the
project's own logic: the whole model already replaced *time* with *supply* when seasons became
tiers, and a milestone unlock says the same thing about the studio's own money. ⚠ It is also the
most complex to specify, and a badly-chosen milestone is worse than a date because it can be gamed
from the inside.

**A reasonable shape, offered as a starting point rather than a recommendation:** **B now** (it
costs nothing and can be published before launch), **D later** if the set gets traction, **C only
if** someone independent reviews the contract. And **whatever is chosen, publish it before launch
rather than after the first sale** — the difference between a policy and a defence.

⚠ Two things I should not be the source on: whether any of this changes the token's legal
characterisation, and the tax treatment of treasury receipts. Both need a professional.

---

## 8 · RISKS AND BLOCKERS, RANKED

| # | thing | why it matters | state |
| --- | --- | --- | --- |
| 1 | ~~P0 unmeasured~~ | **✅ CLOSED 2026-08-06** — measured at ≈$0.08 on the mainnet preview (4× the assumption). Packs are dollar-priced now and no burn % is published. `docs/PACK-PRICING.md` | ✅ resolved |
| 2 | **PackSink + Lens721 not deployed** | the site states a 50/50 split; the code **ships dark** and falls back to a 100% burn until an address is pasted in | ⛔ open — written, tested, deploy path scripted |
| 3 | **Deploy-time permanents** | `name()`, `symbol()`, the lens EIP-712 domain, the lens symbol, and a byline **compiled into the renderer's bytecode** are frozen the moment the transaction lands. There is no setter for the byline. | ✅ all pinned by `npm run test:name`; **`--preview` first, read it back, then `--yes`** |
| 4 | **No external audit** | Sepolia rehearsal + internal review is the entire safety net. SuperRare states plainly that they do not QA custom renderers. | accepted (artist's call) |
| 5 | **Treasury concentration 44.4%** | the most legitimate criticism available; §7 is the answer or there isn't one | ⛔ decision open |
| 6 | **Reserve seed 10k vs 0** | decides whether there is any bid below spot on day one | ⛔ contradiction unresolved |
| 7 | **WalletConnect domain allow-list** | a Reown project id is allow-listed **by domain**. On a host that is not on the list, mobile wallet connect does not degrade — it **fails**, at the moment someone is trying to rip. Not a code change. | ⛔ **action required before launch** |
| 8 | **Never tested on a real phone** | all mobile numbers are from software GL in a container; they are relative only | ⛔ open |
| 9 | **Deck is placeholders** | 196 stand-ins; the real 100 are being made | on-plan |
| 10 | **Seats are advisory** | nothing verifies them server-side | documented; no real value depends on them |

---

## 9 · WHAT TO ASK SUPERRARE

Their public documentation does **not** state: the creator revenue model; the buy/sell fee split and
who receives it; the curve mechanism and whether/when an edition graduates to a DEX; and how the
opening price is set. **Do not model revenue until they answer.** Graduation is load-bearing for
liquidity — before it there is nothing to provide liquidity *to*, since curve depth is placed once
at deploy with no documented top-up path.

---

## 10 · WHAT I WOULD WANT AN AUDIT TO PUSH ON

Not a checklist — the places where I think the reasoning is thinnest:

1. **Is a 44.4% treasury survivable as a public position**, and does §7-B actually help or does it
   just draw attention?
2. **Is the pack priced in tokens the right primitive at all?** It is what makes the burn
   cap-independent, and it is also what makes the dollar price hostage to P0.
3. **Does "a tier opens when the last sells out" have a failure mode** if tier I *doesn't* sell out
   — is a stalled programme worse than a missed date?
4. **Is shipping the 50/50 split dark acceptable**, given the site already states it? The fallback
   is a 100% burn, which is *more* deflationary and *less* funded — a defensible failure, but it is
   not what the page says.
5. **The earned-titles tier depends on a human signer.** That is a person who can be pressured, and
   the private key is hot all season. Is the voucher design's inversion actually a win?
6. **Everything creative is open studio.** Is that a real position or a way of shipping unfinished
   work? It was agreed with the platform — but it is worth being challenged on.

---

*Generated from the repository at the date above. Numbers in §5 come from `npm run model`; the
Sepolia figures in §6 come from a keyless on-chain pre-flight (`npm run preflight`) run against a
live block, not from memory.*
