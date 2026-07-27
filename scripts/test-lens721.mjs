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
const SRC='contracts/UR3030Lens721.sol';   // run from repo root: npm run test:lens
const out = JSON.parse(solc.compile(JSON.stringify({language:'Solidity',
  sources:{[SRC]:{content:readFileSync(join(ROOT,SRC),'utf8')}},
  settings:{optimizer:{enabled:true,runs:200},viaIR:true,outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}}),{import:findImport}));
const C = out.contracts[SRC].UR3030Lens721;

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
const strs=['upperdeckripmaster3030 lens','UR3030L','https://upperdeckripmaster3030.com','https://upperdeckripmaster3030.com/cards/hero/'];
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
  const nh = keccak256(new TextEncoder().encode('upperdeckripmaster3030'));
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
