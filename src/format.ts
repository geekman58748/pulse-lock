/** Formatting — exact spec from mockup/dashboard.html. Shared by console + webhooks. */

export const fmtUSD = (n: number | null | undefined): string =>
  n == null
    ? '--'
    : n >= 1e9
      ? '$' + (n / 1e9).toFixed(1) + 'B'
      : n >= 1e6
        ? '$' + (n / 1e6).toFixed(1) + 'M'
        : n >= 1e3
          ? '$' + (n / 1e3).toFixed(1) + 'K'
          : '$' + n.toFixed(2)

export const fmtPct = (n: number | null | undefined): string =>
  n == null ? '--' : (n * 100).toFixed(0) + '%'

export const fmtAge = (s: number): string =>
  s < 60 ? s + 's' : Math.floor(s / 60) + 'm ' + String(s % 60).padStart(2, '0') + 's'

/** Execution-venue + explorer deep links for a mint. Photon first: the one-click
 *  "act" target — alarm → click → on the token's page, ready to trade.
 *  Photon's public page is PAIR-keyed (/en/lp/{pool}); its mint-keyed
 *  /en/token/{mint} route 404s once a launch graduates (pumpfun → pumpswap). */
export const explorerLinks = (
  mint: string,
  dex = '',
  pool = '',
): { label: string; url: string }[] =>
  !mint
    ? []
    : [
        {
          label: 'Photon',
          url: pool
            ? `https://photon-sol.tinyastro.io/en/lp/${pool}`
            : `https://photon-sol.tinyastro.io/en/token/${mint}`,
        },
        { label: 'Axiom', url: `https://axiom.trade/t/${mint}` },
        { label: 'Birdeye', url: `https://birdeye.so/token/${mint}?chain=solana` },
        { label: 'Dexscreener', url: `https://dexscreener.com/solana/${mint}` },
      ]
