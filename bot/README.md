# the FWA/ETH executor — deploy as its OWN Vercel project

⛔ **Do not add this to the site's Vercel project.** Every function in a Vercel project shares one
environment. The site's project already has two endpoints that reflect `process.env` keys into HTTP
responses (`api/pin.js:79`, `api/presence.js:148`) and one that pipes user text into an LLM
(`api/lore.js`). Those filter tightly enough today — the point is that echoing env is a debugging
habit in that codebase, and a signing key must not live where that habit lives.

## deploy

1. **New Vercel project**, root directory `bot/`. Nothing else from this repo goes with it.
2. **Environment variables — Production scope only, never Preview.** A preview deploy of any branch
   otherwise gets the same key.

   | var | what |
   | --- | --- |
   | `CRON_SECRET` | any long random string. The handler refuses to run without it and rejects any request not carrying it. |
   | `BOT_PRIVATE_KEY` | the hot key. ⚠ **Fund it with what you can lose.** It is not the treasury. |
   | `LIVE` | leave **unset** to start. `1` is the only thing that lets it sign. |
   | `KV_REST_API_URL` / `KV_REST_API_TOKEN` | the daily-spend counter. Without it the cap resets on restart, which is the one rail a crash could otherwise erase. |

3. The cron is already in `vercel.json`: `*/5 19-23 * * *` — five-minute ticks during the measured
   volume window, and the key is simply not exercised the other nineteen hours a day.

   ⚠ **Vercel Hobby fires crons once per day, maximum.** Five-minute ticks need Pro. If you are on
   Hobby this architecture does not run — use a small VPS or your own machine instead; the paper
   bot in `scripts/bot.mjs` is a plain node process and the same logic runs there unchanged.

4. Leave `LIVE` unset for a few days and read the logs. Every tick returns its decision and its
   reason as JSON whether or not it trades.

## what it refuses to do

`bot/lib/rails.mjs`, guarded by `npm run test:bot` (34 assertions, no network):

- **0.05 ETH per trade, 0.25 ETH per day**, the day's spend held in KV so a restart cannot reset it
- **a two-address destination allowlist** — the Uniswap UniversalRouter and the cold treasury.
  Nothing else, ever. That is what turns a stolen key from *drain* into *some bad trades on 0.05 ETH*
- **a 0.20 ETH balance ceiling**: over that it refuses to operate at all. ⚑ Caps on spending do
  nothing if the wallet is accidentally funded with 10 ETH; the ceiling is what makes the maximum
  possible loss a number somebody chose
- **simulate before send, no bypass.** The transaction is `eth_call`'d and its output compared with
  the Quoter; past 150 bps of disagreement it refuses. This repo's own record of hand-assembled
  calldata is that it *"fails silently — wrong selector hits the fallback, wrong offset approves the
  wrong spender"*, and v4 calldata here is assembled by hand
- **dry run is the default.** Not a flag to remember — the absence of `LIVE=1` is a refusal

## the treasury is never a signer

`0x8455cF296e1265b494605207e97884813De21950` is a cold Ledger. It is on the allowlist so the skim
can land and its key is not in this system. That is what makes the skim a **one-way ratchet**: half
of every realised profit leaves the risk book permanently and the bot can never draw it back. Same
property as `contracts/PackSink.sol` — `_split()` pushes and the treasury signs nothing.

## before you set LIVE=1

Every rule in here is **backtested and none is forward-tested**. The best in-sample configuration
scored 69.5% win / +9,459% and then **50.0% win / −60%** on the out-of-sample half, and simply
holding beat every rule in every out-of-sample window tested. `npm run bot paper` is running the
identical decision logic against live data and spending nothing. Read `npm run bot report` first.

---

# the VPS version — `run.mjs` (recommended over the cron)

⛔ **`api/tick.js` only buys.** A Vercel cron is stateless: each invocation is a fresh process with
no memory of an open position, so take-profit, stop-loss and the timeout have nowhere to live. As
written it would enter and never exit, which is not a bot. `run.mjs` is one long-running process
that holds the position, so it does both sides. Use it unless you specifically want the hosted one.

It also removes the two things that made the hosted route awkward: no cron-tier minimum, and the
key sits in a file on a box you control rather than in a hosting dashboard.

## setup, on any $5/month box

```sh
sudo adduser --system --group bot
sudo mkdir -p /opt/ripmaster && sudo chown bot:bot /opt/ripmaster
sudo -u bot git clone https://github.com/1800bobrossdotcom-byte/upperdeckripmaster3030 /opt/ripmaster/repo
sudo -u bot ln -s /opt/ripmaster/repo/bot /opt/ripmaster/bot
cd /opt/ripmaster/bot && sudo -u bot npm install        # viem only

sudo -u bot cp .env.example .env
sudo -u bot nano .env                                   # paste the key, leave LIVE commented out
sudo chmod 600 .env                                     # ⛔ nobody else on the box reads it
```

Run it in the foreground first and watch a full window (19:00–23:00 UTC):

```sh
sudo -u bot node run.mjs
```

You want lines like `no signal · accumulation -215161 vs cut 623184`. That is it working.

Then install the service:

```sh
sudo cp ripmaster-bot.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now ripmaster-bot
journalctl -u ripmaster-bot -f
```

## before it can sell

⛔ Buying needs no approval — the input is native ETH. **Selling does**: FWA must be approved to
Permit2, and Permit2 must authorise the router. Miss either and the sell reverts *at the moment you
are trying to take profit or stop a loss*. The daemon checks both before it ever opens a position
and refuses to buy something it has not proved it can sell. Set them once:

```sh
LIVE=1 node run.mjs approve
```

## going live

1. Fund the wallet with **0.05–0.1 ETH** of working capital. ⚠ Above **0.20 ETH** the rails refuse
   to operate — an over-funded bot is the risk, not the protection.
2. Watch the dry run for several days. `node run.mjs report`.
3. Only then uncomment `LIVE=1` in `.env` and `sudo systemctl restart ripmaster-bot`.

⚠ Every rule in here is backtested and none is forward-tested. The best in-sample configuration
scored 69.5% win / +9,459% and then **50.0% win / −60%** out of sample, and holding beat every rule
in every out-of-sample window. The dry run is not a formality.
