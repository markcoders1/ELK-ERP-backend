/**
 * Consistent DQS sync console logging for ops / debugging.
 * Never logs the full bearer token.
 */
const PREFIX = '[dqs-sync]';

const maskToken = (token) => {
  const t = String(token || '');
  if (!t) return '(empty)';
  if (t.length <= 8) return '****';
  return `${t.slice(0, 4)}…${t.slice(-4)}`;
};

const summarizeItems = (items = [], sample = 3) => {
  const list = Array.isArray(items) ? items : [];
  return {
    skuCount: list.length,
    finishCount: list.reduce((n, row) => n + (row.finishes?.length || 0), 0),
    sample: list.slice(0, sample).map((row) => ({
      itemCode: row.itemCode,
      finishes: (row.finishes || []).slice(0, 2).map((f) => ({
        finishName: f.finishName,
        price: f.price,
      })),
      finishTotal: row.finishes?.length || 0,
    })),
  };
};

const info = (message, meta) => {
  if (meta !== undefined) {
    // eslint-disable-next-line no-console
    console.log(PREFIX, message, typeof meta === 'string' ? meta : JSON.stringify(meta));
    return;
  }
  // eslint-disable-next-line no-console
  console.log(PREFIX, message);
};

const warn = (message, meta) => {
  if (meta !== undefined) {
    // eslint-disable-next-line no-console
    console.warn(PREFIX, message, typeof meta === 'string' ? meta : JSON.stringify(meta));
    return;
  }
  // eslint-disable-next-line no-console
  console.warn(PREFIX, message);
};

const error = (message, meta) => {
  if (meta !== undefined) {
    // eslint-disable-next-line no-console
    console.error(PREFIX, message, typeof meta === 'string' ? meta : JSON.stringify(meta));
    return;
  }
  // eslint-disable-next-line no-console
  console.error(PREFIX, message);
};

module.exports = {
  maskToken,
  summarizeItems,
  info,
  warn,
  error,
};
