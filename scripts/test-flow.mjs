#!/usr/bin/env node
/* ripmaster3030studios — `npm run test:flow`
 *
 * Guards the tape reader (`scripts/flow.mjs`) and the pool scanner (`mm scan`). Both are
 * MEASUREMENT tools, and a measurement tool fails in the one way that matters here: it returns a
 * confident number that is wrong. So almost every assertion below is about the GUARD rather than
 * the happy path — does the self-check actually bite, does a hook's powers decode to something
 * that DISCRIMINATES, is "unread" distinguishable from "zero".
 *
 * ⛔ NO NETWORK. Every assertion runs against synthetic logs, because a suite that needs an RPC
 *   fails for reasons that have nothing to do with the code and then gets ignored.
 */
import { replay } from './flow.mjs';
import { hookPowers } from './mm.mjs';

let pass = 0, fail = 0;
const ok = (c, name, detail = '') => { if (c) { pass++; console.log(`  ok   ${name}${detail ? '  — ' + detail : ''}`); } else { fail++; console.log(`  FAIL ${name}${detail ? '  — ' + detail : ''}`); } };
const H = (s) => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 74 - s.length))}`);

const ZERO = '0x0000000000000000000000000000000000000000';
const A = '0x00000000000000000000000000000000000000aa';
const B = '0x00000000000000000000000000000000000000bb';
const C = '0x00000000000000000000000000000000000000cc';
const L = (from, to, value, blockNumber = 1) => ({ blockNumber: BigInt(blockNumber), logIndex: 0, args: { from, to, value: BigInt(value) } });

/* ═══ 1 · the holder reconstruction ═══════════════════════════════════════════════════════ */
H('1 · replay(): balances rebuilt from Transfer logs');
{
  const { bal } = replay([L(ZERO, A, 1000), L(A, B, 300), L(B, C, 100)]);
  ok(bal.get(A) === 700n, 'a mint then a send leaves the right balance', `A=${bal.get(A)}`);
  ok(bal.get(B) === 200n, 'the middle hop nets out', `B=${bal.get(B)}`);
  ok(bal.get(C) === 100n, 'the tail receives', `C=${bal.get(C)}`);
  let sum = 0n; for (const v of bal.values()) sum += v;
  ok(sum === 1000n, 'the rebuilt total equals what was minted', `${sum}`);
  ok(!bal.has(ZERO), 'the zero address is never a holder');
}
{
  /* ⚑ A burn must REDUCE the reconstructed supply, or the self-check would pass on a token that
   *   has burned and the holder table would be silently inflated. */
  const { bal } = replay([L(ZERO, A, 1000), L(A, ZERO, 250)]);
  let sum = 0n; for (const v of bal.values()) sum += v;
  ok(sum === 750n, 'a burn to 0x0 reduces the rebuilt supply', `${sum}`);
  ok(bal.get(A) === 750n, 'and it comes out of the burner');
}
{
  const { bal } = replay([L(ZERO, A, 500), L(A, B, 500)]);
  ok(!bal.has(A), 'an address emptied to zero drops out of the holder set entirely');
  ok(bal.size === 1, 'so the holder count is holders, not addresses ever touched', `size=${bal.size}`);
}

/* ═══ 2 · THE SABOTAGE — the self-check must catch a dropped window ══════════════════════ */
H('2 · a dropped window must break the totalSupply check');
{
  /* This is the assertion the whole tool rests on. `loadTape` refuses to report when the replayed
   * sum does not equal totalSupply(); if a missing chunk could still sum correctly, that refusal
   * is decoration. Here the "chain" is a mint plus three sends, and we drop one. */
  const full = [L(ZERO, A, 1000, 1), L(A, B, 100, 2), L(A, C, 200, 3), L(B, C, 50, 4)];
  const supply = 1000n;
  const sumOf = ls => { const { bal } = replay(ls); let s = 0n; for (const v of bal.values()) s += v; return s; };
  ok(sumOf(full) === supply, 'the complete tape reproduces totalSupply exactly', `${sumOf(full)}`);

  /* Dropping a pure A→B transfer conserves the total — that is REAL and it is the limitation
   * worth stating: the check catches a missing MINT or BURN, not a missing internal hop. */
  const dropHop = full.filter((_, i) => i !== 1);
  ok(sumOf(dropHop) === supply, '⚠ dropping an internal transfer does NOT break the sum — a known blind spot', `${sumOf(dropHop)}`);

  /* But dropping the mint — the actual failure that happened on the first live run — must bite. */
  const dropMint = full.filter((_, i) => i !== 0);
  ok(sumOf(dropMint) !== supply, 'dropping the MINT breaks the check, which is the bug that really occurred', `${sumOf(dropMint)} != ${supply}`);
  /* ⚑ AND THE RESIDUE IS NOT ARBITRARY, WHICH IS WHAT MAKES THE FAILURE READABLE RATHER THAN
   *   JUST LOUD. Every transfer between two non-zero addresses nets to zero, so with the mint
   *   gone the sum collapses to exactly MINUS whatever has been burned. Nothing burned here, so
   *   it is 0; on the live FWA tape it was −4,841,583.275287090655949122, and that number IS the
   *   lifetime burn — which is how the first run told me the mint was missing rather than merely
   *   that something was. ⚠ My first version of this assertion guessed −350 and was wrong: the
   *   test caught my arithmetic, not the tool's. */
  ok(sumOf(dropMint) === 0n, 'and the residue is exactly minus the lifetime burn — here, nothing burned, so 0', `${sumOf(dropMint)}`);
  const withBurn = [L(ZERO, A, 1000, 1), L(A, ZERO, 250, 2), L(A, B, 100, 3)];
  ok(sumOf(withBurn.slice(1)) === -250n, 'with a burn in the tape, dropping the mint leaves exactly −(burned)', `${sumOf(withBurn.slice(1))}`);
}

/* ═══ 3 · hook powers must DISCRIMINATE ══════════════════════════════════════════════════ */
H('3 · hookPowers(): the two bits that decide whether an LP can earn');
{
  /* The real FWA hook, measured on chain 2026-08-08. */
  const fwa = hookPowers('0x2C67ebA8A50AF0dB5Fba55F725247a75CbDA6444');
  ok(fwa.bits === 0x2444n, 'FWA hook low bits decode to 0x2444', '0x' + fwa.bits.toString(16));
  ok(fwa.canTakeTheFee === true, '⛔ it CAN take the whole fee (afterSwapReturnDelta)');
  ok(fwa.canRefuseLiquidity === false, '⚠ it CANNOT refuse liquidity — you may fund it and earn nothing');
  ok(fwa.on.includes('afterSwapReturnDelta'), 'the flag is named, not just counted');
  ok(fwa.on.includes('beforeInitialize') && fwa.on.includes('afterSwap'), 'and the other set bits decode too', fwa.on.join(','));

  /* ⛔ "it decodes something" is trivially true. It has to give a DIFFERENT answer for a hookless
   *   pool, or every pool would read as dangerous and the check would carry no information. */
  const none = hookPowers('0x0000000000000000000000000000000000000000');
  ok(none.bits === 0n && none.on.length === 0, 'the zero address has no powers at all');
  ok(none.canTakeTheFee === false && none.canRefuseLiquidity === false, 'and a hookless pool reads as safe — the check discriminates');

  /* A hook that can refuse liquidity but not take the fee — the opposite corner. */
  const gate = hookPowers('0x0000000000000000000000000000000000000800');  // bit 11 only
  ok(gate.canRefuseLiquidity === true && gate.canTakeTheFee === false, 'bit 11 alone reads as gated-but-honest');
  const skim = hookPowers('0x0000000000000000000000000000000000000008');  // bit 3 only
  ok(skim.canTakeTheFee === true && skim.canRefuseLiquidity === false, 'bit 3 alone reads as open-but-skimming');
  ok(gate.bits !== skim.bits, 'and the two corners are not the same value', `${gate.bits} vs ${skim.bits}`);
}

/* ═══ 4 · the measured facts this tooling exists to carry ════════════════════════════════ */
H('4 · the FWA numbers are pinned so a later edit cannot quietly move them');
{
  /* ⚑ Pinned as ARITHMETIC, not as prose: these are the figures the round-trip verdict rests on,
   *   and if somebody re-derives them differently the sums below stop working. */
  const hookTook = 20378454.0284280999430707, buySide = 2036383550.720530975309268881;
  const rate = hookTook / buySide * 100;
  ok(Math.abs(rate - 1.0007) < 0.001, 'the hook took 1.0007% of buy-side flow, measured over the pool\'s whole life', rate.toFixed(4) + '%');

  const GAS_RT = 0.0315 * 2, TRADE = 50, FEES = 0.02, IMPACT = 2 * 0.6 / 10000;
  const breakeven = (TRADE * (FEES + IMPACT) + GAS_RT) / TRADE * 100;
  ok(breakeven > 2 && breakeven < 2.3, 'a $50 round trip needs a ~2.1% favourable move to break even', breakeven.toFixed(2) + '%');
  ok(TRADE * 0.002 < TRADE * FEES, '⛔ a "dime" on $50 (0.2%) is an order of magnitude under the cost — micro-scalping is arithmetically dead');

  /* Splitting across wallets: same fees, gas paid per wallet. It can only get worse. */
  const oneWallet = TRADE * FEES + GAS_RT;
  const fiveWallets = TRADE * FEES + GAS_RT * 5;
  ok(fiveWallets > oneWallet, 'splitting one trade across 5 wallets costs MORE, never less', `$${oneWallet.toFixed(3)} → $${fiveWallets.toFixed(3)}`);
}

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
