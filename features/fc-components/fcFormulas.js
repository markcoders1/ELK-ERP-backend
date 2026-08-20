/**
 * Excel-faithful FC Components List helpers.
 *
 * BOARD (m²) = LENGTH × WIDTH / 1e6 × QTY
 *
 * EDGING LINEAR METER:
 * IF(edging="1L", L*Q,
 *   IF("1L1S", L*Q+W*Q,
 *     IF("2L1S", L*Q+W*Q,
 *       IF("1L2S", L*Q+W*Q,
 *         IF(AND(W<L,"1S"), W*Q,
 *           IF(AND(W>L,"1S"), L*Q,
 *             IF("2L", L*Q*2,
 *               IF("2S", W*Q*2,
 *                 IF("EAR", 2*(L+W)*Q, 0)))))))))
 */

const toNumber = (value, fallback = 0) => {
  if (value === '' || value === null || value === undefined) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const normalizeEdging = (edging) =>
  String(edging || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');

const calculateBoardM2 = ({ length, width, quantity }) => {
  const L = toNumber(length);
  const W = toNumber(width);
  const Q = toNumber(quantity);
  return (L * W * Q) / 1e6;
};

const calculateEdgingLinearMeter = ({ edging, length, width, quantity }) => {
  const type = normalizeEdging(edging);
  const L = toNumber(length);
  const W = toNumber(width);
  const Q = toNumber(quantity);

  if (type === '1L') return L * Q;
  if (type === '1L1S') return L * Q + W * Q;
  if (type === '2L1S') return L * Q + W * Q;
  if (type === '1L2S') return L * Q + W * Q;
  if (type === '1S') {
    if (W < L) return W * Q;
    if (W > L) return L * Q;
    return 0;
  }
  if (type === '2L') return L * Q * 2;
  if (type === '2S') return W * Q * 2;
  if (type === 'EAR') return 2 * (L + W) * Q;
  return 0;
};

module.exports = {
  calculateBoardM2,
  calculateEdgingLinearMeter,
  normalizeEdging,
};
