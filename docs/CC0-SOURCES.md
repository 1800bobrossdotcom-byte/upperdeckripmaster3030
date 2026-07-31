# CC0 source dossier

*Evidence file for the CC0-inspired asset work in `models/cc0/`. Every claim below was checked
against a source that was actually fetched — nothing here is from memory, and news articles were
never treated as proof.*

**This is a record of evidence, not legal advice.** It says what each project has published about
its own licence and how strong that publication is. It does not say what you may do with it. If
anything here is going to end up inside a minted token, the artist should confirm it — ideally
directly with the artist concerned, which for this scene is a DM, not a lawsuit.

**Why the care.** This project mints on-chain. A licensing mistake in a token is permanent and
unfixable, exactly like `name()`. So the rule for `models/cc0/` is: **VERIFIED sources may inform
phase-2 study and phase-3 assets; CLAIMED and UNVERIFIED may not.** They are recorded here as
leads for the artist, and that is all.

---

## Two things CC0 does not do

**1 · CC0 waives copyright. It does NOT waive trademark.**
CC0 1.0 is a copyright and neighbouring-rights waiver. Names, logos, wordmarks and brand identity
are a separate right and are not touched by it. So: do not name an asset after a project, do not
reproduce a project's logo or wordmark as ours, do not present anything as an official or endorsed
asset of another project, and do not imply affiliation. The Nouns brand-assets page makes the
point itself — it CC0s "the logos, traits and every Noun", which is unusually generous, and even
there the endorsement line still applies. Assume the opposite for everyone else.

**2 · CC0 is irrevocable for works actually dedicated — and a re-upload is not a dedication.**
If a rights-holder validly dedicated a work, they cannot take it back. But that only covers works
*they* held rights in and *actually* dedicated. Someone else re-uploading an artist's work to a
CC0-labelled collection does not make it CC0. Neither does a marketplace, an aggregator, a "CC0
wiki", or a derivative project asserting it downstream. Trace the claim to the rights-holder or
treat it as unverified.

**Corollary that bit twice in this research:** collaborations are the standard exclusion. XCOPY
says so on their own licence page. Assume any two-name piece is out unless both names say
otherwise.

---

## Confidence key

| grade | means |
| --- | --- |
| **VERIFIED** | a primary source was fetched and read — the rights-holder's own site, repo, on-chain contract, or a collection description on a channel they control |
| **CLAIMED** | only secondary reporting, aggregators, or third parties assert it; the primary source could not be reached or does not say it |
| **UNVERIFIED** | no usable evidence either way, or positive evidence that it is *not* blanket CC0 |

Because "primary" covers a range, every VERIFIED row also carries an **evidence class**:

- **A — dedicated licence instrument or on-chain constant.** The strongest. A page whose only job
  is the licence, or the licence baked into the contract.
- **B — the project's own site says it in prose.**
- **C — a collection description the creator controls on a third-party marketplace.** The creator
  wrote it; the platform hosts it. Weaker than A/B because it can be edited and is not versioned,
  but it is still the rights-holder speaking.

---

## The table

| artist / project | what exactly is CC0 | primary evidence | conf. | class | caveats |
| --- | --- | --- | --- | --- | --- |
| **XCOPY** | The solo body of work — "XCOPY works", stated without a date limit, so read as prior + future | <https://xcopy.art/creative-commons> — the artist's own domain, a page whose entire purpose is the licence. Verbatim: *"PERMISSIONLESS ART. XCOPY works are licensed under CC0 (Public Domain), free to use, remix, and build upon. Derivative and collaborative works may have different rights retained by the original artist."* Site footer: *"No rights reserved."* | **VERIFIED** | A | ⚠ **Collaborations are excluded by the page itself.** So are derivative works by others. The page carries **no date and no work list** — the "August 2022, retroactive" framing is secondary reporting only; the page as it stands is undated and general. Editions/1-of-1s are not enumerated, so a specific piece cannot be confirmed from this page alone. |
| **Nouns** | "The logos, traits and every Noun generated on the playground" | Two independent primary sources in the project's own monorepo. On-chain: `packages/nouns-contracts/contracts/NounsDescriptor{,V2,V3}.sol` carries `bytes32 constant COPYRIGHT_CC0_1_0_UNIVERSAL_LICENSE = 0xa2010f34…cf0499` with the CC0 legalcode URL above it. In the official webapp: `packages/nouns-webapp/src/pages/TraitsPage.tsx` and `.../BrandAssets/BrandAssetsPage.tsx` — *"All traits are CC0 (Creative Commons Zero), meaning they are in the public domain and free to use for any purpose without restriction."* | **VERIFIED** | A | The cleanest evidence of any project here — the licence hash is *in the art contract*. Note it covers the **traits and the generator**, which is what the palette below comes from. Derivative Nouns-ish projects (Lil Nouns, NounPunks, …) are separate projects with separate rights; do not infer. |
| **Blitmap** | "Blitmaps" — the 100 originals and the 1,600 community siblings | <https://blitmap.com> — the project's own site: *"And it's public domain. Blitmaps are released as CC0 public domain. Feel free to use them in any way you want."* | **VERIFIED** | B | Says *Blitmaps*. The **Blitnauts** expansion is described separately on the same page and is **not** named in the licence sentence — treat Blitnauts as unverified. Siblings recombine an original's composition with another's palette, so the sibling licence rides on the originals being covered, which this sentence does cover. |
| **goblintown** | The 10,000-piece mint | The project's own mint site, archived: `web.archive.org/web/2022…/goblintown.wtf` — *"No roadmap. No Discord. No utility. CC0."* | **VERIFIED** | B | Terse — four words on a mint page, no instrument, no scope statement, no signature. It is unambiguous about the intent and thin about the boundary. **Later goblintown properties (Grumpls, McGoblin Burger, the "187"/IP-licensing announcements) are separate and are NOT covered by this line** — reporting indicates some of them went the *opposite* way, into negotiated IP licensing. Only the original goblintown mint is in scope. |
| **mfers** | The 10,000-piece collection by sartoshi | The creator's own OpenSea collection description: *"mfers are generated entirely from hand drawings by sartoshi. this project is in the public domain; feel free to use mfers any way you want."* | **VERIFIED** | C | Plain-words public-domain dedication, not a formal CC0 instrument. sartoshi handed the project to the community and deleted their accounts in June 2022, so **there is no longer anyone to ask** — which cuts both ways: the dedication cannot be walked back, and it also cannot be clarified. Community follow-ons (end of sartoshi, sartoshi's-successor projects) are separate. |
| **CrypToadz by GREMPLIN** | The 6,969-piece collection | The creator's own OpenSea collection description: *"This project is in the public domain. Feel free to use the toadz in any way you want."* | **VERIFIED** | C | ⚠ The same description says the collection was *"Created by Gremplin, with a little bit of help from his friends"* — i.e. **it is on its face partly collaborative**, and the contributors are not enumerated. Given the collaboration rule above, that is a real edge. The project's own site is a JS app that serves no text to a fetcher, so there is no site-level statement to fall back on. |
| **Anonymice** | The fully on-chain collection | The creator's own OpenSea collection description: *"CC0. No IPFS. No APIs. Just code. Fully on-chain, generative NFT."* Contract is renounced and the art is generated in Solidity. | **VERIFIED** | C | ⚠ **anonymice.xyz is gone — the domain is parked and for sale.** There is no project site left to check, and no team to ask. The on-chain art survives the site; the licence page did not. A good argument for reading the contract, not the website. |
| **Loot (for Adventurers)** | The Loot bags | <https://www.lootproject.com> — the creator's own site: *"Stats, images, and other functionality are intentionally omitted for others to interpret. **Feel free to use Loot in any way you want.**"* | **VERIFIED** | B | ⚠ **This is a permission sentence, not a CC0 instrument.** Loot is universally *called* CC0; its own site never uses the term. That is a meaningful difference — a named licence has defined scope and irrevocability, an invitation does not. Also: Loot's "art" is a plain text list, and short factual item names are thin copyright material to begin with. Use the **format**, which is the interesting part anyway. |
| **Moonbirds** | The 10,000-piece collection, art by Justin Mezzell | moonbirds.xyz (archived 2023), the project's own site: *"They are distributed under a creative commons (CC0) licence, meaning that any and every creative can use the artwork to build their own collections and products."* | **VERIFIED** | B | ⚠ **Verified but deliberately unused — see the "not used" list.** The dedication was a unilateral retroactive switch by PROOF in Aug 2022, after holders had been told they held IP rights; the legitimacy of that switch was publicly contested at the time. The project has since changed corporate hands. The statement is clear; the chain of authority behind it is the messy part, and this is the one category of mess a minted token cannot absorb. |
| **Darkfarms1 — SMOWLz** | The 4,201-piece collection | The creator's own OpenSea collection description: *"4201 SMOWLz by Darkfarms1, CC0 smol project, just a Smol wanna be Birb-Birb and Hoot-Hoot with frens."* | **VERIFIED** | C | ⚠ **Weakest VERIFIED row here, and the artist should confirm it in person.** `darkfarms.wtf` was fetched in full and contains **no licence statement of any kind** — grepped for cc0 / creative commons / public domain / licence, zero hits. The SMOWL contract has no `contractURI` and exposes no licence field (checked on-chain). So the entire evidence is three letters in a marketplace description. Given that this artist is in the artist's own scene, **a direct message is worth more than any amount of further desk research.** |
| **Darkfarms1 — "Decal by Darkfarms"** | claimed: the whole Decal series | None found. The OpenSea collection description is only *"An interpretation of the Decal by Darkfarms. A symbol of permissionless creativity. Series Sixteen."* — "permissionless creativity" is a vibe, not a licence. The CC0 claim traces to Deca (the **platform**), not to Darkfarms. | **CLAIMED** | — | Deca asserting that "CC0 is the perfect cryptoart license model" is Deca's editorial position about its own product, not the artist's dedication of these works. **Not used.** |
| **Darkfarms1 — Book of Meme / BOME** | claimed: CC0-associated | None found. | **UNVERIFIED** | — | **Not used.** |
| **Chain Runners** | claimed: the on-chain collection | None reachable. chainrunners.xyz and its `/xr` terms page are a JS app that serves no text to a fetcher, live or archived. The OpenSea description carries no licence line (*"Chain Runners are Mega City renegades 100% stored and generated on chain."*). Etherscan blocks unauthenticated fetches and Sourcify's v1 API is in a scheduled brownout, so the verified contract source could not be read either. | **CLAIMED** | — | Very widely reported as CC0, including in a16z's own cc0 explainer, and other projects' contracts credit it as CC0 inspiration. Probably true. **Probably is not a licence.** Not used — the only thing missing is a readable primary source, so this is the most likely row to be promoted later. |
| **Rare Pepe (Counterparty, 2016–18)** | **nothing blanket** | Positive evidence *against*: the Rare Pepe Directory's submission rules required work to be **original** and prohibited copying — i.e. artists retained their own positions, per card, per artist. There is no project-wide dedication, and there are hundreds of individual submitting artists. | **UNVERIFIED** | — | ⚠ **And a second, larger problem: Pepe the Frog is Matt Furie's copyright and he has actively enforced it**, including against crypto projects. A Rare Pepe card is at minimum two rights stacked — the submitting artist's, and Furie's underlying character. **Not used, and should not be used**, notwithstanding that this is the artist's home scene. Card *format* and card *culture* are not copyrightable and are ours to work in freely; specific Pepe imagery is not. |
| **Fake Rares / Dank Rares** | **nothing blanket** | Same structure as Rare Pepe — a per-submission directory of independent artists, no project-wide dedication found. | **UNVERIFIED** | — | **Not used.** Same two-layer problem. The artist's own Fake Rares work is of course the artist's own and is unaffected by any of this. |

---

## Which VERIFIED sources phase 2/3 actually leaned on

Six, and only at the level of palette, proportion, technique and format — none of which is
copyrightable in the first place, which is exactly why it transfers into a game and a traced
character does not.

| source | what was taken | what was NOT taken |
| --- | --- | --- |
| **XCOPY** | the measured colour statistics (below) and the FX grammar: strobe, slice-offset, scanline, dither | no figure, no skull, no composition, no title, no typeface |
| **Nouns** | the literal on-chain 239-colour palette, and the strict-grid flat-fill construction logic | **no noggles.** The eyewear is *the* Nouns mark and the one shape that would read as impersonation. Zero Noun-shaped geometry. |
| **Blitmap** | the four-colours-per-piece constraint as a generator rule | no Blitmap composition or palette pairing |
| **Loot** | the format — white monospace on black, a list as an artwork, art withheld for others to interpret | no item names, no bag contents |
| **Anonymice** | 1-bit / ordered-dither monochrome as a discipline | no mouse |
| **Darkfarms (SMOWLz)** | the measured cel-fill statistics: heavy black keyline + flat candy fills | no owl, no character, no trait |

Everything else in the table was left alone.

---

## Deliberately NOT used, and why

This list matters as much as the assets.

- **Moonbirds** — VERIFIED statement, unresolved authority behind it. The CC0 switch was made
  unilaterally and retroactively over an existing grant to holders and was publicly disputed;
  the project has since changed hands. Nothing in `models/cc0/` derives from it.
- **Chain Runners** — CLAIMED only. Primary source unreachable, not for lack of trying (site,
  archived site, `/xr` terms page, OpenSea description, Etherscan, Sourcify). Promote it if
  someone can produce a readable statement.
- **"Decal by Darkfarms"** — CLAIMED via the platform, not the artist.
- **Book of Meme / BOME** — UNVERIFIED.
- **Rare Pepe / Fake Rares** — UNVERIFIED *and* encumbered by Matt Furie's underlying copyright
  in Pepe. This is the artist's own scene and the temptation is real; it is still a no. The
  lineage lives in the repo as *form* — the card, the rip, the directory culture — not as pixels.
- **Any third-party image or model file.** Nothing was committed. A handful of CC0 works were
  fetched into a scratch directory to *measure* palettes and were not copied into the repo. Every
  triangle and every pixel in `models/cc0/` is generated by `scripts/blender/build-cc0-*.py` and
  `scripts/build-cc0.mjs`.

---

## Measured palettes (phase 2 raw data)

Measurement beats recollection. These are the numbers phase 3 actually used.

### XCOPY — measured, 5 works, 5-bit-per-channel quantised

Sampled from `churn`, `max pain`, `the doomed`, `last selfie`, `bang bang` (fetched from the
artist's own CDN, analysed, not retained).

| work | near-black | near-white | high-chroma | the two poles |
| --- | --- | --- | --- | --- |
| max pain | 61.9% | **0.0%** | 29.5% | `#f80070` / `#007080` |
| churn | 71.0% | **0.0%** | 11.1% | `#f84088` / `#1858a0` |
| the doomed | 49.8% | **0.0%** | 31.3% | `#78f8f8` / `#183030` |
| last selfie | 39.1% | **0.0%** | 7.1% | `#a04060` / `#686070` |
| bang bang | 46.8% | **0.0%** | 7.1% | `#c83030` / `#48b0b0` |

Three findings, all of them non-obvious and all of them useful:

1. **Black is the substrate, not the shadow.** 39–71% of every frame is at or near `#000000`,
   and `#000000` exactly is the single most common value in four of the five. Form is what
   *interrupts* black.
2. **White is absent. Not rare — absent.** Near-white measured **0.00%** in all five. Highlights
   are chromatic, never neutral. This is the single most transferable rule here, and it is the
   opposite of what a game renderer does by default (bloom clips to white — cf. the `knee`
   rolloff note in the project memory).
3. **Two chroma poles and a cold steel mid.** Hot magenta/pink at H≈330–340 and cyan/teal at
   H≈180–190, both at 90–100% saturation, over a desaturated blue-grey mid at H≈210–225. Very few
   colours doing very much work.

### Darkfarms — SMOWLz, measured, 7 tokens, exact colours

903×903 flat PNGs; 512 distinct exact colours across seven whole tokens — i.e. a small fixed
palette per trait, no gradients, no anti-alias soup.

| hex | share | role |
| --- | --- | --- |
| `#000000` | 21.4% | **the keyline.** A fifth of the image is pure black outline. |
| `#aca3fe` | 10.9% | lilac fill |
| `#f4cd70` | 9.3% | butter fill |
| `#9500a3` | 5.5% | saturated magenta accent |
| `#cfd4da` | 5.0% | cool paper grey |
| `#5d8f36` | 4.7% | moss green |
| `#6d000f` | 1.8% | deep maroon shadow |

The rule: **flat cel fills, candy-pastel, held together by a heavy black keyline** — and one
saturated accent per piece so it does not go soft. Compare XCOPY, where black is the ground; here
black is the *edge*. Two opposite uses of the same colour, and both are in the asset set.

### Nouns — exact, from the art contract

`packages/nouns-assets/src/image-data.json`, the same data the on-chain descriptor renders from.
**239 entries.** Backgrounds are exactly two: `#d5d7e1` (cold) and `#e1d7d5` (warm) — the same
three bytes, reversed. That joke is the whole palette philosophy in miniature.

Working subset used in `models/cc0/skins.json`:

`#1f1d29` `#343235` `#4b4949` `#807f7e` `#c5b9a1` `#fffdf2` `#63a0f9` `#5648ed` `#caeff9`
`#068940` `#4bea69` `#80a72d` `#eed811` `#ffc110` `#ffae1a` `#f98f30` `#fe500c` `#d22209`
`#f3322c` `#e9265c` `#b9185c` `#ff638d` `#9f21a0` `#8bc0c5` `#5a423f` `#ae3208`

Construction logic worth stealing (and free to): **flat fill, hard edge, strict grid, no
gradient, no anti-alias.** Legibility comes from silhouette and value separation, not shading —
which is precisely why it survives being turned into low-poly geometry.

---

## Method notes, for whoever re-runs this

- **Modern project sites are single-page apps and serve nothing to a fetcher.** cryptoadz.io,
  chainrunners.xyz, mfers.io, nouns.wtf and moonbirds.xyz all returned "You need to enable
  JavaScript to run this app" or a bare title. This is why so much evidence here is class C: the
  marketplace description was often the only human-readable text the rights-holder controls.
  When a site fails, try: the archived copy, the GitHub repo, the contract, then the marketplace.
- **The Wayback Machine works, but not through the summarising fetcher** — it had to be curled
  and stripped, and it rate-limits. It is the only reason goblintown and Moonbirds are VERIFIED.
- **Repos and contracts are the best sources and are the ones nobody checks.** Nouns' licence is a
  `bytes32` in the descriptor. That is a stronger artefact than any web page, because it is as
  permanent as the art.
- **Etherscan returns 403 to unauthenticated fetches and Sourcify v1 is in a brownout window
  (2026-07-07 → 2027-01-08).** Reading verified contract source needs a key or Sourcify v2.

---

## Open questions for the artist

1. **Darkfarms** — you are in this scene. A direct confirmation from Darkfarms that SMOWLz is CC0
   (and where he'd say the line is on *Decal*) would upgrade the weakest row here in one message.
2. **Chain Runners** — if anyone has a screenshot or a saved copy of the `/xr` terms text, that
   promotes CLAIMED → VERIFIED.
3. **XCOPY scope** — the licence page names no works and carries no date. If you want to use a
   *specific* piece rather than the general vocabulary, that specific piece needs its own check.
4. **Moonbirds** — do you want it in at all? It is verified, it is contested, and nothing
   currently depends on the answer.
