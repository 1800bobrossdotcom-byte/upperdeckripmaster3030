#!/usr/bin/env node
/* upperdeckripmaster3030 — lens contract CLI. The Sepolia dress rehearsal, and later the
 * mainnet run, drive Ripmaster3030Lens721 from here.
 *
 *   node scripts/lens-cli.mjs verify  --at 0x…                 (read-only, NO KEY)
 *   node scripts/lens-cli.mjs deploy  --renderer 0x… --signer 0x…
 *   node scripts/lens-cli.mjs wire    --at 0x… --renderer 0x…
 *   node scripts/lens-cli.mjs cards   --at 0x… [--from cards/hero/cids.json]
 *   node scripts/lens-cli.mjs voucher --at 0x… --to 0x… --id 7 --kind 1 [--hours 72]
 *   node scripts/lens-cli.mjs claim   --at 0x… --to 0x… --id 7 --kind 1 --deadline N --sig 0x…
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
]);

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
  const args = encodeAbiParameters(
    [{ type: 'string' }, { type: 'string' }, { type: 'address' }, { type: 'address' }, { type: 'string' }, { type: 'string' }],
    ['ripmaster3030studios lens', '3030L', renderer, signer,
     'https://upperdeckripmaster3030.com', 'https://upperdeckripmaster3030.com/cards/hero/']
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

const CMDS = { verify, deploy, wire, cards, voucher, claim };
if (!CMDS[cmd]) {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n/, ''));
  process.exit(cmd ? 1 : 0);
}
await CMDS[cmd]();
