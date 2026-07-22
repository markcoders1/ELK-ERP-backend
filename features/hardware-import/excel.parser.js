const XLSX = require('xlsx');

/**
 * Generic Excel workbook parser (SheetJS).
 * Reads displayed cell values only — never evaluates formulas.
 * Module-agnostic so Boards / Products / BOMs can reuse later.
 */

const ALLOWED_EXTENSIONS = new Set(['.xlsx', '.xls']);
const REJECTED_EXTENSIONS = new Set(['.csv', '.pdf', '.zip', '.txt', '.ods']);

const getExtension = (filename = '') => {
  const match = String(filename).toLowerCase().match(/(\.[a-z0-9]+)$/);
  return match ? match[1] : '';
};

const assertAllowedWorkbook = (filename) => {
  const ext = getExtension(filename);
  if (REJECTED_EXTENSIONS.has(ext)) {
    const error = new Error(`File type ${ext} is not supported. Upload an .xlsx or .xls workbook.`);
    error.statusCode = 400;
    throw error;
  }
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    const error = new Error('Only Excel workbooks (.xlsx, .xls) are accepted.');
    error.statusCode = 400;
    throw error;
  }
};

/**
 * Parse a workbook buffer into sheet descriptors.
 * @param {Buffer} buffer
 * @param {{ sheetIndex?: number, sheetName?: string }} [options]
 * @returns {{ sheets: Array<{ name: string, index: number, headers: string[], rows: Array<{ excelRowNumber: number, raw: Record<string, unknown> }> }> }}
 */
const parseWorkbook = (buffer, options = {}) => {
  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    cellDates: true,
    cellNF: false,
    cellText: false,
    // raw: false returns formatted/displayed values when available
    raw: false,
    dense: false,
  });

  const sheetNames = workbook.SheetNames || [];
  if (sheetNames.length === 0) {
    const error = new Error('Workbook contains no worksheets.');
    error.statusCode = 400;
    throw error;
  }

  const sheets = sheetNames.map((name, index) => {
    const worksheet = workbook.Sheets[name];
    const matrix = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: null,
      blankrows: false,
      raw: false,
    });

    if (!matrix.length) {
      return {
        name,
        index,
        headers: [],
        rows: [],
      };
    }

    const headerRow = matrix[0] || [];
    const headers = headerRow.map((cell, colIndex) => {
      if (cell == null || String(cell).trim() === '') {
        return `COLUMN_${colIndex + 1}`;
      }
      return String(cell).trim();
    });

    const rows = [];
    for (let i = 1; i < matrix.length; i += 1) {
      const line = matrix[i] || [];
      const excelRowNumber = i + 1; // 1-based Excel row (header is row 1)

      const raw = {};
      let hasAnyValue = false;

      headers.forEach((header, colIndex) => {
        const value = line[colIndex] !== undefined ? line[colIndex] : null;
        raw[header] = value;
        if (value !== null && value !== undefined && String(value).trim() !== '') {
          hasAnyValue = true;
        }
      });

      if (!hasAnyValue) continue;

      rows.push({ excelRowNumber, raw });
    }

    return {
      name,
      index,
      headers,
      rows,
    };
  });

  let selected = sheets[0];
  if (options.sheetName) {
    selected = sheets.find((sheet) => sheet.name === options.sheetName) || null;
  } else if (Number.isInteger(options.sheetIndex) && options.sheetIndex >= 0) {
    selected = sheets[options.sheetIndex] || null;
  }

  if (!selected) {
    const error = new Error('Requested worksheet was not found in the workbook.');
    error.statusCode = 400;
    throw error;
  }

  return {
    sheetNames,
    sheets,
    selectedSheet: selected,
  };
};

/**
 * Process rows in fixed-size chunks (does not load extra copies of the workbook).
 * @template T
 * @param {T[]} items
 * @param {number} chunkSize
 * @param {(chunk: T[], chunkIndex: number) => Promise<void> | void} handler
 */
const processInChunks = async (items, chunkSize, handler) => {
  const size = Math.max(1, chunkSize);
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    // eslint-disable-next-line no-await-in-loop
    await handler(chunk, Math.floor(i / size));
  }
};

module.exports = {
  ALLOWED_EXTENSIONS,
  assertAllowedWorkbook,
  parseWorkbook,
  processInChunks,
  getExtension,
};
