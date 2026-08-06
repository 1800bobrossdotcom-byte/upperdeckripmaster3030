/* js/wallet.js — the 50/50 split path, driven against a fake wallet.  npm run test:split
 *
 * ⚑ WHY THIS EXISTS SEPARATELY FROM test-packsink.mjs. That suite proves the CONTRACT splits
 *   correctly. It cannot prove the browser ever reaches it: js/wallet.js hand-assembles calldata
 *   as hex strings, and every failure mode there is silent. A wrong selector hits the fallback, a
 *   wrong offset approves the wrong spender, a missing 10^18 approves 350 wei instead of 350
 *   tokens. None of those throw in the browser — they produce a wallet prompt that looks fine.
 *
 * So this drives the real file through a fake EIP-1193 provider and reads the calldata back out.
 *
 * ⚑ THE FALLBACK IS TESTED AS CAREFULLY AS THE SPLIT. `contracts.packSink` is empty today, so the
 *   fallback is what actually ships — and it is the path that must not change behaviour by one
 *   byte from the burn that has already been rehearsed on-chain.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = '/home/user/upperdeckripmaster3030';
const TOKEN = '0xdc47e98b35Da73956fa7cCD450f8feEA746Ec83C';
const SINK  = '0x1234567890AbcdEF1234567890aBcdef12345678';
const TREAS = '0x432D71bA14D2602B566dD9e3e098E24859d166c9';
const ACCT  = '0x5C3bc6dD6d5b9913d267527275dD95ceB235d89F';
const E18   = 10n ** 18n;

let pass = 0, fail = 0;
const t = (name, cond, extra = '') => { if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  — ' + extra : '')); } };

/* A fake wallet that records everything and answers plausibly. `allowanceWei` lets a test say
 * "this account has already approved enough", which is the branch that decides whether a player
 * signs one prompt or two. */
function makeEnv({ packSink, allowanceWei = 0n, receiptStatus = '0x1', treasury = TREAS }) {
  const sent = [], calls = [];
  const provider = {
    on() {},
    async request({ method, params }) {
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [ACCT];
      if (method === 'eth_chainId') return '0xaa36a7';                       // sepolia — no switch
      if (method === 'eth_call') {
        calls.push(params[0]);
        const d = params[0].data || '';
        if (d.startsWith('0xdd62ed3e')) return '0x' + allowanceWei.toString(16).padStart(64, '0');
        if (d.startsWith('0x70a08231')) return '0x' + (10n ** 24n).toString(16).padStart(64, '0');
        return '0x0';
      }
      if (method === 'eth_sendTransaction') { sent.push(params[0]); return '0x' + 'ab'.repeat(32); }
      if (method === 'eth_getTransactionReceipt') return { blockNumber: '0x1', status: receiptStatus };
      throw new Error('unexpected method ' + method);
    },
  };
  const win = {
    ethereum: provider,
    RIPMASTER_CHAIN: {
      chainId: 11155111, packBurn: 350, approveBatch: 12, treasury,
      contracts: { liquidEdition: TOKEN, packSink },
    },
    matchMedia: () => ({ matches: false }),
  };
  const ctx = { window: win, document: { createElement: () => ({ style: {}, querySelector: () => ({}), querySelectorAll: () => [], addEventListener() {} }), body: { appendChild() {} } },
                navigator: { userAgent: 'node' }, setTimeout, clearTimeout, console, fetch: async () => { throw new Error('no net'); } };
  ctx.globalThis = ctx;
  const src = readFileSync(join(ROOT, 'js/wallet.js'), 'utf8');
  // run the real file with `window` bound to our fake — no edits, no shim inside the source
  new Function('window', 'document', 'navigator', 'setTimeout', 'console', src)(
    win, ctx.document, ctx.navigator, setTimeout, console);
  return { W: win.RipWallet, sent, calls };
}

const argAt = (data, i) => '0x' + data.slice(10 + i * 64, 10 + (i + 1) * 64);
const addrArg = (data, i) => ('0x' + argAt(data, i).slice(-40)).toLowerCase();
const uintArg = (data, i) => BigInt(argAt(data, i));

console.log('── with PackSink deployed: approve, then ONE atomic split call ──');
{
  const { W, sent } = makeEnv({ packSink: SINK });
  t('hasSink() sees the address', W.hasSink());
  const steps = [];
  const r = await W.payPack(350, s => steps.push(s));

  t('payPack succeeds', r.ok, JSON.stringify(r));
  t('it reports split:true so the UI can say so', r.split === true);
  t('it reports the halves it expects (175/175)', r.burned === 175 && r.treasury === 175, `${r.burned}/${r.treasury}`);
  t('the caller is told both steps, in order', steps.join(',') === 'approve,pay', steps.join(','));
  t('exactly two transactions', sent.length === 2, 'sent ' + sent.length);

  const [approve, pay] = sent;
  t('approve goes to the TOKEN, not the sink', (approve.to || '').toLowerCase() === TOKEN.toLowerCase(), approve.to);
  t('approve selector is approve(address,uint256)', approve.data.startsWith('0x095ea7b3'));
  t('approve spender is the SINK', addrArg(approve.data, 0) === SINK.toLowerCase(), addrArg(approve.data, 0));
  /* ⚠ the units trap: approving 350 rather than 350×10^18 would prompt for 350 wei and then the
   *   pack call would revert on allowance, after the player had already signed something. */
  t('approve amount is 12 packs × 350 × 10^18', uintArg(approve.data, 1) === 350n * 12n * E18, uintArg(approve.data, 1).toString());

  t('the pack call goes to the SINK', (pay.to || '').toLowerCase() === SINK.toLowerCase(), pay.to);
  t('the pack call is buyPack(uint256)', pay.data.startsWith('0xdc45bfb3'), pay.data.slice(0, 10));
  t('the pack call is for 350 × 10^18', uintArg(pay.data, 0) === 350n * E18, uintArg(pay.data, 0).toString());
  t('nothing is sent to the token BURN selector', !sent.some(s => (s.data || '').startsWith('0x42966c68')));
}

console.log('\n── an existing allowance means ONE prompt, not two ──');
{
  const { W, sent } = makeEnv({ packSink: SINK, allowanceWei: 10_000n * E18 });
  const r = await W.payPack(350);
  t('still succeeds', r.ok && r.split === true);
  t('only the pack call is signed', sent.length === 1, 'sent ' + sent.length);
  t('...and it is buyPack', sent[0].data.startsWith('0xdc45bfb3'));
}

console.log('\n── payRake uses the rake entry point, same encoding ──');
{
  const { W, sent } = makeEnv({ packSink: SINK, allowanceWei: 10_000n * E18 });
  const r = await W.payRake(5);
  t('payRake succeeds', r.ok && r.split === true);
  t('calls payRake(uint256), NOT buyPack', sent[0].data.startsWith('0x85cf61ef'), sent[0].data.slice(0, 10));
  t('for 5 × 10^18', uintArg(sent[0].data, 0) === 5n * E18);
}

console.log('\n── a rejected approval charges NOTHING ──');
{
  /* The whole point of the contract is that nothing half-executes. That guarantee has to survive
   * the browser too: if the approval fails, the pack call must never be sent. */
  const { W, sent } = makeEnv({ packSink: SINK, receiptStatus: '0x0' });
  const r = await W.payPack(350);
  t('payPack fails', !r.ok, JSON.stringify(r));
  t('the pack call is never sent', sent.length === 1 && sent[0].data.startsWith('0x095ea7b3'), 'sent ' + sent.length);
  t('the reason is explainable to a human', typeof W.explain(r.reason) === 'string' && !/^Something went wrong/.test(W.explain(r.reason)), W.explain(r.reason));
}

console.log('\n── with packSink UNSET it is the plain burn, unchanged ──');
{
  const { W, sent } = makeEnv({ packSink: '' });
  t('hasSink() is false', !W.hasSink());
  const r = await W.payPack(350);
  t('payPack still succeeds', r.ok, JSON.stringify(r));
  t('it reports split:false, so no UI claims a studio cut', r.split === false);
  t('one transaction only', sent.length === 1, 'sent ' + sent.length);
  t('it is burn(uint256) on the TOKEN', sent[0].data.startsWith('0x42966c68') &&
    (sent[0].to || '').toLowerCase() === TOKEN.toLowerCase(), sent[0].data.slice(0, 10));
  t('for the WHOLE 350 × 10^18 — identical to the rehearsed burn', uintArg(sent[0].data, 0) === 350n * E18);
  t('no approval is requested', !sent.some(s => (s.data || '').startsWith('0x095ea7b3')));
}

console.log('\n── payTreasury: 100% to the studio, and it is NOT a burn ──');
{
  /* Rip Rocketer's launch fee. ⚑ No contract and no approval: paying ONE address is one
   * operation, so a plain ERC-20 transfer is already atomic. The risk here is the opposite of
   * the split's — that it quietly burns, or quietly sends somewhere else. */
  const { W, sent } = makeEnv({ packSink: SINK });     // sink present: must be ignored entirely
  const r = await W.payTreasury(25);
  t('payTreasury succeeds', r.ok, JSON.stringify(r));
  t('it reports the whole amount to treasury, zero burned', r.treasury === 25 && r.burned === 0);
  t('ONE transaction — no approval, no contract call', sent.length === 1, 'sent ' + sent.length);
  t('it is transfer(address,uint256) on the TOKEN', sent[0].data.startsWith('0xa9059cbb') &&
    (sent[0].to || '').toLowerCase() === TOKEN.toLowerCase(), sent[0].data.slice(0, 10));
  t('the destination is the TREASURY wallet', addrArg(sent[0].data, 0) === TREAS.toLowerCase(), addrArg(sent[0].data, 0));
  t('for 25 × 10^18', uintArg(sent[0].data, 1) === 25n * E18, uintArg(sent[0].data, 1).toString());
  t('NOTHING is burned', !sent.some(s => (s.data || '').startsWith('0x42966c68')));
  t('it does NOT touch the sink even though one is deployed',
    !sent.some(s => (s.to || '').toLowerCase() === SINK.toLowerCase()));
}
for (const [treasury, label] of [['', 'unset'], ['0x0000000000000000000000000000000000000000', 'the zero address']]) {
  /* ⚠ IT MUST FAIL RATHER THAN SUBSTITUTE A DIFFERENT ECONOMIC ACTION. Falling back to a burn
   * would destroy tokens the artist asked to be PAID, and the zero address is how that happens
   * by accident — so it is rejected explicitly, not merely left to the token to revert on. */
  const { W, sent } = makeEnv({ packSink: SINK, treasury });
  const r = await W.payTreasury(25);
  t(`treasury ${label}: payTreasury fails`, !r.ok && r.reason === 'no-treasury', JSON.stringify(r));
  t(`treasury ${label}: NOTHING is sent`, sent.length === 0, 'sent ' + sent.length);
  t(`treasury ${label}: it does not fall back to a burn`, !sent.some(s => (s.data || '').startsWith('0x42966c68')));
  t(`treasury ${label}: the reason is explainable`, !/^Something went wrong/.test(W.explain(r.reason)), W.explain(r.reason));
}
{
  const src = readFileSync(join(ROOT, 'js/wallet.js'), 'utf8');
  t('payTreasury uses 0xa9059cbb = transfer(address,uint256)', src.includes('0xa9059cbb'));
}

console.log('\n── the on-screen rake numbers follow the sink, not the doc ──');
{
  /* ⚠ THIS IS THE BUG THIS PAIRING EXISTS TO PREVENT. wager-payout.js computed a treasury half
   * unconditionally, so with the sink unwired the result screen would have credited the studio
   * with tokens that had in fact all been burned. */
  const wp = readFileSync(join(ROOT, 'js/wager-payout.js'), 'utf8');
  for (const [sink, label, wantTreasury] of [[SINK, 'deployed', 5], ['', 'unset', 0]]) {
    const { W } = makeEnv({ packSink: sink });
    const win = { RipWallet: W };
    new Function('window', wp)(win);
    const P = win.WagerPayout.compute(100, 4, 3, 0);
    t(`sink ${label}: rake is still 10% of the pot`, P.rakeTotal === 40, String(P.rakeTotal));
    t(`sink ${label}: treasury ${wantTreasury}`, P.treasury === (wantTreasury * 4), String(P.treasury));
    t(`sink ${label}: burn + treasury == rake`, P.burn + P.treasury === P.rakeTotal, `${P.burn}+${P.treasury}`);
    t(`sink ${label}: anteBurn + anteTreasury == anteRake`,
      P.anteBurn + P.anteTreasury === P.anteRake, `${P.anteBurn}+${P.anteTreasury} vs ${P.anteRake}`);
  }
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
