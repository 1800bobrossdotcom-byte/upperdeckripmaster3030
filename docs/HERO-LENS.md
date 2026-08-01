# HERO LENSES — cards 1–33 as live HTML

*Cards 1–33 are the hero 1/1s. They are not pictures of cards; they are cards that run.
Builder: `scripts/build-hero-lens.mjs`. Template: `cards/hero/_template.html`.*

---

## Why HTML at all

`docs/RENDER-CONTRACT.md` gives every card a lens: `tokenURI(uint256 id)` returns metadata
for card *id*. For a flat card that metadata points at an image. For a hero it points at a
page — so the card can move, react, and read the chain it lives on.

The delivery path, already proven on SuperRare's dev environment:

```
tokenURI(id)  →  on-chain JSON
                 └─ animation_url = data:text/html;base64,<wrapper>
                                     └─ <iframe src="https://upperdeckripmaster3030.com/cards/hero/<id>.html">
```

The wrapper is on-chain and tiny (see `_animHtml` in `contracts/Ripmaster3030Renderer.sol`).
SuperRare's media slot renders `animation_url` as a **`data:text/html` document, not an
external URL** — which is the whole reason the indirection exists.

## The hostile-environment rules

The lens loads inside a **sandboxed iframe at an opaque origin, on someone else's site**.
Everything in `cards/hero/_template.html` follows from that:

| Constraint | Consequence |
|---|---|
| Opaque origin | `localStorage` **throws**. Verified: `storageThrew: true` in both test frames. |
| Sandboxed | No injected wallet. `window.parent` / `window.top` access throws. |
| Someone else's page | No external requests — no CDN, no fonts, no remote images. Inline everything. |
| Unknown size | Size in %, vh/vw or cqw — never fixed px. ~320px wide on a phone, ~900px on desktop. |
| Cold load | No cookies, no referrer, no gate. The page must work from nothing. |

## The card must hold 2:3

A trading card is *a size before it's anything*. The shell locks that and fits it to
whatever frames it — but which side binds depends on the frame's own aspect:

```css
.card{ aspect-ratio:2/3; margin:auto }
@media (min-aspect-ratio:2/3){ .card{ height:100%; width:auto } }  /* wide frame */
@media (max-aspect-ratio:2/3){ .card{ width:100%; height:auto } }  /* tall frame */
```

**The trap:** `height:100%` + `max-width:100%` together looks correct and is not. Once the
clamp binds, `aspect-ratio` silently yields and the card stretches — measured **0.571**
instead of 0.667 in a 320×560 phone slot. Only testing at phone width caught it.

## Authoring

Copy `cards/hero/_template.html`, rename to `NN - YOUR TITLE.html`, drop it in the repo root
next to the field-card PNGs, then:

```
node scripts/build-hero-lens.mjs                    # dry run — coverage + what it found
node scripts/build-hero-lens.mjs --apply            # → cards/hero/<n>.html
node scripts/build-hero-lens.mjs --apply --inline   # embed GIFs as data: URIs
```

A hero can also just be a GIF — `NN - TITLE.gif` gets framed at card aspect with
`object-fit:contain`. Titles are taken verbatim, same as the field cards.

`--inline` makes the page fully self-contained so it survives re-hosting to IPFS/Arweave
with no companion files, at ~1.37× the GIF's bytes. Without it the GIF is a relative sibling
and the page stays light; `vercel.json` already serves these CORS-open.

## Testing a hero before it ships

Three checks, in order of how much they catch:

1. Open `cards/hero/<n>.html` directly.
2. Open it in a **sandboxed iframe** (`sandbox="allow-scripts"`) — catches storage throws
   and stray external requests.
3. Open it at **320px wide** — catches aspect and type-size bugs.

Survive all three and it will survive the media slot.

## Numbering

- **1–33** heroes — `.html` or `.gif`, built by `build-hero-lens.mjs`
- **34–100** field cards — `.png`, ingested by `ingest-deck.mjs`

Matches model v2.2: 33 hero 1/1s + 67 render-only field lenses = the 100-card deck.

## Still to build

- `tokenURI(uint256 id)` itself — the render-by-id lens contract. The passthrough renderer
  exists; per-id does not.
- The EIP-712 voucher mint for the 33 heroes.
- **Durability.** The lens is hosted, so if the site goes, the lens goes. Pin an `--inline`
  copy to IPFS/Arweave and keep that as the fallback `animation_url`.

*NFA. Experimental art token — it can go to zero.*
