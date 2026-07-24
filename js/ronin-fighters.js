/* upperdeckripmaster3030 — NEON RONIN fighter art.
 *
 * Six big, detailed, completely-distinct procedural ninjas. They share the spring
 * skeleton computed by the game (feet at local y=0, forward = +x; the game applies the
 * facing flip + body rotation before calling us), but each one draws its own build,
 * gear, head and weapon — a lean straw-hatted ronin, a shelled frog Kappa, a hooded
 * cleaver Doomer, a horned club Oni, a chain-sickle Kunoichi, and a crystalline
 * Prizmancer. RoninArt.skel(f) builds the joint geometry (and the blade tip the game
 * uses for the trail); RoninArt.draw / RoninArt.portrait render.
 */
window.RoninArt = (function () {
  const S = 1.0;
  const rot = (p, a, l) => ({ x: p.x + Math.sin(a) * l, y: p.y + Math.cos(a) * l });
  const mid = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  function shade(hex, d) { const n = parseInt(hex.slice(1), 16); const c = v => Math.max(0, Math.min(255, v + d));
    return '#' + ((1 << 24) + (c(n >> 16) << 16) + (c((n >> 8) & 255) << 8) + c(n & 255)).toString(16).slice(1); }
  function chain(base, angs, lens) { const pts = [base]; let p = base; for (let i = 0; i < angs.length; i++) { p = rot(p, angs[i], lens[i]); pts.push(p); } return pts; }

  const WLEN = { katana: 74, tanto: 44, nodachi: 104, club: 84, sickle: 40, light: 84 };
  function weaponKind(f) { return f.a && f.a.weaponArt ? f.a.weaponArt : (f.weapon || 'katana'); }
  function skel(f) {
    const r = f.rig, bob = r.bob;
    const HIP = -58 - bob, CHEST = -106 - bob, HEADY = -140 - bob;
    const build = (f.a && f.a.build) || {};
    const hunch = build.hunch || 0;
    const pelvis = { x: r.lean * 8, y: HIP };
    const chest = { x: r.lean * 30 + hunch * 10, y: CHEST + hunch * 8 };
    const head = { x: chest.x + r.head * 8 + hunch * 6, y: HEADY + hunch * 10 };
    const thigh = 40 * (build.legLen || 1), shin = 38 * (build.legLen || 1), upper = 34, fore = 30;
    const legF = chain(pelvis, [r.hF, r.hF + r.kF], [thigh, shin]);
    const legB = chain(pelvis, [r.hB, r.hB + r.kB], [thigh, shin]);
    const armF = chain(chest, [r.aF, r.aF + r.eF], [upper, fore]);
    const armB = chain(chest, [r.aB, r.aB + r.eB], [upper, fore]);
    const wlen = (WLEN[weaponKind(f)] || 70) * (f.glow > 0 ? 1.18 : 1);
    const hand = armF[2], tip = rot(hand, r.sw, wlen);
    return { pelvis, chest, head, legF, legB, armF, armB, sword: { hand, tip, ang: r.sw, wlen }, bob, hunch };
  }

  // ── primitives (ctx already translated/rotated/scaled into the fighter's local space) ──
  function cap(ctx, a, b, w, col) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  function taper(ctx, a, b, w0, w1, col) { const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(a.x + nx * w0, a.y + ny * w0); ctx.lineTo(b.x + nx * w1, b.y + ny * w1);
    ctx.lineTo(b.x - nx * w1, b.y - ny * w1); ctx.lineTo(a.x - nx * w0, a.y - ny * w0); ctx.closePath(); ctx.fill();
    dot(ctx, a.x, a.y, w0, col); dot(ctx, b.x, b.y, w1, col); }
  function limb(ctx, p, w0, w1, w2, col) { taper(ctx, p[0], p[1], w0, w1, col); taper(ctx, p[1], p[2], w1, w2, col); }
  function dot(ctx, x, y, r, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.28); ctx.fill(); }
  function poly(ctx, pts, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.closePath(); ctx.fill(); }
  function tabi(ctx, foot, dir, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(foot.x + dir * 5, foot.y, 9, 5, 0, 0, 6.28); ctx.fill(); }

  // torso as a filled body (pelvis→chest) with a belt; returns nothing
  function torso(ctx, K, w, col, beltCol) { taper(ctx, K.pelvis, K.chest, w * 0.9, w, col);
    dot(ctx, K.chest.x, K.chest.y, w * 0.7, col);
    if (beltCol) { const b = mid(K.pelvis, K.chest, 0.32); ctx.save(); ctx.translate(b.x, b.y); ctx.fillStyle = beltCol; ctx.fillRect(-w, -4, w * 2, 8); ctx.restore(); } }

  function blade(ctx, K, col, edge, wide) { const s = K.sword; ctx.save(); ctx.lineCap = 'round';
    ctx.strokeStyle = edge; ctx.lineWidth = wide || 4; ctx.shadowColor = col; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.moveTo(s.hand.x, s.hand.y); ctx.lineTo(s.tip.x, s.tip.y); ctx.stroke();
    // guard
    const g = rot(s.hand, s.ang + 1.57, 6), g2 = rot(s.hand, s.ang - 1.57, 6);
    ctx.strokeStyle = '#8a6a2a'; ctx.lineWidth = 4; ctx.shadowBlur = 0; ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.lineTo(g2.x, g2.y); ctx.stroke(); ctx.restore(); }

  // ── the six fighters ──
  const A = {
    // GREY RONIN — lean swordsman, tattered haori cloak, straw amigasa hat, katana + trailing sash
    ronin(ctx, f, K) { const c = f.col, ac = f.tint, dk = shade(c, -40), t = f.rig ? 0 : 0;
      shadowAt(ctx, K);
      // back arm + back leg (behind)
      limb(ctx, K.legB, 8, 7, 6, dk); tabi(ctx, K.legB[2], -1, dk); limb(ctx, K.armB, 6, 5, 4, dk);
      // haori cloak draped off the shoulders (behind torso), tattered hem
      const sh = K.chest; poly(ctx, [{ x: sh.x - 20, y: sh.y - 6 }, { x: sh.x + 16, y: sh.y - 6 }, { x: sh.x + 22, y: sh.y + 46 }, { x: sh.x + 8, y: sh.y + 40 }, { x: sh.x + 2, y: sh.y + 52 }, { x: sh.x - 6, y: sh.y + 40 }, { x: sh.x - 14, y: sh.y + 50 }, { x: sh.x - 22, y: sh.y + 42 }], shade(c, -20));
      torso(ctx, K, 13, c, ac); limb(ctx, K.legF, 9, 8, 6, c); tabi(ctx, K.legF[2], 1, shade(c, -20));
      // front arm (sleeve) + katana with a sash
      limb(ctx, K.armF, 8, 6, 4, c); blade(ctx, K, ac, '#eef6ff', 4);
      // trailing sash on the hilt
      ctx.strokeStyle = ac; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(K.sword.hand.x, K.sword.hand.y);
      ctx.quadraticCurveTo(K.sword.hand.x - 16, K.sword.hand.y + 18, K.sword.hand.x - 26, K.sword.hand.y + 34); ctx.stroke();
      // head: hidden face + wide straw hat
      const h = K.head; dot(ctx, h.x, h.y, 12, shade(c, -30));
      ctx.fillStyle = ac; ctx.fillRect(h.x - 12, h.y + 1, 24, 4);            // eye band shadow
      ctx.fillStyle = '#fff'; ctx.fillRect(h.x + 3, h.y + 1.5, 5, 2.4);      // eye glint
      // amigasa (straw cone) tilted forward
      ctx.save(); ctx.translate(h.x, h.y - 9); ctx.rotate(0.12);
      const hatCol = shade('#caa15a', 0); poly(ctx, [{ x: -26, y: 6 }, { x: 26, y: 6 }, { x: 8, y: -14 }, { x: -8, y: -14 }], hatCol);
      ctx.strokeStyle = shade(hatCol, -40); ctx.lineWidth = 1.4; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 6, -12); ctx.lineTo(i * 10, 5); ctx.stroke(); }
      ctx.restore();
    },
    // KAPPA — squat frog ninja with a turtle shell, bulbous eyes, dual tanto, webbed limbs
    kappa(ctx, f, K) { const c = f.col, ac = f.tint, dk = shade(c, -34);
      shadowAt(ctx, K);
      limb(ctx, K.legB, 10, 8, 7, dk); web(ctx, K.legB[2], dk); limb(ctx, K.armB, 8, 6, 5, dk);
      // shell on the back
      const bk = mid(K.pelvis, K.chest, 0.5); ctx.save(); ctx.translate(bk.x - 8, bk.y); ctx.fillStyle = shade('#6b4a22', 0);
      ctx.beginPath(); ctx.ellipse(0, 0, 26, 32, -0.1, 0, 6.28); ctx.fill(); ctx.strokeStyle = shade('#3e2a12', 0); ctx.lineWidth = 2;
      for (const hx of [[0, -12], [-10, 4], [10, 4], [0, 16]]) { ctx.beginPath(); ctx.moveTo(hx[0], hx[1] - 6); ctx.lineTo(hx[0] + 6, hx[1] - 2); ctx.lineTo(hx[0] + 5, hx[1] + 5); ctx.lineTo(hx[0] - 5, hx[1] + 5); ctx.lineTo(hx[0] - 6, hx[1] - 2); ctx.closePath(); ctx.stroke(); } ctx.restore();
      // rounder torso
      taper(ctx, K.pelvis, K.chest, 17, 14, c); dot(ctx, mid(K.pelvis, K.chest, 0.45).x, mid(K.pelvis, K.chest, 0.45).y, 18, c);
      ctx.fillStyle = shade(c, 26); dot(ctx, mid(K.pelvis, K.chest, 0.5).x + 2, mid(K.pelvis, K.chest, 0.5).y + 4, 11, shade(c, 26)); // pale belly
      limb(ctx, K.legF, 11, 9, 7, c); web(ctx, K.legF[2], shade(c, -18));
      limb(ctx, K.armF, 9, 7, 5, c);
      // dual tanto (short) in both hands
      shortBlade(ctx, K.armB[2], K.armB[2].y > K.chest.y ? -1.9 : -1.9, '#dfeeff'); blade(ctx, K, ac, '#eef6ff', 3.5);
      // big frog head, headband, bulging eyes
      const h = K.head; ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(h.x, h.y + 2, 15, 12, 0, 0, 6.28); ctx.fill();
      ctx.fillStyle = ac; ctx.fillRect(h.x - 15, h.y - 1, 30, 4);              // headband
      ctx.strokeStyle = ac; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(h.x - 13, h.y + 1); ctx.quadraticCurveTo(h.x - 30, h.y + 6, h.x - 36, h.y + 14); ctx.stroke();
      for (const ex of [-8, 8]) { dot(ctx, h.x + ex, h.y - 10, 6, c); dot(ctx, h.x + ex, h.y - 11, 4.4, '#fff'); dot(ctx, h.x + ex + Math.sign(ex) * 1, h.y - 11, 2, '#0a0512'); }
      ctx.strokeStyle = '#0a2a12'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(h.x - 11, h.y + 7); ctx.quadraticCurveTo(h.x, h.y + 12, h.x + 11, h.y + 7); ctx.stroke();
    },
    // DOOMER — hunched hoodie, beanie, tired eyes + cig ember, drags a heavy cleaver
    doomer(ctx, f, K) { const c = f.col, ac = f.tint, dk = shade(c, -34), hood = shade(c, -18);
      shadowAt(ctx, K);
      limb(ctx, K.legB, 11, 9, 7, dk); shoe(ctx, K.legB[2], -1, '#26313f'); limb(ctx, K.armB, 11, 9, 6, hood);
      // baggy hoodie torso
      taper(ctx, K.pelvis, K.chest, 18, 20, c); dot(ctx, K.chest.x, K.chest.y + 2, 20, c);
      ctx.strokeStyle = dk; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(K.chest.x - 12, K.chest.y + 20); ctx.lineTo(K.chest.x + 12, K.chest.y + 20); ctx.stroke(); // pocket
      // drawstrings
      ctx.strokeStyle = '#e8ecf2'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(K.chest.x - 4, K.chest.y); ctx.lineTo(K.chest.x - 5, K.chest.y + 16); ctx.moveTo(K.chest.x + 4, K.chest.y); ctx.lineTo(K.chest.x + 5, K.chest.y + 16); ctx.stroke();
      limb(ctx, K.legF, 13, 11, 8, shade(c, 8)); shoe(ctx, K.legF[2], 1, '#2f3a48');
      // baggy sleeve + heavy cleaver dragged low
      limb(ctx, K.armF, 13, 10, 6, c); cleaver(ctx, K, ac);
      // hooded head, tired face + ember
      const h = K.head; ctx.fillStyle = hood; ctx.beginPath(); ctx.arc(h.x, h.y + 1, 15, Math.PI * 0.15, Math.PI * 0.85, false); ctx.lineTo(h.x + 15, h.y + 14); ctx.lineTo(h.x - 15, h.y + 14); ctx.closePath(); ctx.fill();
      ctx.fillStyle = shade('#cfc3b2', 0); dot(ctx, h.x, h.y + 4, 10, shade('#cfc3b2', 0));  // face
      ctx.fillStyle = hood; ctx.beginPath(); ctx.arc(h.x, h.y - 3, 15, Math.PI, 0, false); ctx.fill(); // hood over top
      ctx.strokeStyle = '#3a3f4a'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(h.x - 6, h.y + 2); ctx.lineTo(h.x - 2, h.y + 2); ctx.moveTo(h.x + 2, h.y + 2); ctx.lineTo(h.x + 6, h.y + 2); ctx.stroke(); // tired eyes
      ctx.strokeStyle = 'rgba(120,110,100,.7)'; ctx.beginPath(); ctx.moveTo(h.x - 6, h.y + 5); ctx.lineTo(h.x - 2, h.y + 5); ctx.moveTo(h.x + 2, h.y + 5); ctx.lineTo(h.x + 6, h.y + 5); ctx.stroke(); // eyebags
      ctx.save(); ctx.shadowColor = '#ff7a2a'; ctx.shadowBlur = 8; dot(ctx, h.x + 12, h.y + 8, 2, '#ff9a3c'); ctx.restore(); // cig ember
    },
    // ONI — hulking red demon, horns + mane, spiked pauldrons, giant spiked club
    oni(ctx, f, K) { const c = f.col, ac = f.tint, dk = shade(c, -46);
      shadowAt(ctx, K, 1.3);
      limb(ctx, K.legB, 13, 11, 9, dk); shoe(ctx, K.legB[2], -1, '#3a0d0d'); limb(ctx, K.armB, 13, 11, 8, dk);
      // broad muscular torso
      taper(ctx, K.pelvis, K.chest, 16, 24, c); dot(ctx, K.chest.x, K.chest.y, 22, c);
      ctx.strokeStyle = dk; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(K.chest.x, K.chest.y - 6); ctx.lineTo(K.chest.x, K.chest.y + 24); ctx.stroke(); // ab line
      // loincloth
      poly(ctx, [{ x: K.pelvis.x - 14, y: K.pelvis.y - 2 }, { x: K.pelvis.x + 14, y: K.pelvis.y - 2 }, { x: K.pelvis.x + 8, y: K.pelvis.y + 22 }, { x: K.pelvis.x - 8, y: K.pelvis.y + 22 }], shade('#2a0a0a', 0));
      limb(ctx, K.legF, 15, 13, 10, c); shoe(ctx, K.legF[2], 1, '#4a1010');
      // spiked pauldron on the front shoulder
      pauldron(ctx, K.chest, ac);
      limb(ctx, K.armF, 14, 12, 9, c); club(ctx, K, ac);
      // demon head: horns, mane, fangs
      const h = K.head; ctx.fillStyle = '#160608'; for (const s2 of [-1, 1]) { ctx.beginPath(); ctx.moveTo(h.x + s2 * 8, h.y - 8); ctx.quadraticCurveTo(h.x + s2 * 22, h.y - 10, h.x + s2 * 30, h.y - 30); ctx.lineTo(h.x + s2 * 40, h.y - 26); ctx.quadraticCurveTo(h.x + s2 * 20, h.y - 4, h.x + s2 * 10, h.y + 4); ctx.closePath(); ctx.fill(); } // mane
      dot(ctx, h.x, h.y, 15, c);
      for (const s2 of [-1, 1]) { ctx.fillStyle = '#f2ead0'; ctx.beginPath(); ctx.moveTo(h.x + s2 * 6, h.y - 12); ctx.lineTo(h.x + s2 * 16, h.y - 30); ctx.lineTo(h.x + s2 * 12, h.y - 10); ctx.closePath(); ctx.fill(); } // horns
      ctx.fillStyle = '#ffe14d'; ctx.save(); ctx.shadowColor = '#ffe14d'; ctx.shadowBlur = 8; for (const s2 of [-1, 1]) { ctx.beginPath(); ctx.moveTo(h.x + s2 * 3, h.y - 2); ctx.lineTo(h.x + s2 * 11, h.y - 5); ctx.lineTo(h.x + s2 * 10, h.y + 1); ctx.closePath(); ctx.fill(); } ctx.restore(); // eyes
      ctx.fillStyle = '#5a0a0a'; ctx.fillRect(h.x - 9, h.y + 6, 18, 4); ctx.fillStyle = '#fff'; for (const fx of [-6, -2, 2, 6]) { ctx.beginPath(); ctx.moveTo(h.x + fx, h.y + 6); ctx.lineTo(h.x + fx + 1.5, h.y + 12); ctx.lineTo(h.x + fx + 3, h.y + 6); ctx.closePath(); ctx.fill(); } // fangs
    },
    // KUNOICHI — lithe, long trailing scarf, hood + one eye, chain-sickle (kusarigama)
    kunoichi(ctx, f, K) { const c = f.col, ac = f.tint, dk = shade(c, -34), t = performance ? 0 : 0;
      shadowAt(ctx, K, 0.85);
      // long scarf trailing behind (waves)
      const nk = { x: K.chest.x - 4, y: K.chest.y - 10 }; ctx.strokeStyle = ac; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.shadowColor = ac; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.moveTo(nk.x, nk.y); ctx.quadraticCurveTo(nk.x - 34, nk.y - 6, nk.x - 46, nk.y + 20); ctx.quadraticCurveTo(nk.x - 52, nk.y + 40, nk.x - 40, nk.y + 54); ctx.stroke(); ctx.shadowBlur = 0;
      limb(ctx, K.legB, 8, 6, 5, dk); tabi(ctx, K.legB[2], -1, dk); limb(ctx, K.armB, 6, 5, 4, dk);
      // chain + weight off the back hand
      const bh = K.armB[2]; ctx.strokeStyle = '#9aa'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(bh.x, bh.y); ctx.quadraticCurveTo(bh.x - 18, bh.y + 16, bh.x - 30, bh.y + 30); ctx.stroke(); dot(ctx, bh.x - 30, bh.y + 30, 4, '#c8ccd6');
      // slim torso + thigh strap
      taper(ctx, K.pelvis, K.chest, 10, 12, c); dot(ctx, K.chest.x, K.chest.y, 11, c);
      ctx.strokeStyle = '#20121c'; ctx.lineWidth = 2; const th = mid(K.legF[0], K.legF[1], 0.5); ctx.beginPath(); ctx.arc(th.x, th.y, 6, 0, 6.28); ctx.stroke();
      limb(ctx, K.legF, 9, 7, 5, c); tabi(ctx, K.legF[2], 1, shade(c, -18));
      // front arm + kama (sickle)
      limb(ctx, K.armF, 8, 6, 4, c); sickle(ctx, K, ac);
      // hood + single eye
      const h = K.head; ctx.fillStyle = shade(c, -14); ctx.beginPath(); ctx.arc(h.x, h.y, 13, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#120a12'; ctx.fillRect(h.x - 13, h.y + 1, 26, 9);      // face wrap
      ctx.save(); ctx.fillStyle = ac; ctx.shadowColor = ac; ctx.shadowBlur = 8; ctx.beginPath(); ctx.ellipse(h.x + 5, h.y + 1, 4, 2.4, 0, 0, 6.28); ctx.fill(); ctx.restore();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(h.x + 1, h.y - 1); ctx.lineTo(h.x + 9, h.y - 2); ctx.stroke(); // lash
      // top-knot
      dot(ctx, h.x - 2, h.y - 13, 4, shade(c, -20));
    },
    // PRIZMANCER — ethereal crystalline mage-ninja, floating shards, prism head, light blade
    prizm(ctx, f, K) { const t = (window.__rnT || 0);
      shadowAt(ctx, K, 0.7);
      const grad = () => { const g = ctx.createLinearGradient(-16, K.chest.y, 16, K.pelvis.y); g.addColorStop(0, '#ff2ad9'); g.addColorStop(.5, '#3df0ff'); g.addColorStop(1, '#ffd23b'); return g; };
      ctx.save(); ctx.globalAlpha *= 0.9;
      limb(ctx, K.legB, 8, 6, 5, 'rgba(180,123,255,.55)'); limb(ctx, K.armB, 7, 5, 4, 'rgba(180,123,255,.55)');
      // crystalline torso (faceted)
      ctx.fillStyle = grad(); poly(ctx, [{ x: K.chest.x - 12, y: K.chest.y }, { x: K.chest.x + 12, y: K.chest.y + 4 }, { x: K.pelvis.x + 9, y: K.pelvis.y }, { x: K.chest.x, y: K.pelvis.y + 4 }, { x: K.pelvis.x - 9, y: K.pelvis.y }], grad());
      ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(K.chest.x, K.chest.y); ctx.lineTo(K.pelvis.x, K.pelvis.y + 4); ctx.stroke();
      limb(ctx, K.legF, 9, 7, 5, grad()); limb(ctx, K.armF, 8, 6, 4, grad());
      // light blade
      const s = K.sword; ctx.save(); ctx.shadowColor = '#e6c8ff'; ctx.shadowBlur = 22; ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(s.hand.x, s.hand.y); ctx.lineTo(s.tip.x, s.tip.y); ctx.stroke(); ctx.strokeStyle = 'rgba(180,123,255,.6)'; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(s.hand.x, s.hand.y); ctx.lineTo(s.tip.x, s.tip.y); ctx.stroke(); ctx.restore();
      // prism head (diamond) — no face
      const h = K.head; ctx.save(); ctx.translate(h.x, h.y); ctx.shadowColor = '#3df0ff'; ctx.shadowBlur = 16;
      ctx.fillStyle = grad(); poly(ctx, [{ x: 0, y: -14 }, { x: 11, y: 0 }, { x: 0, y: 14 }, { x: -11, y: 0 }], grad());
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(0, 14); ctx.moveTo(-11, 0); ctx.lineTo(11, 0); ctx.stroke(); ctx.restore();
      // floating shards orbiting
      for (let i = 0; i < 3; i++) { const a = t * 1.4 + i * 2.1, ox = Math.cos(a) * 26, oy = K.chest.y + Math.sin(a) * 22 + 8;
        ctx.save(); ctx.translate(K.chest.x + ox, oy); ctx.rotate(a); ctx.fillStyle = ['#ff2ad9', '#3df0ff', '#ffd23b'][i]; ctx.globalAlpha *= 0.85;
        poly(ctx, [{ x: 0, y: -5 }, { x: 3, y: 0 }, { x: 0, y: 5 }, { x: -3, y: 0 }], ctx.fillStyle); ctx.restore(); }
      ctx.restore();
    },
  };

  // helpers for gear
  function shadowAt(ctx, K, sc) { ctx.save(); ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(0, 2, 22 * (sc || 1), 6, 0, 0, 6.28); ctx.fill(); ctx.restore(); }
  function web(ctx, foot, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(foot.x - 10, foot.y); ctx.lineTo(foot.x + 12, foot.y - 3); ctx.lineTo(foot.x + 12, foot.y + 4); ctx.closePath(); ctx.fill(); }
  function shoe(ctx, foot, dir, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(foot.x - 8, foot.y - 3); ctx.lineTo(foot.x + dir * 15, foot.y - 2); ctx.lineTo(foot.x + dir * 15, foot.y + 4); ctx.lineTo(foot.x - 8, foot.y + 4); ctx.closePath(); ctx.fill(); }
  function pauldron(ctx, sh, col) { ctx.save(); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(sh.x + 6, sh.y - 2, 14, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#f2ead0'; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(sh.x + 6 + i * 8, sh.y - 12); ctx.lineTo(sh.x + 6 + i * 8 + 2, sh.y - 22); ctx.lineTo(sh.x + 6 + i * 8 + 5, sh.y - 12); ctx.closePath(); ctx.fill(); } ctx.restore(); }
  function shortBlade(ctx, hand, ang, edge) { const tip = rot(hand, ang, 28); ctx.save(); ctx.strokeStyle = edge; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.shadowColor = '#8ffff0'; ctx.shadowBlur = 8; ctx.beginPath(); ctx.moveTo(hand.x, hand.y); ctx.lineTo(tip.x, tip.y); ctx.stroke(); ctx.restore(); }
  function cleaver(ctx, K, col) { const s = K.sword, dir = { x: s.tip.x - s.hand.x, y: s.tip.y - s.hand.y }, L = Math.hypot(dir.x, dir.y) || 1, nx = -dir.y / L, ny = dir.x / L;
    ctx.save(); ctx.fillStyle = '#c9d2dc'; ctx.strokeStyle = '#7a828c'; ctx.lineWidth = 1.5; ctx.shadowColor = col; ctx.shadowBlur = 10;
    const b0 = mid(s.hand, s.tip, 0.35); ctx.beginPath(); ctx.moveTo(b0.x + nx * 3, b0.y + ny * 3); ctx.lineTo(s.tip.x + nx * 3, s.tip.y + ny * 3); ctx.lineTo(s.tip.x - nx * 16, s.tip.y - ny * 16); ctx.lineTo(b0.x - nx * 12, b0.y - ny * 12); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#3a2a18'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(s.hand.x, s.hand.y); ctx.lineTo(b0.x, b0.y); ctx.stroke(); ctx.restore(); }
  function club(ctx, K, col) { const s = K.sword, dir = { x: s.tip.x - s.hand.x, y: s.tip.y - s.hand.y }, L = Math.hypot(dir.x, dir.y) || 1, ux = dir.x / L, uy = dir.y / L, nx = -uy, ny = ux;
    ctx.save(); ctx.strokeStyle = '#4a3420'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(s.hand.x, s.hand.y); ctx.lineTo(s.tip.x, s.tip.y); ctx.stroke();
    ctx.fillStyle = '#5a4028'; ctx.shadowColor = col; ctx.shadowBlur = 8; const head = mid(s.hand, s.tip, 0.72); ctx.beginPath(); ctx.ellipse(head.x, head.y, 16, 13, Math.atan2(uy, ux), 0, 6.28); ctx.fill();
    ctx.fillStyle = '#cfc3a6'; for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; const px = head.x + Math.cos(a) * 14, py = head.y + Math.sin(a) * 12; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(a) * 8, py + Math.sin(a) * 8); ctx.lineTo(px + Math.cos(a + .5) * 4, py + Math.sin(a + .5) * 4); ctx.closePath(); ctx.fill(); } ctx.restore(); }
  function sickle(ctx, K, col) { const s = K.sword; ctx.save(); ctx.strokeStyle = '#3a2a18'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(s.hand.x, s.hand.y); ctx.lineTo(s.tip.x, s.tip.y); ctx.stroke();
    ctx.strokeStyle = '#eef6ff'; ctx.lineWidth = 4; ctx.shadowColor = col; ctx.shadowBlur = 12; const perp = s.ang - 1.4; const hook = rot(s.tip, perp, 26);
    ctx.beginPath(); ctx.moveTo(s.tip.x, s.tip.y); ctx.quadraticCurveTo(s.tip.x + Math.sin(s.ang - 0.7) * 22, s.tip.y + Math.cos(s.ang - 0.7) * 22, hook.x, hook.y); ctx.stroke(); ctx.restore(); }

  function draw(ctx, f, K) { (A[f.arch] || A.ronin)(ctx, f, K); }

  // ── lobby portrait: idle pose, scaled to fit the cell ──
  function portrait(ctx, archKey, arch) {
    ctx.clearRect(0, 0, 120, 128); ctx.save(); ctx.translate(60, 124); ctx.scale(0.72, 0.72);
    const f = { arch: archKey, a: arch, col: arch.col, tint: arch.tint, weapon: arch.weapon, glow: 0, rig: {
      lean: 0.05, head: 0, aF: -0.5, eF: 0.55, aB: 0.5, eB: 0.55, hF: 0.16, kF: 0.02, hB: -0.16, kB: 0.02, sw: -0.7, bob: 0, bodyRot: 0 } };
    const K = skel(f); (A[archKey] || A.ronin)(ctx, f, K); ctx.restore();
  }

  return { skel, draw, portrait, WLEN, weaponKind };
})();
