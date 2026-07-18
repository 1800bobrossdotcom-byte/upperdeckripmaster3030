# Namecheap → GitHub Pages

Wire `upperdeckripmaster3030.com` to this repo's site. ~15 minutes of clicking, then
DNS propagation.

> **Status (July 18):** DNS A/CNAME records are in place at Namecheap ✔, the `CNAME`
> file is in the repo ✔. Two things remain, both below: **enable Pages in repo
> settings** (that's what the 404 means) and **delete the stray `216.150.1.1` A record**.

## 1. Enable GitHub Pages  ← the 404 fix

Repo → **Settings → Pages**:

- Source: *Deploy from a branch*
- Branch: **`claude/superrare-trading-cards-71ajcx`** (that's where the site lives),
  folder `/ (root)` — or merge the branch to `main` first and select `main`.
- Save. "There isn't a GitHub Pages site here" = this step hasn't been done yet;
  DNS can be perfect and you'll still 404 until Pages is enabled.
- Then in the same screen: **Custom domain** → `upperdeckripmaster3030.com` → Save →
  once the DNS check passes, tick **Enforce HTTPS** (cert can take up to ~1 hour).

## 2. Point the domain at Pages (Namecheap)

Namecheap → Domain List → your domain → **Advanced DNS**. **Delete the stray
`A @ 216.150.1.1` record** (Namecheap parking — it makes the domain resolve to the
wrong server intermittently). Keep exactly these:

| Type | Host | Value | TTL |
|---|---|---|---|
| A | `@` | `185.199.108.153` | Automatic |
| A | `@` | `185.199.109.153` | Automatic |
| A | `@` | `185.199.110.153` | Automatic |
| A | `@` | `185.199.111.153` | Automatic |
| CNAME | `www` | `1800bobrossdotcom-byte.github.io.` | Automatic |

(Those four A records are GitHub Pages' anycast IPs — current list is in GitHub's
"Managing a custom domain" docs; verify there if anything fails.)

## 3. Tell GitHub about the domain

Repo → **Settings → Pages → Custom domain**: enter the apex domain (e.g. `example.com`),
save, and once the DNS check passes, tick **Enforce HTTPS** (cert issuance can take up to
an hour after DNS propagates).

This writes a `CNAME` file into the repo — commit it if GitHub opens a PR/commit prompt,
and don't delete it.

Also do **Settings → Pages → verified domains** (account level: Settings → Pages →
Add verified domain) so nobody can hijack the domain if Pages is ever disabled.

## 4. Sanity checks

```bash
dig +short example.com A          # → the four 185.199.x.153 IPs
dig +short www.example.com CNAME  # → 1800bobrossdotcom-byte.github.io.
curl -I https://example.com       # → 200/301 from GitHub
```

Propagation is usually minutes but can take a few hours.

## Notes

- Domain name ideas should match the aesthetic — short, ancient, foil.
- Skip Namecheap's "Web Hosting" upsells entirely; Pages is the host.
- If you later want redirect rules, analytics, or edge caching, put Cloudflare's free
  tier in front (change nameservers) — not needed for launch.
- The mint page URL for the SuperRare intake form (Part 4) will be this domain.
