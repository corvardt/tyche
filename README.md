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
| **Roll** | Forty keys are generated, priced, and looked up in two batches of twenty. The previous sheet stays on screen while the new one resolves |
| **Auto** | Rolls every two seconds until stopped, or until something is found. `rec` alongside it buffers every batch and writes one file when you stop |
| **Sheet** | The batch as a contact sheet of identicons. Right-click any cell for its actions; the colour is derived from the address, so it is the fastest way to tell forty of them apart |
| **List** | The same batch as a log: channel number, address, private key, balance. The address links to Etherscan |
| **Keep** | Kept keys go to `localStorage` and open from `kept` in the header. Export writes them as address/key pairs |
| **Test** | Plants a known funded address (a Binance hot wallet) in the batch, so the found-one path can be exercised without waiting for a 1-in-2^160 event |
| **Keys** | `x` roll · `a` auto · `v` sheet/list · `k` api key · `f` kept keys · `t` tube/paper |

### When something is found

Rolling stops, auto mode switches off, and the key takes the top of the page in
reserved white. The sheet behind it dims every address that missed. The hit is
also appended to `localStorage` under `stonks` and logged to the console, so a
find survives the tab being closed before you read it.

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

## Layout

| Path | Role |
| --- | --- |
| `src/dApp.jsx` | The page: one responsive layout, the controls, the readouts, the shortcuts |
| `src/hooks/useScanner.js` | One roll, start to finish: generate, price, look up, publish. Owns the in-flight guard and the halt on a find |
| `src/lib/accounts.js` | The `Account` record, batch generation, and migration of favourites stored as tuples by earlier versions |
| `src/lib/etherscan.js` | Balance lookups in batches of twenty, and the reader's key: read, validate, save, clear |
| `src/lib/theme.js` | Medium selection, stored domain-wide as a cookie on `.unmod.fun` |
| `src/components/BlockieSheet.jsx` | The contact sheet |
| `src/components/AddressTable.jsx` | The same batch as a log |
| `src/components/Panel.jsx` | Modal shell shared by the key panel and the kept sheet: backdrop, focus trap, `esc`, corner ticks |
| `src/components/Crt.jsx` | The glass: scanlines, vignette, refresh sweep. The only place the retro treatment lives |
| `src/index.css` | The shared medium, carried from Keraunos: both palettes, the type, the glass, the decay rule. Plus the sheet, which is this project's own |
| `public/fonts/` | IBM Plex Mono, three weights, latin and latin-ext |

## Notes

White is reserved. Nothing in the interface reaches it except an address that
actually holds ether, which is the one event the thing exists to catch. Every
other state is built out of `dim`, `land` and `text`.

Identicons are the single exception to the monochrome palette. Their colour is
computed from the address, so it is data rather than decoration, and
desaturating them into the medium would throw away the only property that makes
forty of them tellable apart at a glance. They sit slightly under full strength
at rest so the reserved white still outranks them.

Generation is independent of the network. An earlier version replaced the fresh
batch with the previous one whenever a lookup failed, which with no key
configured meant forty valid keypairs were generated and discarded before paint
on every roll: a blank grid and a disabled save button with nothing on screen to
explain why. A failed lookup now keeps the batch and reports itself.

There is no router. One page, mounted at whatever path it is served from.

The typeface is served from this origin. An app whose entire premise is that
your keys never leave your machine has no business handing every visitor's IP to
Google for a font. Plex Mono ships no Greek subset, so the `Ξ` in the readouts
falls to the system mono.

Everything animated is switched off under `prefers-reduced-motion`.
