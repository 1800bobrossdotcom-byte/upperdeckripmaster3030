#!/usr/bin/env node
/* Live state, measured. No key, no writes. */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, http, formatEther, formatUnits, parseAbiItem } from 'viem';
import { mainnet } from 'viem/chains';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(ROOT, 'js/chain-config.js'), 'utf8');
const w = {}; new Function('window', src)(w);
const CFG = w.RIPMASTER_CHAIN;

const WALLET = '0xcFCFc8e42AEBFC58AB78093217C2C4bB186BAc86';
const T3030 = CFG.contracts.liquidEdition;
const FWA = '0xa0Df17B5aC76ABaBA36E1450E2cbCd18A620C845';

/* Agree across endpoints rather than trusting one — the repo's own rule. */
async function agree(fn, label) {
  const out = [];
  for (const url of CFG.rpcs) {
    try {
      const c = createPublicClient({ chain: mainnet, transport: http(url, { timeout: 12000, retryCount: 0 }) });
      out.push({ url, v: await fn(c) });
    } catch (e) { out.push({ url, err: (e.shortMessage || e.message || '').slice(0, 60) }); }
  }
  console.log(`  ${label}`);
  for (const o of out) console.log(`     ${o.err ? '⛔ ' + o.err : o.v}   ${new URL(o.url).host}`);
  return out.filter(o => !o.err).map(o => o.v);
}

console.log('\n  LIVE STATE  ' + new Date().toISOString() + '\n');

await agree(async c => {
  const b = await c.getBlockNumber();
  return `block ${b}`;
}, 'head');

await agree(async c => {
  const g = await c.getGasPrice();
  return `${(Number(g) / 1e9).toFixed(4)} gwei`;
}, 'gas price (eth_gasPrice)');

await agree(async c => {
  const [bal, nonce] = await Promise.all([
    c.getBalance({ address: WALLET }), c.getTransactionCount({ address: WALLET }),
  ]);
  return `${formatEther(bal)} ETH   nonce ${nonce}`;
}, `the fresh wallet ${WALLET.slice(0, 10)}…`);

/* Does the fresh wallet hold any $3030 or FWA already? */
const erc = [parseAbiItem('function balanceOf(address) view returns (uint256)')];
const c0 = createPublicClient({ chain: mainnet, transport: http(CFG.rpcs[0]) });
for (const [name, addr, dec] of [['$3030', T3030, 18], ['FWA', FWA, 18]]) {
  const b = await c0.readContract({ address: addr, abi: erc, functionName: 'balanceOf', args: [WALLET] });
  console.log(`  fresh wallet ${name.padEnd(6)} ${formatUnits(b, dec)}`);
}

/* Live USD references, from two independent sources, labelled. */
const j = await (await fetch('https://api.coinbase.com/v2/prices/ETH-USD/spot')).json();
const ethUsd = parseFloat(j.data.amount);
console.log(`\n  ETH/USD  $${ethUsd}   (Coinbase spot)`);

for (const [label, addr] of [['$3030', T3030], ['FWA', FWA]]) {
  const r = await (await fetch(`https://api.dexscreener.com/latest/dex/tokens/${addr}`)).json();
  const ps = (r.pairs || []).sort((a, b) => Number(b.liquidity?.usd || 0) - Number(a.liquidity?.usd || 0));
  console.log(`\n  ${label} — ${ps.length} indexed pair(s)`);
  for (const p of ps.slice(0, 4)) {
    console.log(`     ${p.baseToken.symbol}/${p.quoteToken.symbol}  $${p.priceUsd}  ` +
      `liq $${Number(p.liquidity?.usd || 0).toLocaleString()}  vol24 $${Number(p.volume?.h24 || 0).toLocaleString()}  ` +
      `buys ${p.txns?.h24?.buys}/sells ${p.txns?.h24?.sells}  ${p.dexId} ${p.labels?.join(',') || ''}`);
  }
}
console.log('');
