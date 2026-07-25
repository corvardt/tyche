# Tyche

τύχη · fortune, the lot that falls.

Forty random Ethereum keypairs a roll, read against the chain. Every private
key is generated in the browser, checked for a balance, and thrown away. The
odds are about one in 2^160 and nothing has ever been found, which is most of
the point: the instrument is built to catch an event that will not happen, and
the whole design is about what it does while waiting.

## Running

```sh
npm install
npm run dev      # dev server
npm run build    # production build to ./dist
npm run preview  # serve that build
```

An Etherscan API key is needed for balances, and the app asks for yours on first
load; see below. Nothing else is configured, and there is no `.env` to fill in.

## Using it

| | |
| --- | --- |
| **Roll** | Keys are generated, priced, and looked up in batches of twenty. The previous sheet stays on screen while the new one resolves. `20 / 40 / 100 / 200` sets how many a roll makes; `stop` abandons one in flight |
| **Auto** | Rolls every two seconds until stopped, or until something is found. `rec` alongside it buffers every batch and writes one file when you stop |
| **Sheet** | The batch as a contact sheet of identicons. Right-click any cell for its actions; the colour is derived from the address, so it is the fastest way to tell forty of them apart |
| **List** | The same batch as a log: channel number, address, private key, balance. The address links to Etherscan |
| **Keep** | Kept keys go to `localStorage` and open from `kept` in the header. Export writes them as address/key pairs; import reads them back, or any text with private keys in it, since a key determines its own address |
| **Chains** | Which chains a roll is read against, and what that costs. Ethereum only unless you say otherwise. Read the cost panel before adding any |
| **Stats** | Rate, session, the fraction of the keyspace covered, and what the day's API allowance has left. Also where the status line is switched on |
| **Status** | A line along the bottom edge naming everything as it happens, one entry at a time. On unless you turn it off under `stats` |
| **Test** | Plants a known funded address (a Binance hot wallet) in the batch, so the found-one path can be exercised without waiting for a 1-in-2^160 event |
| **Keys** | `x` roll · `a` auto · `v` sheet/list · `k` api key · `f` kept keys · `c` chains · `s` stats · `t` tube/paper |

### When something is found

Rolling stops, auto mode switches off, and the key takes the top of the page in
reserved white. The sheet behind it dims every address that missed. The hit is
also appended to `localStorage` under `stonks` and logged to the console, so a
find survives the tab being closed before you read it. It is stored as a record
with the address, the key, the balance and the time it landed; hits written by
earlier versions, which kept one flat string and no address, are read back and
their addresses recovered from their keys.

`resume` in that banner is the way on: it clears the hold and rolls again. It is
a click and not a key, because `x` is muscle memory by the thousandth roll and a
find is the one thing that should not be dismissed by reflex.

## The API key

Balance lookups need an Etherscan key, and the app ships without one. It is
asked for on first load and can be changed or cleared from `api` in the header.

It is validated against the live API before being saved, then kept in that
browser's `localStorage` and sent to Etherscan and nowhere else. No key is
compiled into the bundle: this is a static client-side app, so a baked-in key
would be readable by anyone who opened the page and would spend one account's
rate limit on every visitor.

Key generation does not depend on it. Without a key the sheet still rolls and
every address and private key is shown; only the balances are unavailable,
which the header reports and the error line reopens the panel to fix.
`VITE_ETHERSCAN_API_KEY` remains as a build-time fallback for a self-hosted
deployment that wants one; see `.env.example` for why you probably do not.

## The status line

A line along the bottom edge names everything the instrument does as it does it:
each roll, the keys as they are generated, every call and the chain it went to,
every wait the rate limiter imposed, every find. Watching the machine work is
most of what there is to do here, so it is on unless you turn it off, from
`verbose status line` under `stats`. One roll of forty against two chains reads:

```
20:14:03.118 00012 ROLL     #2 · 40 keys · 2 chain(s)
20:14:03.229 00013 GEN      40 keypairs · 15ms
20:14:03.340 00014 LOOKUP   Ethereum · batch 1/2 · 20 addrs
20:14:03.451 00015 LOOKUP   Ethereum · batch 2/2 · 20 addrs
20:14:03.562 00016 THROTTLE held 361ms · 3/s cap
20:14:03.673 00017 LOOKUP   Polygon · batch 1/2 · 20 addrs
...
20:14:04.237 00021 DONE     #2 · 40 checked · 0 funded · 1119ms · 4 calls
```

Events are published to a bus and the line subscribes to it directly, so an
entry arriving re-renders one line rather than the page. They are paced at one
every 110ms — a roll emits its start, its generation timing and its first lookup
inside about fifteen milliseconds, and anything rendering them as they arrive
gets coalesced into a single paint, so the entries in between are shown to
nobody. If the machine ever outruns the line the backlog is dropped from the
front rather than allowed to lag; in practice the rate limiter holds calls below
the speed the line can display, so it keeps up.

## Chains, and what they cost

Etherscan's V2 API serves sixty-odd chains from one endpoint on one key, so
reading a roll against more of them is a `chainid` and nothing else. The cost is
the interesting part, and `chains` in the header puts it on screen next to the
switches that set it.

A free key allows **3 calls/second and 100,000 calls/day**, and twenty addresses
fit in a call. At forty keys a roll, on the default two-second cadence:

| chains | calls / roll | calls / sec | calls / day | keys / day at the cap |
| --- | --- | --- | --- | --- |
| 1 | 2 | 1.0 | 86,400 | 2,000,000 |
| 2 | 4 | 2.0 | 172,800 | 1,000,000 |
| 3 | 6 | 3.0 | 259,200 | 666,667 |
| 5 | 10 | 5.0 | 432,000 | 400,000 |

One chain fits inside both limits with room to spare. Three sit exactly on the
per-second ceiling and spend the day's allowance in nine hours. Every call is
spaced by `src/lib/limiter.js` so nothing can actually breach the rate, but past
three chains that means auto runs slower than the two seconds it advertises.

The last column is the one worth reading. An allowance buys *lookups*, not keys,
so every chain added spends the same budget re-asking about keys already
generated rather than generating new ones. Reading N chains multiplies the odds
that any one key is funded by roughly N and divides the keys reachable in a day
by exactly N; those cancel, and the expected find rate does not move. Mainnet
also holds far more funded addresses than the quiet chains, so spreading a fixed
allowance across them lowers the odds per call slightly. Breadth is worth buying
on a key with headroom. On the free tier it is a trade, not an upgrade, which is
why the default is Ethereum alone.

Balance queries on Base, OP Mainnet, BNB Chain and Avalanche need a paid plan.
They are listed and marked `paid` rather than hidden, because they are the ones
people look for first.

## Layout

| Path | Role |
| --- | --- |
| `src/dApp.jsx` | The page: one responsive layout, the controls, the readouts, the shortcuts |
| `src/hooks/useScanner.js` | One roll, start to finish: generate, price, look up, publish. Owns the in-flight guard and the halt on a find |
| `src/lib/accounts.js` | The `Account` record, batch generation, and migration of favourites stored as tuples by earlier versions |
| `src/lib/etherscan.js` | Balance lookups in batches of twenty across any number of chains, the account's own quota, and the reader's key: read, validate, save, clear |
| `src/lib/chains.js` | The chains a roll can read, which of them a free key can reach, and where to link each one |
| `src/lib/cost.js` | What a setting costs to run, and the arithmetic behind the chain panel's warning |
| `src/lib/limiter.js` | Spaces every outgoing call so no combination of chains and batch size outruns the plan |
| `src/lib/telemetry.js` | The commentary bus. Everything publishes here; the status line is the only subscriber |
| `src/components/StatusLine.jsx` | That commentary, one line, bottom edge |
| `src/lib/theme.js` | Medium selection, stored domain-wide as a cookie on `.unmod.fun` |
| `src/components/BlockieSheet.jsx` | The contact sheet |
| `src/components/AddressTable.jsx` | The same batch as a log |
| `src/components/Panel.jsx` | Modal shell shared by the key panel and the kept sheet: backdrop, focus trap, `esc`, corner ticks |
| `src/components/Crt.jsx` | The glass: scanlines, vignette, refresh sweep. The only place the retro treatment lives |
| `src/index.css` | The shared medium, carried from Keraunos: both palettes, the type, the glass, the decay rule. Plus the sheet, which is this project's own |
| `public/fonts/` | IBM Plex Mono, three weights, latin and latin-ext |
