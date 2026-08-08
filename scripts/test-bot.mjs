#!/usr/bin/env node
/* ripmaster3030studios — `npm run test:bot`
 *
 * Guards the executor's RAILS, which are the only reason a hot key is allowed to exist. No network:
 * every assertion is a pure call against `bot/lib/rails.mjs`.
 *
 * ⛔ THE LOAD-BEARING ASSERTIONS ARE THE REFUSALS. "It permits a good trade" is trivially true of a
 *   function that permits everything, so every cap is tested from BOTH sides — permitted just
 *   under, refused just over — and the destination allowlist is tested against an address that
 *   looks almost right.
 */
import { RAILS, check } from '../bot/lib/rails.mjs';

let pass = 0, fail = 0;
const ok = (c, n, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? '  — ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? '  — ' + d : ''}`); } };
const H = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 72 - s.length))}`);

const ROUTER = '0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af';
const TREASURY = '0x8455cF296e1265b494605207e97884813De21950';
/* ⛔ THE FIXTURE IS DERIVED FROM THE RAILS, NOT PINNED. It hard-coded valueEth 0.05 and broke the
 *   moment the default stake dropped to 0.01 — twelve assertions went red because the FIXTURE was
 *   stale, not the code. A test whose setup restates a value the code owns has two sources of
 *   truth and fails on the wrong one. */
const base = { toAddress: ROUTER, valueEth: RAILS.maxPerTrade, spentTodayEth: 0,
  walletBalanceEth: Math.min(RAILS.maxWalletBalance, RAILS.maxPerTrade * 4), hourUTC: 20, live: true };
const w = o => check({ ...base, ...o });

H('1 · the happy path exists, or every refusal below is vacuous');
ok(w({}).ok, 'a good trade inside every rail is permitted');
ok(w({ toAddress: TREASURY }).ok, 'the treasury is a permitted destination (the skim)');

H('2 · the destination allowlist');
ok(!w({ toAddress: '0x0000000000000000000000000000000000000001' }).ok, 'an arbitrary address is refused');
/* ⚑ One character off the real router. A stolen key that can only reach two addresses is a bounded
 *   loss; an allowlist that accepts a near-miss is not an allowlist. */
ok(!w({ toAddress: '0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Ff' }).ok, 'an address differing in the last two chars is refused');
ok(!w({ toAddress: '' }).ok, 'an empty destination is refused');
ok(w({ toAddress: ROUTER.toLowerCase() }).ok, 'but case does not matter — checksums are cosmetic, bytes are not');
ok(/allowlist/.test(w({ toAddress: '0x0000000000000000000000000000000000000001' }).why), 'and it says WHICH rail it hit', w({ toAddress: '0x0000000000000000000000000000000000000001' }).why);

H('3 · the caps, from both sides');
ok(w({ valueEth: RAILS.maxPerTrade }).ok, 'exactly at the per-trade cap is allowed');
ok(!w({ valueEth: RAILS.maxPerTrade + 1e-9 }).ok, 'a hair over the per-trade cap is refused');
ok(!w({ valueEth: 0 }).ok, 'a zero-value trade is refused');
ok(!w({ valueEth: -1 }).ok, 'a negative value is refused');
ok(w({ spentTodayEth: RAILS.maxPerDay - RAILS.maxPerTrade }).ok, 'the last trade that fits the daily cap is allowed');
ok(!w({ spentTodayEth: RAILS.maxPerDay - RAILS.maxPerTrade + 1e-9 }).ok, 'the one after it is refused');
ok(!w({ valueEth: RAILS.maxPerTrade, walletBalanceEth: RAILS.maxPerTrade / 2 }).ok, 'it will not spend more than it holds');

H('4 · the balance ceiling — the rail that bounds the worst case');
/* ⚑ Caps on SPENDING do nothing if the wallet is accidentally funded with 10 ETH. The ceiling is
 *   what makes the maximum possible loss a number somebody chose. */
ok(!w({ walletBalanceEth: RAILS.maxWalletBalance + 0.0001 }).ok, 'an over-funded wallet refuses to operate at all');
ok(w({ walletBalanceEth: RAILS.maxWalletBalance }).ok, '…and exactly at the ceiling is still fine');
ok(/over-funded|ceiling/.test(w({ walletBalanceEth: 5 }).why), 'and it explains why rather than looking broken', w({ walletBalanceEth: 5 }).why);

H('5 · the window and the dry-run default');
for (const h of RAILS.hoursUTC) ok(w({ hourUTC: h }).ok, `${h}h UTC is inside the depth window`);
for (const h of [0, 7, 12, 18]) ok(!w({ hourUTC: h }).ok, `${h}h UTC is refused`);
ok(!w({ live: false }).ok, '⛔ LIVE unset refuses to trade — dry run is the DEFAULT, not a flag you remember');
ok(/LIVE/.test(w({ live: false }).why), 'and says so plainly');

H('6 · the treasury is a destination, never a signer');
ok(RAILS.allowedTo.includes(TREASURY.toLowerCase()), 'the cold treasury is on the allowlist so the skim can land');
ok(RAILS.skimBps > 0 && RAILS.skimBps <= 10000, 'the skim is a real fraction', RAILS.skimBps / 100 + '%');
/* ⛔ Nothing in the rails may name a key, a seed or a mnemonic. The treasury is a cold Ledger and
 *   the whole ratchet depends on its key being absent from this system. */
const src = (await import('node:fs')).readFileSync(new URL('../bot/lib/rails.mjs', import.meta.url), 'utf8');
ok(!/PRIVATE_KEY|mnemonic|seed phrase|0x[0-9a-fA-F]{64}/.test(src), 'the rails file contains no key material of any kind');

H('7 · the trading rules match what was measured');
ok(RAILS.tpPct === 0.20, 'take-profit is the wide one the sweep chose, not a narrow one that lost');
ok(RAILS.slPct > RAILS.tpPct, 'the stop is wider than the target — the tight-stop config was chopped to -92%');
ok(RAILS.hoursUTC.length === 5 && RAILS.hoursUTC[0] === 19, 'the window is the measured 19-23h UTC volume block');

/* ── sizing and manage-only ─────────────────────────────────────────────────── */
H('8 · the stake is sized from env, and the ceiling moves with it');
ok(RAILS.maxPerTrade > 0 && RAILS.maxPerTrade <= 0.05, 'the default stake is small', RAILS.maxPerTrade + ' ETH');
ok(RAILS.maxWalletBalance > RAILS.maxPerTrade, 'the ceiling is above the stake, or every trade would be refused');
ok(RAILS.maxPerDay >= RAILS.maxPerTrade, 'the daily cap allows at least one trade');
/* ⛔ The cost curve is why a small stake is acceptable: the toll is the hook's 1%/leg at every
 *   size, so shrinking the stake gives up very little. Asserted so nobody "optimises" the stake
 *   upward believing the fee scales away. */
const cost = usd => (usd * 0.02 + 0.063) / usd * 100;
ok(cost(20) < 2.4 && cost(96) > 2.0, 'a $20 stake costs 2.31% against $96 at 2.07% — 24 bps, not a cliff', `${cost(20).toFixed(2)}% vs ${cost(96).toFixed(2)}%`);
ok(cost(5) > cost(20), 'but it does get worse below ~$10 as gas stops being negligible', `$5 = ${cost(5).toFixed(2)}%`);
ok(typeof RAILS.manageOnly === 'boolean', 'manage-only is a real flag');

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
