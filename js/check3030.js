/* ripmaster3030studios — 3030: THE APPROVAL CHECK. THE ONE DEFINITION.
 *
 * ⛔ THIS FILE IS SHARED BY THE BROWSER AND THE CLI. `3030.html` loads it with a <script src>;
 *   `scripts/drain.mjs` READS THIS FILE and evaluates it. So the score a visitor sees when they
 *   paste an address and the score the hourly screen writes into the ledger come from identical
 *   bytes. Two scorers is two answers to one question, and the one that drifts is the one nobody
 *   is looking at.
 * ⚠ CLASSIC SCRIPT, NOT ESM: `npm run test:reach` §0 compiles every shipped browser script with
 *   `new Function`, where an `export` keyword is a SyntaxError.
 *
 * ══ WHAT IT SCORES ════════════════════════════════════════════════════════════════════════════
 *
 * A wallet drainer does not steal tokens — it collects APPROVALS and sweeps later. So the plan is
 * on-chain before the theft is, and it has a shape:
 *
 *   BURST     many distinct wallets approving the same spender inside a few minutes
 *   HISTORY   nothing before that — a router has taken approvals every day for years
 *   SPREAD    a handful of tokens, not seventy — wide spread is ROUTER behaviour and scores DOWN
 *   FUNNEL    and afterwards, those wallets' tokens all land on ONE address
 *
 * ⛔ THE FUNNEL IS THE ONLY TERM THAT OBSERVES A CONSEQUENCE RATHER THAN A POSTURE, and getting
 *   it right took being wrong in public. The first version scored the OUTFLOW ITSELF — and every
 *   router on Base came back 111/111, 92/92, 86/88, because approving a router and having it move
 *   your tokens IS a swap. It fired on everything and separated nothing. **Movement is not the
 *   signal; concentration is.** A router's users each receive their own output and it fans out to
 *   many pools; a collector's victims all pay one address.
 *
 * ══ ⛔ IT NEVER ACCUSES, AND THAT IS THE PRODUCT RATHER THAN A DISCLAIMER ══════════════════════
 *
 * No address is ever labelled a scam, a drainer or malicious. It emits COUNTS and the reader
 * concludes. A new protocol launching, an airdrop claim, a token migration and a popular mint all
 * look exactly like a drainer for the first hour of their lives — a migration contract genuinely
 * does move everyone's tokens to one address, by design and with consent, and it scores high here.
 * A feed that publishes accusations is a liability to the desk that buys it; a ranked queue with
 * the working shown is a tool. `npm run test:drain` asserts the words cannot appear.
 */
(function (root) {
  'use strict';

  /* ⛔ NOT CLAMPED TO 100. A funnel is the strongest evidence this produces, and with a ceiling it
   * scored identically to a diffuse sweep — the top of the queue is exactly where ranking matters
   * most. The number is a QUEUE POSITION, not a percentage; the bands are the reader-facing part. */
  function score(c) {
    var reasons = [], s = 0;
    var victims = c.owners instanceof Set ? c.owners.size : (c.owners || 0);
    var tokenCount = c.tokens instanceof Set ? c.tokens.size : (c.tokens || 0);

    /* ⛔ NO APPROVERS MEANS NOTHING TO SCORE, AND THE FIRST VERSION SCORED IT 28. An address with
     * zero approvals in the window still collected +18 for "no approvals in the day-earlier
     * sample" and +10 for being an EOA — **points for the ABSENCE of evidence**, which is
     * backwards in the one direction that matters: it makes a completely inert address look
     * mildly interesting. Found by checking a Base-only contract against Ethereum, where it does
     * not exist. Nothing seen is not a finding; it is the lack of one. */
    if (victims === 0) {
      return { score: 0, reasons: ['no approvals to this address in the window read — nothing to judge'] };
    }

    if (victims >= 25) { s += 40; reasons.push(victims + ' distinct approvers'); }
    else if (victims >= 10) { s += 25; reasons.push(victims + ' distinct approvers'); }
    else if (victims >= 5) { s += 12; reasons.push(victims + ' distinct approvers'); }
    else reasons.push(victims + ' distinct approvers');

    var unl = (c.unlimited || 0) + (c.forAll || 0);
    var unlShare = c.n ? unl / c.n : 0;
    if (unlShare >= 0.8 && unl >= 5) { s += 25; reasons.push(Math.round(100 * unlShare) + '% unlimited'); }
    else if (unlShare >= 0.5 && unl >= 3) { s += 12; reasons.push(Math.round(100 * unlShare) + '% unlimited'); }

    if ((c.forAll || 0) >= 3) { s += 15; reasons.push(c.forAll + ' setApprovalForAll(true)'); }

    /* a BURST separates a drainer from a protocol that is merely popular */
    var width = Math.max(1, (c.lastBlock - c.firstBlock) + 1);
    if (victims >= 5 && victims / width >= 0.5) {
      s += 20; reasons.push('burst: ' + victims + ' in ' + width + ' blocks');
    }

    if (c.isContract === false) { s += 10; reasons.push('spender is an EOA, not a contract'); }
    if (c.isContract && c.codeSize && c.codeSize < 500) { s += 8; reasons.push('tiny contract (' + c.codeSize + 'B)'); }

    /* ⛔ WIDE TOKEN SPREAD IS A ROUTER SIGNAL AND SCORING IT UP WAS BACKWARDS. */
    if (tokenCount >= 25) { s -= 25; reasons.push(tokenCount + ' tokens — router-like spread'); }
    else if (tokenCount >= 3 && tokenCount <= 12) { s += 6; reasons.push(tokenCount + ' tokens'); }

    /* ⛔ THE AGE TERM SEPARATES INFRASTRUCTURE FROM EVERYTHING ELSE, and it is COMPUTED rather
     * than listed — so it cannot be wrong about an address nobody thought to allowlist. */
    if (c.priorChecked && c.priorHits > 0) {
      s -= 45; reasons.push('ESTABLISHED — ' + c.priorHits + ' approvals a day earlier');
    } else if (c.priorChecked && c.priorHits === 0) {
      s += 18; reasons.push('no approvals in the day-earlier sample');
    } else {
      reasons.push('history unread');       // ⚠ neutral: unknown is not suspicious
    }

    var w = c.sweep;
    if (w && w.checked && w.transfers) {
      var share = w.movedOut / w.checked;
      var conc = w.topDestinationCount / w.transfers;
      var fan = w.distinctDestinations / Math.max(1, w.movedOut);
      if (share >= 0.4 && w.movedOut >= 5 && conc >= 0.5 && w.distinctDestinations <= 4) {
        s += 55;
        reasons.push('FUNNEL: ' + w.movedOut + '/' + w.checked + ' approvers drained, ' +
                     w.topDestinationCount + '/' + w.transfers + ' to ONE address');
      } else if (share >= 0.4 && w.movedOut >= 5 && conc >= 0.3 && fan <= 0.35) {
        s += 25;
        reasons.push('concentrated outflow: ' + w.movedOut + '/' + w.checked + ' moved, ' +
                     w.distinctDestinations + ' destinations');
      } else if (share >= 0.4 && w.movedOut >= 5) {
        /* ⚠ STATED AND SCORED ZERO, so a reader knows the check RAN rather than assuming it did
         * not. This is what using a router looks like. */
        reasons.push('outflow fans out (' + w.distinctDestinations + ' destinations) — router-shaped');
      } else {
        reasons.push('no outflow yet (' + w.movedOut + '/' + w.checked + ' moved)');
      }
    }

    return { score: Math.max(0, s), reasons: reasons };
  }

  /* ⚠ THE BANDS ARE THE READER-FACING SUMMARY and the only thing a non-analyst should act on.
   * They are deliberately three, not five: a scale with more steps than a person has responses
   * to is a scale that invites false precision. */
  function band(n) {
    return n >= 60 ? 'LOOK' : n >= 35 ? 'WATCH' : 'QUIET';
  }

  /* ⛔ THE PLAIN-LANGUAGE ANSWER, and it is deliberately NOT a verdict. A person pasting an
   * address wants to know what to do, and the honest answer is never "this is a scam" — it is
   * what was seen and what that usually means. */
  function verdict(n, checked) {
    if (!checked) return 'The chain could not be read, so nothing was checked. That is not a pass.';
    if (n >= 60) return 'This has the shape approval-drainers have. It also has the shape a brand ' +
      'new protocol or a token migration has. Do not sign it on this page’s say-so — find out ' +
      'what it is first, from a source that is not this one.';
    if (n >= 35) return 'Some of the shape is here and not all of it. Worth knowing what you are ' +
      'approving before you approve it.';
    return 'Nothing unusual in what was read. That is not a guarantee — a spender with no ' +
      'history yet has nothing to be unusual about.';
  }

  root.Check3030 = { score: score, band: band, verdict: verdict };
})(typeof window !== 'undefined' ? window : this);
