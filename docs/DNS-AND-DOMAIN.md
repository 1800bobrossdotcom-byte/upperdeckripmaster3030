# DNS · ripmaster3030studios.com

*Written 2026-08-05, one day out. The repo side is done and pushed; everything below is a
dashboard/registrar action, which is why it is a runbook rather than code.*

---

## ⛔ READ THIS FIRST — the old domain being offline is not a neutral state

`vercel.json` now forwards `upperdeckripmaster3030.com` (and its `www`) to
`ripmaster3030studios.com`, path-preserving and permanent. **That redirect cannot fire while the
old domain is offline**, because a redirect is something the platform does to a request that
reached it. DNS has to point at the platform first. Offline is not "the old domain is retired" —
it is "every old link is a dead end and nothing is telling anyone where to go."

⛔ **AND IT IS ALREADY COSTING SOMETHING MEASURABLE.** Read off the live Sepolia renderer
(`0x948E6330…de903`) at the time of writing:

```
animationUrl()   "https://upperdeckripmaster3030.com/"
externalUrl()    "https://upperdeckripmaster3030.com"
lensName()       "upperdeckripmaster3030"
```

That renderer was deployed on 2026-07-27, four days before the rename. So **the SuperRare token
page's media slot is currently pointing at a host that does not answer** — the live-site-inside-the-
token demo that was proven working on 2026-07-27 is dark right now, and so is the token's
`external_url`.

✅ **All three are owner-settable, no redeploy** — `setAnimationUrl(...)` and
`setMeta(name, description, externalUrl)` on the renderer, from the artist's SuperRare-linked
wallet. Fixing DNS makes it work again immediately; fixing the strings makes it right.

---

## 1 · The order matters

**Add both domains to the hosting project BEFORE changing any DNS.** Adding a domain is what
provisions the TLS certificate; if DNS points at the platform before the domain is attached,
visitors get a certificate error rather than a site, and that is a worse failure than a 404 because
browsers remember it.

1. In the hosting dashboard, add **`ripmaster3030studios.com`** and **`www.ripmaster3030studios.com`**
   to the project.
2. Add **`upperdeckripmaster3030.com`** and **`www.upperdeckripmaster3030.com`** to the **same
   project** — do not use the registrar's own forwarding.
3. *Then* set the DNS records below.
4. Wait for the certificates to issue (usually minutes), then check all four hosts.

⚑ **Why the same project rather than registrar forwarding:** the redirect then lives in
`vercel.json`, in version control, path-preserving, and covered by a test. Registrar forwarding is a
setting in somebody else's panel that nobody will remember exists, and most of them drop the path —
so `…/cards/binder.html` lands on the new home page instead of the new folder.

---

## 2 · The records

The dashboard prints the exact values when you add a domain, **and those are the authority** — if
they disagree with anything here, believe the dashboard. What it will almost certainly ask for:

### ripmaster3030studios.com — the live host

| type | name | value | notes |
| --- | --- | --- | --- |
| `A` | `@` | `76.76.21.21` | the apex. Delete any existing `A`/`AAAA` on `@` first. |
| `CNAME` | `www` | `cname.vercel-dns.com` | |

### upperdeckripmaster3030.com — the forward

| type | name | value | notes |
| --- | --- | --- | --- |
| `A` | `@` | `76.76.21.21` | same project; `vercel.json` does the redirect |
| `CNAME` | `www` | `cname.vercel-dns.com` | |

⚠ **A `CNAME` cannot live on an apex** — that is why the root is an `A` record and only `www` is a
`CNAME`. Some registrars offer `ALIAS`/`ANAME`/"CNAME flattening" at the apex; either works.

⚠ **Delete conflicting records, don't add alongside.** Two `A` records on `@` pointing at different
hosts is a coin flip per visitor, and it presents as "the site works for me" — the single most
expensive shape a DNS problem can take.

⚠ **Leave `MX` and `TXT` alone.** Changing `A`/`CNAME` does not affect mail; deleting a `TXT`
record can break domain verification somewhere you have forgotten about.

---

## 3 · What to check once it resolves

All four should end at `https://ripmaster3030studios.com/…` with the path intact:

```
curl -sSI https://upperdeckripmaster3030.com/cards/binder.html  | head -3
curl -sSI https://www.upperdeckripmaster3030.com/               | head -3
curl -sSI https://www.ripmaster3030studios.com/                 | head -3
curl -sSI https://ripmaster3030studios.com/                     | head -3   # 200, not a redirect
```

Expect `HTTP/2 308` and a `location:` on the first three, `200` on the last. ⚠ **If the last one
redirects, the rule is not host-scoped and you have a loop** — that is exactly what `npm run
test:name` asserts against, but verify it against the live host too, because the test can only see
the config.

---

## 4 · The two things DNS does not fix

**1 · The renderer's URLs.** See the top of this document. After the domain answers, set them to
the live host so the token stops naming a retired one:

```
setAnimationUrl("https://ripmaster3030studios.com/")
setMeta("ripmaster3030studios", "<description>", "https://ripmaster3030studios.com")
```

from the owner wallet. ⚠ On the **launch** edition these must be right at deploy — a fresh renderer
deployed with the correct strings is cleaner than one corrected afterwards, because marketplaces
cache metadata hard and "recoverable" and "not visible on the collector's card for a week" are
different things.

**2 · ⛔ The WalletConnect/Reown allow-list.** A project id is allow-listed **by domain**. On a host
that is not on the list, mobile wallet connect does not degrade — it **fails**, at the moment a
collector is trying to rip a pack. Add `ripmaster3030studios.com` to the project's allowed domains
in the Reown dashboard. It is a setting on somebody else's server, so no test can repair it; what
`npm run test:name` does instead is refuse to let the note in `js/chain-config.js` claim the wrong
host, which is the most a checker can do about it.

---

## 5 · The repo side, already done and pushed

- `vercel.json` — host-scoped, path-preserving, permanent redirects for the old apex, the old
  `www`, and the new `www`.
- Every shipped surface — canonicals, `og:url`, `sitemap.xml`, `robots.txt`, `token-metadata.json`,
  the WalletConnect dApp metadata, the SIWE statement — already names `ripmaster3030studios.com`.
- `npm run test:name` asserts the redirect exists, is host-scoped so it cannot loop, preserves the
  path, and that the chain-config note names the live host.
- ⚑ `vercel.json` is the one file allowed to contain the retired name, because **the redirect that
  retires the old domain has to name the old domain.** It is allow-listed with that reason and its
  shape is asserted separately — an exemption without a replacement check is a blind spot with a
  comment on it.
- **The git repository does not move.** `upperdeckripmaster3030` is the repo and npm identifier, not
  a hostname; renaming it breaks clone URLs to buy nothing.
