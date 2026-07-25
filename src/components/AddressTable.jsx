import { memo } from 'react';

import { fundedChains, isFunded } from '../lib/accounts';
import { blockie } from '../lib/blockie';
import { chainById, DEFAULT_CHAIN_ID, explorerAddress } from '../lib/chains';
import { formatEth } from '../lib/format';

/**
 * What an account holds, as one cell.
 *
 * A single number cannot say where an amount is once a roll reads more than one
 * chain, and the amounts cannot be added: 1 POL is not 1 Ξ. The largest holding
 * is named with its own symbol, and anything further is counted rather than
 * crammed in.
 */
function Holding({ account }) {
  const held = fundedChains(account);
  if (held.length === 0) return <>{formatEth(0)}</>;

  const [largest] = held;
  const chain = chainById(largest.chainId);

  return (
    <>
      {formatEth(largest.amount)} {chain?.symbol ?? ''}
      {held.length > 1 && (
        <span className="text-dim" title={`funded on ${held.length} chains`}>
          {' '}
          +{held.length - 1}
        </span>
      )}
    </>
  );
}

/**
 * The same batch, read as a log instead of a sheet.
 *
 * Rows are addressed by channel number the way the index numbers its stations,
 * so a key can be named out loud ("nineteen") while pointing at the sheet. The
 * previous table hung its columns off `pr-[20rem]` padding inside flex rows,
 * which is why nothing lined up below 1400px.
 */
function AddressTable({ accounts, onSelect, hitClass = '' }) {
  return (
    <div className="w-full overflow-x-auto border border-line">
      <table className="w-full min-w-[52rem] border-collapse text-left">
        <thead>
          <tr className="border-b border-line">
            {['', 'ch', 'address', 'private key', 'balance'].map((label, index) => (
              <th
                key={label || 'blockie'}
                scope="col"
                className={`px-3 py-2 text-2xs font-normal uppercase tracking-label text-dim ${
                  index === 4 ? 'text-right' : ''
                }`}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {accounts.map((account, index) => {
            const funded = isFunded(account);

            return (
              <tr
                key={account.address}
                className={`group border-t border-line first:border-t-0 ${
                  funded ? 'bg-panel' : ''
                }`}
              >
                <td className="w-8 px-3 py-1.5">
                  <span className={`block h-4 w-4 ${funded ? '' : 'opacity-70'}`}>
                    <img
                      className={`blockie ${hitClass}`}
                      src={blockie(account.address)}
                      alt=""
                      draggable="false"
                    />
                  </span>
                </td>
                <td className="px-3 py-1.5 text-2xs tracking-label text-land">
                  {String(index + 1).padStart(2, '0')}
                </td>
                <td className="px-3 py-1.5 text-xs">
                  {/* The address is the one cell worth leaving the app for. */}
                  <a
                    href={explorerAddress(
                      account.address,
                      fundedChains(account)[0]?.chainId ?? DEFAULT_CHAIN_ID,
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`transition-colors hover:text-strike ${
                      funded ? 'glow-hot text-strike' : 'text-text'
                    }`}
                  >
                    {account.address}
                  </a>
                </td>
                <td className="px-3 py-1.5 text-xs text-dim">
                  {onSelect ? (
                    <button
                      type="button"
                      onClick={(event) => onSelect(event, account)}
                      onContextMenu={(event) => onSelect(event, account)}
                      className={`${hitClass} text-left transition-colors hover:text-text`}
                      title="Actions"
                    >
                      {account.privateKey}
                    </button>
                  ) : (
                    account.privateKey
                  )}
                </td>
                <td
                  className={`px-3 py-1.5 text-right text-xs ${
                    funded ? 'glow-hot text-strike' : 'text-dim'
                  }`}
                >
                  <Holding account={account} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Same reasoning as the sheet: the rows only change when the batch does.
export default memo(AddressTable);
