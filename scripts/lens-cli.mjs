#!/usr/bin/env node
/* ripmaster3030studios — lens contract CLI. The Sepolia dress rehearsal, and later the
 * mainnet run, drive Ripmaster3030Lens721 from here.
 *
 *   node scripts/lens-cli.mjs verify  --at 0x…                 (read-only, NO KEY)
 *   node scripts/lens-cli.mjs deploy  --renderer 0x… --signer 0x…
 *   node scripts/lens-cli.mjs wire    --at 0x… --renderer 0x…
 *   node scripts/lens-cli.mjs cards   --at 0x… [--from cards/hero/cids.json]
 *   node scripts/lens-cli.mjs voucher --at 0x… --to 0x… --id 7 --kind 1 [--hours 72]
 *   node scripts/lens-cli.mjs claim   --at 0x… --to 0x… --id 7 --kind 1 --deadline N --sig 0x…
 *   node scripts/lens-cli.mjs tiers   --at 0x… [--edition 0x…] [--set a,b,c,d] [--of 0x…] [--card N]
 *
 *   node scripts/lens-cli.mjs sink        --at 0x…            (read-only, NO KEY)
 *   node scripts/lens-cli.mjs deploy-sink [--token 0x…] [--treasury 0x…]
 *
 * ⚑ AND THE TIER SYSTEM HAD THE SAME HOLE, FOUND 2026-08-05. Staking is BUILT and tested
 *   (98/98) — `tierOfHolder` reads the holder's $3030 and `tokenURI` prints it — but the ABI
 *   here carried none of it, so `setEdition`, THE ONE CALL THAT TURNS THE FEATURE ON, had no
 *   scripted caller and no step in docs/DEPLOY-LENS.md. A lens deployed from either documented
 *   route would render every card at tier 0 (`edition == address(0)`) with nothing to say so.
 *   Same shape as PackSink above: built, reviewed, tested, unreachable.
 *
 * ⚑ PackSink HAD NO DEPLOY PATH AT ALL until 2026-08-02. It was written, reviewed and tested
 *   (51/51) and there was no scripted way to get it on-chain, so the one contract standing
 *   between the site's stated 50/50 revenue split and what the code actually does was blocked on
 *   somebody hand-rolling a deployment. Both addresses are `immutable`, so a wrong constructor
 *   arg is not editable — it is a redeploy. Hence `sink` reads them back before anything trusts it.
 *
 * ── keys ──────────────────────────────────────────────────────────────────────────────
 * Everything that writes needs PRIVATE_KEY in the environment; nothing here ever stores,
 * logs or transmits it. `verify` needs no key at all, which is the point: anyone can audit
 * a deployed lens without holding anything.
 *
 *     export PRIVATE_KEY=0x…            # the artist's key, in their shell, never committed
 *     export RPC_URL=https://…          # optional; defaults to the configured chain
 *
 * ⚑ The signing key for vouchers should NOT be the deploy/owner key. `deploy --signer`
 *   takes a separate address precisely so the hot key that signs claims all season is not
 *   the admin key that can retarget the contract.
 *
 * Chain comes from js/chain-config.js — the same file the site reads, so the rehearsal and
 * the site can never disagree about which network they are on.
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import solc from 'solc';
import {
  createPublicClient, createWalletClient, http, encodeAbiParameters, parseAbi,
  getContract, formatEther,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia, mainnet } from 'viem/chains';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const cmd = argv[0];
const val = f => { const i = argv.indexOf('--' + f); return i >= 0 ? argv[i + 1] : null; };
const die = m => { console.error('✗ ' + m); process.exit(1); };

// ── chain, straight from the file the site uses ──
const cfgSrc = readFileSync(join(ROOT, 'js/chain-config.js'), 'utf8');
const CFG = (() => { const g = {}; new Function('window', cfgSrc)(g); return g.RIPMASTER_CHAIN || {}; })();
const CHAIN = Number(CFG.chainId) === 1 ? mainnet : sepolia;
const RPC = process.env.RPC_URL || (CFG.rpcs || [])[0];
if (!RPC) die('no RPC — set RPC_URL or add rpcs[] to js/chain-config.js');

const pub = createPublicClient({ chain: CHAIN, transport: http(RPC) });
function wallet() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) die('PRIVATE_KEY not set (read-only commands: verify)');
  const account = privateKeyToAccount(pk.startsWith('0x') ? pk : '0x' + pk);
  return { account, client: createWalletClient({ account, chain: CHAIN, transport: http(RPC) }) };
}

const ABI = parseAbi([
  'function tokenURI() view returns (string)',
  'function tokenURI(uint256) view returns (string)',
  'function owner() view returns (address)',
  'function claimSigner() view returns (address)',
  'function editionRenderer() view returns (address)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function card(uint256) view returns (string,string)',
  'function ownerOf(uint256) view returns (address)',
  'function setEditionRenderer(address)',
  'function setCards(uint256[],string[],string[])',
  'function claimHero(address,uint256,uint8,uint256,bytes)',
  // ── the tier / staking read. Absent from this ABI until 2026-08-05, which is why the
  //    feature had no deploy path — see the header note.
  'function edition() view returns (address)',
  'function tierAt(uint256) view returns (uint256)',
  'function tierOf(uint256) view returns (uint8)',
  'function tierOfHolder(address) view returns (uint8)',
  'function tierName(uint8) view returns (string)',
  'function setEdition(address)',
  'function setTiers(uint256[4])',
  // ── the market read: what makes this a LIQUID lens rather than a balance check
  'function burnBps() view returns (uint256)',
  'function marketSnapshot() view returns (bool,uint256,uint256,int24,uint128)',
  'function lensState(uint256) view returns (bool,uint8,uint256,bool,uint256,int24,uint128,uint256)',
  'function heldFor(uint256) view returns (uint256)',
  'function heldSince(uint256) view returns (uint64)',
]);

const SINK_ABI = parseAbi([
  'function token() view returns (address)',
  'function treasury() view returns (address)',
  'function BURN_BPS() view returns (uint256)',
  'function buyPack(uint256)',
  'function payRake(uint256)',
  'function flush()',
]);

/* One compiler for both contracts — `which` names the file and the contract, which are the same
 * string in this repo. Kept generic rather than copied, because two compile() functions is two
 * places for the optimizer settings to drift, and those settings are part of the deployed
 * bytecode (`npm run flatten` asserts them against Remix's). */
function compileAny(src, contractName) {
  const findImport = p => {
    for (const c of [join(ROOT, 'node_modules', p), join(ROOT, p)]) if (existsSync(c)) return { contents: readFileSync(c, 'utf8') };
    return { error: 'not found: ' + p };
  };
  const out = JSON.parse(solc.compile(JSON.stringify({
    language: 'Solidity',
    sources: { [src]: { content: readFileSync(join(ROOT, src), 'utf8') } },
    settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true, outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } },
  }), { import: findImport }));
  const errs = (out.errors || []).filter(e => e.severity === 'error');
  if (errs.length) { errs.forEach(e => console.error(e.formattedMessage)); die('compile failed: ' + src); }
  return out.contracts[src][contractName];
}

function compile() {
  const SRC = 'contracts/Ripmaster3030Lens721.sol';
  const findImport = p => {
    for (const c of [join(ROOT, 'node_modules', p), join(ROOT, p)]) if (existsSync(c)) return { contents: readFileSync(c, 'utf8') };
    return { error: 'not found: ' + p };
  };
  const out = JSON.parse(solc.compile(JSON.stringify({
    language: 'Solidity',
    sources: { [SRC]: { content: readFileSync(join(ROOT, SRC), 'utf8') } },
    settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true, outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } },
  }), { import: findImport }));
  const errs = (out.errors || []).filter(e => e.severity === 'error');
  if (errs.length) { errs.forEach(e => console.error(e.formattedMessage)); die('compile failed'); }
  return out.contracts[SRC].Ripmaster3030Lens721;
}

const decodeDataUri = uri => {
  if (!uri || !uri.startsWith('data:')) return null;
  const [, b64] = uri.split(',');
  try { return Buffer.from(b64, 'base64').toString('utf8'); } catch { return null; }
};

// ── commands ─────────────────────────────────────────────────────────────────────────
async function verify() {
  const at = val('at') || die('--at required');
  console.log(`chain   ${CHAIN.name} (${CHAIN.id})\nrpc     ${RPC}\nlens    ${at}\n`);
  const c = getContract({ address: at, abi: ABI, client: pub });
  const [nm, sym, own, signer, renderer] = await Promise.all([
    c.read.name(), c.read.symbol(), c.read.owner(), c.read.claimSigner(), c.read.editionRenderer(),
  ]);
  console.log(`name    ${nm} (${sym})`);
  console.log(`owner   ${own}`);
  console.log(`signer  ${signer}${signer.toLowerCase() === own.toLowerCase() ? '   ⚠ SAME AS OWNER — the hot signing key should not be the admin key' : ''}`);
  console.log(`render  ${renderer}${/^0x0+$/.test(renderer) ? '   ⚠ UNSET — tokenURI() will revert' : ''}`);

  /* ⚑ verify() said NOTHING about tiers until 2026-08-05, so the one command the runbook tells
   *   the artist to run after deploying reported a healthy contract while the whole staking
   *   feature sat switched off. A read that omits a switched-off feature reads as "fine". */
  try {
    const ed = await c.read.edition();
    console.log(`tiers   ${/^0x0+$/.test(ed)
      ? '⛔ OFF — edition unset, every card renders tier 0 (Ash). Fix: lens-cli tiers --at <lens> --edition 0x…'
      : 'on, reading ' + ed}`);
  } catch { console.log('tiers   ⚠ could not read edition() — is this the current contract?'); }

  console.log('\n── tokenURI() · the edition passthrough ──');
  try {
    const j = decodeDataUri(await c.read.tokenURI());
    console.log(j ? '  ✓ ' + j.slice(0, 150) + '…' : '  ✗ not a data uri');
  } catch (e) { console.log('  ✗ reverted:', String(e.shortMessage || e.message).split('\n')[0]); }

  console.log('\n── tokenURI(id) · per-card ──');
  for (const id of [1, 7, 34, 42, 100]) {
    try {
      const j = JSON.parse(decodeDataUri(await c.read.tokenURI([BigInt(id)])));
      let mint = '—';
      try { mint = await c.read.ownerOf([BigInt(id)]); } catch { mint = 'unminted'; }
      console.log(`  ${String(id).padStart(3)}  ${(j.image || 'no image').padEnd(58)} ${j.animation_url ? 'anim ✓' : 'anim —'}  ${mint}`);
    } catch (e) { console.log(`  ${String(id).padStart(3)}  ✗ ${String(e.shortMessage || e.message).split('\n')[0]}`); }
  }
}

async function deploy() {
  const renderer = val('renderer') || '0x0000000000000000000000000000000000000000';
  const signer = val('signer') || die('--signer required (the voucher-signing address)');
  const { account, client } = wallet();
  const bal = await pub.getBalance({ address: account.address });
  console.log(`deployer ${account.address}  ${formatEther(bal)} ETH on ${CHAIN.name}`);
  if (bal === 0n) die('deployer has no ETH');
  const C = compile();
  /* ⛔ THESE SIX VALUES ARE WRITTEN INTO THE DEPLOYED CONTRACT. Two of them were still the
   *    RETIRED DOMAIN until 2026-08-02 — every token this lens minted would have been born with
   *    `external_url` and `animation_url` on upperdeckripmaster3030.com. `setUrls()` can fix it
   *    afterwards, so it is recoverable, but marketplaces cache metadata hard: "recoverable" and
   *    "not visible on the collector's card for a week" are different things.
   *  ⚑ `npm run test:name` skips scripts/ (it mirrors .vercelignore, and scripts/ does not ship)
   *    — which is exactly why nothing caught this. It now pins these two strings explicitly.
   *  ⚠ `name` and `symbol` here are the LENS's, not the token's. The lens is
   *    `ripmaster3030studios lens` / `3030L`; the ERC-20 is `ripmaster3030` / `3030`. Different
   *    contracts, different strings, and CLAUDE.md records `UR3030L` -> `3030L` as a deploy-time
   *    permanent. The EIP-712 domain is a third one and lives in the contract itself, where it
   *    already reads `ripmaster3030studios` — changing it breaks every voucher ever signed. */
  const args = encodeAbiParameters(
    [{ type: 'string' }, { type: 'string' }, { type: 'address' }, { type: 'address' }, { type: 'string' }, { type: 'string' }],
    ['ripmaster3030studios lens', '3030L', renderer, signer,
     'https://ripmaster3030studios.com', 'https://ripmaster3030studios.com/cards/hero/']
  );
  // constructor args appended to the creation bytecode — one explicit path, no guessing
  const hash = await client.sendTransaction({ data: '0x' + C.evm.bytecode.object + args.slice(2) });
  console.log('tx', hash);
  const r = await pub.waitForTransactionReceipt({ hash });
  console.log(r.status === 'success' ? `✦ deployed at ${r.contractAddress}` : '✗ deploy reverted');
  if (r.contractAddress) console.log(`\nnext:\n  node scripts/lens-cli.mjs verify --at ${r.contractAddress}`);
}

async function wire() {
  const at = val('at') || die('--at required');
  const renderer = val('renderer') || die('--renderer required');
  const { client } = wallet();
  const hash = await client.writeContract({ address: at, abi: ABI, functionName: 'setEditionRenderer', args: [renderer] });
  console.log('tx', hash);
  const r = await pub.waitForTransactionReceipt({ hash });
  console.log(r.status === 'success' ? '✦ renderer wired' : '✗ reverted');
}

/** Push card art on-chain from cards/hero/cids.json + the dossiers. Batched — 100 separate
 *  transactions is a bad launch night. */
async function cards() {
  const at = val('at') || die('--at required');
  const cidFile = val('from') || 'cards/hero/cids.json';
  const cids = JSON.parse(readFileSync(join(ROOT, cidFile), 'utf8'));
  const ids = [], cidArr = [], titles = [];
  for (const [k, v] of Object.entries(cids)) {
    const n = Number(k); if (!Number.isInteger(n) || n < 1 || n > 100) continue;   // skip "_" notes
    let title = `Card ${n}`;
    const meta = join(ROOT, 'cards/hero', `${n}.json`);
    if (existsSync(meta)) { try { title = JSON.parse(readFileSync(meta, 'utf8')).name.split(' · ')[0]; } catch {} }
    ids.push(BigInt(n)); cidArr.push(String(v)); titles.push(title);
  }
  if (!ids.length) die(`no usable card numbers in ${cidFile}`);
  console.log(`setting ${ids.length} cards: ${ids.join(', ')}`);
  const { client } = wallet();
  const hash = await client.writeContract({ address: at, abi: ABI, functionName: 'setCards', args: [ids, cidArr, titles] });
  console.log('tx', hash);
  const r = await pub.waitForTransactionReceipt({ hash });
  console.log(r.status === 'success' ? `✦ ${ids.length} cards registered` : '✗ reverted');
}

/** Sign an EIP-712 claim voucher. Prints it; broadcasting is the claimant's job, which is
 *  the whole point of a voucher — the artist never pays gas for someone else's claim. */
async function voucher() {
  const at = val('at') || die('--at required');
  const to = val('to') || die('--to required');
  const id = Number(val('id') || die('--id required'));
  const kind = Number(val('kind') || 1);
  const hours = Number(val('hours') || 72);
  if (id < 1 || id > 33) die('vouchers are for heroes 1–33 only');
  if (kind !== 1 && kind !== 2) die('--kind 1 (gacha pack-claim) or 2 (earned game title)');
  const deadline = BigInt(Math.floor(Date.now() / 1000) + hours * 3600);
  const { account, client } = wallet();
  const sig = await client.signTypedData({
    account,
    domain: { name: 'ripmaster3030studios', version: '1', chainId: CHAIN.id, verifyingContract: at },
    types: { Claim: [{ name: 'to', type: 'address' }, { name: 'id', type: 'uint256' },
                     { name: 'kind', type: 'uint8' }, { name: 'deadline', type: 'uint256' }] },
    primaryType: 'Claim',
    message: { to, id: BigInt(id), kind, deadline },
  });
  const onChainSigner = await pub.readContract({ address: at, abi: ABI, functionName: 'claimSigner' });
  if (onChainSigner.toLowerCase() !== account.address.toLowerCase())
    console.log(`⚠ signing as ${account.address} but the contract expects ${onChainSigner} — this voucher will be REJECTED`);
  console.log(JSON.stringify({ lens: at, to, id, kind, deadline: deadline.toString(), sig }, null, 2));
  console.log(`\nredeem:\n  node scripts/lens-cli.mjs claim --at ${at} --to ${to} --id ${id} --kind ${kind} --deadline ${deadline} --sig ${sig}`);
}

async function claim() {
  const at = val('at') || die('--at required');
  const { client } = wallet();
  const hash = await client.writeContract({
    address: at, abi: ABI, functionName: 'claimHero',
    args: [val('to'), BigInt(val('id')), Number(val('kind') || 1), BigInt(val('deadline')), val('sig')],
  });
  console.log('tx', hash);
  const r = await pub.waitForTransactionReceipt({ hash });
  console.log(r.status === 'success' ? '✦ hero claimed' : '✗ reverted');
}

/**
 * Read the tier ladder back, and optionally wire it. With no write flags this needs NO KEY.
 *
 * ⛔ `--edition` IS THE SWITCH THAT TURNS STAKING ON. Until it is set, `edition` is address(0)
 *    and every card in the deck renders "Holding: Ash / Tier 0" — the feature is fully built,
 *    fully tested and completely invisible, with nothing on-chain to say it is off.
 * ⚠ The likeliest mistake here is pasting a WALLET address instead of the token's. The contract
 *   survives it by design (`edition.code.length == 0` returns tier 0 rather than reverting
 *   `tokenURI` for all 100 cards) — which means it fails SILENTLY, so this checks for bytecode
 *   and diffs against chain-config before writing rather than after.
 */
async function tiers() {
  const at = val('at') || (CFG.contracts || {}).lens721 || die('--at required (or set contracts.lens721)');
  const setEd = val('edition');
  const setT = val('set');
  console.log(`chain    ${CHAIN.name} (${CHAIN.id})\nrpc      ${RPC}\nlens     ${at}\n`);
  const code = await pub.getBytecode({ address: at });
  if (!code || code === '0x') die('nothing deployed at that address');
  const c = getContract({ address: at, abi: ABI, client: pub });

  if (setEd) {
    const want = (CFG.contracts || {}).liquidEdition || '';
    const edCode = await pub.getBytecode({ address: setEd });
    if (!edCode || edCode === '0x')
      die(`${setEd} has NO BYTECODE — that is a wallet, not the token. Tiers would silently read 0 forever.`);
    if (want && setEd.toLowerCase() !== want.toLowerCase())
      console.log(`⚠ ${setEd} is not chain-config.contracts.liquidEdition (${want}) — continuing, but check it`);
    const { client } = wallet();
    const hash = await client.writeContract({ address: at, abi: ABI, functionName: 'setEdition', args: [setEd] });
    console.log('tx', hash);
    const r = await pub.waitForTransactionReceipt({ hash });
    console.log(r.status === 'success' ? '✦ edition wired — tiers are LIVE' : '✗ reverted');
  }

  if (setT) {
    /* ⚠ Ascending is enforced on-chain (`TiersNotAscending`) and it is not cosmetic: the read
     *   returns the HIGHEST threshold cleared, so an out-of-order table caps everyone at tier 1. */
    const parts = setT.split(',').map(s => s.trim());
    if (parts.length !== 4) die('--set wants exactly four whole-token thresholds, e.g. 350,3500,35000,350000');
    const t = parts.map(p => BigInt(p) * (10n ** 18n));
    const { client } = wallet();
    const hash = await client.writeContract({ address: at, abi: ABI, functionName: 'setTiers', args: [t] });
    console.log('tx', hash);
    const r = await pub.waitForTransactionReceipt({ hash });
    console.log(r.status === 'success' ? '✦ ladder set' : '✗ reverted');
  }

  /* ⚠ Pointing this at the RENDERER instead of the lens is an easy slip — the two addresses sit
   *   next to each other in chain-config and both are "the lens contract" in conversation. A raw
   *   viem stack trace does not say that; this does. */
  let ed;
  try { ed = await c.read.edition(); }
  catch { die(`${at} has no edition() — that is not the lens 721. The renderer and the lens are different contracts.`); }
  const off = /^0x0+$/.test(ed);
  console.log(`edition  ${ed}${off ? '   ⛔ UNSET — every card renders tier 0 (Ash). Staking is OFF.' : ''}`);
  if (!off) {
    const want = (CFG.contracts || {}).liquidEdition || '';
    console.log(`         ${want && ed.toLowerCase() === want.toLowerCase() ? '✓ matches chain-config.contracts.liquidEdition' : '⚠ does not match chain-config — ' + (want || 'unset')}`);
  }
  console.log('\nladder   (thresholds are in whole $3030; the pack is 350, so: one pack, ten, a hundred, a thousand)');
  for (let i = 0; i < 4; i++) {
    const raw = await c.read.tierAt([BigInt(i)]);
    console.log(`  tier ${i + 1}  ${String(formatEther(raw)).padStart(12)}  ${await c.read.tierName(i + 1)}`);
  }
  /* ⚑ THE MARKET HALF. `live` false is not an error — it is what an unset or mute edition looks
   *   like, and the contract is built to return exactly that rather than revert, because a revert
   *   in this read would take the metadata of all 100 cards offline at once. */
  const [mLive, mBurn, mRpt, mTick, mLiq] = await c.read.marketSnapshot();
  console.log('\nmarket');
  if (!mLive) {
    console.log('  ⛔ NOT LIVE — the edition is unset, has no bytecode, or does not answer.');
    console.log('     Cards render with Burned bps 0. This is the safe failure, not a crash.');
  } else {
    console.log(`  burned   ${(Number(mBurn) / 100).toFixed(2)}%  (${mBurn} bps — this is what reaches card metadata)`);
    console.log(`  price    ${formatEther(mRpt)} RARE per 3030`);
    console.log(`  tick     ${mTick}`);
    console.log(`  depth    ${formatEther(mLiq)}${mLiq === 0n ? '   ⚠ no liquidity in the book' : ''}`);
  }

  const who = val('of');
  if (who) console.log(`\n${who}\n  tier ${await c.read.tierOfHolder(who)} · ${await c.read.tierName(await c.read.tierOfHolder(who))}`);
  const card = val('card');
  if (card) {
    const [lLive, lTier, lBurn, lMinted, , , , lHeld] = await c.read.lensState([BigInt(card)]);
    const days = Number(lHeld) / 86400;
    console.log(`\ncard ${card}  (one eth_call — what the live page reads)`);
    console.log(`  ${lMinted ? 'minted' : 'unminted'} · holding ${await c.read.tierName(lTier)} (tier ${lTier}) · burned ${lBurn} bps · market ${lLive ? 'live' : 'not live'}`);
    /* ⚑ Tenure is with the CURRENT owner and resets on transfer — it is not lifetime provenance
     *   and must never be printed as if it were. */
    console.log(`  held by this owner for ${days < 1 ? Number(lHeld) + ' s' : days.toFixed(1) + ' days'}${lMinted ? '' : '  (unminted — no tenure)'}`);
  }
  if (off) console.log('\nnext:\n  node scripts/lens-cli.mjs tiers --at ' + at + ' --edition ' + ((CFG.contracts || {}).liquidEdition || '0x<the $3030 token>'));
}

/* ── PackSink ────────────────────────────────────────────────────────────────────────────────
 * Reads the sink back and checks the two things that cannot be fixed afterwards. */
async function sink() {
  const at = val('at') || (CFG.contracts || {}).packSink || die('--at required (or set contracts.packSink)');
  console.log(`chain    ${CHAIN.name} (${CHAIN.id})\nrpc      ${RPC}\nsink     ${at}\n`);
  const code = await pub.getBytecode({ address: at });
  if (!code || code === '0x') die('nothing deployed at that address');
  const c = getContract({ address: at, abi: SINK_ABI, client: pub });
  const [tok, tre] = await Promise.all([c.read.token(), c.read.treasury()]);
  const wantTok = (CFG.contracts || {}).liquidEdition || '';
  const wantTre = CFG.treasury || '';
  console.log(`token    ${tok}`);
  console.log(`         ${tok.toLowerCase() === wantTok.toLowerCase() ? '✓ matches chain-config.contracts.liquidEdition' : '⛔ DOES NOT MATCH chain-config — ' + wantTok}`);
  console.log(`treasury ${tre}`);
  console.log(`         ${tre.toLowerCase() === wantTre.toLowerCase() ? '✓ matches chain-config.treasury' : '⛔ DOES NOT MATCH chain-config — ' + wantTre}`);
  try { console.log(`burn     ${Number(await c.read.BURN_BPS())/100}% burns, the rest to the studio`); } catch {}
  /* ⚠ A sink holding a balance means a payment landed and was not forwarded. `flush()` is
   *   permissionless precisely so anyone can clear it, so a non-zero balance is a nudge, not
   *   an alarm — but it should never be non-zero for long. */
  try {
    const bal = await pub.readContract({ address: tok, abi: parseAbi(['function balanceOf(address) view returns (uint256)']), functionName: 'balanceOf', args: [at] });
    console.log(`holding  ${formatEther(bal)} $3030${bal > 0n ? '   ⚠ non-zero — call flush()' : '   (holds nothing between calls, as designed)'}`);
  } catch {}
  console.log(`\nnext:\n  paste ${at} into js/chain-config.js -> contracts.packSink`);
  console.log('  that ONE edit is what turns the 50/50 split on across the whole site.');
}

async function deploySink() {
  const token = val('token') || (CFG.contracts || {}).liquidEdition || die('--token required');
  const treasury = val('treasury') || CFG.treasury || die('--treasury required');
  /* ⛔ BOTH ARE `immutable`. A typo here is not a setting to change later, it is a redeploy —
   *    and a wrong treasury means every pack's studio half goes somewhere nobody controls. */
  if (!/^0x[0-9a-fA-F]{40}$/.test(token)) die('token is not an address: ' + token);
  if (!/^0x[0-9a-fA-F]{40}$/.test(treasury)) die('treasury is not an address: ' + treasury);
  const tCode = await pub.getBytecode({ address: token });
  if (!tCode || tCode === '0x') die(`token ${token} has NO BYTECODE — that is a wallet, not the edition`);

  const { account, client } = wallet();
  const bal = await pub.getBalance({ address: account.address });
  console.log(`deployer ${account.address}  ${formatEther(bal)} ETH on ${CHAIN.name}`);
  console.log(`token    ${token}\ntreasury ${treasury}\n`);
  if (bal === 0n) die('deployer has no ETH');

  const C = compileAny('contracts/PackSink.sol', 'PackSink');
  const args = encodeAbiParameters([{ type: 'address' }, { type: 'address' }], [token, treasury]);
  const hash = await client.sendTransaction({ data: '0x' + C.evm.bytecode.object + args.slice(2) });
  console.log('tx', hash);
  const r = await pub.waitForTransactionReceipt({ hash });
  console.log(r.status === 'success' ? `✦ PackSink at ${r.contractAddress}` : '✗ deploy reverted');
  if (r.contractAddress) {
    console.log(`\nnext:\n  node scripts/lens-cli.mjs sink --at ${r.contractAddress}`);
    console.log(`  then paste it into js/chain-config.js -> contracts.packSink`);
  }
}

const CMDS = { verify, deploy, wire, cards, voucher, claim, tiers, sink, 'deploy-sink': deploySink };
if (!CMDS[cmd]) {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n/, ''));
  process.exit(cmd ? 1 : 0);
}
await CMDS[cmd]();
