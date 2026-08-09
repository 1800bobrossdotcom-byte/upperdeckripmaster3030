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
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ── topics ───────────────────────────────────────────────────────────────────────────────── */
const T_APPROVAL = '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925';
const T_APPROVAL_FOR_ALL = '0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31';
const T_TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

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

  /* ⚠ ONLY FOR THE CANDIDATES THAT ALREADY LOOK LIKE SOMETHING — one extra call each, and the
   * window runs from the burst to the head so a sweep that happened after the approvals is seen. */
  for (const c of cands.slice(0, 10)) {
    c.sweep = await sweepCheck(chain, c, c.firstBlock, head);
  }

  return { chain, head, from, span, events: logs.length, missed, spenders: by.size, cands };
}

/* ── ⛔ THE SWEEP — the difference between suspicion and evidence ─────────────────────────────
 *
 * Everything above measures INTENT-SHAPED BEHAVIOUR: somebody is collecting authorisations. That
 * is worth a look and it is not proof of anything — a protocol collects authorisations too.
 *
 * ⚑ BUT A DRAINER DOES NOT COLLECT APPROVALS FOR THEIR OWN SAKE. IT SWEEPS. So the confirming
 *   question is answerable from the same logs: after those wallets approved this spender, **did
 *   tokens leave those exact wallets, and did they land in one place?** An approval burst followed
 *   by the approvers' balances moving to a common destination is not a shape any legitimate
 *   protocol produces — a router's users each receive their own output, they do not all pay one
 *   address.
 *
 * ⚠ THE `from` TOPIC IS INDEXED, so the victim set can be pushed into the filter as an OR and the
 *   node does the work. This is one call per candidate, not one per victim.
 * ⚠ STILL NOT AN ACCUSATION. A high sweep share is reported as a COUNT — "17 of 22 approvers had
 *   tokens leave, 15 to one address" — and the reader concludes. There are innocent readings
 *   (a migration contract moves everyone's tokens to a new one, by design, with consent). */
async function sweepCheck(chain, cand, fromBlock, toBlock) {
  const owners = [...cand.owners];
  if (!owners.length) return null;
  const pad = (a) => '0x' + a.slice(2).padStart(64, '0');
  /* the OR list is capped: a node will refuse an unbounded topic array */
  const victims = owners.slice(0, 120).map(pad);
  try {
    const logs = await rpc(chain, 'eth_getLogs', [{
      fromBlock: hex(fromBlock), toBlock: hex(toBlock),
      topics: [T_TRANSFER, victims],
    }]);
    const moved = new Set(), dest = new Map();
    for (const l of logs) {
      if (!l.topics || l.topics.length < 3) continue;
      const from = addrOf(l.topics[1]), to = addrOf(l.topics[2]);
      if (to === '0x0000000000000000000000000000000000000000') continue;
      moved.add(from);
      dest.set(to, (dest.get(to) || 0) + 1);
    }
    const top = [...dest.entries()].sort((a, b) => b[1] - a[1])[0] || null;
    return {
      checked: victims.length, movedOut: moved.size, transfers: logs.length,
      topDestination: top ? top[0] : null, topDestinationCount: top ? top[1] : 0,
      distinctDestinations: dest.size,
    };
  } catch { return null; }
}

/* ⛔ THE SCORER LIVES IN `js/check3030.js` AND THIS FILE READS IT — it does not import a copy and
 * it does not reimplement one. So the score a visitor sees when they paste an address into
 * `3030.html` and the score this screen writes into the ledger come from IDENTICAL BYTES.
 * ⚑ Reading the shipped file is stronger than sharing a module would be, because the thing under
 *   test is the file that actually ships to the browser. This repo has paid twice for a harness
 *   that reimplemented the thing it was testing and therefore only proved the harness.
 * ⚠ It is a classic script rather than ESM because `test:reach` §0 compiles every shipped browser
 *   script with `new Function`, where an `export` keyword is a SyntaxError. */
const shim = {};
new Function('window', readFileSync(join(ROOT, 'js/check3030.js'), 'utf8'))(shim);
const { score, band, verdict } = shim.Check3030;

/* ── ⛔ THE LEDGER — a flag with no follow-up is an opinion ───────────────────────────────────
 *
 * A screen that prints a ranked list every hour and never looks back produces nothing anyone can
 * evaluate. **The product is not the flag, it is the flag plus what happened next.** So every
 * candidate that clears the floor is recorded once, with the evidence as it stood at that block,
 * and every later run REVISITS the open entries and appends what has changed.
 *
 * ⚑ THAT IS ALSO THE ONLY HONEST WAY TO EARN THE CLAIM. This repo's own bot README says every
 *   rule in it is backtested and none is forward-tested, and the paper book sits at 0 trades. A
 *   ledger built in public, at a cost of zero, is what turns "does this screen work" from an
 *   argument into a number a stranger can read.
 *
 * ⚠ APPEND-ONLY ON THE EVIDENCE. A revisit adds a row; it never rewrites what was said at flag
 *   time. A record that can be edited after the fact is not a record — and the temptation to
 *   quietly fix a bad call is exactly what it exists to remove.
 * ⚠ AND IT STILL NEVER CONCLUDES. `outcome` is derived from counts on read, not stored as a
 *   judgement: a funnel that kept growing and one that went quiet are both just numbers here. */
const LEDGER = join(ROOT, 'data/drain-ledger.json');
const FLOOR = 60;                        // the LOOK band — only these are worth following

function loadLedger() {
  try { return JSON.parse(readFileSync(LEDGER, 'utf8')); }
  catch { return { version: 1, opened: 0, entries: [] }; }
}

async function ledgerPass(chain, rows, head, log) {
  const led = loadLedger();
  const byKey = new Map(led.entries.map((e) => [e.chain + ':' + e.spender, e]));
  const now = new Date().toISOString();
  let opened = 0, revisited = 0;

  /* open new entries */
  for (const r of rows.filter((x) => x.score >= FLOOR)) {
    const key = chain + ':' + r.spender;
    if (byKey.has(key)) continue;
    const e = {
      chain, spender: r.spender, openedAt: now, openedBlock: head,
      flag: { score: r.score, approvers: r.approvers, unlimited: r.unlimited, forAll: r.forAll,
              tokens: r.tokens, codeSize: r.codeSize, isContract: r.isContract,
              priorHits: r.priorHits, sweep: r.sweep, reasons: r.reasons },
      revisits: [],
    };
    led.entries.push(e); byKey.set(key, e); opened++;
    log(`  + opened ${r.spender}  score ${r.score}`);
  }

  /* revisit the open ones — what happened AFTER we flagged it */
  /* ⚠ NOT THE ONES OPENED IN THIS RUN. A revisit at +0 blocks measures nothing and puts a row in
   * the record that looks like follow-up and is not — which is exactly the kind of padding that
   * makes a track record unreadable later. An entry gets its first revisit on the NEXT pass. */
  const open = led.entries.filter((e) =>
    e.chain === chain && e.revisits.length < 24 && e.openedBlock < head);
  for (const e of open.slice(0, 8)) {
    try {
      const pad = '0x' + e.spender.slice(2).padStart(64, '0');
      /* how many MORE approvals has it taken since we flagged it? */
      const since = await rpc(chain, 'eth_getLogs', [{
        fromBlock: hex(e.openedBlock), toBlock: hex(head),
        topics: [[T_APPROVAL, T_APPROVAL_FOR_ALL], null, pad],
      }]);
      const owners = new Set(since.map((l) => addrOf(l.topics[1])));
      e.revisits.push({ at: now, block: head, blocksSince: head - e.openedBlock,
                        newApprovals: since.length, newApprovers: owners.size });
      revisited++;
    } catch { /* a revisit that cannot read is simply not appended — never a fabricated row */ }
  }

  led.opened = led.entries.length;
  led.updatedAt = now;
  mkdirSync(dirname(LEDGER), { recursive: true });
  writeFileSync(LEDGER, JSON.stringify(led, null, 1));
  log(`  ledger: ${opened} opened, ${revisited} revisited, ${led.entries.length} total`);
  return led;
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
          priorHits: c.priorHits, priorChecked: c.priorChecked, sweep: c.sweep || null,
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

  /* the ledger runs for every chain that read successfully */
  for (const [name, r] of Object.entries(out.chains)) {
    if (r.error || !r.rows) continue;
    console.log(`\n  ── ${CHAINS[name].label} ledger ──`);
    await ledgerPass(name, r.rows, r.head, (m) => console.log(m));
  }

  console.log('\n  → data/drain.json · data/drain-ledger.json');
  console.log('\n  ⚠ EVERY ROW IS A QUEUE POSITION FOR A HUMAN, NOT A VERDICT. A new protocol, an');
  console.log('    airdrop claim, a migration contract and a popular mint all look exactly like');
  console.log('    a drainer for the first hour of their lives. Check before you say anything.\n');
}

export { screen, score, band, verdict, KNOWN };
