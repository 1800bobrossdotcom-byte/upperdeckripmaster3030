/* ripmaster3030studios — SERVE THE FORGE LOCALLY.   `npm run forge`
 *
 * Artist, 2026-08-06: *"no one should have access to the plate proof console except me."*
 *
 * ⛔ `cards/proof.html` IS IN `.vercelignore`, SO IT IS NOT ON THE LIVE HOST ANY MORE. That is
 *    the lock — unlinking a page whose URL is in a public repo, behind a veil that has been off
 *    since 2026-08-05, is obscurity and nothing else. The file is still in git, so nothing about
 *    making the hundred changed except WHERE you open it: here, on your own machine, instead of
 *    on ripmaster3030studios.com.
 *
 * ⚑ IT SERVES THE WHOLE REPO, NOT JUST THE ONE FILE, AND IT HAS TO. The forge fetches
 *   `cards/manifest.json`, `cards/hero-manifest.json`, `cards/type/alphabet.json`, `js/*.js` and
 *   ~211 source pictures; a server rooted at `cards/` would open the page and print nothing,
 *   which is this repo's most expensive failure shape — a card that renders empty rather than an
 *   error anybody can read.
 *
 * ⚠ LOOPBACK ONLY. It binds 127.0.0.1, so it is not reachable from the network even while it is
 *   running — the point of the exercise is that this console has one user.
 * ⚠ Saved cards live in `localStorage`, which is per-ORIGIN. Always come in on the same
 *   host:port or the deck panel will look empty; the JSON export is the artifact that survives,
 *   as the panel itself says. `--port` is here so that origin can be pinned.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (f) => { const i = process.argv.indexOf(f); return i === -1 ? null : process.argv[i + 1]; };
const PORT = Number(arg('--port') || 8030);

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp',
  '.gif': 'image/gif', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.wld': 'application/octet-stream',
  '.skn': 'application/octet-stream', '.ico': 'image/x-icon' };

const srv = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    /* ⚠ A path is untrusted even from your own browser: `normalize` first, then refuse anything
     * that climbs out of the repo. One line, and it is the difference between a dev server and
     * a file-read endpoint. */
    const file = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end('no'); return; }
    const s = await stat(file);
    if (s.isDirectory()) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, {
      'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      /* the forge is a tool being edited — never serve yesterday's copy of it */
      'cache-control': 'no-store',
    });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end('not found');
  }
});

srv.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('  ⚙  THE FORGE — local only, not on the live site.');
  console.log(`     http://127.0.0.1:${PORT}/cards/proof.html`);
  console.log('');
  console.log(`     the hundred     http://127.0.0.1:${PORT}/cards/deck.html`);
  console.log(`     the folder      http://127.0.0.1:${PORT}/cards/binder.html`);
  console.log('');
  console.log('     ⚠ saved cards are per-origin — keep the port the same, and export the JSON.');
  console.log('     ctrl-c to stop.');
  console.log('');
});
