/**
 * The chains a roll can be read against.
 *
 * Etherscan's V2 API is one endpoint, one key, and a `chainid` parameter, so
 * widening the net costs nothing structurally. It costs plenty in quota: see
 * `describeCost` below and the note in the chain panel.
 *
 * `free` tracks whether the balance endpoints work on a free-tier key, which is
 * the only kind this app assumes anyone has. Base, OP Mainnet, Avalanche and
 * BNB are deliberately listed and deliberately marked paid: they are the ones
 * people ask for first, and silently omitting them reads as a bug.
 *
 * Source: https://docs.etherscan.io/supported-chains
 */
export const CHAINS = [
  { id: 1, name: 'Ethereum', symbol: 'Ξ', free: true },
  { id: 137, name: 'Polygon', symbol: 'POL', free: true },
  { id: 42161, name: 'Arbitrum', symbol: 'Ξ', free: true },
  { id: 59144, name: 'Linea', symbol: 'Ξ', free: true },
  { id: 100, name: 'Gnosis', symbol: 'xDAI', free: true },
  { id: 5000, name: 'Mantle', symbol: 'MNT', free: true },
  { id: 42220, name: 'Celo', symbol: 'CELO', free: true },
  { id: 81457, name: 'Blast', symbol: 'Ξ', free: true },
  { id: 146, name: 'Sonic', symbol: 'S', free: true },
  { id: 130, name: 'Unichain', symbol: 'Ξ', free: true },
  { id: 8453, name: 'Base', symbol: 'Ξ', free: false },
  { id: 10, name: 'OP Mainnet', symbol: 'Ξ', free: false },
  { id: 56, name: 'BNB Chain', symbol: 'BNB', free: false },
  { id: 43114, name: 'Avalanche', symbol: 'AVAX', free: false },
];

/** Mainnet, and the only chain the instrument reads unless told otherwise. */
export const DEFAULT_CHAIN_ID = 1;

const BY_ID = new Map(CHAINS.map((chain) => [chain.id, chain]));

export const chainById = (id) => BY_ID.get(id) ?? null;

export const chainName = (id) => chainById(id)?.name ?? `chain ${id}`;

/** Etherscan links are per-chain; only mainnet lives on etherscan.io. */
const EXPLORERS = {
  1: 'https://etherscan.io',
  137: 'https://polygonscan.com',
  42161: 'https://arbiscan.io',
  59144: 'https://lineascan.build',
  100: 'https://gnosisscan.io',
  5000: 'https://mantlescan.xyz',
  42220: 'https://celoscan.io',
  81457: 'https://blastscan.io',
  146: 'https://sonicscan.org',
  130: 'https://uniscan.xyz',
  8453: 'https://basescan.org',
  10: 'https://optimistic.etherscan.io',
  56: 'https://bscscan.com',
  43114: 'https://snowscan.xyz',
};

export const explorerAddress = (address, chainId = DEFAULT_CHAIN_ID) =>
  `${EXPLORERS[chainId] ?? EXPLORERS[DEFAULT_CHAIN_ID]}/address/${address}`;
