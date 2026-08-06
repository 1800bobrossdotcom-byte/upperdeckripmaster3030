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

  /* ⚑ BOUNDARIES ARE THE WHOLE TEST. The ladder is anchored on the LAUNCH pack (125 $3030 — see
   * docs/PACK-PRICING.md; it was 350 under the assumed $0.02 token and the measured open is
   * $0.08), so the
   *   interesting inputs are one wei under each threshold and exactly on it — an off-by-one in
   *   `>=` vs `>` is invisible at any other input. */
  const LADDER = [[125, 1], [1_250, 2], [12_500, 3], [125_000, 4]];
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
