#!/usr/bin/env node
/* ripmaster3030studios — guard for js/lens-state.js + js/card-layers.js.
 *
 *     node scripts/test-lens-state.mjs            (offline: selectors, decoding, schema)
 *     node scripts/test-lens-state.mjs --live     (also hits Sepolia and re-proves word order)
 *
 * ⚑ WHY THIS EXISTS. Exactly the reason `npm run test:split` exists. A wrong 4-byte selector in
 *   a read path FAILS SILENTLY: `eth_call` returns '0x' or reverts, the card shrugs and shows
 *   its static state, and nobody finds out until a collector's card is permanently, quietly
 *   dead. Writing selectors from memory has already produced two wrong ones in this repo. So
 *   they are recomputed here from their signature strings with keccak and asserted against the
 *   literals in the shipped file — the pair cannot silently disagree.
 *
 * ⚑ AND IT PINS THE TRAP. `maxTotalSupply()` = 0x2ab4d052; `0xd5abeb01` is `maxSupply()`, a
 *   DIFFERENT function that reverts on this edition. A test that only checked "the selector is
 *   32 bits of hex" would have shipped that.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sha3 from 'js-sha3';
const { keccak_256 } = sha3;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  FAIL  ' + m); } };
const head = (s) => console.log('\n' + s);

/* Load the browser globals the same way a browser would: evaluate the IIFE against a fake
 * window. If the file ever stops being a plain script this breaks loudly, which is correct —
 * it has to stay loadable by <script src> inside a sandboxed frame. */
const globalWin = { location: { href: 'https://ripmaster3030studios.com/cards/lens3d.html' } };
globalWin.window = globalWin;
function loadBrowserModule(rel) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  new Function('window', 'globalThis', 'document', 'fetch', src)
    .call(globalWin, globalWin, globalWin, undefined, undefined);
}
loadBrowserModule('js/lens-state.js');
loadBrowserModule('js/card-layers.js');
const LensState = globalWin.LensState, CardLayers = globalWin.CardLayers;

head('1. selectors — recomputed from the signature, not trusted');
ok(!!LensState, 'LensState registered on window');
const SEL = LensState.SEL;
for (const [sig, hex] of Object.entries(SEL)) {
  const want = '0x' + keccak_256(sig).slice(0, 8);
  ok(hex === want, `${sig} should be ${want}, file says ${hex}`);
}
ok(SEL['maxTotalSupply()'] === '0x2ab4d052', 'maxTotalSupply() is 0x2ab4d052');
ok(!Object.values(SEL).includes('0xd5abeb01'),
   'maxSupply() 0xd5abeb01 must NOT appear — it reverts on this edition');
ok(SEL['getMarketState()'] === '0xd8165743', 'getMarketState() is 0xd8165743');
/* The calls the card actually needs, no more: every extra call is another way to be slow.
 * ⚑ THREE ON THE EDITION + ONE ON THE LENS. The fourth is `lensState(id)`, and it is a read of a
 *   DIFFERENT CONTRACT — the 721 rather than the ERC-20 — which is why it is worth counting
 *   separately rather than letting this number drift upward unremarked. It needs no wallet: the
 *   contract resolves the card's owner itself, so the card learns who holds it without asking the
 *   viewer to connect anything, which is the only reason a tier read can ship in the media slot. */
ok(Object.keys(SEL).length === 4, 'exactly four reads — three on the edition, one on the lens');
ok(SEL['lensState(uint256)'] === '0x9fa9fc54', 'lensState(uint256) is 0x9fa9fc54');

head('2. static state — what ships when the frame blocks the network');
const S = LensState.STATIC;
ok(S.live === false, 'STATIC.live is false');
ok(S.burned === null && S.rarePerToken === null, 'STATIC carries no numbers, only nulls');
const d0 = LensState.derive(null);
ok(d0.live === false && d0.burn === 0 && d0.price === 0.5 && d0.depth === 0.5,
   'derive(null) rests at burn 0 / price .5 / depth .5 — the tuned card');
ok(Object.isFrozen(S), 'STATIC is frozen');

head('3. dials');
LensState._resetRef(null);
const mk = (o) => Object.assign({ live: true, orderOk: true, burnFrac: 0, tick: 0, liquidity: 1,
                                  supply: 1, maxSupply: 1, burned: 0, rarePerToken: 1,
                                  tokenPerRare: 1, at: 0, reason: 'ok' }, o);
const dBurnFull = LensState.derive(mk({ burnFrac: 0.031 }));
ok(Math.abs(dBurnFull.burn - 1) < 1e-9, 'burn dial saturates at the modelled 3.1% programme burn');
ok(LensState.derive(mk({ burnFrac: 0 })).burn === 0, 'burn dial is 0 before any burn');
const live = 998700, cap = 1000000;             // Sepolia today
const dNow = LensState.derive(mk({ burnFrac: (cap - live) / cap }));
ok(dNow.burn > 0.15 && dNow.burn < 0.30,
   `today's 1,300-token burn reads ${dNow.burn.toFixed(3)} — visible, not saturated`);
ok(LensState.derive(mk({ burnFrac: 5 })).burn === 1, 'burn dial clamps above 1');
// price/depth need a reference; without one they must NOT invent a scale
ok(LensState.derive(mk({ tick: 12345 })).price === 0.5,
   'no reference -> price rests at 0.5 rather than inventing P0');
const ref = { ref: { tick: 0, liquidity: 100 }, chain: null };
ok(Math.abs(LensState.derive(mk({ tick: 6932 }), ref).price - 1) < 1e-6,
   'a 2x move (6932 ticks) is one full swing of the price dial');
ok(Math.abs(LensState.derive(mk({ tick: -6932 }), ref).price - 0) < 1e-6, 'and -2x is the other end');
ok(LensState.derive(mk({ liquidity: 0 }), ref).depth === 0,
   'zero liquidity -> depth 0: no depth in the book, no depth in the card');
ok(Math.abs(LensState.derive(mk({ liquidity: 1000 }), ref).depth - 1) < 1e-6, 'a decade of liquidity is one full swing');

head('4. word-order proof — the check that makes a drift visible');
// the real Sepolia words, 2026-08-01
const W = {
  total: '0x' + (998700n * 10n ** 18n).toString(16).padStart(64, '0'),
  max:   '0x' + (1000000n * 10n ** 18n).toString(16).padStart(64, '0'),
  mkt:   '0x000000000000000000000000000000000000000000000000e8ec1be2e0dc8384'
       + '00000000000000000000000000000000000000000000000000d3acc6c8830b2d'
       + '00000000000000000000000000000000000000003e7cda0406549474cfadeb4d'
       + 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff91d2'
       + '0000000000000000000000000000000000000000000060534db34990735a1c62'
       + '00000000000000000000000000000000000000000000d37ba2af049f99300000'
};
const decode = makeDecoder();
const st = decode(W.total, W.max, W.mkt);
ok(!!st && st.live, 'the real Sepolia payload decodes');
ok(st.orderOk === true, 'word order verified: 1.0001^tick == tokenPerRare');
ok(Math.abs(st.rarePerToken - 16.78382) < 1e-4, `rarePerToken ${st.rarePerToken}`);
ok(Math.abs(st.burned - 1300) < 1e-6, `burned ${st.burned}`);
ok(Math.abs(st.supply - 998700) < 1e-6, 'supply decoded past 2^53 without losing digits');
// swap word0/word1 — the exact drift CLAUDE.md warns about
const swapped = W.mkt.slice(0, 2) + W.mkt.slice(66, 130) + W.mkt.slice(2, 66) + W.mkt.slice(130);
const stS = decode(W.total, W.max, swapped);
ok(stS && stS.orderOk === false, 'a transposed word0/word1 is CAUGHT');
ok(stS && stS.rarePerToken === null && stS.tick === null,
   'and the price is withheld rather than rendered 280x wrong');
ok(stS && stS.burned === 1300, 'burn survives a price drift — it does not come from getMarketState');
// a cap below the live supply must poison the whole read
ok(decode(W.max, W.total, W.mkt) === null, 'cap < supply is refused outright');
ok(decode('0x', W.max, W.mkt) === null, 'a reverted call is refused');
ok(decode(W.total, W.max, '0x' + '00'.repeat(64)) === null, 'a short getMarketState is refused');

head('5. layer schema — null is the normal answer');
ok(CardLayers.normalize(null) === null, 'no spec -> null');
ok(CardLayers.normalize({ layers: [] }) === null, 'empty -> null');
ok(CardLayers.normalize({ layers: [{ id: 'x' }] }, 'https://x/a/') === null, 'a layer with no src -> null');
ok(CardLayers.normalize({ v: 99, layers: [{ src: 'a.png' }] }, 'https://x/a/') === null,
   'a schema newer than we speak -> null, not a half-read card');
const spec = CardLayers.normalize({
  v: 1, layers: [
    { id: 'fx', src: 'fx.webp', z: 0.9, blend: 'add', drive: { gain: 'burn', min: 0.2, max: 1 } },
    { id: 'bg', src: 'bg.webp', z: 0 },
    { id: 'sub', src: 's.webp', z: 0.5, relief: 1, normal: 's.n.webp' }
  ]
}, 'https://x/a/c.layers.json');
ok(!!spec && spec.layers.length === 3, 'three good layers survive');
ok(spec.layers.map(l => l.id).join() === 'bg,sub,fx', 'sorted back-to-front by z');
ok(spec.layers[0].fit === 'full', 'the bottom plate defaults to full-bleed so parallax cannot reveal its edge');
ok(spec.layers[0].src === 'https://x/a/bg.webp', 'src resolved against the sidecar');
ok(spec.layers[2].normal === null && spec.layers[1].normal === 'https://x/a/s.n.webp', 'authored normals resolved');
ok(spec.layers[0].par === -1 && spec.layers[2].par === 0.8, 'par defaults to 2z-1');
ok(spec.layers[2].blend === 'add' && spec.layers[2].drive.gain === 'burn', 'blend + drive kept');
ok(spec.layers[2].drive.rest === 1, 'drive.rest defaults to max — a failed fetch cannot delete a drawn layer');
const rested = CardLayers.normalize({ layers: [{ src: 'a.png', drive: { gain: 'burn', min: 0, max: 1, rest: 0.25 } }] }, 'https://x/');
ok(rested.layers[0].drive.rest === 0.25, 'an authored drive.rest is kept');
ok(spec.layers[1].relief === 1 && spec.layers[0].relief === 0,
   'declared relief is honoured and NOT also applied to every other plate');
const noRelief = CardLayers.normalize({ layers: [{ src: 'a.png', z: 0 }, { src: 'b.png', z: 1 }] }, 'https://x/');
ok(noRelief.layers[0].relief === 0.6, 'nothing declared -> the bottom plate is embossed, as the flat card always was');
const many = CardLayers.normalize({ layers: Array.from({ length: 20 }, (_, i) => ({ src: i + '.png' })) }, 'https://x/');
ok(many.layers.length === CardLayers.MAX_LAYERS, 'capped at MAX_LAYERS');
ok(CardLayers.sidecarUrl('https://x/art/hero/34.webp') === 'https://x/art/hero/34.layers.json',
   'sidecar url derived from the art url');
// junk must never throw
for (const junk of [0, '', 'x', [], {}, { layers: 'no' }, { layers: [null, 3] }])
  ok(CardLayers.normalize(junk, 'https://x/') === null, 'junk -> null (' + JSON.stringify(junk) + ')');

head('6. the shipped demo sidecar, if it has been baked');
const demo = path.join(ROOT, 'media/lens/demo/demo.layers.json');
if (fs.existsSync(demo)) {
  const parsed = CardLayers.normalize(JSON.parse(fs.readFileSync(demo, 'utf8')),
                                      'https://x/media/lens/demo/demo.layers.json');
  ok(!!parsed, 'demo sidecar validates');
  ok(parsed.layers.length >= 3, `demo has ${parsed && parsed.layers.length} layers`);
  for (const L of parsed.layers) {
    const f = path.join(ROOT, 'media/lens/demo', L.src.split('/').pop());
    ok(fs.existsSync(f), 'demo layer image exists: ' + path.basename(f));
  }
} else console.log('  (skipped — run `node scripts/build-lens-demo.mjs` to bake it)');

head('7. cards/lens3d.html — the embed rules');
const lens = fs.readFileSync(path.join(ROOT, 'cards/lens3d.html'), 'utf8');
/* Comments are stripped first, and deliberately: this page's comments have to be free to NAME
 * the things it must not do ("no localStorage — it THROWS"), or the guard would forbid writing
 * down the reason for the guard. */
const code = (s) => s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
                     .replace(/^\s*\/\/.*$/gm, '');
const lensCode = code(lens);
for (const bad of ['window.ethereum', 'WalletConnect', 'eth_requestAccounts', 'eth_sendTransaction',
                   'personal_sign', 'RipWallet', 'wallet.js'])
  ok(!lensCode.includes(bad), `no wallet surface: ${bad}`);
ok(!/localStorage|sessionStorage/.test(lensCode), 'no web storage — it THROWS at an opaque origin');
ok(!/localStorage|sessionStorage/.test(code(fs.readFileSync(path.join(ROOT, 'js/lens-state.js'), 'utf8'))),
   'lens-state keeps its session baseline in memory, not in storage');
ok(/eth_call/.test(fs.readFileSync(path.join(ROOT, 'js/lens-state.js'), 'utf8')),
   'lens-state reads via eth_call');
ok(!/eth_sendTransaction|personal_sign|eth_sign/.test(fs.readFileSync(path.join(ROOT, 'js/lens-state.js'), 'utf8')),
   'lens-state can only read');
const c3 = fs.readFileSync(path.join(ROOT, 'js/card3d.js'), 'utf8');
ok((c3.match(/useSkybox:\s*false/g) || []).length >= 3,
   'every artwork material still sets useSkybox:false — THE WASH');
ok(/prefers-reduced-motion/.test(c3), 'card3d honours prefers-reduced-motion');
ok(/GfxPost\.dprCap/.test(c3), 'card3d caps DPR through the one weak-device definition');

if (process.argv.includes('--live')) {
  head('8. LIVE — against the real Sepolia edition');
  const cfgSrc = fs.readFileSync(path.join(ROOT, 'js/chain-config.js'), 'utf8');
  const w = {}; new Function('window', cfgSrc)(w);
  const C = w.RIPMASTER_CHAIN, ED = C.contracts.liquidEdition;
  const call = async (data) => {
    const r = await fetch(C.rpcs[0], { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: ED, data }, 'latest'] }) });
    const j = await r.json(); return j.result || null;
  };
  const [t, m, k] = await Promise.all([call(SEL['totalSupply()']), call(SEL['maxTotalSupply()']),
                                       call(SEL['getMarketState()'])]);
  ok(!!t && !!m && !!k, 'all three selectors return data on the live edition');
  const bad = await call('0xd5abeb01');
  ok(!bad || bad === '0x', 'maxSupply() 0xd5abeb01 really does fail on this edition');
  const L = decode(t, m, k);
  ok(!!L && L.live, 'the live payload decodes');
  ok(L && L.orderOk === true, 'word order still holds on-chain today');
  console.log(`  live: supply ${L.supply}  cap ${L.maxSupply}  burned ${L.burned}  ` +
              `rare/3030 ${L.rarePerToken}  tick ${L.tick}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

/* The decoder is private to the module (it is an implementation detail, not API), so the test
 * lifts it out of the source rather than exporting it and widening the surface a browser sees. */
function makeDecoder() {
  const src = fs.readFileSync(path.join(ROOT, 'js/lens-state.js'), 'utf8');
  const grab = (name) => {
    const i = src.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('missing ' + name);
    let d = 0, j = src.indexOf('{', i);
    for (let k = j; k < src.length; k++) {
      if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
    }
    throw new Error('unbalanced ' + name);
  };
  const body = ['words', 'fx', 'i24', 'decode'].map(grab).join('\n');
  return new Function(body + '\nreturn decode;')();
}
