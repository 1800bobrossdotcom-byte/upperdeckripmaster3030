import solc from 'solc';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { EVM } from '@ethereumjs/evm';
import { Common, Chain, Hardfork } from '@ethereumjs/common';
import { Address, Account, hexToBytes, bytesToHex, privateToAddress } from '@ethereumjs/util';
import { keccak256 } from 'ethereum-cryptography/keccak.js';
import { secp256k1 } from 'ethereum-cryptography/secp256k1.js';

const ROOT='/home/user/upperdeckripmaster3030';
const findImport = p => { for (const c of [join(ROOT,'node_modules',p), join(ROOT,p)]) if (existsSync(c)) return {contents:readFileSync(c,'utf8')}; return {error:'nf '+p}; };
const SRC='contracts/Ripmaster3030Lens721.sol';   // run from repo root: npm run test:lens
const SRC_R='contracts/Ripmaster3030Renderer.sol', SRC_M='contracts/test/MockLiquid.sol';
const SRC_T='contracts/test/MockBurnToken.sol', SRC_H='contracts/test/HostileToken.sol';
const out = JSON.parse(solc.compile(JSON.stringify({language:'Solidity',
  sources:{ [SRC]:{content:readFileSync(join(ROOT,SRC),'utf8')},
            [SRC_R]:{content:readFileSync(join(ROOT,SRC_R),'utf8')},
            [SRC_M]:{content:readFileSync(join(ROOT,SRC_M),'utf8')},
            [SRC_T]:{content:readFileSync(join(ROOT,SRC_T),'utf8')},
            [SRC_H]:{content:readFileSync(join(ROOT,SRC_H),'utf8')} },
  settings:{optimizer:{enabled:true,runs:200},viaIR:true,outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}}),{import:findImport}));
const C = out.contracts[SRC].Ripmaster3030Lens721;

// ---- tiny ABI coder (only what these tests need) ----
const sel = sig => bytesToHex(keccak256(new TextEncoder().encode(sig))).slice(0,10);
const padL = h => h.replace(/^0x/,'').padStart(64,'0');
const encUint = n => padL(BigInt(n).toString(16));
const encAddr = a => padL(a.replace(/^0x/,'').toLowerCase());
const encStr = s => { const b=new TextEncoder().encode(s); let h=''; for(const x of b) h+=x.toString(16).padStart(2,'0');
  return encUint(b.length) + h.padEnd(Math.ceil(b.length/32)*64,'0'); };
function decStr(hex){ const d=hex.replace(/^0x/,''); const off=parseInt(d.slice(0,64),16)*2; const len=parseInt(d.slice(off,off+64),16)*2;
  const body=d.slice(off+64, off+64+len); let s=''; for(let i=0;i<body.length;i+=2) s+=String.fromCharCode(parseInt(body.substr(i,2),16)); return s; }

const evm = await EVM.create({ common: new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Shanghai }) });
const PK = hexToBytes('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
const SIGNER = new Address(privateToAddress(PK));
const DEPLOYER = new Address(hexToBytes('0x1111111111111111111111111111111111111111'));
const ALICE = '0x2222222222222222222222222222222222222222';
for (const a of [DEPLOYER, SIGNER]) await evm.stateManager.putAccount(a, new Account(0n, 10n**20n));

// constructor(name,symbol,editionRenderer,claimSigner,externalUrl,lensBaseUrl)
const HEAD=6*32;
let tail='', offs=[];
const strs=['ripmaster3030studios lens','3030L','https://ripmaster3030studios.com','https://ripmaster3030studios.com/cards/hero/'];
// layout: str,str,addr,addr,str,str
let dyn = HEAD;
const p0=dyn; tail+=encStr(strs[0]); dyn=HEAD+tail.length/2;
const p1=dyn; tail+=encStr(strs[1]); dyn=HEAD+tail.length/2;
const p4=dyn; tail+=encStr(strs[2]); dyn=HEAD+tail.length/2;
const p5=dyn; tail+=encStr(strs[3]);
const args = encUint(p0)+encUint(p1)+encAddr('0x0000000000000000000000000000000000000000')+encAddr(SIGNER.toString())+encUint(p4)+encUint(p5)+tail;
const dep = await evm.runCall({ caller:DEPLOYER, to:undefined, data:hexToBytes('0x'+C.evm.bytecode.object+args), gasLimit:30000000n });
if (dep.execResult.exceptionError) { console.log('DEPLOY FAILED', dep.execResult.exceptionError); process.exit(1); }
const ADDR = dep.createdAddress;
console.log('deployed at', ADDR.toString(), '·', (dep.execResult.returnValue.length), 'bytes runtime');

const NOW = 1900000000n;   // a real timestamp: with the default 0, `0 > deadline` is never true
const BLOCK = { header: { number: 1n, cliqueSigner: () => Address.zero(), coinbase: Address.zero(),
  timestamp: NOW, difficulty: 0n, prevRandao: new Uint8Array(32), gasLimit: 30000000n, baseFeePerGas: undefined } };
const call = async (data, caller=DEPLOYER) => evm.runCall({ caller, to:ADDR, data:hexToBytes(data), gasLimit:30000000n, block: BLOCK });
const ok = r => !r.execResult.exceptionError;
const revertOf = r => r.execResult.exceptionError ? String(r.execResult.exceptionError) : 'none';

let pass=0, fail=0;
const t = (name, cond, extra='') => { if(cond){pass++;console.log('  ✓',name,extra);} else {fail++;console.log('  ✗ FAIL',name,extra);} };

// ---- register cards: hero 7 + field 42 ----
// setCards(uint256[],string[],string[])
const ids=[7,42], cids=['bafyHERO7','bafyFIELD42'], titles=['NO TEST NOTICE','WAT HAPPEN TO JOE ROBERTS'];
function encArrUint(a){ return encUint(a.length)+a.map(encUint).join(''); }
function encArrStr(a){ let head='',tl='',off=a.length*32; for(const s of a){ head+=encUint(off); const e=encStr(s); tl+=e; off+=e.length/2; } return encUint(a.length)+head+tl; }
{
  const A=encArrUint(ids), B=encArrStr(cids), D=encArrStr(titles);
  const o1=3*32, o2=o1+A.length/2, o3=o2+B.length/2;
  const data = sel('setCards(uint256[],string[],string[])')+encUint(o1)+encUint(o2)+encUint(o3)+A+B+D;
  const r = await call(data); t('setCards (hero 7 + field 42)', ok(r), revertOf(r));
}

console.log('\n── rendering ──');
{
  const r = await call(sel('tokenURI(uint256)')+encUint(42));
  const uri = ok(r) ? decStr(bytesToHex(r.execResult.returnValue)) : '';
  const json = uri.startsWith('data:application/json;base64,') ? Buffer.from(uri.split(',')[1],'base64').toString() : '';
  t('UNMINTED field card 42 renders (does not revert)', ok(r) && json.includes('WAT HAPPEN'));
  t('  field card has ipfs image', json.includes('"image":"ipfs://bafyFIELD42"'));
  t('  field card has NO animation_url', !json.includes('animation_url'));
  t('  field card classed "Field Lens"', json.includes('Field Lens'));
  t('  reports Minted:no', json.includes('"trait_type":"Minted","value":"no"'));
}
{
  const r = await call(sel('tokenURI(uint256)')+encUint(7));
  const json = Buffer.from(decStr(bytesToHex(r.execResult.returnValue)).split(',')[1],'base64').toString();
  t('UNMINTED hero 7 renders', ok(r) && json.includes('NO TEST NOTICE'));
  t('  hero has ipfs image (the permanent record)', json.includes('"image":"ipfs://bafyHERO7"'));
  t('  hero has animation_url as data:text/html', json.includes('"animation_url":"data:text/html;base64,'));
  const anim = json.split('"animation_url":"')[1].split('"')[0];
  const html = Buffer.from(anim.split(',')[1],'base64').toString();
  t('  wrapper iframes the per-id lens page', html.includes('/cards/hero/7.html'), '');
}
{
  const r = await call(sel('tokenURI(uint256)')+encUint(101));
  t('id 101 (outside deck) reverts', !ok(r));
}

console.log('\n── voucher mint ──');
const DOMAIN = (() => {
  const th = keccak256(new TextEncoder().encode('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'));
  /* ⚠ MUST MATCH THE CONTRACT'S EIP712(...) NAME EXACTLY. The domain separator is part of every
   *   voucher digest, so a mismatch here does not warn — every claimHero signature simply fails
   *   `BadSignature`. Renaming the contract's domain to ripmaster3030studios broke 6 tests
   *   instantly, which is the good outcome: it proves the domain is load-bearing and that the
   *   signer (scripts/lens-cli.mjs) has to be changed in lockstep. ⛔ Once ANY real voucher is
   *   signed against a deployed contract this string is frozen forever. */
  const nh = keccak256(new TextEncoder().encode('ripmaster3030studios'));
  const vh = keccak256(new TextEncoder().encode('1'));
  return keccak256(hexToBytes('0x'+bytesToHex(th).slice(2)+bytesToHex(nh).slice(2)+bytesToHex(vh).slice(2)+encUint(1)+encAddr(ADDR.toString())));
})();
function voucher(to,id,kind,deadline){
  const th = keccak256(new TextEncoder().encode('Claim(address to,uint256 id,uint8 kind,uint256 deadline)'));
  const structHash = keccak256(hexToBytes('0x'+bytesToHex(th).slice(2)+encAddr(to)+encUint(id)+encUint(kind)+encUint(deadline)));
  const digest = keccak256(hexToBytes('0x1901'+bytesToHex(DOMAIN).slice(2)+bytesToHex(structHash).slice(2)));
  const sig = secp256k1.sign(digest, PK);
  const r=sig.r.toString(16).padStart(64,'0'), s=sig.s.toString(16).padStart(64,'0'), v=(sig.recovery+27).toString(16).padStart(2,'0');
  return { sigHex: r+s+v };
}
const DL = 9999999999;
{
  const {sigHex} = voucher(ALICE,7,1,DL);
  const data = sel('claimHero(address,uint256,uint8,uint256,bytes)')+encAddr(ALICE)+encUint(7)+encUint(1)+encUint(DL)+encUint(5*32)+encUint(65)+sigHex.padEnd(128,'0');
  const r = await call(data); t('valid voucher mints hero 7', ok(r), revertOf(r));
  const own = await call(sel('ownerOf(uint256)')+encUint(7));
  t('  ownerOf(7) == Alice', bytesToHex(own.execResult.returnValue).endsWith('2222222222222222222222222222222222222222'));
  const r2 = await call(data); t('  replay of same voucher REJECTED', !ok(r2), revertOf(r2));
}
{
  const {sigHex} = voucher(ALICE,8,1,DL);
  // tamper: claim kind 2 with a kind-1 signature
  const data = sel('claimHero(address,uint256,uint8,uint256,bytes)')+encAddr(ALICE)+encUint(8)+encUint(2)+encUint(DL)+encUint(5*32)+encUint(65)+sigHex.padEnd(128,'0');
  const r = await call(data); t('kind swapped (pack voucher used as title) REJECTED', !ok(r), revertOf(r));
}
{
  const {sigHex} = voucher(ALICE,34,1,DL);
  const data = sel('claimHero(address,uint256,uint8,uint256,bytes)')+encAddr(ALICE)+encUint(34)+encUint(1)+encUint(DL)+encUint(5*32)+encUint(65)+sigHex.padEnd(128,'0');
  const r = await call(data); t('field card 34 cannot be minted as a hero', !ok(r), revertOf(r));
}
{
  const {sigHex} = voucher(ALICE,9,1,1);   // deadline in the past
  const data = sel('claimHero(address,uint256,uint8,uint256,bytes)')+encAddr(ALICE)+encUint(9)+encUint(1)+encUint(1)+encUint(5*32)+encUint(65)+sigHex.padEnd(128,'0');
  const r = await call(data); t('expired voucher REJECTED', !ok(r), revertOf(r));
}

console.log('\n── lovebeing (soulbound) ──');
{
  const r = await call(sel('mintLovebeing(address)')+encAddr(ALICE));
  t('owner mints Lovebeing', ok(r), revertOf(r));
  const r2 = await call(sel('mintLovebeing(address)')+encAddr(ALICE));
  t('  second Lovebeing for same wallet REJECTED', !ok(r2), revertOf(r2));
  const id = 1000001;
  const tr = await call(sel('transferFrom(address,address,uint256)')+encAddr(ALICE)+encAddr('0x3333333333333333333333333333333333333333')+encUint(id), new Address(hexToBytes(ALICE)));
  t('  transfer of Lovebeing REJECTED (soulbound)', !ok(tr), revertOf(tr));
  const hero = await call(sel('transferFrom(address,address,uint256)')+encAddr(ALICE)+encAddr('0x3333333333333333333333333333333333333333')+encUint(7), new Address(hexToBytes(ALICE)));
  t('  hero 7 IS transferable', ok(hero), revertOf(hero));
}


console.log('\n── edition passthrough: mock edition -> render prototype -> lens ──');
{
  // MockLiquid
  const mock = await evm.runCall({ caller:DEPLOYER, to:undefined,
    data:hexToBytes('0x'+out.contracts[SRC_M].MockLiquid.evm.bytecode.object), gasLimit:30000000n });
  t('mock edition deploys', !mock.execResult.exceptionError, String(mock.execResult.exceptionError||''));
  const MOCK = mock.createdAddress;

  // Ripmaster3030Renderer(liquid,name,description,externalUrl,animationUrl)
  /* ⚠ Fixture strings, but they MIRROR THE REAL DEPLOY on purpose. They carried the retired name
   and domain until 2026-08-02 — harmless to the assertions, and a live copy-paste trap for anyone
   reading this file to learn what to pass a constructor. A fixture that models reality costs
   nothing; one that models a retired reality teaches the wrong string. */
  const rs=['ripmaster3030','a liquid trading-card game','https://ripmaster3030studios.com','https://ripmaster3030studios.com/cabinet.html'];
  const H=5*32; let tl='', o=H;
  const q=[]; for(const x of rs){ q.push(o); const e=encStr(x); tl+=e; o+=e.length/2; }
  const rargs = encAddr(MOCK.toString())+q.map(encUint).join('')+tl;
  const rd = await evm.runCall({ caller:DEPLOYER, to:undefined,
    data:hexToBytes('0x'+out.contracts[SRC_R].Ripmaster3030Renderer.evm.bytecode.object+rargs), gasLimit:30000000n });
  t('render prototype deploys against the mock', !rd.execResult.exceptionError, String(rd.execResult.exceptionError||''));
  const RENDERER = rd.createdAddress;

  // renderer alone must answer
  const direct = await evm.runCall({ caller:DEPLOYER, to:RENDERER, data:hexToBytes(sel('tokenURI()')), gasLimit:30000000n, block:BLOCK });
  t('renderer.tokenURI() reads live market state', !direct.execResult.exceptionError, String(direct.execResult.exceptionError||''));

  // before wiring, the lens must refuse rather than return junk
  const before = await call(sel('tokenURI()'));
  t('lens tokenURI() reverts while renderer unset', !ok(before));

  const w = await call(sel('setEditionRenderer(address)')+encAddr(RENDERER.toString()));
  t('owner wires the renderer', ok(w), revertOf(w));

  const after = await call(sel('tokenURI()'));
  t('lens tokenURI() DELEGATES to the renderer', ok(after), revertOf(after));
  const uri = ok(after) ? decStr(bytesToHex(after.execResult.returnValue)) : '';
  const json = uri.startsWith('data:application/json;base64,') ? Buffer.from(uri.split(',')[1],'base64').toString() : '';
  t('  delegated payload is the EDITION json', json.includes('ripmaster3030'));
  t('  carries live burn attributes', json.includes('"trait_type":"Burned"') && json.includes('Live Supply'));
  const burned0 = (json.match(/"trait_type":"Burned","value":(\d+)/)||[])[1];
  t('  burned reads 0 before any burn', burned0==='0', 'burned='+burned0);

  // burn 350 (one pack rip) and confirm the lens's delegated view moves
  await evm.runCall({ caller:DEPLOYER, to:MOCK, data:hexToBytes(sel('burnFromSupply(uint256)')+encUint(350n*10n**18n)), gasLimit:30000000n });
  const after2 = await call(sel('tokenURI()'));
  const json2 = Buffer.from(decStr(bytesToHex(after2.execResult.returnValue)).split(',')[1],'base64').toString();
  const burned1 = (json2.match(/"trait_type":"Burned","value":(\d+)/)||[])[1];
  t('  a real pack burn moves the delegated render', burned1==='350', 'burned='+burned1);
}


// ══ TIERS — the lens reads the holder's balance (task #78) ═══════════════════════════════════
/* SuperRare names "holder balances" as a documented render input, and that IS the staking
 * mechanism here: no staking contract, no lock, no emissions. These tests care about two things
 * only — that the ladder is exactly right at its boundaries, and that it can NEVER break the
 * artwork.                                                                                    */
console.log('\n── tiers: the render reads your balance ──');
{
  const TOKC = out.contracts[SRC_T].MockBurnToken, HOSTC = out.contracts[SRC_H].HostileToken;
  const dep1 = await evm.runCall({ caller:DEPLOYER, to:undefined, data:hexToBytes('0x'+TOKC.evm.bytecode.object), gasLimit:30000000n, block:BLOCK });
  const TOKEN = dep1.createdAddress;
  const dep2 = await evm.runCall({ caller:DEPLOYER, to:undefined, data:hexToBytes('0x'+HOSTC.evm.bytecode.object), gasLimit:30000000n, block:BLOCK });
  const HOSTILE = dep2.createdAddress;
  const E18 = 10n ** 18n;
  // ⚠ a reverted call returns empty data; decode defensively or the harness dies before the assert
  const decU = r => { const h = bytesToHex(r.execResult.returnValue); return (!h || h === '0x') ? -1n : BigInt(h); };
  const tierOfHolder = async who => Number(decU(await call(sel('tierOfHolder(address)') + encAddr(who))));
  const tierOfCard  = async id  => Number(decU(await call(sel('tierOf(uint256)') + encUint(id))));
  const mintTo = async (who, whole) => evm.runCall({ caller:DEPLOYER, to:TOKEN,
    data:hexToBytes(sel('mint(address,uint256)') + encAddr(who) + encUint(BigInt(whole) * E18)), gasLimit:30000000n, block:BLOCK });

  t('tiers are OFF until an edition is set', (await tierOfHolder(ALICE)) === 0);

  await call(sel('setEdition(address)') + encAddr(TOKEN.toString()));
  t('setEdition wires the token', ok(await call(sel('setEdition(address)') + encAddr(TOKEN.toString()))));
  t('a zero balance is tier 0', (await tierOfHolder(ALICE)) === 0);

  /* ⚑ BOUNDARIES ARE THE WHOLE TEST. The ladder is anchored on the pack (~350 $3030), so the
   *   interesting inputs are one wei under each threshold and exactly on it — an off-by-one in
   *   `>=` vs `>` is invisible at any other input. */
  const LADDER = [[350, 1], [3_500, 2], [35_000, 3], [350_000, 4]];
  let held = 0n;
  for (const [threshold, want] of LADDER) {
    const justUnder = BigInt(threshold) * E18 - 1n - held;
    await evm.runCall({ caller:DEPLOYER, to:TOKEN,
      data:hexToBytes(sel('mint(address,uint256)') + encAddr(ALICE) + encUint(justUnder)), gasLimit:30000000n, block:BLOCK });
    held = BigInt(threshold) * E18 - 1n;
    t(`  ${threshold} - 1 wei is still tier ${want - 1}`, (await tierOfHolder(ALICE)) === want - 1, 'got ' + await tierOfHolder(ALICE));
    await evm.runCall({ caller:DEPLOYER, to:TOKEN,
      data:hexToBytes(sel('mint(address,uint256)') + encAddr(ALICE) + encUint(1n)), gasLimit:30000000n, block:BLOCK });
    held += 1n;
    t(`  exactly ${threshold} is tier ${want}`, (await tierOfHolder(ALICE)) === want, 'got ' + await tierOfHolder(ALICE));
  }

  // a card's tier is its OWNER's balance; render-only cards have no owner
  t('an unminted field card is tier 0', (await tierOfCard(34)) === 0);
  const own7 = '0x' + bytesToHex((await call(sel('ownerOf(uint256)') + encUint(7))).execResult.returnValue).slice(-40);
  await mintTo(own7, 4_000);
  t("a minted hero renders at its OWNER's tier", (await tierOfCard(7)) === 2, 'got ' + await tierOfCard(7));

  // the metadata carries it, and the seasons string is gone
  const uri = decStr(bytesToHex((await call(sel('tokenURI(uint256)') + encUint(7))).execResult.returnValue));
  const j = Buffer.from(uri.split(',')[1], 'base64').toString();
  t('  metadata carries the tier name', j.includes('"trait_type":"Holding","value":"Ember"'), j.slice(0, 0));
  t('  metadata carries the numeric tier', j.includes('"trait_type":"Tier","value":2'));
  t('  ⛔ no "Season" string survives on-chain', !/Season/i.test(j));
  t('  deck reads Genesis', j.includes('"trait_type":"Deck","value":"Genesis"'));

  /* ⚠ THE ONE THAT MATTERS. tierOfHolder is called from tokenURI, so if a misconfigured edition
   *   could revert, ONE bad owner transaction would take all 100 cards' metadata offline at once
   *   — on a marketplace, and permanently as far as any cache is concerned. */
  await call(sel('setEdition(address)') + encAddr(HOSTILE.toString()));
  t('a REVERTING token does not revert the tier read', (await tierOfHolder(ALICE)) === 0);
  const hostileUri = await call(sel('tokenURI(uint256)') + encUint(7));
  t('  ...and tokenURI still renders', ok(hostileUri), revertOf(hostileUri));

  await call(sel('setEdition(address)') + encAddr('0x000000000000000000000000000000000000dEaD'));
  /* ⚑ THIS IS THE ONE THAT FOUND THE BUG. Solidity's contract-existence check fires BEFORE
   *   the call and is NOT catchable by try/catch, so an EOA in `setEdition` — pasting a wallet
   *   address instead of the token's, the likeliest mistake anyone will make here — reverted
   *   tokenURI for all 100 cards until an explicit `code.length` guard was added. */
  t('an EOA as the edition does not revert either', (await tierOfHolder(ALICE)) === 0, 'got ' + await tierOfHolder(ALICE));
  t('  ...and tokenURI still renders', ok(await call(sel('tokenURI(uint256)') + encUint(7))));

  // restore, then the guards
  await call(sel('setEdition(address)') + encAddr(TOKEN.toString()));
  const bad = await call(sel('setTiers(uint256[4])') + encUint(100n) + encUint(50n) + encUint(200n) + encUint(300n));
  t('setTiers REJECTS a non-ascending table', !ok(bad), revertOf(bad));
  const notOwner = await call(sel('setEdition(address)') + encAddr(TOKEN.toString()), new Address(hexToBytes(ALICE)));
  t('setEdition is owner-only', !ok(notOwner), revertOf(notOwner));
  t('setTiers accepts an ascending one',
    ok(await call(sel('setTiers(uint256[4])') + encUint(1n) + encUint(2n) + encUint(3n) + encUint(4n))));
}

/* ── THE MARKET READ — what makes this a LIQUID lens ──────────────────────────────────────────
 * The contract read exactly one of SuperRare's documented inputs (balances) until now. These
 * tests care about the same two things the tier tests do — that the numbers are exactly right,
 * and that NONE of it can ever break the artwork. There are three external calls behind this
 * instead of one, so there are three more ways to take all 100 cards offline, and every one of
 * them is exercised here against a token built to misbehave.                                  */
console.log('\n── the market read: burn, price, liquidity ──');
{
  const LIQC = out.contracts[SRC_M].MockLiquid;
  const depL = await evm.runCall({ caller:DEPLOYER, to:undefined, data:hexToBytes('0x'+LIQC.evm.bytecode.object), gasLimit:30000000n, block:BLOCK });
  const LIQ = depL.createdAddress;
  const E18 = 10n ** 18n;
  const MAXS = 3_030_000n * E18;                       // MockLiquid's cap, minted whole into the pool

  const words = r => { const h = bytesToHex(r.execResult.returnValue).replace(/^0x/,'');
    return h.length ? h.match(/.{64}/g) : []; };
  const asU = w => BigInt('0x' + w);
  // ⚠ int24 arrives SIGN-EXTENDED to 32 bytes, so a negative tick is a huge unsigned word.
  //   Reading it unsigned would silently turn -13500 into ~1.16e77 and the assert would still run.
  const asI = w => { const v = BigInt('0x' + w); return v >= (1n << 255n) ? v - (1n << 256n) : v; };
  const at = async (fn, arg='') => words(await call(sel(fn) + arg));
  const burnBps = async () => Number(asU((await at('burnBps()'))[0]));
  const liqCall = async (data) => evm.runCall({ caller:DEPLOYER, to:LIQ, data:hexToBytes(data), gasLimit:30000000n, block:BLOCK });

  // point the lens at a token that is BOTH an ERC-20 and a curve — the real edition's shape
  await call(sel('setEdition(address)') + encAddr(LIQ.toString()));
  /* ⚠ RESET THE LADDER. The block above ends by proving setTiers ACCEPTS an ascending table, and
   *   the one it hands over is [1,2,3,4] WEI — so every wallet with a dust balance is Inferno from
   *   that line onward. Inheriting it read as a tier bug in this block and was left-over state
   *   from the previous one. A test block that depends on where the last one stopped is a test
   *   block that breaks when somebody reorders them. */
  await call(sel('setTiers(uint256[4])')
    + encUint(350n * E18) + encUint(3_500n * E18) + encUint(35_000n * E18) + encUint(350_000n * E18));

  t('a full pool has burned nothing', (await burnBps()) === 0, 'got ' + await burnBps());

  /* One tier-I pack out of a 3,030,000 cap = 350/3030000 = 1.155 bps, which floors to 1. The
   * point of BASIS POINTS rather than whole percent is exactly this: a single pack has to move
   * the number, or the most important event in the economy rounds to nothing. */
  await liqCall(sel('burnFromSupply(uint256)') + encUint(350n * E18));
  t('one 350-token pack registers at all', (await burnBps()) === 1, 'got ' + await burnBps());

  // take it to a round 10% so the arithmetic is checkable by eye
  await liqCall(sel('setCurrentSupply(uint256)') + encUint(MAXS * 90n / 100n));
  t('10% burned reads 1000 bps', (await burnBps()) === 1000, 'got ' + await burnBps());

  const snap = await at('marketSnapshot()');
  t('marketSnapshot is live', asU(snap[0]) === 1n);
  t('  ...and carries the same burn', Number(asU(snap[1])) === 1000, 'got ' + asU(snap[1]));
  t('  ...and word0 is rarePerToken, not the tick', asU(snap[2]) === E18, 'got ' + asU(snap[2]));
  t('  ...and the tick survives as a NEGATIVE number', asI(snap[3]) === -13500n, 'got ' + asI(snap[3]));
  t('  ...and liquidity comes through', asU(snap[4]) === E18, 'got ' + asU(snap[4]));

  /* ⚑ lensState is the page's one round-trip. The assertion that matters is not that it answers
   *   but that it answers CONSISTENTLY with the individual reads — four calls that disagree is
   *   the bug it exists to prevent. */
  /* ⚠ FUND THE CARD'S ACTUAL OWNER, READ OFF THE CHAIN — do not assume it. Hero 7 is minted to
   *   ALICE and then TRANSFERRED away by the transfer block, so hard-coding ALICE here funded a
   *   wallet that no longer holds the card. `tierOfHolder(ALICE)` was a correct 2 the whole time
   *   while the CARD read 0, which looks exactly like a broken tier and is a broken assumption.
   *   Reading the owner keeps this true however the blocks are ordered. */
  const owner7 = '0x' + bytesToHex((await call(sel('ownerOf(uint256)') + encUint(7))).execResult.returnValue).slice(-40);
  await liqCall(sel('mint(address,uint256)') + encAddr(owner7) + encUint(3_500n * E18));
  /* ⚠ CARD 7 IS THE MINTED HERO (voucher block, to ALICE); 34 is a FIELD card that can never be
   *   minted here at all. Getting these the wrong way round is what the first run of this block
   *   did, and every failure it produced looked like a contract bug. */
  const st34 = await at('lensState(uint256)', encUint(34));
  t('lensState says live', asU(st34[0]) === 1n);
  t('  an unminted card has no tier and is not minted', Number(asU(st34[1])) === 0 && asU(st34[3]) === 0n);
  t('  and it still reports the burn', Number(asU(st34[2])) === 1000, 'got ' + asU(st34[2]));

  /* ⚠ THE TIER ON A CARD IS ITS OWNER'S — so funding ALICE must move the card SHE holds and must
   *   leave the unminted one at zero. Both halves, or "everything reads 0" would pass. */
  const st7 = await at('lensState(uint256)', encUint(7));
  t('a minted card reports its OWNER as minted', asU(st7[3]) === 1n);
  t('  ...and carries that owner\'s tier — 3,500 is Ember', Number(asU(st7[1])) === 2, 'got ' + asU(st7[1]));
  t('  ...while the unminted card beside it still reads 0', Number(asU(st34[1])) === 0);

  const uri = decStr(bytesToHex((await call(sel('tokenURI(uint256)') + encUint(7))).execResult.returnValue));
  const json = JSON.parse(Buffer.from(uri.split(',')[1], 'base64').toString('utf8'));
  const trait = n => (json.attributes.find(a => a.trait_type === n) || {}).value;
  t('the burn reaches the CARD metadata', trait('Burned bps') === 1000, 'got ' + trait('Burned bps'));
  t('  ...alongside the holding tier', trait('Holding') === 'Ember' && trait('Tier') === 2);
  /* ⚠ Price and tick are deliberately NOT baked in: metadata is read LATE, and a stale price is a
   *   lie where a stale burn is merely a floor. Assert the absence, or the next edit adds them. */
  t('  ...and NO price or tick is baked into cached metadata',
    trait('Price') === undefined && trait('Market Tick') === undefined && trait('Tick') === undefined);

  /* ── now break it, four ways, and require the artwork to survive every one ── */
  const rendersAnyway = async label => {
    t(`  ${label}: tokenURI still renders`, ok(await call(sel('tokenURI(uint256)') + encUint(7))));
    t(`  ${label}: burnBps answers 0 rather than reverting`, (await burnBps()) === 0, 'got ' + await burnBps());
  };

  /* ⛔ A CAP UNDER THE LIVE SUPPLY IS THE DANGEROUS ONE — it underflows, and an underflow in
   *   0.8.x REVERTS. js/lens-state.js refuses the same state for the same reason: a burn figure
   *   derived from it is a false claim, and a false burn on a collector's card is worse than none. */
  await liqCall(sel('setCurrentSupply(uint256)') + encUint(MAXS + 1n));
  await rendersAnyway('supply above the cap');
  const bad = await at('marketSnapshot()');
  t('  supply above the cap reports NOT live — it does not publish a wrong burn', asU(bad[0]) === 0n);

  /* ⛔ AN ASTRONOMICAL CAP OVERFLOWS THE MULTIPLICATION, and in 0.8.x that REVERTS. An
   *   unlimited-supply ERC-20 returning type(uint256).max is the realistic shape. This was the
   *   last remaining way for the market read to throw and it was found by re-reading the
   *   function — every other failure path already returned neutral, so nothing pointed at it. */
  await liqCall(sel('setCurrentSupply(uint256)') + encUint(0n));
  await liqCall(sel('setMaxTotalSupply(uint256)') + encUint((1n << 256n) - 1n));
  t('  a cap of type(uint256).max does not overflow the bps maths', ok(await call(sel('burnBps()'))));
  t('  ...and tokenURI still renders', ok(await call(sel('tokenURI(uint256)') + encUint(7))));
  /* ⚠ Assert the VALUE, not just that it answered: everything burned but nothing minted is 100%,
   *   i.e. 10000 bps. A guard that returns a wrong number is not a guard. */
  t('  ...and still reports the RIGHT number — all of it burned is 10000 bps',
    Number(asU((await at('burnBps()'))[0])) === 10000, 'got ' + asU((await at('burnBps()'))[0]));

  // a zero cap would divide by zero
  await liqCall(sel('setCurrentSupply(uint256)') + encUint(0n));
  await liqCall(sel('setMaxTotalSupply(uint256)') + encUint(0n));
  await rendersAnyway('a zero cap');

  /* ⚑ THE INTERFACE-SEPARATION CLAIM, TESTED. IERC20Balance and IEditionMarket are deliberately
   *   two interfaces so a plain ERC-20 with balanceOf and no curve still tiers correctly. Folding
   *   them into one would make every market call a new way for tierOfHolder — and therefore
   *   tokenURI — to fail. MockBurnToken is exactly that token: balances, no market. */
  const TOKC2 = out.contracts[SRC_T].MockBurnToken;
  const depT2 = await evm.runCall({ caller:DEPLOYER, to:undefined, data:hexToBytes('0x'+TOKC2.evm.bytecode.object), gasLimit:30000000n, block:BLOCK });
  const PLAIN = depT2.createdAddress;
  await evm.runCall({ caller:DEPLOYER, to:PLAIN, data:hexToBytes(sel('mint(address,uint256)') + encAddr(ALICE) + encUint(35_000n * E18)), gasLimit:30000000n, block:BLOCK });
  await call(sel('setEdition(address)') + encAddr(PLAIN.toString()));
  await rendersAnyway('an ERC-20 with no market surface');
  const plainTier = Number(BigInt(bytesToHex((await call(sel('tierOfHolder(address)') + encAddr(ALICE))).execResult.returnValue)));
  t('  ...and the TIER still works on it — 35,000 is Flame', plainTier === 3, 'got ' + plainTier);

  // and the two already-known hostile shapes, now against three calls instead of one
  const HOSTC2 = out.contracts[SRC_H].HostileToken;
  const depH2 = await evm.runCall({ caller:DEPLOYER, to:undefined, data:hexToBytes('0x'+HOSTC2.evm.bytecode.object), gasLimit:30000000n, block:BLOCK });
  await call(sel('setEdition(address)') + encAddr(depH2.createdAddress.toString()));
  await rendersAnyway('a token that reverts on everything');

  await call(sel('setEdition(address)') + encAddr('0x000000000000000000000000000000000000dEaD'));
  await rendersAnyway('an EOA pasted in as the edition');

  await call(sel('setEdition(address)') + encAddr('0x0000000000000000000000000000000000000000'));
  await rendersAnyway('no edition at all');
}

/* ── TENURE — the input that cannot be bought ─────────────────────────────────────────────────
 * A balance is a snapshot and can be flash-borrowed for one block, which is why the tier is only
 * ever spent on something aesthetic. Time cannot be borrowed. These assert the two things that
 * make it trustworthy: it STARTS at the mint (not at 1970) and it RESETS on a transfer.        */
console.log('\n── tenure: held-since, which no wallet can fake ──');
{
  const LATER = (secs) => ({ header: { ...BLOCK.header, timestamp: NOW + BigInt(secs) } });
  const callAt = async (data, blk, caller = DEPLOYER) =>
    evm.runCall({ caller, to: ADDR, data: hexToBytes(data), gasLimit: 30000000n, block: blk });
  const num = r => { const h = bytesToHex(r.execResult.returnValue); return (!h || h === '0x') ? -1n : BigInt(h); };
  const heldFor = async (id, blk = BLOCK) => num(await callAt(sel('heldFor(uint256)') + encUint(id), blk));
  const heldSince = async id => num(await call(sel('heldSince(uint256)') + encUint(id)));

  /* ⛔ THE MINT MUST STAMP IT. Stamping only TRANSFERS is the obvious way to write this and it is
   *   wrong in the worst direction: a never-transferred card would read heldSince 0, i.e. held
   *   since 1970 — the OLDEST card in the deck rather than the newest. */
  t('the mint stamped hero 7', (await heldSince(7)) === NOW, 'got ' + await heldSince(7));
  t('an unminted field card has no tenure', (await heldSince(34)) === 0n);
  t('  ...and heldFor answers 0 rather than a huge number', (await heldFor(34)) === 0n,
    'got ' + await heldFor(34));

  t('tenure is 0 in the block it was minted in', (await heldFor(7)) === 0n, 'got ' + await heldFor(7));
  t('a day later it is 86,400 seconds', (await heldFor(7, LATER(86400))) === 86400n,
    'got ' + await heldFor(7, LATER(86400)));

  /* ⚠ AND A TRANSFER RESETS IT. This is tenure with the CURRENT owner, not lifetime provenance —
   *   a card that gets passed around keeps arriving wet, which is the whole point. */
  const OWNER7 = '0x' + bytesToHex((await call(sel('ownerOf(uint256)') + encUint(7))).execResult.returnValue).slice(-40);
  const CAROL = '0x4444444444444444444444444444444444444444';
  await evm.stateManager.putAccount(new Address(hexToBytes(OWNER7)), new Account(0n, 10n ** 20n));
  const moved = await callAt(
    sel('transferFrom(address,address,uint256)') + encAddr(OWNER7) + encAddr(CAROL) + encUint(7),
    LATER(86400), new Address(hexToBytes(OWNER7)));
  t('the card transfers', ok(moved), revertOf(moved));
  t('  ...and the new owner\'s tenure starts from zero', (await heldFor(7, LATER(86400))) === 0n,
    'got ' + await heldFor(7, LATER(86400)));
  t('  ...not from the original mint', (await heldSince(7)) === NOW + 86400n,
    'got ' + await heldSince(7));

  /* ⚠ A clock that runs BACKWARDS (a reorg, or a test harness) must not underflow into a
   *   near-infinite tenure. Assert the guard, not the happy path. */
  t('a timestamp before the stamp reads 0, not an underflow',
    (await heldFor(7, BLOCK)) === 0n, 'got ' + await heldFor(7, BLOCK));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
