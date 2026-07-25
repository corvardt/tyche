const ETH_DIGITS = { minimumFractionDigits: 0, maximumFractionDigits: 5 };
const USD_DIGITS = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

/** Below this, five decimal places round a real balance down to a flat `0`. */
const DUST = 1e-5;
const DUST_DIGITS = { maximumSignificantDigits: 3 };

/**
 * Balances in Ξ. `0.0...` is the placeholder for nothing there.
 *
 * Anything under 1e-5 used to print as `0`, so a funded row could glow hot next
 * to a balance reading zero — the one number the instrument exists to show,
 * rounded away. Sub-dust amounts switch to significant digits instead, which is
 * long but true; the fixed five places stay for everything at normal scale,
 * where significant digits would round 1234.5 to 1,230.
 *
 * @param {number} value
 */
export const formatEth = (value) => {
  if (!(value > 0)) return '0.0...';
  return value < DUST
    ? value.toLocaleString('en-US', DUST_DIGITS)
    : value.toLocaleString('en-US', ETH_DIGITS);
};

/** @param {number|null} eth @param {number|null} usdPerEth */
export const formatUsd = (eth, usdPerEth) => {
  const total = (Number(eth) || 0) * (Number(usdPerEth) || 0);
  return total > 0 ? total.toLocaleString('en-US', USD_DIGITS) : '0.0...';
};

/** @param {number} count */
export const formatCount = (count) => Number(count || 0).toLocaleString('en-US');
