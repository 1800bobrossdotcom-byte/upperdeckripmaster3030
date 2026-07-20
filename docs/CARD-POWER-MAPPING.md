# CARD → POWER MAPPING · $UR3030 in-game armory

**Status: working spec.** The mapping below is LIVE in the games today via
`js/card-powers.js` (`window.RipPowers`), computed client-side from the local
card vault. The onchain-verification path (bottom) is the Phase-2 plan for
making the same mapping trustlessly readable from the Liquid Edition itself —
it is NOT live yet and is labeled accordingly wherever players see it.

---

## 1 · The armory model

Cards are not cosmetics — staked into a game they ARM you. Every card
contributes to a **loadout** with five amplifier axes plus gun/power-up
unlocks, and the whole loadout is scaled by **live chain heat** (hotter
market → hotter cards):

```
loadout = RipPowers.loadout(cards, market)
        = { dmg, rate, shield, speed, score, guns[], powerups[], amp }
```

## 2 · Per-card contribution (live today)

Source of truth: `js/card-powers.js`.

| Card field | In-game effect | Formula |
|---|---|---|
| `atk` (0–10) | damage amplifier | `dmg += atk × 0.028 + w × 0.05` |
| `def` (0–10) | shield charges | `shield += def × 0.10 + rank × 0.35` |
| rarity rank `r` (common 0 → prizm 4) | weight `w` | `w = [1, 1.35, 1.8, 2.4, 3.2][r]` |
| rarity weight `w` | rate of fire | `rate += w × 0.03` |
| rarity weight `w` | speed / score | `speed += w × 0.015` · `score += w × 0.06` |

### Rarity unlocks
| Rank | Unlock |
|---|---|
| rare+ (2) | **SPREAD** gun |
| mythic+ (3) | **LASER** |
| prizm (4) | **OVERDRIVE** power-up (rapid bursts) |
| `def ≥ 4` | **SHIELD** power-up |

### Trigger guns
Each card's market trigger maps to a gun it can activate
(`RipPowers.TRIGGER_GUN`):

| Trigger | Gun |
|---|---|
| GAS STORM | rapid |
| STILL AIR | twin |
| BURN WAVE | spread |
| MOON CANDLE | laser |
| RUG WIND | bomb |
| DEEP WATER | shield |
| BLOCK OMEN | pierce |
| WHALE SONG | homing |

### Market coupling (live today)
`RipPowers.pollMarket()` reads the latest block's gas ratio →
`heat ∈ [0.7, 2.6]` → amplifier `amp ∈ [0.75, 1.7]` applied to every axis.
The chain literally turns the damage dial.

## 3 · Where each axis lands per game

| Axis | DOGFIGHT | RIP ROCKETER | SECTION 9 |
|---|---|---|---|
| `dmg` | bolt damage mult (`emitBolt`) | gun damage | weapon damage (planned) |
| `rate` | burst cadence (`tryFire`) | fire cadence | reload/cadence (planned) |
| `shield` | +8 hp per charge, max-hp bump | hull bonus | armor bonus (planned) |
| `speed` | thrust ceiling nudge | scroll/boost | sprint (planned) |
| `guns[]` | weapon-level unlocks | gun level | slot unlocks (planned) |
| `overdrive` | rapid without pickup | — | — |

Cards are also the **stake**: a full pick rides the pot and moves on a real
wager — you can arm yourself with them AND lose them.

## 4 · Onchain verification path (Phase-2 — NOT live)

Today the vault is a local-browser prototype (localStorage). The Phase-2 goal
is that the SAME mapping above becomes verifiable against the chain:

1. **Ownership**: a wallet's $UR3030 balance (ERC-20 `balanceOf`) gates how
   many cards it may field; per-card identity comes from the card registry
   manifest hash committed alongside the render contract.
2. **Attributes onchain**: `atk / def / rarity / trigger` published as a
   merkle root (manifest → root in the render contract) so a client — or an
   opponent — can verify a fielded card's stats with a proof, not trust.
3. **CLI surface (PROPOSED — to be confirmed against the Rare CLI's actual
   extension points before any of it is promised publicly):**
   - `rare liquid cards loadout <address>` → resolve owned cards → print the
     computed loadout (same formulas as §2, shared JS module).
   - `rare liquid cards verify <slug> <proof>` → check a card's stats against
     the onchain root.
   - `rare liquid cards arm <slugs...>` → sign an "armory manifest" message
     the game lobbies accept as proof-of-loadout.
4. **Games consume proofs, not claims**: dogfight's PvP lobby already carries
   a `sig` field end-to-end; the armory manifest slots into the same envelope.

Until Phase-2 ships, every player-facing surface labels card pulls, the
binder, and card powers as a **testnet-era prototype** — the token burn is
real; the card layer is local.
