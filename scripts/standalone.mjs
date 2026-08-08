#!/usr/bin/env node
/* ripmaster3030studios — STANDALONE GAME EXPORT.  `npm run standalone [game|all]`
 *
 * Builds a crypto-free, self-contained copy of a cabinet into `build/standalone/<game>/`,
 * ready to drop on itch.io, Newgrounds, r/WebGames or Show HN.
 *
 * ⛔ WHY CRYPTO-FREE IS THE WHOLE POINT, AND NOT A COMPROMISE. The site has 31 holders and the
 *   games have never been shown anywhere a stranger already is. Game portals bury — and their
 *   communities brigade — anything that mentions a token, so shipping the arcade with a wallet
 *   in it converts the one genuine asset this studio owns into a reason to be ignored. The
 *   studio name and one link in the credits is the whole ask. **The token is discovered second,
 *   by somebody who already likes the game.**
 *
 * ⚑ THE STRIP LIST IS A DENY-LIST OF MODULES, NOT A TEXT SCRUB. Deleting the word "3030" out of
 *   a build would leave the calls to `RipWallet` in place and break the game silently; removing
 *   the SCRIPT TAG removes the capability, and every one of these modules is already written to
 *   fail open (that is a standing rule in this repo), so the game degrades to itself.
 * ⚠ Which is a claim that has to be PROVEN per game, not assumed — `npm run test:standalone`
 *   drives every build and asserts it still boots, renders and takes input with none of them.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, cpSync, statSync } from 'node:fs';
import { join, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'build/standalone');

/* Everything that reaches for a wallet, our API, our chain, or somebody else's audio. */
const STRIP = [
  'js/chain-config.js', 'js/wallet.js', 'js/wallet-ui.js', 'js/session.js', 'js/eth-play.js',
  'js/lens-state.js', 'js/hero-claim.js', 'js/title-ledger.js', 'js/leaderboard.js',
  'js/vault-fix.js', 'js/challenge-ui.js', 'cards/arena-net.js', 'js/city-net.js',
  'js/arena-lobby.js',
  /* ⛔ `js/wager-payout.js` IS NOT ON THIS LIST AND MUST NOT GO BACK ON IT. I stripped it in the
   *   first pass because "wager" sounds like money; it is pure podium arithmetic (1st/2nd/3rd,
   *   ordinals) and reads `RipWallet` only through `splitLive()`, which returns false when the
   *   wallet is absent. Removing it threw `WagerPayout is not defined` at DOGFIGHT's result
   *   screen — i.e. the game played fine and then died at the final whistle, which is precisely
   *   the deleted-`music`-binding failure this repo already has on record. Caught by the suite,
   *   not by reading. **Strip by CAPABILITY, never by the sound of a filename.** */
  'theme.js',      // streams somebody else's album — not ours to redistribute in a download
  '/gate.js',      // the pre-launch veil has no meaning off-site
];

/* ⛔ SOURCE PATCHES, AND EACH ONE THROWS IF ITS ANCHOR IS GONE. A silent `String.replace` that
 *   matches nothing is this repo's recorded worst case — the edit does not happen and nothing
 *   says so — so a missed anchor is a build failure, not a warning. */
const PATCHES = [
  { file: 'js/card-powers.js',
    find: `CFG.rpcs || ['https://ethereum-sepolia-rpc.publicnode.com']`,
    to:   `CFG.rpcs || []   /* standalone: no chain, no fallback */`,
    why:  'card-powers falls back to a hardcoded SEPOLIA rpc when chain-config is absent — which ' +
          'is exactly the state of every standalone build, so it phones a testnet on load' },
  { file: 'js/rrpc-app.js',
    find: `CFG.rpcs || ['https://ethereum-sepolia-rpc.publicnode.com']`,
    to:   `CFG.rpcs || []   /* standalone: no chain, no fallback */`,
    why:  'the same hardcoded SEPOLIA fallback, second site — RIP ROCKETER phoned a testnet from ' +
          'a crypto-free build until the suite caught the request' },
];
/* ⚠ AND THIS IS A LIVE-SITE FINDING, NOT JUST AN EXPORT ONE. Both fallbacks fire whenever
 *   `window.RIPMASTER_CHAIN` is missing — so on the real mainnet site, any load where
 *   chain-config.js fails to arrive sends the page to a SEPOLIA endpoint and reads a testnet as
 *   though it were the market. It is a 404-on-one-script away, and nothing would say so. */

/* ⛔ THE META DESCRIPTION SHIPS THE TICKER, AND IT IS THE ONE STRING A PORTAL SCRAPES.
 *   The cabinets' own `<meta name="description">` read "Ante $3030 and stake your cards…" — so a
 *   build that had correctly stripped every wallet module still introduced itself to itch.io as a
 *   crypto game, in the single sentence that becomes the listing blurb. My BANNED list missed it
 *   because it hunts CAPABILITY (rpc urls, connect paths, the contract address) and this is
 *   PROSE. Both matter, for different reasons: capability is what phones home, prose is what gets
 *   you buried.
 * ⚠ These are the cabinets' own words with the ante clauses removed — not new copy. Anything
 *   genuinely missing is left EMPTY and reported, rather than invented: the arcade menu has
 *   already once described a game that was not the one that shipped, and a listing is a promise
 *   to a stranger who has not played it yet. */
const GAMES = {
  city: { file: 'city.html', title: 'THE CITY',
    blurb: 'Explore a 3.8 km generated city as a bird, a squirrel, a cat or a dog. No timer, no score, nothing chasing you — fly the river, climb the towers, and find the places only your animal can reach.' },
  cloudracer: { file: 'cloudracer.html', title: 'CLOUD RACER',
    blurb: 'Anti-grav pod racing on a white sky-circuit. Take the inside line, earn your boost, tuck into the slipstream and take the podium.' },
  riprocketer: { file: 'riprocketer.html', title: 'RIP ROCKETER',
    blurb: 'Galaga on acid. A formation of trading cards flies in, breaks out and dives at you. Rip it back.' },
  dogfight: { file: 'dogfight.html', title: 'DOGFIGHT',
    blurb: 'A contained-arena dogfight. Fly a hand-built craft into a winner-takes-all melee — most frags takes the podium.' },
  section9: { file: 'section9.html', title: 'SECTION 9',
    blurb: 'A tactical arena shooter. Six maps, real cover, bots that flank and suppress, and a time-to-kill long enough that positioning beats reflexes.' },
};

const CREDIT = (title) => `
<!-- ripmaster3030studios — ${title}. Standalone build, no account, no network, nothing to install. -->
<div id="sa-credit" style="position:fixed;left:8px;bottom:6px;z-index:2147483000;font:11px/1.4 ui-monospace,Menlo,monospace;color:#8a8f98;opacity:.72;pointer-events:auto">
  <a href="https://www.ripmaster3030studios.com" target="_blank" rel="noopener"
     style="color:#8a8f98;text-decoration:none">ripmaster3030studios</a>
</div>`;

/* Pull every same-origin asset an HTML file names, follow one level into its scripts, and copy
 * only those. ⚠ A blanket copy of the repo would sweep 31 MB of card art and the contracts into
 * a game download; a hand-written list would go stale the first time a game gains a module. */
function assetsOf(html, seen = new Set()) {
  const out = new Set();
  const add = p => { if (p && !/^(https?:|data:|#|mailto:)/.test(p)) out.add(p.replace(/^\.?\//, '').split('?')[0]); };
  for (const m of html.matchAll(/(?:src|href)\s*=\s*"([^"]+)"/g)) add(m[1]);
  for (const m of html.matchAll(/["'`](?:\.\/)?((?:js|vendor|models|media|art|cards|audio|fonts)\/[A-Za-z0-9_\-./]+\.[a-z0-9]{2,5})["'`]/g)) add(m[1]);
  return out;
}

function build(key) {
  const g = GAMES[key];
  const src = join(ROOT, g.file);
  if (!existsSync(src)) return { key, ok: false, why: 'missing ' + g.file };
  let html = readFileSync(src, 'utf8');

  /* 1 — remove the script tags, and count what actually matched so a rename cannot silently
   *     leave a wallet in the build. */
  let removed = [];
  for (const s of STRIP) {
    const re = new RegExp(`[ \\t]*<script[^>]*src="${s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}"[^>]*>\\s*</script>[ \\t]*\\r?\\n?`, 'g');
    if (re.test(html)) { html = html.replace(re, ''); removed.push(s); }
  }
  /* 2 — the site's own nav/footer links point back at pages that do not exist in the export. */
  html = html.replace(/<a\b[^>]*href="(?:\/|\.\/)?(?:index\.html|cards\/[^"]*|arcade\.html|whitepaper\.html|tokenomics\.html|updates\.html)"[^>]*>[\s\S]*?<\/a>/g, '');
  /* 3 — the meta description a portal will scrape. Replaced, never patched around. */
  const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const metaRe = /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i;
  const meta = `<meta name="description" content="${esc(g.blurb)}">`;
  html = metaRe.test(html) ? html.replace(metaRe, meta)
                           : html.replace(/<\/head>/i, '  ' + meta + '\n</head>');
  /* 4 — the credit line, which is the entire funnel. */
  html = html.replace(/<\/body>/i, CREDIT(g.title) + '\n</body>');

  const dir = join(OUT, key);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), html);

  /* 4 — copy the assets the surviving markup names, one level deep through the scripts. */
  const want = assetsOf(html);
  for (const f of [...want]) {
    if (!/\.(js|mjs)$/.test(f)) continue;
    const p = join(ROOT, f);
    if (existsSync(p)) for (const d of assetsOf(readFileSync(p, 'utf8'))) want.add(d);
  }
  let copied = 0, bytes = 0, missing = [], patched = [];
  for (const f of want) {
    if (STRIP.some(s => f === s.replace(/^\//, ''))) continue;
    /* ⛔ NEVER COPY ANOTHER PAGE. The asset sweep follows `cards/…` and sibling paths out of the
     *   scripts, which dragged battle.html, deck.html, market.html, dogfight.html and
     *   riprocketer.html into the exports — whole other cabinets, each carrying the wallet this
     *   build exists to remove. The entry document is written by hand above; nothing else is a
     *   document. Found by the suite flagging "a wallet hook in cards/battle.html" inside a
     *   build that had, correctly, stripped its own. */
    if (/\.html?$/i.test(f)) continue;
    const from = join(ROOT, f), to = join(dir, f);
    if (!existsSync(from)) { missing.push(f); continue; }
    if (statSync(from).isDirectory()) continue;
    mkdirSync(dirname(to), { recursive: true });
    const p = PATCHES.find(x => x.file === f);
    if (p) {
      const s = readFileSync(from, 'utf8');
      if (!s.includes(p.find)) throw new Error(`patch anchor missing in ${f} — ${p.why}`);
      writeFileSync(to, s.split(p.find).join(p.to));
      patched.push(f);
    } else cpSync(from, to);
    copied++; bytes += statSync(from).size;
  }
  return { key, ok: true, removed, copied, bytes, missing, patched, dir };
}

/* ⛔ STATIC ANALYSIS CANNOT SEE A COMPUTED PATH, AND FOUR OF FIVE BUILDS SHIPPED BROKEN BECAUSE
 *   OF IT. `assetsOf` matches string literals, so `cards/art/deck/${n}.webp` and anything named
 *   inside a fetched JSON manifest is invisible to it — DOGFIGHT and RIP ROCKETER went out
 *   missing the CARD ART, which is what those games are about. It passed every check I had
 *   because the games fail open: a 404 throws nothing, renders nothing, and looks fine.
 * ⚑ SO THE SWEEP IS EMPIRICAL NOW. Serve the build, PLAY it, write down every request that 404s,
 *   copy exactly those, and go again until a pass adds nothing. What the game asks for is not a
 *   guess about the game — it is the game. */
async function trace(keys) {
  const { createServer } = await import('node:http');
  const { createRequire } = await import('node:module');
  const { chromium } = createRequire(import.meta.url)(
    '/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.js');
  const MT = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
    '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.svg': 'image/svg+xml',
    '.glb': 'model/gltf-binary', '.skn': 'application/octet-stream', '.wld': 'application/octet-stream',
    '.mp3': 'audio/mpeg', '.gif': 'image/gif', '.bin': 'application/octet-stream' };
  let SERVE = '', missed = [];
  const srv = createServer((q, r) => {
    let p = q.url.split('?')[0]; if (p === '/') p = '/index.html';
    const f = join(SERVE, decodeURIComponent(p));
    if (!existsSync(f) || !extname(f)) { missed.push(p.replace(/^\//, '')); r.writeHead(404); return r.end('x'); }
    r.writeHead(200, { 'content-type': MT[extname(f)] || 'application/octet-stream' }); r.end(readFileSync(f));
  });
  await new Promise(z => srv.listen(8092, z));
  const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const out = {};
  for (const k of keys) {
    SERVE = join(OUT, k);
    let added = 0;
    for (let pass = 0; pass < 3; pass++) {
      missed = [];
      const pg = await br.newPage({ viewport: { width: 1280, height: 720 } });
      await pg.goto('http://localhost:8092/index.html', { waitUntil: 'domcontentloaded' }).catch(() => {});
      await pg.waitForTimeout(4000);
      for (const sel of ['#btnPractice', '#btnStart', '#btnPlay']) {
        const el = await pg.$(sel).catch(() => null);
        if (el && await el.isVisible().catch(() => false)) { await el.click().catch(() => {}); break; }
      }
      await pg.waitForTimeout(3500);
      await pg.keyboard.press('Space').catch(() => {});
      await pg.keyboard.down('KeyW').catch(() => {}); await pg.waitForTimeout(1800);
      await pg.keyboard.up('KeyW').catch(() => {}); await pg.waitForTimeout(1200);
      await pg.close();
      const want = [...new Set(missed)].filter(f => !/^(gate\.js|favicon)/.test(f));
      let got = 0;
      for (const f of want) {
        const from = join(ROOT, f); if (!existsSync(from) || statSync(from).isDirectory()) continue;
        const to = join(OUT, k, f); mkdirSync(dirname(to), { recursive: true });
        cpSync(from, to); got++; added++;
      }
      if (!got) break;
    }
    out[k] = added;
  }
  await br.close(); srv.close();
  return out;
}

const arg = (process.argv[2] || 'all').toLowerCase();
const keys = arg === 'all' ? Object.keys(GAMES) : [arg];
if (keys.some(k => !GAMES[k])) { console.log('  games: ' + Object.keys(GAMES).join(' · ') + ' · all'); process.exit(1); }

console.log('\n  STANDALONE EXPORT — crypto-free, self-contained\n');
for (const k of keys) {
  const r = build(k);
  if (!r.ok) { console.log(`  ⛔ ${k}: ${r.why}`); continue; }
  console.log(`  ${k.padEnd(12)} ${String(r.copied).padStart(3)} files  ${(r.bytes / 1048576).toFixed(1)} MB   stripped ${r.removed.length} modules`);
  if (r.missing.length) console.log(`     ⚠ ${r.missing.length} referenced asset(s) not found: ${r.missing.slice(0, 3).join(', ')}${r.missing.length > 3 ? '…' : ''}`);
}
/* ⚑ THE TRACE PASS. Nothing above it can see a computed path; this can, because it asks the
 * running game. */
console.log('\n  tracing what each build actually REQUESTS (playing it, not parsing it)…');
const traced = await trace(keys.filter(k => GAMES[k]));
for (const [k, n] of Object.entries(traced))
  console.log(`  ${k.padEnd(12)} ${n ? `+${n} assets static analysis could not see` : 'nothing missing'}`);

console.log(`\n  → ${OUT}`);
console.log('  ⚠ Run `npm run test:standalone` before shipping — a build that boots is not a build that PLAYS.\n');
