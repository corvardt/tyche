const ETH_DIGITS = { minimumFractionDigits: 0, maximumFractionDigits: 5 };
const USD_DIGITS = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

/** @param {number} value */
export const formatEth = (value) =>
  value > 0 ? value.toLocaleString('en-US', ETH_DIGITS) : '0.0...';

/** @param {number|null} eth @param {number|null} usdPerEth */
export const formatUsd = (eth, usdPerEth) => {
  const total = (Number(eth) || 0) * (Number(usdPerEth) || 0);
  return total > 0 ? total.toLocaleString('en-US', USD_DIGITS) : '0.0...';
};

/** @param {number} count */
export const formatCount = (count) => Number(count || 0).toLocaleString('en-US');
