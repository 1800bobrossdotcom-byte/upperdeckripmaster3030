# LAUNCH CHECKLIST — $UR3030 · Season I

**T-0: August 6, 2026 · 11:11 PM ET** (`2026-08-07T03:11:00Z`).
Confirmed by the artist 2026-07-27. The landing countdown already targets exactly this.

> August in New York is **EDT** (UTC−4), so "11:11 PM EST" resolves to 11:11 PM EDT =
> `03:11Z`. Verified against the tz database — no change needed to `index.html`.

---

## Status: the critical path is CLEAR

All four items that were blocking everything else closed on 2026-07-27:

| Was blocking | Resolution |
|---|---|
| Launch date ambiguity (Aug 6 vs Oct 6) | **Aug 6, 2026 · 11:11 PM ET.** Confirmed. |
| SuperRare deploy path (assisted vs self) | **Assisted — SuperRare deploys.** We do not self-deploy. |
| Curve calibration | **SuperRare's**, they walk the artist through it. |
| Render contract redeploy | **Done on dev + proven** — the token page renders the live site. |

Nothing on the remaining list depends on an outside answer. It is all execution.

---

## ⚑ The one irreversible step

**The token's `name()` must read `upperdeckripmaster3030`** — one word, lowercase.

Because the deploy is **assisted**, the name is whatever we hand SuperRare. So:

1. Give SuperRare the string **in writing**, copy-pasted, not retyped.
2. After they deploy and **before any announcement**, read `name()` back off the
   deployed contract and compare it character by character.

The Sepolia test token has the title-case name baked in and cannot be fixed. That is the
precedent — assume the same permanence here. Everything else on this page is recoverable;
this is not.

---

## Artist / SuperRare track

- [ ] Hand SR the token name string; re-read `name()` post-deploy before announcing.
- [ ] Walk the curve calibration with SR. The uncalibrated Sepolia curve
      (1 UR3030 ≈ 16 RARE) does **not** carry over — the launch curve sets the opening
      price and is hard to walk back.
- [ ] Deploy from the **SuperRare-linked wallet**, or the token won't surface on
      superrare.com.
- [ ] Repeat the render-contract step on mainnet: deploy, then "Update Render Contract",
      then confirm the token page renders the site in its media slot (proven on dev).
- [ ] Decide the deck question below.

## Site track

- [ ] **Clean-slate the deck.** `cards/manifest.json` currently holds **196 placeholder
      cards**. Build the empty-deck path + ingest pipeline first, pour real art in as it
      lands. Every consumer must survive zero cards: gallery, binder, pack rip,
      `card-powers`, and NEON RONIN's card-gated fighter unlocks.
- [ ] **Mainnet flip.** `js/chain-config.js` is the single switch — `js/wallet.js` already
      picks `dev.superrare.co` vs `superrare.com` off `chainId`, so the testnet/prod split
      is automatic. Audit the stray Sepolia references in `riprocketer.html`,
      `deploy-render.html`, `js/card-powers.js`. Add a wrong-network guard.
- [ ] **Smoke test on mainnet** — a real buy, a real rip, a real burn — before doors open.
- [ ] **Mobile on real hardware.** Never done. The `HEAVY_OK` device budget was added blind
      after a mobile-broken report and has never been confirmed on a phone. Phones will be
      most of the traffic arriving from a SuperRare token page.
- [ ] **Lift the gate.** `gate.js` is injected into all 13 pages and ships its password in
      page source. Decide remove-vs-coming-soon-veil, and rotate the password regardless.
- [ ] **Final copy + NFA pass** across the public pages against model v2.2.

---

## Explicitly deferred to post-launch

Named here so they don't quietly consume the runway:

- **Real-money wagering.** Needs escrow + anti-cheat + ideally an audit. The games ship as
  free play with the burns that are already real on-chain — which is the on-ethos version
  anyway: *the win is the having-done-it.*
- **Seat server verification.** Seats stay advisory; nothing of value depends on
  `seat.ok`, and `docs/SEATS.md` says so in as many words.
- **Lens voucher mint, Section 9 stage-3 maps, NEON RONIN character work.** All good work,
  none of it launch-critical.

---

## The decision to make before day 7

**If the 100 handmade cards are not finished by Aug 6, what ships?**

Launching with the token live, the site live, and the deck marked *Season I incoming* is a
legitimate and honest option. Launching with 196 placeholder cards presented as the deck is
not — it would undercut the one thing the project is actually about.

Decide this early, while it's a plan rather than a scramble.

---

## Launch-night runbook

1. SuperRare deploys the token. **Read `name()` back. Stop if it is wrong.**
2. Deploy + set the render contract; confirm the token page renders the site.
3. Flip `js/chain-config.js` to mainnet with the real addresses; push; confirm live.
4. Smoke test: buy → rip → burn. Confirm `totalSupply` moves.
5. Lift the gate.
6. Countdown flips itself at `03:11Z` — no manual step.
7. Announce.

**Rollback:** the site is a Vercel deploy from `main`, so any site-side mistake is one
revert away. The token is not. That asymmetry is why steps 1–2 get read back twice and
steps 3–5 can move fast.

---

*NFA. Experimental art token — it can go to zero. Keep the disclaimers loud.*
