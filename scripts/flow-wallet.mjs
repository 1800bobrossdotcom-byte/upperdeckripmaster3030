#!/usr/bin/env node
/* ripmaster3030studios — TRACK A WALLET.  `npm run flow:wallet -- 0x…`
 *
 * Every FWA position a wallet has ever taken, priced at the pool's own tick at the moment it
 * happened, so the cost basis is what the chain says rather than what anyone remembers.
 *
 * ⚑ IT USES THE COMPLETE TAPE, WHICH IS WHAT MAKES IT EXACT. `flow holders` already replays every
 *   Transfer since the token's deploy block and proves the replay by reproducing totalSupply() to
 *   the wei. One wallet's slice of a tape that is provably complete is provably complete too.
 * ⚠ NATIVE ETH IS NOT IN THAT TAPE and cannot be — ETH moves emit no logs. So the ETH column is
 *   DERIVED from the pool price at each block, not observed. It is the right number for a cost
 *   basis and it is NOT a substitute for the wallet's actual ETH ledger.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createPublicClient, http, parseAbi, formatEther, formatUnits } from 'viem';
import { mainnet } from 'viem/chains';

const W = (process.argv[2] || '0xcFCFc8e42AEBFC58AB78093217C2C4bB186BAc86').toLowerCase();
const ETHUSD = 1919.63;
const c = createPublicClient({ chain: mainnet, transport: http('https://gateway.tenderly.co/public/mainnet', { timeout: 25000 }) });
const FWA = '0xa0Df17B5aC76ABaBA36E1450E2cbCd18A620C845';
const PM = '0x000000000004444c5dc75cb358380d2e3de08a90';

const TF = 'fwa-audit/tape-a0Df17B5-25546793.json', SF = 'fwa-audit/swaps.json';
if (!existsSync(TF) || !existsSync(SF)) { console.log('  ⛔ run `npm run flow holders` first to build the tape'); process.exit(1); }
const tape = JSON.parse(readFileSync(TF, 'utf8'));
const swaps = JSON.parse(readFileSync(SF, 'utf8')).rows;
const blocks = swaps.map(r => r[0]);
const pxAt = b => { let i = 0, j = blocks.length - 1, best = -1;
  while (i <= j) { const m = (i + j) >> 1; if (blocks[m] <= b) { best = m; i = m + 1; } else j = m - 1; }
  return best < 0 ? null : 1 / Math.pow(Number(swaps[best][1]) / 2 ** 96, 2); };

const mine = tape.logs.filter(([b, li, f, t]) => f.toLowerCase() === W || t.toLowerCase() === W);
console.log(`\n  WALLET ${W}`);
console.log(`  tape covers blocks ${tape.logs[0][0]} → ${tape.head}   ·   ${mine.length} FWA transfers touch this wallet\n`);

const bal = await c.readContract({ address: FWA, abi: parseAbi(['function balanceOf(address) view returns (uint256)']), functionName: 'balanceOf', args: [W] });
const eth = await c.getBalance({ address: W });
const nonce = await c.getTransactionCount({ address: W });

if (!mine.length) {
  console.log('  ⛔ This wallet has never sent or received FWA. It has taken no position in this token.');
} else {
  console.log(`  ${'block'.padStart(9)}  ${'dir'.padEnd(4)} ${'FWA'.padStart(14)} ${'price (ETH)'.padStart(13)} ${'ETH value'.padStart(11)} ${'usd'.padStart(9)}  counterparty`);
  let net = 0n, ethIn = 0, ethOut = 0;
  for (const [b, li, f, t, v] of mine) {
    const val = BigInt(v), inbound = t.toLowerCase() === W;
    const p = pxAt(b); const amt = Number(formatUnits(val, 18));
    const e = p ? amt * p : 0;
    net += inbound ? val : -val;
    if (inbound) ethIn += e; else ethOut += e;
    const other = inbound ? f : t;
    const label = other.toLowerCase() === PM ? 'the pool' : other.slice(0, 10) + '…';
    console.log(`  ${String(b).padStart(9)}  ${(inbound ? 'IN' : 'OUT').padEnd(4)} ${amt.toLocaleString(undefined, { maximumFractionDigits: 0 }).padStart(14)} ${(p ? p.toExponential(3) : '—').padStart(13)} ${e.toFixed(6).padStart(11)} ${('$' + (e * ETHUSD).toFixed(2)).padStart(9)}  ${label}`);
  }
  const now = pxAt(tape.head);
  const held = Number(formatUnits(bal, 18));
  const mark = now ? held * now : 0;
  console.log(`\n  ── position ──`);
  console.log(`  FWA acquired (ETH cost at the time) : ${ethIn.toFixed(6)} ETH = $${(ethIn * ETHUSD).toFixed(2)}`);
  console.log(`  FWA disposed (ETH value at the time): ${ethOut.toFixed(6)} ETH = $${(ethOut * ETHUSD).toFixed(2)}`);
  console.log(`  FWA held now                        : ${held.toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
  console.log(`  marked at the current tick          : ${mark.toFixed(6)} ETH = $${(mark * ETHUSD).toFixed(2)}`);
  const pnl = (ethOut + mark) - ethIn;
  console.log(`  ⚑ net                                : ${(pnl >= 0 ? '+' : '') + pnl.toFixed(6)} ETH = ${(pnl >= 0 ? '+$' : '-$') + Math.abs(pnl * ETHUSD).toFixed(2)}`);
  console.log(`     ⚠ cost basis is DERIVED from the pool tick at each block, not from the wallet's`);
  console.log(`       ETH ledger — native ETH emits no logs, so a transfer in or out is invisible here.`);
}
console.log(`\n  ── live ──`);
console.log(`  ETH   ${formatEther(eth)} = $${(Number(formatEther(eth)) * ETHUSD).toFixed(2)}`);
console.log(`  FWA   ${formatUnits(bal, 18)}`);
console.log(`  nonce ${nonce}  ${nonce === 0 ? '← has never signed a transaction' : ''}`);
const rails = 0.20;
console.log(`\n  against the bot's rails: ceiling ${rails} ETH · ${Number(formatEther(eth)) > rails ? '⛔ OVER — the daemon would refuse to operate' : '✅ under the ceiling, the daemon will run'}`);
