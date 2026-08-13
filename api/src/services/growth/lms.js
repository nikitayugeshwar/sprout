/**
 * LMS (Box-Cox power exponential) maths for the WHO Child Growth Standards.
 *
 * Every WHO growth reference is published as three age-indexed parameters:
 *   L — skewness (Box-Cox power)
 *   M — median
 *   S — coefficient of variation
 *
 * A measurement X is converted to a z-score with:
 *   L != 0 :  z = ((X/M)^L - 1) / (L * S)
 *   L == 0 :  z = ln(X/M) / S
 *
 * Reference: WHO Multicentre Growth Reference Study Group (2006),
 * "WHO Child Growth Standards: Methods and development", chapter 7.
 */

/** Indicators where WHO prescribes the extreme-tail correction below. */
const CORRECTED_INDICATORS = new Set(['wfa', 'bfa', 'wfl', 'wfh']);

/**
 * Value at an arbitrary z-score for a given LMS triple (the inverse of `zScore`).
 * Used to draw the P3/P15/P50/P85/P97 reference bands on the growth charts.
 */
export function valueAtZ({ l, m, s }, z) {
  if (l === 0) return m * Math.exp(s * z);
  return m * Math.pow(1 + l * s * z, 1 / l);
}

/**
 * Raw, uncorrected LMS z-score.
 */
export function rawZScore({ l, m, s }, x) {
  if (l === 0) return Math.log(x / m) / s;
  return (Math.pow(x / m, l) - 1) / (l * s);
}

/**
 * z-score for a measurement, applying WHO's extreme-value correction.
 *
 * Beyond ±3 SD the Box-Cox tails become unstable for weight-based indicators, so
 * WHO replaces the curve with a linear extrapolation anchored on the distance
 * between the 2nd and 3rd standard deviations. Height-for-age and head
 * circumference-for-age are *not* corrected — their distributions are normal.
 */
export function zScore(lms, x, indicator) {
  const z = rawZScore(lms, x);
  if (!CORRECTED_INDICATORS.has(indicator) || Math.abs(z) <= 3) return z;

  if (z > 3) {
    const sd3 = valueAtZ(lms, 3);
    const sd2 = valueAtZ(lms, 2);
    return 3 + (x - sd3) / (sd3 - sd2);
  }
  const sd3neg = valueAtZ(lms, -3);
  const sd2neg = valueAtZ(lms, -2);
  return -3 + (x - sd3neg) / (sd2neg - sd3neg);
}

/**
 * Cumulative standard normal distribution.
 *
 * Hart's double-precision rational approximation (as popularised by Graeme West,
 * "Better approximations to cumulative normal functions", 2005). Accurate to
 * roughly 1e-15 across the whole real line, which is far more than percentile
 * reporting needs but costs nothing.
 */
export function normalCdf(x) {
  const z = Math.abs(x);
  let c = 0;

  if (z <= 37) {
    const e = Math.exp((-z * z) / 2);
    if (z < 7.07106781186547) {
      let b = 3.52624965998911e-2 * z + 0.700383064443688;
      b = b * z + 6.37396220353165;
      b = b * z + 33.912866078383;
      b = b * z + 112.079291497871;
      b = b * z + 221.213596169931;
      b = b * z + 220.206867912376;

      let d = 8.83883476483184e-2 * z + 1.75566716318264;
      d = d * z + 16.064177579207;
      d = d * z + 86.7807322029461;
      d = d * z + 296.564248779674;
      d = d * z + 637.333633378831;
      d = d * z + 793.826512519948;
      d = d * z + 440.413735824752;

      c = (e * b) / d;
    } else {
      // Continued-fraction expansion for the far tail.
      let b = z + 0.65;
      b = z + 4 / b;
      b = z + 3 / b;
      b = z + 2 / b;
      b = z + 1 / b;
      c = e / (b * 2.506628274631);
    }
  }

  return x > 0 ? 1 - c : c;
}

/** Percentile (0–100) for a z-score. */
export function percentileFromZ(z) {
  return normalCdf(z) * 100;
}

/**
 * Linear interpolation between two LMS triples.
 *
 * WHO tables are tabulated at whole days/months; a child measured between two
 * rows gets the weighted blend rather than the nearest row, which keeps the
 * plotted curve smooth and avoids step artefacts in the z-score trend.
 */
export function interpolateLms(a, b, t) {
  return {
    l: a.l + (b.l - a.l) * t,
    m: a.m + (b.m - a.m) * t,
    s: a.s + (b.s - a.s) * t,
  };
}
