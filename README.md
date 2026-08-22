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
npm test         # unit tests: `lib` under node, hooks and components under jsdom
npm run lint     # eslint
```

An Etherscan API key is needed for balances, and the app asks for yours on first
load; see below. Nothing else is configured, and there is no `.env` to fill in.

## Using it

| | |
| --- | --- |
| **Roll** | Keys are generated, screened, and looked up in batches of twenty. The sheet fills as it goes: an empty slot has no key yet, a latent cell has an address but no balance, a developed one has been read. `20 / 40 / 100 / 200` sets how many a roll makes; `stop` abandons one in flight |
| **Auto** | Rolls continuously until stopped, or until something is found. Each roll starts as the last one ends, so what sets the pace is whatever is actually slowest: the rate limiter when the chain is being read, key generation when the screen has spared it. `rec` alongside it buffers every batch — every roll, not every roll the sheet had time to draw — and writes one file whenever auto stops, including when a find is what stopped it. Recording holds 200,000 keys before it stops taking more, which a screened run reaches in about a minute |
| **Sheet** | The batch as a contact sheet of identicons. Right-click any cell for its actions; the colour is derived from the address, so it is the fastest way to tell forty of them apart |
| **List** | The same batch as a log: channel number, address, private key, balance. The address links to Etherscan |
| **Keep** | Kept keys go to `localStorage` and open from `kept` in the header. Export writes them as address/key pairs; import reads them back, or any text with private keys in it, since a key determines its own address |
| **Chains** | Which chains a roll is read against, and what that costs. Ethereum only unless you say otherwise. Read the cost panel before adding any |
| **Cfg** | Everything the reader sets, in one panel: the medium and the tube, the API key, the screen, the status line. `stats` reports, `cfg` decides |
| **Stats** | Rate, session, the fraction of the keyspace covered, and what the day's API allowance has left |
| **Screen** | Load a list of addresses worth finding and the chain is only asked about the ones that match. Two orders of magnitude more keys a day, and no API key needed for the misses. Under `cfg` |
| **Status** | A line along the bottom edge naming everything as it happens, one entry at a time. On unless you turn it off under `cfg` |
| **Test** | Plants a known funded address (a Binance hot wallet) in the batch, so the found-one path can be exercised without waiting for a 1-in-2^160 event |
| **Tube** | Dark or light, and on dark which phosphor the tube is coated with: `white`, or one of three palettes carried over from Keraunos. Top of `cfg` |
| **Keys** | `x` roll · `a` auto · `v` sheet/list · `k` cfg · `f` kept keys · `c` chains · `s` stats · `t` dark/light |

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
asked for on first load and can be changed or cleared from `cfg` in the header.

It is validated against the live API before being saved, then kept in that
browser's `localStorage` and sent to Etherscan and nowhere else. No key is
compiled into the bundle: this is a static client-side app, so a baked-in key
would be readable by anyone who opened the page and would spend one account's
rate limit on every visitor.

Key generation does not depend on it. Without a key the sheet still rolls and
every address and private key is shown; only the balances are unavailable,
which the header reports and the error line reopens the panel to fix.
`VITE_ETHERSCAN_API_KEY` remains as a build-time fallback for a self-hosted
deployment that wants one. You probably do not: this is a client-side app, so
anything set there ships in the bundle, is readable by anyone who opens the
page, and spends that one account's allowance on every visitor.

## The status line

A line along the bottom edge names everything the instrument does as it does it:
each roll, the keys as they are generated, every call and the chain it went to,
every wait the rate limiter imposed, every find. Watching the machine work is
most of what there is to do here, so it is on unless you turn it off, from
`verbose status line` under `cfg`. One roll of forty against two chains reads:

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

## Developing

A roll has three phases and the sheet shows all three, because which one is
slow depends entirely on how the instrument is set up.

Keys are generated in twenties, yielding to the browser between them, so the
grid fills rather than appearing at once — two hundred keys is about 75ms of
secp256k1 and used to be a dropped frame. Each cell then sits *latent*: its
address exists, and so does its identicon, but its balance does not. It develops
when its twenty are answered.

That means the sheet fills in the order the chain actually replies, and stops
filling while the rate limiter holds. The pause is not an animation waiting; it
is the instrument telling you what it is doing.

With a filter loaded the balance of the two inverts. Generation becomes the only
slow part — the screen is sub-millisecond and the chain is usually not asked at
all — so the roll reads as a sheet being made rather than a sheet being
confirmed. Without one, generation is a blink and the developing is the whole
show. Neither is decoration: each phase animates only while it is the one taking
the time.

The list says the same thing in its own terms. A row with no balance yet reads
`— — —`, which is a different fact from `0.0...` — the app could not previously
tell "not yet read" from "read, and empty".

## The screen

The instrument is quota-bound, not compute-bound, and by a long way. A free
Etherscan key buys two million lookups a day; the same browser generates keys at
about two and a half thousand a second, which is two hundred and thirty million
a day. Everything above is the machine idling while it waits for its allowance.

Load a list of addresses worth finding and that inverts. Every generated address
is checked against a Bloom filter held in memory, at over a million a second, and
the chain is asked only about the ones that match. `load addresses` under `cfg`
takes a plain text or CSV file — a BigQuery export, a Dune result, a bare list —
and builds the filter in the browser. There is a command-line equivalent for
building one ahead of time:

```sh
npm run build-filter -- top-accounts.csv --out public/funded.bin
```

which a self-hosted deployment can ship in `public/`, and which the app loads if
nothing has been imported.

At a hundred thousand addresses the filter is about 470kB and reports a false
candidate roughly one time in a hundred million — so at 230M keys a day, about
two candidates to confirm, against an allowance of a hundred thousand calls. A
roll that raises no candidate costs nothing at all, which means an ordinary roll
needs no API key: without one the screen still runs and only a candidate goes
unconfirmed.

None of this improves the odds. It is still one in 2^160, and 230M keys a day
still covers about 1e-40 of the keyspace. It is a hundred times more instrument
for no more quota, and the arithmetic of what it is not finding is in `stats`.

What goes in the list is the interesting decision. Screening is only worth the
bytes it spends, and most addresses holding *something* hold dust — an address
with 0.000005 Ξ costs the same room in the filter as one with thirty, and raises
a candidate worth the same nothing. Filtering the list by a minimum balance
before building makes the filter smaller, the download shorter and every
candidate worth confirming. `key_list/balance_checker.py` does that pass.

The list is yours for the same reasons the API key is: it is large, it goes
stale, and what counts as worth finding is your call. Nothing is bundled, and
the file never leaves the browser — it is read locally and the filter is built
there.

## Chains, and what they cost

Etherscan's V2 API serves sixty-odd chains from one endpoint on one key, so
reading a roll against more of them is a `chainid` and nothing else. The cost is
the interesting part, and `chains` in the header puts it on screen next to the
switches that set it.

A free key allows **3 calls/second and 100,000 calls/day**, and twenty addresses
fit in a call. Auto does not pace itself any more, so the limiter does: calls
leave at 2.7 a second, a tenth under the ceiling, and that is the rate under
every setting on this panel. An unscreened run spends the day's hundred thousand
in about ten hours no matter what is selected. What the switches change is what
that allowance buys. At forty keys a roll:

| chains | calls / roll | keys / day at the cap |
| --- | --- | --- |
| 1 | 2 | 2,000,000 |
| 2 | 4 | 1,000,000 |
| 3 | 6 | 666,667 |
| 5 | 10 | 400,000 |

The rate columns are gone because they had stopped saying anything. They were
arithmetic on a two-second timer, where each chain added another call per roll
and three chains sat exactly on the per-second ceiling. Rolls follow each other
with no gap now, so `src/lib/limiter.js` is the only thing setting the pace, and
it holds the same line however many chains are asked. None of this applies to a
screened roll, which makes no call at all.

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
| `src/lib/bloom.js` | The filter: sizing, building, reading, and the membership test every generated address goes through |
| `src/lib/filterStore.js` | Where an imported filter is kept, and why it can never be allowed to hang |
| `scripts/build-filter.mjs` | Builds a filter from an address list, ahead of time |
| `src/lib/telemetry.js` | The commentary bus. Everything publishes here; the status line is the only subscriber |
| `src/components/StatusLine.jsx` | That commentary, one line, bottom edge |
| `src/lib/theme.js` | Medium selection, stored domain-wide as a cookie on `.corvardt.com`; the coating is this origin's own |
| `src/components/ConfigPanel.jsx` | Everything the reader sets: medium, key, screen, status line |
| `src/components/BlockieSheet.jsx` | The contact sheet |
| `src/components/AddressTable.jsx` | The same batch as a log |
| `src/components/Panel.jsx` | Modal shell shared by the key panel and the kept sheet: backdrop, focus trap, `esc`, corner ticks |
| `src/components/Crt.jsx` | The glass: scanlines, vignette, refresh sweep. The only place the retro treatment lives |
| `src/index.css` | The shared medium, carried from Keraunos: both palettes, the type, the glass, the decay rule. Plus the sheet, which is this project's own |
| `public/fonts/` | IBM Plex Mono, three weights, latin and latin-ext |
