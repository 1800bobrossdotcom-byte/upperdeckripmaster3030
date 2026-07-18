# Namecheap → GitHub Pages

Wire a Namecheap domain to this repo's site. ~15 minutes of clicking, then DNS propagation.

## 1. Enable GitHub Pages

Repo → **Settings → Pages**:

- Source: *Deploy from a branch*
- Branch: the default branch, folder `/ (root)` (the site lives at the repo root)
- Save. The site appears at `https://1800bobrossdotcom-byte.github.io/upperdeckripmaster3030/` within a minute or two.

## 2. Point the domain at Pages (Namecheap)

Namecheap → Domain List → your domain → **Advanced DNS**. Remove any parking records, then add:

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
