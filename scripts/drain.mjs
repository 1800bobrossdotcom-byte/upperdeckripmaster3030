#!/usr/bin/env node
/* ripmaster3030studios — THE DRAIN SCREEN.  `npm run drain`
 *
 * Artist, 2026-08-09: *"we can use this for ethereum investigative work … lets hunt scammers and
 * other rings of illicit wallet attempts."*
 *
 * ══ WHAT IT LOOKS FOR ═════════════════════════════════════════════════════════════════════════
 *
 * A wallet drainer does not steal tokens. **It collects APPROVALS**, and then it sweeps at its
 * leisure. That is the whole shape of the crime and it is visible on-chain before the theft:
 *
 *   Approval(owner, spender, value)         ERC-20 — a spender you authorised
 *   ApprovalForAll(owner, operator, true)   ERC-721/1155 — an operator you authorised for EVERYTHING
 *
 * A legitimate spender — a router, a marketplace — receives approvals from everybody, forever.
 * **A drainer receives a BURST of approvals from many distinct wallets, and it is not a router.**
 * That difference is measurable in one pass over the logs, on both chains, with no indexer.
 *
 * ══ ⛔ WHAT THIS DOES NOT DO, AND THE RULE IS ABSOLUTE ════════════════════════════════════════
 *
 * **IT NEVER ACCUSES ANYBODY.** It emits a SIGNAL and the EVIDENCE, and the reader draws the
 * conclusion. Approval clustering has real false positives — a new legitimate protocol launching,
 * an airdrop claim, a migration contract, a popular mint — and every one of them looks exactly
 * like a drainer for the first hour of its life.
 *
 * ⚠ This studio already refuses to publish a burn percentage on the grounds that a printed number
 *   drifts into a lie with nobody editing anything. **An accusation is far worse than a number**:
 *   it is defamatory if wrong, it is unfalsifiable to the person it names, and it cannot be
 *   retracted from the people who read it. So:
 *     · no address is ever labelled "scam", "drainer" or "malicious" by this tool
 *     · every flag prints the counts it is built from, so it can be checked and disagreed with
 *     · the known-good allowlist is a stated input, not a hidden judgement
 *     · a HIGH signal means "this is worth a human looking at", and nothing else
 *
 * ⚑ THAT RESTRAINT IS ALSO WHAT MAKES IT SELLABLE. A feed that cries wolf is worthless to a
 *   compliance desk; a feed that publishes accusations is a liability to one. What an exchange,
 *   a wallet or a compliance team can actually use is a ranked queue with the working shown.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ── topics ───────────────────────────────────────────────────────────────────────────────── */
const T_APPROVAL = '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925';
const T_APPROVAL_FOR_ALL = '0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31';

const CHAINS = {
  ethereum: {
    label: 'ETHEREUM',
    rpcs: ['https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org',
           'https://rpc.mevblocker.io', 'https://eth.merkle.io'],
    span: 120,          // ~24 min
  },
  base: {
    label: 'BASE',
    rpcs: ['https://mainnet.base.org', 'https://base-rpc.publicnode.com', 'https://base.drpc.org'],
    span: 600,          // ~20 min
  },
};

/* ⛔ THE ALLOWLIST IS A STATED INPUT, NOT A HIDDEN JUDGEMENT. These are the addresses that
 * legitimately receive approvals from everyone — routers, marketplaces, permit systems. Without
 * it the screen returns Permit2 at the top every single run and is useless.
 * ⚠ IT IS ALSO THE MOST DANGEROUS PART OF THE TOOL: anything wrongly ON this list becomes
 *   invisible. So it is short, every entry is named, and it is printed with the results rather
 *   than buried — a reader has to be able to see what was excluded. */
const KNOWN = new Map(Object.entries({
  '0x000000000022d473030f116ddee9f6b43ac78ba3': 'Permit2 (Uniswap)',
  '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad': 'UniversalRouter (Uniswap)',
  '0x66a9893cc07d91d95644aedd05d03f95e1dba8af': 'UniversalRouter v2 (Uniswap)',
  '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45': 'SwapRouter02 (Uniswap)',
  '0xe592427a0aece92de3edee1f18e0157c05861564': 'SwapRouter (Uniswap v3)',
  '0x7a250d5630b4cf539739df2c5dacb4c659f2488d': 'Router02 (Uniswap v2)',
  '0x00000000006c3852cbef3e08e8df289169ede581': 'Seaport 1.1 (OpenSea)',
  '0x00000000000000adc04c56bf30ac9d3c0aaf14dc': 'Seaport 1.5 (OpenSea)',
  '0x0000000000000068f116a894984e2db1123eb395': 'Seaport 1.6 (OpenSea)',
  '0xdef1c0ded9bec7f1a1670819833240f027b25eff': '0x Exchange Proxy',
  '0x1111111254eeb25477b68fb85ed929f73a960582': '1inch v5',
  '0x111111125421ca6dc452d289314280a0f8842a65': '1inch v6',
  '0xc92e8bdf79f0507f65a392b0ab4667716bfe0110': 'CoW Protocol VaultRelayer',
  '0x881d40237659c251811cec9c364ef91dc08d300c': 'Metamask Swap Router',
  '0x6131b5fae19ea4f9d964eac0408e4408b66337b5': 'KyberSwap MetaAggregator',
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'USDC (token, not a spender)',
}).map(([k, v]) => [k.toLowerCase(), v]));

const MAX_UINT = (1n << 256n) - 1n;
/* "unlimited" in practice is anything absurd, not literally 2^256-1 — wallets set different
 * sentinels and drainers often use uint96/uint160 maxima to look less alarming. */
const HUGE = (1n << 200n);

/* ── rpc: race, abort, and never trust HTTP 200 ───────────────────────────────────────────── */
async function rpc(chain, method, params, { timeout = 25000 } = {}) {
  const errs = [];
  const one = (url) => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeout);
    return fetch(url, { method: 'POST', signal: ac.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })
      .then(async (r) => {
        const j = await r.json();
        if (j.error) throw new Error(`${url}: ${(j.error.message || '').slice(0, 90)}`);
        if (j.result === undefined) throw new Error(`${url}: no result`);
        return j.result;
      }).finally(() => clearTimeout(t));
  };
  const rs = await Promise.allSettled(CHAINS[chain].rpcs.map(one));
  for (const r of rs) { if (r.status === 'fulfilled') return r.value; errs.push(r.reason?.message || 'failed'); }
  throw new Error(`${chain}.${method}: every endpoint failed — ${errs.join(' | ')}`);
}

const hex = (n) => '0x' + n.toString(16);
const num = (h) => parseInt(h, 16);
const addrOf = (topic) => '0x' + topic.slice(26).toLowerCase();

/* ── the pass ─────────────────────────────────────────────────────────────────────────────── */
async function screen(chain, log) {
  const head = num(await rpc(chain, 'eth_blockNumber', []));
  const span = CHAINS[chain].span;
  const from = head - span;
  log(`${CHAINS[chain].label}  blocks ${from.toLocaleString()}–${head.toLocaleString()}`);

  /* ⚠ CHUNKED, because a public RPC caps the range or the result count and answers with an error
   * body at HTTP 200. A screen that silently reads half the window and reports confidently is
   * worse than one that says it could not read. */
  const step = Math.max(1, Math.ceil(span / 6));
  const logs = [];
  let missed = 0;
  for (let a = from; a <= head; a += step) {
    const b = Math.min(head, a + step - 1);
    try {
      const got = await rpc(chain, 'eth_getLogs', [{
        fromBlock: hex(a), toBlock: hex(b), topics: [[T_APPROVAL, T_APPROVAL_FOR_ALL]],
      }]);
      logs.push(...got);
    } catch (e) { missed += (b - a + 1); }
  }
  log(`  ${logs.length.toLocaleString()} approval events` + (missed ? `  ⚠ ${missed} blocks unread` : ''));

  /* group by SPENDER — the thing a victim authorises */
  const by = new Map();
  for (const l of logs) {
    if (!l.topics || l.topics.length < 3) continue;
    const isAll = l.topics[0].toLowerCase() === T_APPROVAL_FOR_ALL;
    const owner = addrOf(l.topics[1]);
    const spender = addrOf(l.topics[2]);
    if (spender === '0x0000000000000000000000000000000000000000') continue;
    let v = by.get(spender);
    if (!v) { v = { spender, owners: new Set(), tokens: new Set(), unlimited: 0, forAll: 0,
                    n: 0, firstBlock: Infinity, lastBlock: 0 }; by.set(spender, v); }
    v.owners.add(owner); v.tokens.add((l.address || '').toLowerCase()); v.n++;
    const bn = num(l.blockNumber);
    v.firstBlock = Math.min(v.firstBlock, bn); v.lastBlock = Math.max(v.lastBlock, bn);
    if (isAll) {
      /* ApprovalForAll's bool is in data; 0x…01 is "approved" */
      if (/1$/.test((l.data || '').trim())) v.forAll++;
    } else {
      let val = 0n; try { val = BigInt(l.data); } catch {}
      if (val >= HUGE || val === MAX_UINT) v.unlimited++;
    }
  }

  /* enrich the candidates only — eth_getCode per address is a round trip */
  const cands = [...by.values()]
    .filter((v) => v.owners.size >= 3 && !KNOWN.has(v.spender))
    .sort((a, b) => b.owners.size - a.owners.size)
    .slice(0, 20);

  /* ⛔ THE FIRST VERSION RANKED UNISWAP'S ROUTERS AND LI.FI'S BRIDGE AT THE TOP, and that is not
   *   a cosmetic fault — a feed whose first page is infrastructure wastes the analyst's time and
   *   discredits every row under it. The obvious fix is a longer allowlist and it is the WRONG
   *   fix: an address wrongly allowlisted is a real drainer made permanently invisible, which is
   *   the one error direction that has a victim.
   * ✅ SO THE DISCRIMINATOR IS COMPUTED, NOT ASSERTED: **has this spender been collecting
   *   approvals for longer than this window?** A router has taken approvals every day for years.
   *   A drainer is days old at most. One extra `eth_getLogs` over a much older, narrow sample
   *   answers it without an indexer, and it cannot be wrong about an address nobody listed.
   * ⚠ It is a ONE-SIDED test and is labelled as one: finding history proves established; finding
   *   none proves only that none was found in the sample. Absence is weak evidence and is scored
   *   as such. */
  const SAMPLE = chain === 'base' ? 40000 : 6000;   // ≈ a day back on each chain
  for (const c of cands) {
    try {
      const code = await rpc(chain, 'eth_getCode', [c.spender, 'latest']);
      c.isContract = !!code && code !== '0x';
      c.codeSize = c.isContract ? (code.length - 2) / 2 : 0;
    } catch { c.isContract = null; c.codeSize = null; }
    try {
      const pad = '0x' + c.spender.slice(2).padStart(64, '0');
      const back = await rpc(chain, 'eth_getLogs', [{
        fromBlock: hex(from - SAMPLE), toBlock: hex(from - SAMPLE + 400),
        topics: [[T_APPROVAL, T_APPROVAL_FOR_ALL], null, pad],
      }]);
      c.priorHits = back.length;
      c.priorChecked = true;
    } catch { c.priorHits = null; c.priorChecked = false; }
  }

  return { chain, head, from, span, events: logs.length, missed, spenders: by.size, cands };
}

/* ⛔ THE SCORE IS A QUEUE POSITION, NOT A VERDICT. Each term is a COUNT the reader can check, and
 * the output prints every count beside the score so the ranking can be disagreed with. */
function score(c) {
  const reasons = [];
  let s = 0;
  const victims = c.owners.size;
  if (victims >= 25) { s += 40; reasons.push(`${victims} distinct approvers`); }
  else if (victims >= 10) { s += 25; reasons.push(`${victims} distinct approvers`); }
  else if (victims >= 5) { s += 12; reasons.push(`${victims} distinct approvers`); }
  else reasons.push(`${victims} distinct approvers`);

  const unl = c.unlimited + c.forAll;
  const unlShare = c.n ? unl / c.n : 0;
  if (unlShare >= 0.8 && unl >= 5) { s += 25; reasons.push(`${(100 * unlShare).toFixed(0)}% unlimited`); }
  else if (unlShare >= 0.5 && unl >= 3) { s += 12; reasons.push(`${(100 * unlShare).toFixed(0)}% unlimited`); }

  if (c.forAll >= 3) { s += 15; reasons.push(`${c.forAll} setApprovalForAll(true)`); }

  /* a BURST — many victims inside a narrow block range — is the shape that separates a drainer
   * from a protocol that is simply popular */
  const width = Math.max(1, c.lastBlock - c.firstBlock + 1);
  const density = victims / width;
  if (victims >= 5 && density >= 0.5) { s += 20; reasons.push(`burst: ${victims} in ${width} blocks`); }

  if (c.isContract === false) { s += 10; reasons.push('spender is an EOA, not a contract'); }
  if (c.isContract && c.codeSize && c.codeSize < 500) { s += 8; reasons.push(`tiny contract (${c.codeSize}B)`); }

  /* ⛔ TOKEN SPREAD IS A ROUTER SIGNAL, NOT A DRAINER SIGNAL, AND SCORING IT UP WAS BACKWARDS.
   *   A router touches 73 tokens in twenty minutes because that is its job. A drainer sweeps
   *   whatever its victims happened to hold — a handful. High spread now scores DOWN. */
  if (c.tokens.size >= 25) { s -= 25; reasons.push(`${c.tokens.size} tokens — router-like spread`); }
  else if (c.tokens.size >= 3 && c.tokens.size <= 12) { s += 6; reasons.push(`${c.tokens.size} tokens`); }

  /* ⛔ THE AGE TERM, and it is the one that separates. Established = seen taking approvals a day
   *   before this window even opened. */
  if (c.priorChecked && c.priorHits > 0) {
    s -= 45; reasons.push(`ESTABLISHED — ${c.priorHits} approvals a day earlier`);
  } else if (c.priorChecked && c.priorHits === 0) {
    s += 18; reasons.push('no approvals in the day-earlier sample');
  } else {
    reasons.push('history unread');           // ⚠ scored neutral: unknown is not suspicious
  }

  return { score: Math.max(0, Math.min(100, s)), reasons };
}

/* ── run ──────────────────────────────────────────────────────────────────────────────────── */
/* ⛔ `endsWith('drain.mjs')` IS TRUE OF `test-drain.mjs`, so importing the scorer from the test
 * fired a full two-chain network screen before a single assertion ran — minutes of RPC to import
 * a pure function, and the test's own output buried under it. Compare the resolved path instead;
 * a suffix match on a filename is a substring test wearing a path's clothes, which is this repo's
 * recorded name-law trap in another place entirely. */
const isMain = process.argv[1] &&
  fileURLToPath(import.meta.url) === join(dirname(process.argv[1]), 'drain.mjs') &&
  process.argv[1].endsWith('/drain.mjs');
if (isMain) {
  const only = process.argv[2];
  console.log('\n══ THE DRAIN SCREEN ══');
  console.log('   approval clustering across Ethereum and Base.');
  console.log('   ⛔ A SIGNAL, NEVER AN ACCUSATION — every flag prints the counts it is built from.\n');

  const out = { generatedAt: new Date().toISOString(), allowlist: [...KNOWN.values()], chains: {} };

  for (const name of Object.keys(CHAINS)) {
    if (only && only !== name) continue;
    try {
      const r = await screen(name, (m) => console.log('  ' + m));
      const rows = r.cands.map((c) => {
        const sc = score(c);
        return {
          spender: c.spender, approvers: c.owners.size, events: c.n,
          unlimited: c.unlimited, forAll: c.forAll, tokens: c.tokens.size,
          blocks: [c.firstBlock, c.lastBlock], isContract: c.isContract, codeSize: c.codeSize,
          priorHits: c.priorHits, priorChecked: c.priorChecked,
          score: sc.score, reasons: sc.reasons,
        };
      }).sort((a, b) => b.score - a.score);
      out.chains[name] = { head: r.head, from: r.from, events: r.events, missed: r.missed,
                           spenders: r.spenders, rows };

      console.log(`\n  ── ${CHAINS[name].label}: ${r.spenders.toLocaleString()} distinct spenders, ` +
                  `${rows.length} past the floor ──`);
      if (!rows.length) {
        /* ⚑ AN EMPTY SCREEN IS A RESULT, NOT A FAILURE. Most windows contain nothing worth a
         * human's time, and a screen that always finds something is fitting noise. */
        console.log('     nothing cleared the floor in this window. That is the common case.');
      }
      for (const r2 of rows.slice(0, 8)) {
        const band = r2.score >= 60 ? 'LOOK' : r2.score >= 35 ? 'watch' : 'noise';
        console.log(`     ${String(r2.score).padStart(3)} ${band.padEnd(5)} ${r2.spender}`);
        console.log(`         ${r2.reasons.join(' · ')}`);
        console.log(`         ${r2.isContract === false ? 'EOA' : r2.isContract ? 'contract ' + r2.codeSize + 'B' : 'code unread'}` +
                    ` · blocks ${r2.blocks[0]}–${r2.blocks[1]}`);
      }
    } catch (e) {
      console.log(`  ${CHAINS[name].label} — could not read: ${e.message.slice(0, 120)}`);
      out.chains[name] = { error: e.message };
    }
  }

  mkdirSync(join(ROOT, 'data'), { recursive: true });
  writeFileSync(join(ROOT, 'data/drain.json'), JSON.stringify(out, null, 1));
  console.log('\n  → data/drain.json');
  console.log('\n  ⚠ EVERY ROW IS A QUEUE POSITION FOR A HUMAN, NOT A VERDICT. A new protocol, an');
  console.log('    airdrop claim, a migration contract and a popular mint all look exactly like');
  console.log('    a drainer for the first hour of their lives. Check before you say anything.\n');
}

export { screen, score, KNOWN };
