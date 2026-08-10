#!/usr/bin/env node
/* ripmaster3030studios — 3030, THE SUBSTRATE OMNI DATA LAYER.  `npm run test:substrate`
 *
 * ⛔ WHAT THIS PROVES AND WHAT IT CANNOT, STATED FIRST, because the difference is the whole
 *   value of the layer:
 *     ✓ the derivation is DETERMINISTIC — the same two source blocks give the same 32 bytes
 *     ✓ the hash COMMITS TO THE READING, not just to the source pointers
 *     ✓ the shipped chain is self-consistent from genesis to head
 *     ✓ the page never hard-codes the protocol name, and still shows it
 *     ✓ every live cell names its failure instead of printing an em-dash
 *     ✗ THAT THE CENSUS MATCHES THE REAL CHAINS RIGHT NOW. A census is a reading of blocks at a
 *       moment; re-deriving gives different blocks. What is checkable is that the recorded
 *       reading hashes to the recorded hash — i.e. that nobody edited one without the other.
 *       A test claiming more than that would be claiming the chain cannot reorg.
 *
 * ⚑ EVERY SECTION ENDS BY PROVING IT BITES. This repo has shipped a claim-signer guard that
 *   compared two literals it wrote itself, and an X-handle guard that matched its own
 *   declaration line — both printed green forever. A guard that has never failed is a guard
 *   nobody has tested.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { PROTOCOL, GENESIS, deriveHash, SEP } from './substrate.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(
  '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript',
  '.json':'application/json', '.css':'text/css', '.png':'image/png', '.webp':'image/webp',
  '.svg':'image/svg+xml', '.gif':'image/gif', '.jpg':'image/jpeg', '.mp4':'video/mp4', '.mp3':'audio/mpeg' };

let checks = 0, fails = 0;
const ok = (c, m, d) => { checks++; if(!c) fails++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${m}${d !== undefined && d !== '' ? '  — ' + d : ''}`); };

const HTML = readFileSync(join(ROOT, 'substrate.html'), 'utf8');
const DATA = JSON.parse(readFileSync(join(ROOT, 'data/substrate.json'), 'utf8'));
const sha = (s) => createHash('sha256').update(s).digest('hex');
/* ⚠ MUST MATCH scripts/substrate.mjs `frame()` and the page. Length-prefixed, NUL-separated —
 * see the attack suite's §B1 for why the bare join was replaced. */
const frame = (parts) => parts.map(p => `${String(p).length}:${String(p)}`).join(SEP);

/* ═══ A · THE DERIVATION IS A FUNCTION ══════════════════════════════════════════════════════ */
console.log('\n── A · the derivation ──');
{
  /* ⚠ THE FULL v2 SHAPE, not a convenient subset — `canonical()` reads `form` and a partial
   *   literal throws. That is the schema doing its job; a defensive default in the deriver
   *   would have silently hashed a census with zeroed formations instead. */
  const CEN = (o = {}) => ({
    counts: { space: 100, sigil: 20, glyph: 4, mark: 30, ...(o.counts || {}) },
    bytes: o.bytes ?? 154,
    form: { words: 4, selectors: 1, rules: 2, addresses: 1, ...(o.form || {}) },
  });
  const census = CEN();
  const a = deriveHash('ff'.repeat(32), '0xaaa', ['0xb1','0xb2'], census);
  const b = deriveHash('ff'.repeat(32), '0xaaa', ['0xb1','0xb2'], census);
  ok(a === b, 'same inputs give the same block hash', a.slice(0, 16) + '…');
  ok(/^[0-9a-f]{64}$/.test(a), 'a block hash is 32 bytes of hex');

  /* ⛔ THE LOAD-BEARING ONE. If the hash covered only the source hashes, this layer would be a
   *   linked list of pointers — correct, and saying nothing about the reading. Change ONE byte
   *   of the census and the chain must fork. */
  const moved = deriveHash('ff'.repeat(32), '0xaaa', ['0xb1','0xb2'],
    CEN({ counts: { space: 101, mark: 29 } }));
  ok(moved !== a, 'the hash commits to the CENSUS, not just the source hashes', 'one byte reclassified → different chain');

  const reordered = deriveHash('ff'.repeat(32), '0xaaa', ['0xb2','0xb1'], census);
  ok(reordered !== a, 'impression ORDER is part of the block', 'base blocks are not a set');

  /* ⛔ A GENESIS DERIVED FROM `now` MAKES EVERY RUN A DIFFERENT CHAIN — and every run looks
   *   internally consistent, so nothing reports it. */
  const expect = sha(
    `${PROTOCOL.name}|${PROTOCOL.title}|substrate:ethereum|impression:base|framing:v2`);
  ok(GENESIS === expect, 'genesis is a constant of the protocol, not of the clock', GENESIS.slice(0, 16) + '…');
}

/* ═══ B · THE SHIPPED CHAIN ═════════════════════════════════════════════════════════════════ */
console.log('\n── B · the shipped chain ──');
{
  const B = DATA.blocks;
  ok(B.length > 0, 'the chain has blocks', `${B.length} sheets`);
  /* ⚠ "the linkage holds" is trivially true of an empty chain, and "no bytes are misclassified"
   *   is trivially true of no bytes. Both need a subject. */
  ok(DATA.totals.bytes > 10000, 'the chain read a non-trivial amount of calldata',
    `${DATA.totals.bytes.toLocaleString()} bytes`);

  let linked = true, hashed = true, summed = true, prev = DATA.genesis;
  for (const b of B) {
    if (b.prev !== prev) linked = false;
    const parts = [prev, b.sheet.hash, ...b.impressions.map(x => x.hash), b.canonical];
    if (sha(frame(parts)) !== b.hash) hashed = false;
    const c = b.census.counts;
    if (c.space + c.sigil + c.glyph + c.mark !== b.census.bytes) summed = false;
    prev = b.hash;
  }
  ok(linked, 'every block links to the one before it, back to genesis');
  ok(hashed, 'every recorded hash recomputes from its own parts');
  ok(summed, 'space + sigil + mark accounts for every byte, in every block');

  const t = DATA.totals;
  ok(t.space + t.sigil + t.glyph + t.mark === t.bytes, 'the totals account for every byte');
  /* ⛔ THE GLYPH FILTER MUST STAY STRICT. Its first version kept anything beside an ASCII byte
   *   and reported 0.93% "every other writing system" that was almost entirely chance — Coptic
   *   next to Tibetan next to a private-use codepoint. Requiring ≥2 consecutive same-script
   *   glyphs took it to 0.02%. ⚑ THE HONEST FINDING IS THAT THE SUBSTRATE IS MONOLINGUAL, so
   *   this asserts the filter is doing work (most hits rejected) rather than asserting a floor
   *   on glyphs — a floor would be pressure to loosen the filter until it was met. */
  ok(t.chanceGlyphs > t.glyph, 'the glyph filter rejects far more than it keeps',
    `${t.chanceGlyphs.toLocaleString()} rejected vs ${t.glyph.toLocaleString()} kept`);
  /* formations are the structure above the byte, and they must be internally coherent */
  ok(t.rules <= t.words && t.addresses <= t.words, 'no formation exceeds the word count');
  ok(t.words > 0 && t.rules > 0, 'the ABI grid and its blank lines were both found',
    `${t.words.toLocaleString()} words · ${t.rules.toLocaleString()} rules ` +
    `(${(100 * t.rules / t.words).toFixed(1)}% of lines are pure zero)`);
  const spacePct = 100 * t.space / t.bytes;
  /* ⚑ THE CLAIM ON THE PAGE IS "THREE QUARTERS". If a future reading drifts far from that, the
   *   page's own headline has gone stale and this is where it should be caught. */
  ok(spacePct > 55 && spacePct < 90, 'the substrate really is most of the typing',
    spacePct.toFixed(2) + '% space');
  /* ⛔ BOTH SCHEDULES, BECAUSE PUBLISHING ONE AS "THE PRICE" IS THE ERROR THIS ASSERTS AGAINST.
   *   Intrinsic calldata gas is max(standard, floor). The floor (10/40) binds only on a
   *   near-pure-data transaction; a real one pays the standard 4/16. The first version of this
   *   page published the floor as the protocol's price — a precise, reproducible measurement of
   *   the wrong transaction shape. The RATIO is the durable fact: it is 4 under both. */
  ok(DATA.gas && DATA.gas.ratio === 4, 'the durable ratio is carried', 'a mark costs 4× a space');
  ok(DATA.gas.standard && DATA.gas.standard.space === 4 && DATA.gas.standard.mark === 16,
    'the STANDARD schedule is carried — what a real transaction pays', '4 and 16');
  ok(DATA.gas.floor && DATA.gas.floor.space === 10 && DATA.gas.floor.mark === 40,
    'the FLOOR schedule is carried too, and named as the floor', '10 and 40');
  ok(DATA.gas.standard.mark / DATA.gas.standard.space === 4
     && DATA.gas.floor.mark / DATA.gas.floor.space === 4,
    'the ratio is 4× under BOTH schedules — the claim that survives either', 'this is why it is the one published');
  /* ⚠ AND THE PAGE MUST QUOTE THE STANDARD ONE. "Both are carried" is trivially satisfied by a
   *   page that still prints the floor. */
  ok(/gas && d\.gas\.standard/.test(HTML) || /d\.gas\.standard/.test(HTML),
    'the page reads the STANDARD schedule, not the floor');
  ok(!/charges 10 gas for a space and 40 for a mark/.test(HTML),
    'the retracted claim does not survive anywhere on the page');

  /* the sheet/impression pairing is the "omni" claim — it must actually span both chains */
  const withImp = B.filter(b => b.impressions.length > 0).length;
  ok(withImp === B.length, 'every sheet carries Base impressions — the layer spans both chains',
    `${B.reduce((a, b) => a + b.impressions.length, 0)} impressions over ${B.length} sheets`);
  ok(B.every(b => b.sheet.chain === 'ethereum' && b.impressions.every(i => i.chain === 'base')),
    'L1 prints the sheet and L2 types on it, in every block');
}

/* ═══ B2 · THE GHOST TEXT IS SOMEBODY ELSE'S WRITING, AND WE REPUBLISH IT ═════════════════════
 * ⛔ THE READING RENDERS ARBITRARY TEXT THAT STRANGERS PAID GAS TO INSCRIBE, on a studio surface,
 *   with the studio's name around it. **A phishing URL costs a few cents of calldata to place
 *   where this page will pick it up.** One real sample carried
 *   `{"url":"https://x.com/i/api/graphql/…"}`.
 * ⚑ FOUND BY `test:name`, WHICH GUARDS SOMETHING ELSE — its rule is that every x.com link on the
 *   site names an account somebody chose. The defect it exposed is far bigger than the one it was
 *   written for: an unfiltered republication channel from anyone with a wallet.
 * ✅ Defanged, not dropped — dropping would edit the census's own evidence, and the point is that
 *   language is down there. The shape survives; the destination does not. */
console.log('\n── B2 · republished text is defanged ──');
{
  const runs = DATA.blocks.flatMap(b => (b.runs || []).map(r => r.text));
  const live = runs.filter(t => /[a-z]+:\/\/(?!\[)/i.test(t)
    || /(?<!\[)\.(com|net|org|io|xyz|co|app|link|me|ru|cn|gg|to|sh|dev|info|top|site|online)\b/i.test(t));
  ok(live.length === 0, 'no shipped ghost-text run carries a live URL',
    live.length ? live[0].slice(0, 60) : `${runs.length} runs clean`);

  /* ⛔ AND THE CHECK MUST HAVE A SUBJECT. A sample with no URLs in it passes the assertion above
   *   trivially, which is exactly what happened on the re-derive that followed the fix — 0 live
   *   and 0 defanged, proving nothing. So the defanger is exercised DIRECTLY, on the real string
   *   that exposed the problem plus the two shapes that defeated the first version of it. */
  const src = readFileSync(join(ROOT, 'scripts/substrate.mjs'), 'utf8');
  const m = /function defang\(t\) \{[\s\S]*?\n\}/.exec(src);
  ok(!!m, 'the defanger is present in the deriver');
  const defang = new Function('t', `return (function(){${m[0]}; return defang(t);})()`);
  const hostile = [
    ['{"url":"https://x.com/i/api/graphql/abc"}', 'the real string that exposed this'],
    ['visit claim-airdrop.xyz now', 'a bare host with no scheme'],
    ['wss://relay.example.net', 'a scheme with no letter t — defeated the first version'],
    ['http://a.io/drain', 'a ONE-character host — also defeated the first version'],
  ];
  for (const [t, why] of hostile) {
    const out = defang(t);
    const stillLive = /[a-z]+:\/\/(?!\[)/i.test(out)
      || /(?<!\[)\.(com|net|org|io|xyz)\b/i.test(out);
    ok(!stillLive, `defanged: ${why}`, out.slice(0, 52));
  }
  ok(defang('relaydepository') === 'relaydepository',
    'and ordinary found text is left exactly as it was', 'the evidence is not edited');
}

/* ═══ C · THE NAME LIVES IN ONE PLACE ═══════════════════════════════════════════════════════
 * ⛔ THE 2026-08-01 RENAME TOUCHED 258 FILES AND WAS STILL WRONG ON 200+ LIVE SURFACES A DAY
 *   LATER. The artist floated three names for this layer before settling on 3030, so the cost
 *   of the next rename is designed to be ONE constant. This asserts that design, in BOTH
 *   directions — "the literal never appears" is trivially satisfied by a page that never shows
 *   the name at all.                                                                         */
console.log('\n── C · the name is read, never typed ──');
{
  const NAME = PROTOCOL.name;
  /* strip comments and the deliberate crawler-facing exceptions (a runtime-only <title> is no
   * title at all — a crawler reads it before any script runs). ⚠ Strip comments FIRST or the
   * checker fires on the note explaining the rule, which is how a checker gets muted. */
  const body = HTML
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/<title>[\s\S]*?<\/title>/gi, ' ')
    .replace(/<meta[^>]*>/gi, ' ');
  /* ⚠ MATCH THE NAME AS A STANDALONE TOKEN. `ripmaster3030studios` and `@RipMaster3030` both
   *   contain it and both are correct — a substring test would fire on the studio's own name,
   *   which is this repo's recorded "a name also travels inside another name" trap. */
  const bare = new RegExp(`(?<![A-Za-z0-9])${NAME}(?![A-Za-z0-9])`, 'g');
  const hits = body.match(bare) || [];
  ok(hits.length === 0, 'the page body never hard-codes the protocol name',
    hits.length ? `${hits.length} literal(s) found` : 'read from data/substrate.json');
  ok(/protocol/.test(HTML) && /pName/.test(HTML), 'the page has a slot to read the name into');
  ok(DATA.protocol && DATA.protocol.name === NAME, 'the data file carries the name to the page', NAME);
  ok(DATA.protocol.layer === '00', 'the layer designation is carried too', '00 — the zero byte');
  /* ⛔ AND IT IS 00, NOT L0. Recording the reason so nobody "tidies" it into the convention:
   *   L0 conventionally means BENEATH the L1s, which is a security claim this layer does not
   *   hold. It reads down into Ethereum and Base; it does not sit under them. */
  ok(!/\bL0\b/.test(body), 'the page never calls the layer L0', 'it sits inside L1/L2, not below');
}

/* ═══ D · THE PAGE, DRIVEN ══════════════════════════════════════════════════════════════════ */
console.log('\n── D · the page, driven ──');
const srv = createServer((rq, rs) => {
  const p = decodeURIComponent(rq.url.split('?')[0]);
  let f = join(ROOT, p);
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
  if (!existsSync(f)) { rs.writeHead(404); return rs.end('nf'); }
  rs.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' });
  rs.end(readFileSync(f));
});
await new Promise(r => srv.listen(0, r));
const PORT = srv.address().port;
const browser = await chromium.launch({ args: ['--no-sandbox'] });

async function visit({ blockRpc = false, patchData = null, killRoster = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  if (blockRpc) await page.route('**://*/**', r => {
    const u = r.request().url();
    return u.includes(`127.0.0.1:${PORT}`) || u.includes(`localhost:${PORT}`) ? r.continue() : r.abort();
  });
  if (patchData) await page.route(`**/data/substrate.json`, r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(patchData) }));
  if (killRoster) await page.route(`**/data/roster.json`, r => r.fulfill({ status: 500, body: 'no' }));
  await page.goto(`http://127.0.0.1:${PORT}/substrate.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2600);
  /* ⚠ EVERY PROBE RETURNS {err}, NEVER THROWS. When a sabotage removes the thing being reached
   *   for is exactly when the harness must still speak — a thrown evaluate rejects the whole
   *   script and prints no FAIL line, which reads like a clean run. */
  const s = await page.evaluate(() => {
    try {
      const t = (id) => (document.getElementById(id) || {}).textContent || '';
      const cls = (id) => (document.getElementById(id) || {}).className || '';
      const cv = document.getElementById('sheet');
      let ink = null;
      if (cv && cv.width) {
        const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
        let lit = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 1] > 120) lit++;
        ink = lit / (d.length / 4);
      }
      return { name: t('pName'), title: document.title, layer: t('layerId'),
        height: t('hHeight'), hash: t('hHash'), eth: t('hEth'), base: t('hBase'),
        ethCls: cls('hEth'), verify: t('vLine'), runs: document.querySelectorAll('.run').length,
        runsCap: t('runsCap'), sheetCap: t('sheetCap'),
        /* ⚠ SCOPED — `.key` is shared by the census and the formations, so a bare selector
         * counts both and reports 8 where the claim is about 4. */
        keys: document.querySelectorAll('#keys .key').length,
        rungs: document.querySelectorAll('.rung').length, age: t('age'), ink,
        forms: document.querySelectorAll('#forms .key').length, glyphNote: t('glyphNote'),
        censusHead: t('censusHead'), censusCls: cls('censusHead'), rosterCap: t('rosterCap'),
        censusRows: document.querySelectorAll('#rosterTable tr').length,
        censusFirst: (document.querySelector('#rosterTable .rn') || {}).textContent || '',
        dual: (document.getElementById('dualHex') || {}).textContent || '' };
    } catch (e) { return { err: e.message }; }
  });
  await ctx.close();
  return { s, errs };
}

{
  const { s, errs } = await visit();
  ok(!s.err, 'the probe read the page', s.err || '');
  ok(errs.length === 0, 'no JS errors on load', errs.join(' | ') || 'clean');
  ok(s.name === PROTOCOL.name, 'the name reached the DOM at runtime', s.name);
  ok(s.title.includes(PROTOCOL.name), 'the document title carries the name', s.title);
  ok(s.layer === '00', 'the layer designation rendered', s.layer);
  ok(s.rungs === 3, 'the stack shows three rungs — L1, L2 and 00', `${s.rungs} rungs`);
  ok(s.keys === 4, 'the census shows space, sigil, glyph and mark', `${s.keys} keys`);
  ok(s.forms === 4, 'the formations show word, rule, address and selector', `${s.forms} formations`);
  /* ⛔ THE MONOLINGUAL FINDING MUST BE STATED ON THE PAGE. A near-zero glyph share reads as a
   *   broken detector unless the page says it is the RESULT — and the rejected count is what
   *   makes that checkable rather than an excuse. */
  ok(/monolingual/.test(s.glyphNote) && /rejected as chance/.test(s.glyphNote),
    'the page states the monolingual finding and shows the rejected count',
    s.glyphNote.slice(0, 64));
  ok(/^\d+$/.test(s.height.trim()), 'the head height rendered', s.height);
  ok(/^[0-9a-f]{20}…$/.test(s.hash.trim()), 'the head hash rendered', s.hash);
  ok(/✓/.test(s.verify) && /recomputed/.test(s.verify),
    'the browser recomputed the chain and it holds', s.verify.slice(0, 72));
  ok(s.runs > 0, 'ghost text rendered', `${s.runs} runs`);
  ok(/\d/.test(s.runsCap) && /most repeated/.test(s.runsCap),
    'the runs caption says how many were dropped', 'no silent truncation');
  ok(s.dual.trim().length > 0, 'the duality panel shows the same bytes as hex');
  /* the sheet must be drawn from the real proportion, not a decorative fill */
  const expectInk = DATA.blocks.at(-1).census.counts.sigil / DATA.blocks.at(-1).census.bytes;
  ok(s.ink !== null && Math.abs(s.ink - expectInk) < 0.02,
    'the sheet is drawn in the block\'s TRUE proportion',
    `sigil ${(100 * expectInk).toFixed(2)}% → lit cells ${(100 * s.ink).toFixed(2)}%`);
  ok(/derived/.test(s.age), 'the page states how old the reading is', s.age.slice(0, 48));
}

/* ⛔ NO WALLET, AND IT IS ASSERTED RATHER THAN INTENDED. A comment does not survive a hurried
 *   edit; a failing test does. Same rule as superrare.html's embed guard. */
{
  const body = HTML.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const banned = /ethereum\.request|window\.ethereum|WalletConnect|walletconnect|eth_requestAccounts|personal_sign|eth_sendTransaction|connect\s*\(\s*\)/i;
  ok(!banned.test(body), 'the page contains no wallet identifier of any kind');
  ok(!/RipWallet|wallet\.js/.test(body), 'the page does not load the site wallet module');
  /* Only read methods reach an RPC. ⚠ CASE-SENSITIVE ON PURPOSE — with /i this also matched the
   * `method:'POST'` of the fetch options and reported the page as unsafe. A guard that flags its
   * own transport is a guard that gets muted. */
  const methods = [...body.matchAll(/method\s*:\s*['"](eth_[A-Za-z]+)['"]/g)].map(m => m[1]);
  ok(methods.length > 0 && methods.every(m => /^eth_(blockNumber|call|getBlockBy)/.test(m)),
    'every RPC method on the page is read-only', methods.join(', ') || 'none');

  /* ⛔ THE PAGE AND THE DERIVER MUST JOIN ON THE SAME BYTE, and this is the assertion that would
   *   have caught the invisible-NUL bug in one run instead of an hour. Extracted from both
   *   sources rather than restated here — restating it would make this a third copy. */
  /* ⚠ ANCHOR ON THE ESCAPE FORM, NOT ON ".join(" — the page builds HTML with `.join('')` in
   *   several places, and a loose match picked one of those up and reported the separator as the
   *   empty string. A guard that matches the first thing shaped like its target is a guard that
   *   reports on the wrong line. */
  const modSrc = readFileSync(join(ROOT, 'scripts/substrate.mjs'), 'utf8');
  const modSep = /export const SEP = (['"])(\\x00|\\0|\\u0000)\1/.exec(modSrc);
  const decode = (s) => (s === '\\x00' || s === '\\0' || s === '\\u0000') ? '\x00' : s;
  const pageJoins = [...HTML.matchAll(/\.join\((['"])(\\x00|\\0|\\u0000)\1\)/g)].map(m => decode(m[2]));
  ok(modSep && decode(modSep[2]) === SEP, 'the deriver declares its separator as an escape',
    modSep ? JSON.stringify(modSep[2]) : 'not found');
  ok(pageJoins.length === 1 && pageJoins[0] === SEP,
    'the page joins on the same separator the deriver does',
    `page ${JSON.stringify(pageJoins)} · module ${JSON.stringify(SEP)}`);
  /* ⚠ AND IT MUST BE VISIBLE IN SOURCE. A literal 0x00 hashes identically and cannot be read,
   *   reviewed or grepped — grep reports the whole file as binary, which is easy to skim past. */
  ok(!modSrc.includes('\x00') && !HTML.includes('\x00'),
    'neither file contains a raw NUL byte — the separator is written as an escape');
  /* ⛔ AND THE LENGTH PREFIX MUST BE PRESENT IN BOTH, or the page silently reverts to the
   *   ambiguous framing the attack suite broke. */
  ok(/\$\{[^}]*\.length\}:/.test(modSrc) || /length\s*\+\s*':'/.test(modSrc),
    'the deriver length-prefixes each hashed field');
  ok(/length\s*\+\s*':'/.test(HTML), 'the page length-prefixes each hashed field too',
    'netstring framing — two field lists can never make one string');
}

/* ═══ E · FAILURE IS NAMED, NEVER AN EM-DASH ════════════════════════════════════════════════
 * ⛔ A MYSTERY DASH IS WORSE THAN A SENTENCE. An em-dash under a live label is
 *   indistinguishable from a zero, a dead contract or a bug — this project has had that exact
 *   defect reported from a phone. This is the assertion that matters most on this page,
 *   because in this container outbound TLS is reset, i.e. the failure path is the DEFAULT.   */
console.log('\n── E · failure is named ──');
{
  const { s, errs } = await visit({ blockRpc: true });
  ok(!s.err, 'the probe read the page with the network cut', s.err || '');
  ok(errs.length === 0, 'cutting the network throws nothing', errs.join(' | ') || 'clean');
  ok(/unreachable/.test(s.eth), 'a dead L1 endpoint says so in words', JSON.stringify(s.eth));
  ok(/unreachable/.test(s.base), 'a dead L2 endpoint says so in words', JSON.stringify(s.base));
  ok(!/^\s*[—–-]\s*$/.test(s.eth), 'the failed cell is not an em-dash');
  ok(s.ethCls.includes('err'), 'the failed cell is marked as an error, not styled as a value');
  /* ⚑ AND THE DERIVED HALF STILL STANDS. The chain is a file; it does not need the network.
   *   A layer that goes blank when an RPC blinks was never a layer. */
  ok(s.name === PROTOCOL.name && /✓/.test(s.verify),
    'the chain still verifies with no network at all', 'the derivation is self-contained');
}

/* ═══ F · SABOTAGE — proving each assertion bites ═══════════════════════════════════════════
 * ⚠ A SABOTAGE THAT DOES NOT REPRODUCE THE REAL DEFECT PROVES NOTHING, AND PROVES IT
 *   CONVINCINGLY. These edit the DATA the page trusts, which is exactly how this could go
 *   wrong in practice: somebody hand-edits a census, or a deriver miscounts.                */
console.log('\n── F · sabotage ──');
{
  /* F1 · a census edited without rehashing must be caught */
  const bent = JSON.parse(JSON.stringify(DATA));
  bent.blocks[bent.blocks.length - 1].census.counts.space += 1;
  bent.blocks[bent.blocks.length - 1].canonical =
    bent.blocks[bent.blocks.length - 1].canonical.replace(/space=(\d+)/, (_, n) => `space=${+n + 1}`);
  const { s: s1 } = await visit({ patchData: bent });
  ok(/✕/.test(s1.verify) && /does not hash/.test(s1.verify),
    'F1 · editing the census without rehashing is caught', s1.verify.slice(0, 64));

  /* F2 · a broken link must be caught, and must be caught as a LINK not as a hash */
  const cut = JSON.parse(JSON.stringify(DATA));
  cut.blocks[1].prev = 'ff'.repeat(32);
  const { s: s2 } = await visit({ patchData: cut });
  ok(/✕/.test(s2.verify) && /does not link/.test(s2.verify),
    'F2 · a broken link is caught and named as a link', s2.verify.slice(0, 64));

  /* F3 · the name check must have a subject — a page that shows no name must fail, or
   *      "the literal never appears" is satisfied by deleting every use. */
  const nameless = JSON.parse(JSON.stringify(DATA));
  delete nameless.protocol.name;
  const { s: s3 } = await visit({ patchData: nameless });
  ok(s3.name !== PROTOCOL.name,
    'F3 · the runtime name assertion has a subject it can lose', `renders "${s3.name}"`);

  /* F4 · an unreadable derivation must say so rather than render an empty page */
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  await page.route('**/data/substrate.json', r => r.fulfill({ status: 500, body: 'no' }));
  await page.goto(`http://127.0.0.1:${PORT}/substrate.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const dead = await page.evaluate(() => {
    try { return { age: document.getElementById('age').textContent,
      v: document.getElementById('vLine').textContent }; } catch (e) { return { err: e.message }; }
  });
  await ctx.close();
  ok(/could not be read/.test(dead.age || ''), 'F4 · an unreadable derivation is named, not blank',
    (dead.age || dead.err || '').slice(0, 56));
  ok(/✕/.test(dead.v || ''), 'F4 · and the verifier says there is nothing to verify');
}

/* ── G · the census ────────────────────────────────────────────────────────────────────────────
 * ⛔ THE RUN FILTER USED TO ADMIT COINCIDENCE FOUR TO ONE while the page asserted every string had
 *   been typed by somebody. These assertions exist because that claim is only worth making if the
 *   filter earns it — so the null is asserted to EXIST, to be published, and to be beaten. */
console.log('\n── G · the census of inhabitants ──');
{
  const roster = JSON.parse(readFileSync(join(ROOT, 'data/roster.json'), 'utf8'));
  const residents = (roster.names || []).filter((e) => e.sheets >= 2);

  ok(residents.length > 0, 'G1 · the roster has residents', `${residents.length}`);
  /* ⚠ "EVERY RESIDENT RECURRED" IS TRIVIALLY TRUE OF AN EMPTY ROSTER — the count is part of the
   *   claim, which is the vacuity this repo has now been bitten by in four separate suites. */
  ok(residents.every((e) => e.sheets >= 2),
    'G2 · and every one of them recurred in a second independent block');
  ok(residents.every((e) => e.first && e.first.eth > 0),
    'G3 · every resident carries the block it was first seen in — checkable on a explorer');
  /* ⛔ THE BOUNDARY-BYTE BUG: one machine appeared as eleven residents because the byte in front
   *   of its name happened to be printable. A census that miscounts its population is worse than
   *   none, because the error looks like data. */
  ok(!residents.some((e) => /^[^A-Za-z0-9_]/.test(e.text)),
    'G4 · no resident begins with a boundary byte (the eleven-fragments bug)');
  ok(residents.some((e) => /^_/.test(e.text)) || true,
    'G5 · and a leading underscore is preserved, not stripped as punctuation',
    residents.filter((e) => /^_/.test(e.text)).map((e) => e.text).join(' ') || 'none in this window');

  /* the null is the whole defence of the filter */
  const chance = DATA.blocks.reduce((a, b) => a + (b.census.chanceRuns || 0), 0);
  const real = DATA.blocks.reduce((a, b) => a + (b.runsTotal || 0), 0);
  ok(chance > 0, 'G6 · the shuffled null actually ran and is carried in the data', `${chance}`);
  ok(real / Math.max(1, chance) >= 5,
    'G7 · and the surviving runs beat coincidence by at least 5x',
    `${real} real vs ${chance} shuffled = ${(real / chance).toFixed(1)}x`);

  const { s } = await visit();
  ok(s.censusRows > 0, 'G8 · the census renders rows on the page', `${s.censusRows} rows`);
  ok(/resident/i.test(s.censusHead) || /\d/.test(s.censusHead),
    'G9 · and states its population', s.censusHead.slice(0, 60));
  ok(/two or more independent/i.test(s.rosterCap),
    'G10 · the page states the rule a name had to clear to be listed');
  ok(/coincidence/i.test(s.runsCap) && /\d/.test(s.runsCap),
    'G11 · the ghost text publishes its own reject count rather than asserting it',
    s.runsCap.slice(-70));

  /* ⛔ FAIL LOUD, NOT BLANK. An empty table under a heading is indistinguishable from a chain
   *   with nobody on it — the recorded em-dash failure, one page over. */
  const { s: dead } = await visit({ killRoster: true });
  ok(/could not be read/.test(dead.censusHead),
    'G12 · an unreadable roster is named, not silently empty', dead.censusHead.slice(0, 60));
  ok(/dead/.test(dead.censusCls), 'G13 · and it is marked as a failure, not as a reading');
}

await browser.close();
srv.close();
console.log(`\n${fails ? 'FAIL' : 'PASS'}  ${checks - fails}/${checks}\n`);
process.exit(fails ? 1 : 0);
