/**
 * Module xử lý tiền và làm tròn số nguyên cho billing.
 * Tuân thủ quy ước K1: cấm dùng số thực (floating point).
 */

/**
 * Làm tròn nửa lên (half-up) cho phép chia tử số / mẫu số bằng số nguyên.
 * @param {number|bigint|string} numerator - Tử số (>= 0)
 * @param {number|bigint|string} denominator - Mẫu số (> 0)
 * @returns {number} Kết quả làm tròn nửa lên
 */
function roundHalfUp(numerator, denominator) {
  const num = BigInt(numerator);
  const den = BigInt(denominator);

  if (den <= 0n) {
    throw new RangeError('Denominator must be positive');
  }
  if (num < 0n) {
    throw new RangeError('Numerator must be non-negative');
  }

  const q = num / den;
  const r = num % den;

  // Nếu phần dư * 2 >= mẫu số thì làm tròn lên
  const result = (r * 2n >= den) ? q + 1n : q;

  if (result <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(result);
  }
  return result;
}

/**
 * Tính số tiền theo đồng từ Wh và đơn giá đồng/kWh.
 * Tiền = roundHalfUp(wh * pricePerKwh / 1000)
 * @param {number|bigint} wh - Số Wh nguyên (>= 0)
 * @param {number|bigint} pricePerKwh - Đơn giá đồng/kWh (>= 0)
 * @returns {number} Số tiền theo đồng
 */
function amountDong(wh, pricePerKwh) {
  const w = BigInt(wh);
  const p = BigInt(pricePerKwh);

  if (w < 0n || p < 0n) {
    throw new RangeError('Wh and pricePerKwh must be non-negative');
  }

  return roundHalfUp(w * p, 1000n);
}

module.exports = {
  roundHalfUp,
  amountDong,
};
