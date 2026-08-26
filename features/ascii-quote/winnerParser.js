/**
 * Winner / 2020 Design kitchen ASCII export parser.
 *
 * Record types used (Winner 12.x style, semicolon-separated):
 *  101/102  company
 *  200      project
 *  300/303  job / contact
 *  405      global construction defaults (plinth, worktop, cornice, …)
 *  407      placement levels
 *  500      product / line item  — ASCII prices on this row are IGNORED
 *  501      orientation
 *  505      carcass/board material name (money ignored)
 *  510      W × H × D
 *  513      construction / hardware / veneer / lighting flags
 *  520      library / range
 *  535      child fronts / extra articles (money ignored)
 *
 * Monetary totals on 301/302/403/404/500 are never copied into quote output.
 */

const toText = (value) => {
  if (value === undefined || value === null) return '';
  return String(value).trim();
};

const toNumber = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(number) ? number : null;
};

const isGuid = (value) =>
  /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(
    toText(value)
  );

const isDimensionCode = (code) => /^\d+(\.\d+)?X\d+/i.test(toText(code));

const splitLine = (line) => String(line).replace(/\r$/, '').split(';');

const extractCategory = (cols) => {
  for (let i = cols.length - 1; i >= 0; i -= 1) {
    const value = toText(cols[i]);
    if (!value || isGuid(value)) continue;
    if (/^[0-9.]+$/.test(value)) continue;
    if (value.length < 3) continue;
    if (/^(Y|N|ea)$/i.test(value)) continue;
    return value;
  }
  return '';
};

const parseProductRow = (cols) => ({
  sourceLineId: toText(cols[1]),
  productCode: toText(cols[3]).toUpperCase(),
  description: toText(cols[8]),
  quantity: toNumber(cols[9]) ?? 1,
  unit: toText(cols[10]) || 'ea',
  category: extractCategory(cols),
  guid: cols.filter(isGuid).pop() || '',
  orientation: '',
  carcassMaterial: '',
  boardColour: '',
  library: '',
  rangeName: '',
  dimensions: { widthMm: null, heightMm: null, depthMm: null },
  settings: [],
  children: [],
});

const parseWinnerAscii = (text) => {
  if (typeof text !== 'string' || !text.trim()) {
    const error = new Error('ASCII file is empty');
    error.statusCode = 400;
    throw error;
  }

  const header = {
    exporter: '',
    company: '',
    projectCode: '',
    projectName: '',
    projectDate: '',
    jobName: '',
    currency: '',
    contactName: '',
    siteAddress: '',
    city: '',
    cityCode: '',
    defaults: [],
    levels: [],
  };

  const products = [];
  let current = null;
  let pendingBoardColour = '';
  let unitRecordCount = 0;

  const detectCity = (text) => {
    const blob = String(text || '').toUpperCase();
    if (/\bJHB\b|\bJOHANNESBURG\b/.test(blob)) return 'JHB';
    if (/\bCPT\b|\bCAPE TOWN\b|\bBELLVILLE\b/.test(blob)) return 'CPT';
    return '';
  };

  const lines = text.split('\n');
  if (lines.length > 200000) {
    const error = new Error('ASCII file has too many lines');
    error.statusCode = 400;
    throw error;
  }

  lines.forEach((raw) => {
    if (!raw || !raw.trim()) return;
    const cols = splitLine(raw);
    const type = toText(cols[0]);

    if (type === '0') {
      header.exporter = toText(cols[6]) || header.exporter;
      return;
    }

    if (type === '101' || type === '102') {
      header.company = toText(cols[1]) || header.company;
      const cityHint = detectCity(cols.join(';'));
      if (cityHint) {
        header.cityCode = cityHint;
        header.city = cityHint === 'CPT' ? 'Cape Town' : 'Johannesburg';
      }
      return;
    }

    if (type === '200') {
      header.projectCode = toText(cols[1]);
      header.projectName = toText(cols[2]);
      header.projectDate = toText(cols[3]);
      return;
    }

    if (type === '211' || type === '305') {
      header.siteAddress = toText(cols[1]) || header.siteAddress;
      return;
    }

    if (type === '300') {
      header.jobName = toText(cols[3]) || toText(cols[1]);
      return;
    }

    if (type === '301' || type === '403') {
      header.currency = toText(cols[6]) || header.currency;
      return;
    }

    if (type === '303' || type === '401') {
      header.contactName = toText(cols[1]) || header.contactName;
      return;
    }

    // 302 / 404 = ASCII job totals — ignored on purpose (city-locked Winner prices)

    if (type === '405') {
      header.defaults.push({
        value: toNumber(cols[1]),
        settingId: toText(cols[2]),
        label: toText(cols[3]),
      });
      return;
    }

    if (type === '407') {
      header.levels.push({
        levelId: toText(cols[1]),
        heightMm: toNumber(cols[2]),
        label: toText(cols[4]),
      });
      return;
    }

    if (type === '525') {
      const label = toText(cols[1]).toLowerCase();
      if (label.includes('board')) {
        pendingBoardColour =
          toText(cols[4]) || toText(cols[3]) || toText(cols[5]);
        if (current && pendingBoardColour) {
          current.boardColour = pendingBoardColour;
        }
      }
      return;
    }

    if (type === '524') {
      const cityHint = detectCity(cols.join(';'));
      if (cityHint) {
        header.cityCode = cityHint;
        header.city = cityHint === 'CPT' ? 'Cape Town' : 'Johannesburg';
      }
      return;
    }

    if (type === '500') {
      if (current) products.push(current);
      current = parseProductRow(cols);
      current.boardColour = pendingBoardColour;
      pendingBoardColour = '';
      unitRecordCount += 1;
      return;
    }

    // 450 = Winner default handle in an empty/demo kitchen — not a quoted product line.
    if (type === '450') {
      return;
    }

    if (!current) return;

    if (type === '501') {
      current.orientation = toText(cols[cols.length - 1]);
      return;
    }

    if (type === '505') {
      const named = toText(cols[15]);
      const fallback = toText(cols[14]);
      current.carcassMaterial = /[A-Za-z]{3,}/.test(named)
        ? named
        : /[A-Za-z]{3,}/.test(fallback)
          ? fallback
          : named || fallback;
      return;
    }

    if (type === '510') {
      current.dimensions = {
        widthMm: toNumber(cols[3]),
        heightMm: toNumber(cols[6]),
        depthMm: toNumber(cols[9]),
      };
      return;
    }

    if (type === '513' && toText(cols[4])) {
      current.settings.push({
        name: toText(cols[4]),
        code: toText(cols[5]),
        value: toText(cols[6]),
      });
      return;
    }

    if (type === '520') {
      current.library = toText(cols[1]);
      current.rangeName = toText(cols[2]);
      return;
    }

    if (type === '535') {
      current.children.push({
        productCode: toText(cols[1]).toUpperCase(),
        description: toText(cols[2]),
        quantity: toNumber(cols[3]) ?? 1,
        unit: toText(cols[4]) || 'ea',
        isCuttingListFront: isDimensionCode(cols[1]),
      });
    }
  });

  if (current) products.push(current);

  return {
    header,
    products,
    lineCount: products.length,
    unitRecordCount,
  };
};

module.exports = {
  parseWinnerAscii,
  isDimensionCode,
};
