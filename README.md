# Tyche

> τύχη · fortune, the lot that falls

Forty random Ethereum keypairs a roll, read against the chain. A free lottery
with odds of roughly 1 in 2^160. React + Vite + Tailwind.

```bash
npm install
npm run dev      # dev server
npm run build    # production build to ./dist
```

One page, no router: it mounts at whatever path it is served from.

## The medium

The interface is the same instrument as the rest of `unmod.fun`: the palette,
type, glass and decay rules in `src/index.css` are carried from Keraunos and the
Oikos index, and the theme choice is written to a `unmod-theme` cookie scoped to
`.unmod.fun`, so switching tube/paper on any project carries to this one.

IBM Plex Mono is served from `public/fonts/` rather than from Google; copy that
directory along with the stylesheet if this is ever split out.

White (`--c-strike`) is reserved: nothing in the interface reaches it except an
address that actually holds ether. When one does, rolling stops and the key
takes the top of the page. Identicons are the one exception to the monochrome
palette: their colour is derived from the address, so it is data.

## Etherscan API key

No key ships with the app. On first load it asks for one, and it can be changed
or removed later from the header (**api**). The key is validated against the API
before being saved, lives in that browser's `localStorage`, and is sent only to
Etherscan.

Without a key the app still generates and displays keypairs; only balance
lookups are unavailable, which the header reports; the error line reopens the
key panel.

`VITE_ETHERSCAN_API_KEY` in a `.env` remains as an optional build-time fallback
for self-hosted deployments; see `.env.example` for why you probably don't want
it.

## Keys

```
x  roll        v  sheet / list      k  api key
a  auto        t  tube / paper      f  kept keys
```
