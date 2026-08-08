#!/usr/bin/env node
/* What did the fresh wallet actually DO? Read-only. */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, http, formatEther, formatUnits, parseAbiItem } from 'viem';
import { mainnet } from 'viem/chains';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const w = {}; new Function('window', readFileSync(join(ROOT, 'js/chain-config.js'), 'utf8'))(w);
const CFG = w.RIPMASTER_CHAIN;
const WALLET = '0xcFCFc8e42AEBFC58AB78093217C2C4bB186BAc86';
const FWA = '0xa0Df17B5aC76ABaBA36E1450E2cbCd18A620C845';
const PM = '0x000000000004444c5dc75cB358380D2e3dE08A90';

/* ⛔ publicnode + merkle refuse eth_getLogs (recorded in mm.mjs). Prove the endpoint serves
 *   logs before believing a zero — an unread tape is not an empty one. */
const LOG_RPCS = ['https://eth.drpc.org', 'https://gateway.tenderly.co/public/mainnet', ...CFG.rpcs];
const XFER = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');

async function logClient() {
  for (const url of LOG_RPCS) {
    const c = createPublicClient({ chain: mainnet, transport: http(url, { timeout: 25000, retryCount: 0 }) });
    try {
      const head = await c.getBlockNumber();
      await c.getLogs({ address: FWA, event: XFER, fromBlock: head - 20n, toBlock: head });
      return { c, url, head };
    } catch { /* next */ }
  }
  throw new Error('no endpoint served eth_getLogs — MEASUREMENT FAILURE, not a finding');
}

const { c, url, head } = await logClient();
console.log(`\n  logs via ${url}   head ${head}\n`);

/* Walk back until we find the inbound FWA transfer. */
let found = [];
for (let i = 0; i < 40 && !found.length; i++) {
  const hi = head - BigInt(i * 800), lo = hi - 799n;
  try {
    const L = await c.getLogs({ address: FWA, event: XFER, args: { to: WALLET }, fromBlock: lo, toBlock: hi });
    if (L.length) found = L;
  } catch (e) { console.log(`     window ${lo}-${hi} errored: ${(e.shortMessage || e.message).slice(0, 50)}`); }
}
if (!found.length) { console.log('  no inbound FWA Transfer found in the last ~32k blocks'); process.exit(0); }

for (const l of found) {
  console.log(`  FWA IN  ${formatUnits(l.args.value, 18)}  from ${l.args.from}`);
  console.log(`          block ${l.blockNumber}  tx ${l.transactionHash}`);
  const [tx, rc, blk] = await Promise.all([
    c.getTransaction({ hash: l.transactionHash }),
    c.getTransactionReceipt({ hash: l.transactionHash }),
    c.getBlock({ blockNumber: l.blockNumber }),
  ]);
  const gasCost = rc.gasUsed * rc.effectiveGasPrice;
  console.log(`          when  ${new Date(Number(blk.timestamp) * 1000).toISOString()}`);
  console.log(`          from  ${tx.from}`);
  console.log(`          to    ${tx.to}   (the router/contract he actually used)`);
  console.log(`          value ${formatEther(tx.value)} ETH   nonce ${tx.nonce}`);
  console.log(`          gas   ${rc.gasUsed} @ ${(Number(rc.effectiveGasPrice) / 1e9).toFixed(4)} gwei = ${formatEther(gasCost)} ETH`);
  console.log(`          status ${rc.status}   logs ${rc.logs.length}`);

  /* Which v4 pool did it hit? The Swap event's indexed id names it. */
  const SWAP = parseAbiItem('event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)');
  for (const lg of rc.logs) {
    if (lg.address.toLowerCase() !== PM.toLowerCase()) continue;
    try {
      const d = c.chain && null;
    } catch {}
  }
  const swaps = rc.logs.filter(x => x.address.toLowerCase() === PM.toLowerCase() && x.topics[0] === '0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f');
  console.log(`          v4 Swap events in this tx: ${swaps.length}`);
  for (const s of swaps) console.log(`            poolId ${s.topics[1]}`);
}
console.log('');
