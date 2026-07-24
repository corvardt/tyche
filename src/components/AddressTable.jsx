import makeBlockie from 'ethereum-blockies-base64';
import { isFunded } from '../lib/accounts';
import { formatEth } from '../lib/format';

/**
 * The same batch, read as a log instead of a sheet.
 *
 * Rows are addressed by channel number the way the index numbers its stations,
 * so a key can be named out loud ("nineteen") while pointing at the sheet. The
 * previous table hung its columns off `pr-[20rem]` padding inside flex rows,
 * which is why nothing lined up below 1400px.
 */
export default function AddressTable({ accounts, onSelect, hitClass = '' }) {
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
                      src={makeBlockie(account.address)}
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
                    href={`https://etherscan.io/address/${account.address}`}
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
                  {formatEth(Number(account.balance) || 0)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
