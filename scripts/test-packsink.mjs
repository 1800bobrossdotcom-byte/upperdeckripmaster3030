/* PackSink — EVM tests.  npm run test:pack
 *
 * The whole reason this contract exists is ATOMICITY (docs/TREASURY.md), so the tests are aimed
 * at the properties that make the split trustworthy rather than at line coverage:
 *
 *   · burned + toTreasury == amount, EXACTLY, for every input including odd ones — no dust is
 *     ever stranded in a contract that has no owner to sweep it
 *   · the sink holds NOTHING afterwards
 *   · a failing transfer REVERTS THE WHOLE CALL — nothing burns, nothing is paid, no pack is owed
 *   · supply really goes down (the burn is a burn, not a transfer to a dead address)
 *   · there is no admin surface to find
 */
import solc from 'solc';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { EVM } from '@ethereumjs/evm';
import { Common, Chain, Hardfork } from '@ethereumjs/common';
import { Address, Account, hexToBytes, bytesToHex } from '@ethereumjs/util';
import { keccak256 } from 'ethereum-cryptography/keccak.js';

const ROOT = '/home/user/upperdeckripmaster3030';
const findImport = p => { for (const c of [join(ROOT, 'node_modules', p), join(ROOT, p)]) if (existsSync(c)) return { contents: readFileSync(c, 'utf8') }; return { error: 'nf ' + p }; };
const SRC = 'contracts/PackSink.sol', MOCK = 'contracts/test/MockBurnToken.sol';
const out = JSON.parse(solc.compile(JSON.stringify({
  language: 'Solidity',
  sources: { [SRC]: { content: readFileSync(join(ROOT, SRC), 'utf8') },
             [MOCK]: { content: readFileSync(join(ROOT, MOCK), 'utf8') } },
  settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true,
              outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } }
}), { import: findImport }));
for (const e of (out.errors || [])) if (e.severity === 'error') { console.log(e.formattedMessage); process.exit(1); }
const SINK = out.contracts[SRC].PackSink, TOK = out.contracts[MOCK].MockBurnToken;

const sel = s => bytesToHex(keccak256(new TextEncoder().encode(s))).slice(0, 10);
const padL = h => h.replace(/^0x/, '').padStart(64, '0');
const uint = n => padL(BigInt(n).toString(16));
const addr = a => padL(a.replace(/^0x/, '').toLowerCase());
const decU = h => BigInt('0x' + (h.replace(/^0x/, '') || '0'));

const evm = await EVM.create({ common: new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Shanghai }) });
const DEP = new Address(hexToBytes('0x1111111111111111111111111111111111111111'));
const BUYER = new Address(hexToBytes('0x2222222222222222222222222222222222222222'));
const TREAS = '0x432D71bA14D2602B566dD9e3e098E24859d166c9';
for (const a of [DEP, BUYER]) await evm.stateManager.putAccount(a, new Account(0n, 10n ** 20n));

const deploy = async (bin, args = '') => {
  const r = await evm.runCall({ caller: DEP, to: undefined, data: hexToBytes('0x' + bin + args), gasLimit: 30000000n });
  if (r.execResult.exceptionError) throw new Error('deploy: ' + r.execResult.exceptionError);
  return r.createdAddress;
};
const TOKA = await deploy(TOK.evm.bytecode.object);
const SINKA = await deploy(SINK.evm.bytecode.object, addr(TOKA.toString()) + addr(TREAS));
const call = (to, data, caller = DEP) => evm.runCall({ caller, to, data: hexToBytes(data), gasLimit: 30000000n });
const ok = r => !r.execResult.exceptionError;
const ret = r => bytesToHex(r.execResult.returnValue);

const bal = async who => decU(ret(await call(TOKA, sel('balanceOf(address)') + addr(who))));
const supply = async () => decU(ret(await call(TOKA, sel('totalSupply()'))));

let pass = 0, fail = 0;
const t = (name, cond, extra = '') => { if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  — ' + extra : '')); } };

console.log('PackSink at', SINKA.toString(), '·', SINK.evm.bytecode.object.length / 2, 'bytes\n');

/* ⚑ BOTH ENTRY POINTS GET THE FULL TREATMENT. `payRake` is not a thin alias to be trusted on
 * inspection — it is a second live money path, and the two differ in exactly one place (which
 * event fires), which is precisely the kind of difference a copy-paste gets wrong. */
const topic = sig => bytesToHex(keccak256(new TextEncoder().encode(sig)));
const PAID = { buyPack: topic('PackPaid(address,uint256,uint256,uint256)'),
               payRake: topic('RakePaid(address,uint256,uint256,uint256)') };
const topics0 = r => (r.execResult.logs || []).map(l => bytesToHex(l[1][0]));

for (const fn of ['buyPack', 'payRake']) {
  console.log(`── ${fn}: the split is exhaustive ──`);
  /* ⚑ 351 and 1 are the interesting inputs, not 350. An even amount cannot reveal a dust bug; an
   * ODD one is exactly where two independent percentages would leave a wei behind, and amount=1
   * is where the burn floors to 0 and the treasury must still receive the whole thing. */
  for (const amount of [350n, 351n, 1n, 999_999n, 10n ** 21n]) {
    await call(TOKA, sel('mint(address,uint256)') + addr(BUYER.toString()) + uint(amount));
    await call(TOKA, sel('approve(address,uint256)') + addr(SINKA.toString()) + uint(amount), BUYER);
    const s0 = await supply(), tr0 = await bal(TREAS);
    const r = await call(SINKA, sel(fn + '(uint256)') + uint(amount), BUYER);
    const burned = s0 - (await supply());
    const paid = (await bal(TREAS)) - tr0;
    const held = await bal(SINKA.toString());
    t(`${fn} ${amount}: burned ${burned} + treasury ${paid} == ${amount}`, ok(r) && burned + paid === amount,
      `got ${burned}+${paid}`);
    t(`${fn} ${amount}: sink holds nothing`, held === 0n, `held ${held}`);
    t(`${fn} ${amount}: burn is ~50%`, burned === amount / 2n, `burned ${burned}`);
  }
  /* ⚠ The events must not be interchangeable: an indexer summing pack revenue would otherwise
   * silently count game rakes as pack sales. */
  await call(TOKA, sel('mint(address,uint256)') + addr(BUYER.toString()) + uint(100n));
  await call(TOKA, sel('approve(address,uint256)') + addr(SINKA.toString()) + uint(100n), BUYER);
  const ev = topics0(await call(SINKA, sel(fn + '(uint256)') + uint(100n), BUYER));
  t(`${fn} emits its OWN event, not the other one`,
    ev.includes(PAID[fn]) && !ev.includes(PAID[fn === 'buyPack' ? 'payRake' : 'buyPack']), ev.join(','));
}

console.log('\n── it is a real burn, not a shuffle ──');
{
  const amount = 1000n;
  await call(TOKA, sel('mint(address,uint256)') + addr(BUYER.toString()) + uint(amount));
  await call(TOKA, sel('approve(address,uint256)') + addr(SINKA.toString()) + uint(amount), BUYER);
  const s0 = await supply();
  await call(SINKA, sel('buyPack(uint256)') + uint(amount), BUYER);
  t('totalSupply falls by the burned half', (s0 - (await supply())) === 500n);
}

console.log('\n── it reverts rather than half-executing ──');
for (const fn of ['buyPack', 'payRake']) {
  t(`${fn}: zero amount reverts`, !ok(await call(SINKA, sel(fn + '(uint256)') + uint(0), BUYER)));
  // no approval granted
  await call(TOKA, sel('mint(address,uint256)') + addr(BUYER.toString()) + uint(500n));
  t(`${fn}: missing allowance reverts`, !ok(await call(SINKA, sel(fn + '(uint256)') + uint(500n), BUYER)));
}
{
  /* ⚑ THE ONE THAT MATTERS. A token whose transfer returns FALSE instead of reverting must still
   * abort the whole call — otherwise the burn happens, the treasury is never paid, and the buyer
   * is told they bought a pack. */
  const amount = 800n;
  await call(TOKA, sel('mint(address,uint256)') + addr(BUYER.toString()) + uint(amount));
  await call(TOKA, sel('approve(address,uint256)') + addr(SINKA.toString()) + uint(amount), BUYER);
  await call(TOKA, sel('setFailTransfers(bool)') + uint(1));
  const s0 = await supply(), b0 = await bal(BUYER.toString());
  const r = await call(SINKA, sel('buyPack(uint256)') + uint(amount), BUYER);
  t('a transfer returning false reverts the whole call', !ok(r));
  t('...nothing burned', (await supply()) === s0);
  t('...buyer keeps their tokens', (await bal(BUYER.toString())) === b0);
  await call(TOKA, sel('setFailTransfers(bool)') + uint(0));
}

console.log('\n── flush recovers a stray transfer ──');
{
  await call(TOKA, sel('mint(address,uint256)') + addr(BUYER.toString()) + uint(77n));
  await call(TOKA, sel('transfer(address,uint256)') + addr(SINKA.toString()) + uint(77n), BUYER);
  const tr0 = await bal(TREAS);
  const r = await call(SINKA, sel('flush()'), BUYER);        // permissionless: a non-deployer calls it
  t('anyone may flush', ok(r));
  t('stray tokens reach the treasury', (await bal(TREAS)) - tr0 === 77n);
  t('flush on an empty sink reverts', !ok(await call(SINKA, sel('flush()'))));
}

console.log('\n── no admin surface ──');
{
  const abi = SINK.abi.map(f => f.name).filter(Boolean);
  const danger = abi.filter(n => /owner|admin|pause|upgrade|setToken|setTreasury|withdraw|rescue/i.test(n));
  t('no owner/admin/upgrade/withdraw functions', danger.length === 0, danger.join(','));
  const externals = abi.filter(n => !['PackPaid', 'RakePaid', 'Flushed', 'ZeroAmount', 'ZeroAddress', 'TransferFailed'].includes(n)).sort().join(',');
  t('exactly the intended externals', externals === 'BURN_BPS,buyPack,flush,payRake,token,treasury', externals);
  const tr = ret(await call(SINKA, sel('treasury()')));
  t('treasury is the studio wallet', tr.toLowerCase().endsWith(TREAS.slice(2).toLowerCase()));
  t('BURN_BPS is 5000', decU(ret(await call(SINKA, sel('BURN_BPS()')))) === 5000n);
}

/* ⚑ THE BROWSER HAS TO CALL THE RIGHT FUNCTION. js/wallet.js sends raw calldata, so it carries
 * hard-coded 4-byte selectors — and a wrong one does not throw, it hits the fallback and reverts
 * (or, on another contract, calls something entirely different). Writing them from memory got
 * BOTH wrong on the first pass. So they are recomputed here from the signatures and asserted
 * against the file itself, which is the only version of this check that stays true. */
console.log('\n── js/wallet.js calls the right selectors ──');
{
  const src = readFileSync(join(ROOT, 'js/wallet.js'), 'utf8');
  for (const [sig, fn] of [['buyPack(uint256)', 'payPack'], ['payRake(uint256)', 'payRake'],
                           ['approve(address,uint256)', 'ensureAllowance'], ['allowance(address,address)', 'allowance']]) {
    const want = sel(sig);
    t(`${fn} uses ${want} = ${sig}`, src.includes(want), 'not found in js/wallet.js');
  }
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
