// Economies whose trade statistics in these years are not their own
// reports to the IMF, so partner breakdowns are rebuilt from other
// countries' records and miss trade inside the Soviet bloc.
// Not IMF reporters in these years (IMF membership: Poland withdrew 1950
// and rejoined 1986, Czechoslovakia withdrew 1954 and rejoined 1990, Cuba
// withdrew 1964; Romania joined 1972, Hungary 1982, Bulgaria 1990, Albania
// and Mongolia 1991; the PRC took China's seat in 1980; East Germany, North
// Korea and North Vietnam never joined). The USSR is covered by its own
// official statistics (load-sess.mjs).
export const NON_REPORTING = {
  SUN: () => true, DDR: () => true, PRK: () => true, DRV: () => true,
  POL: (y) => y >= 1950 && y < 1986, CSK: (y) => y >= 1954 && y < 1990, CUB: (y) => y >= 1964,
  ROU: (y) => y >= 1946 && y < 1972, HUN: (y) => y >= 1946 && y < 1982, BGR: (y) => y >= 1946 && y < 1990,
  ALB: (y) => y >= 1946 && y < 1991, MNG: (y) => y < 1991, CHN: (y) => y >= 1949 && y < 1980,
};

