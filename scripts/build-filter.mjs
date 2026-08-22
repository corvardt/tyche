#!/usr/bin/env node
/**
 * Builds the funded-address filter the app screens against.
 *
 * Input is a list of addresses, one per line, or any delimited file with the
 * address first on each line: a CSV straight out of BigQuery or Dune works
 * without editing. Lines that are not addresses are counted and skipped, so a
 * header row costs nothing.
 *
 *   npm run build-filter -- top-accounts.csv
 *   npm run build-filter -- top-accounts.csv --fpr 1e-8 --out public/funded.bin
 *   cat addresses.txt | npm run build-filter -- -
 *
 * See the README for a query that produces the input.
 */
import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';

import { addressesFrom, buildFilter, falsePositiveRate, sizeFor } from '../src/lib/bloom.js';

function parseArgs(argv) {
  const args = { input: null, out: 'public/funded.bin', fpr: 1e-8 };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') args.out = argv[(i += 1)];
    else if (arg === '--fpr') args.fpr = Number(argv[(i += 1)]);
    else if (!arg.startsWith('--')) args.input = arg;
  }

  if (!args.input) {
    console.error('usage: build-filter <addresses.csv|-> [--out public/funded.bin] [--fpr 1e-8]');
    process.exit(1);
  }
  if (!Number.isFinite(args.fpr) || args.fpr <= 0 || args.fpr >= 1) {
    console.error(`--fpr must be between 0 and 1, got ${args.fpr}`);
    process.exit(1);
  }
  return args;
}

async function readAddresses(input) {
  const stream = input === '-' ? process.stdin : createReadStream(resolve(input));
  const lines = createInterface({ input: stream, crlfDelay: Infinity });

  const addresses = [];
  let skipped = 0;

  // Line by line rather than reading the file whole: a list of every funded
  // address on mainnet does not want to be a single string in memory.
  for await (const line of lines) {
    const found = addressesFrom(line);
    if (found.length > 0) addresses.push(...found);
    else if (line.trim()) skipped += 1;
  }

  return { addresses, skipped };
}

const kb = (bytes) => `${(bytes / 1024).toFixed(0)}kB`;

const { input, out, fpr } = parseArgs(process.argv.slice(2));

console.error(`reading ${input === '-' ? 'stdin' : input}`);
const { addresses, skipped } = await readAddresses(input);

if (addresses.length === 0) {
  console.error('no addresses found: expected 0x-prefixed 40-hex values');
  process.exit(1);
}

// De-duplicate before sizing: a list with repeats would otherwise be sized for
// more entries than it holds, wasting bytes for no gain in accuracy.
const unique = [...new Set(addresses)];

const { m, k } = sizeFor(unique.length, fpr);
const { buffer, n } = buildFilter(unique, { falsePositiveRate: fpr });

const destination = resolve(out);
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, Buffer.from(buffer));

const achieved = falsePositiveRate({ m, k, n });

console.error('');
console.error(`  addresses    ${n.toLocaleString('en-US')}${
  unique.length !== addresses.length
    ? ` (${(addresses.length - unique.length).toLocaleString('en-US')} duplicates dropped)`
    : ''
}`);
if (skipped) console.error(`  skipped      ${skipped.toLocaleString('en-US')} unparsable lines`);
console.error(`  size         ${kb(buffer.byteLength)}  (${(m / n).toFixed(1)} bits each, k=${k})`);
console.error(`  false hits   1 in ${Math.round(1 / achieved).toLocaleString('en-US')}`);
console.error(`  written to   ${out}`);
console.error('');
