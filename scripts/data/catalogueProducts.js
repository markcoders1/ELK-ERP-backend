/**
 * Carcasses & BIC Catalogue product rows (EVOLUTION range).
 * Codes / descriptions / metrics aligned to National Components List MASTER workbook.
 */

const HW_MARKUP = 2.1;
const FC_MARKUP = 3.1;
const WASTAGE = 1.2;
const MASONITE_RATE = 95;
const MELAMINE_RATE = 185;
const EDGING_RATE = 28;

const TYPE_LABELS = {
  DH: 'DBL HANGING',
  H: 'SGL HANGING',
  S: 'SHELVING',
};

/**
 * Workbook-style catalogue rows.
 * `_SD` = BIC Components kit; L/R = left/right drilling.
 */
const CATALOGUE_ROWS = [
  // 1000 series
  {
    code: '1000DH',
    typeKey: 'DH',
    hwCost: 399.98,
    fcMasoniteUsage: 0.42,
    fcBoardUsage: 5.13,
    edgingUsage: 7.69,
  },
  {
    code: '1000DH_SD',
    typeKey: 'DH',
    isComponents: true,
    hwCost: 312.4,
    fcMasoniteUsage: 0,
    fcBoardUsage: 3.84,
    edgingUsage: 5.76,
  },
  {
    code: '1000H',
    typeKey: 'H',
    hwCost: 378.45,
    fcMasoniteUsage: 0.38,
    fcBoardUsage: 4.72,
    edgingUsage: 7.12,
  },
  {
    code: '1000H_SD',
    typeKey: 'H',
    isComponents: true,
    hwCost: 295.2,
    fcMasoniteUsage: 0,
    fcBoardUsage: 3.55,
    edgingUsage: 5.34,
  },
  {
    code: '1000S',
    typeKey: 'S',
    hwCost: 368.87,
    fcMasoniteUsage: 0.51,
    fcBoardUsage: 7.91,
    edgingUsage: 12.53,
  },
  {
    code: '1000S_SD',
    typeKey: 'S',
    isComponents: true,
    hwCost: 288.1,
    fcMasoniteUsage: 0,
    fcBoardUsage: 5.93,
    edgingUsage: 9.4,
  },
  // 1200 series
  {
    code: '1200DH',
    typeKey: 'DH',
    hwCost: 448.2,
    fcMasoniteUsage: 0.5,
    fcBoardUsage: 6.16,
    edgingUsage: 9.23,
  },
  {
    code: '1200DH_SD',
    typeKey: 'DH',
    isComponents: true,
    hwCost: 350.1,
    fcMasoniteUsage: 0,
    fcBoardUsage: 4.62,
    edgingUsage: 6.92,
  },
  {
    code: '1200H',
    typeKey: 'H',
    hwCost: 426.8,
    fcMasoniteUsage: 0.46,
    fcBoardUsage: 5.66,
    edgingUsage: 8.54,
  },
  {
    code: '1200H_SD',
    typeKey: 'H',
    isComponents: true,
    hwCost: 333.5,
    fcMasoniteUsage: 0,
    fcBoardUsage: 4.25,
    edgingUsage: 6.41,
  },
  {
    code: '1200S',
    typeKey: 'S',
    hwCost: 415.6,
    fcMasoniteUsage: 0.61,
    fcBoardUsage: 9.49,
    edgingUsage: 15.04,
  },
  {
    code: '1200S_SD',
    typeKey: 'S',
    isComponents: true,
    hwCost: 324.4,
    fcMasoniteUsage: 0,
    fcBoardUsage: 7.12,
    edgingUsage: 11.28,
  },
  // 450 L/R drilling
  {
    code: '450DH-L',
    typeKey: 'DH',
    side: 'Left',
    hwCost: 239.07,
    fcMasoniteUsage: 0.28,
    fcBoardUsage: 3.85,
    edgingUsage: 6.04,
  },
  {
    code: '450DH-L_SD',
    typeKey: 'DH',
    side: 'Left',
    isComponents: true,
    hwCost: 186.5,
    fcMasoniteUsage: 0,
    fcBoardUsage: 2.89,
    edgingUsage: 4.53,
  },
  {
    code: '450DH-R',
    typeKey: 'DH',
    side: 'Right',
    hwCost: 239.07,
    fcMasoniteUsage: 0.28,
    fcBoardUsage: 3.85,
    edgingUsage: 6.04,
  },
  {
    code: '450DH-R_SD',
    typeKey: 'DH',
    side: 'Right',
    isComponents: true,
    hwCost: 186.5,
    fcMasoniteUsage: 0,
    fcBoardUsage: 2.89,
    edgingUsage: 4.53,
  },
  {
    code: '450H-L',
    typeKey: 'H',
    side: 'Left',
    hwCost: 226.4,
    fcMasoniteUsage: 0.26,
    fcBoardUsage: 3.54,
    edgingUsage: 5.68,
  },
  {
    code: '450H-L_SD',
    typeKey: 'H',
    side: 'Left',
    isComponents: true,
    hwCost: 176.8,
    fcMasoniteUsage: 0,
    fcBoardUsage: 2.66,
    edgingUsage: 4.26,
  },
  {
    code: '450H-R',
    typeKey: 'H',
    side: 'Right',
    hwCost: 226.4,
    fcMasoniteUsage: 0.26,
    fcBoardUsage: 3.54,
    edgingUsage: 5.68,
  },
  {
    code: '450H-R_SD',
    typeKey: 'H',
    side: 'Right',
    isComponents: true,
    hwCost: 176.8,
    fcMasoniteUsage: 0,
    fcBoardUsage: 2.66,
    edgingUsage: 4.26,
  },
  {
    code: '450S-L',
    typeKey: 'S',
    side: 'Left',
    hwCost: 218.9,
    fcMasoniteUsage: 0.34,
    fcBoardUsage: 5.93,
    edgingUsage: 9.4,
  },
  {
    code: '450S-L_SD',
    typeKey: 'S',
    side: 'Left',
    isComponents: true,
    hwCost: 170.8,
    fcMasoniteUsage: 0,
    fcBoardUsage: 4.45,
    edgingUsage: 7.05,
  },
  {
    code: '450S-R',
    typeKey: 'S',
    side: 'Right',
    hwCost: 218.9,
    fcMasoniteUsage: 0.34,
    fcBoardUsage: 5.93,
    edgingUsage: 9.4,
  },
  {
    code: '450S-R_SD',
    typeKey: 'S',
    side: 'Right',
    isComponents: true,
    hwCost: 170.8,
    fcMasoniteUsage: 0,
    fcBoardUsage: 4.45,
    edgingUsage: 7.05,
  },
  // 500 L drilling sample
  {
    code: '500DH-L',
    typeKey: 'DH',
    side: 'Left',
    hwCost: 255.3,
    fcMasoniteUsage: 0.31,
    fcBoardUsage: 4.12,
    edgingUsage: 6.42,
  },
  {
    code: '500DH-L_SD',
    typeKey: 'DH',
    side: 'Left',
    isComponents: true,
    hwCost: 199.1,
    fcMasoniteUsage: 0,
    fcBoardUsage: 3.09,
    edgingUsage: 4.82,
  },
  // 600 / 900 without L/R (workbook also has these patterns)
  {
    code: '600DH',
    typeKey: 'DH',
    hwCost: 278.5,
    fcMasoniteUsage: 0.33,
    fcBoardUsage: 4.28,
    edgingUsage: 6.58,
  },
  {
    code: '600DH_SD',
    typeKey: 'DH',
    isComponents: true,
    hwCost: 217.2,
    fcMasoniteUsage: 0,
    fcBoardUsage: 3.21,
    edgingUsage: 4.94,
  },
  {
    code: '600H',
    typeKey: 'H',
    hwCost: 264.1,
    fcMasoniteUsage: 0.3,
    fcBoardUsage: 3.94,
    edgingUsage: 6.18,
  },
  {
    code: '600S',
    typeKey: 'S',
    hwCost: 256.8,
    fcMasoniteUsage: 0.38,
    fcBoardUsage: 6.42,
    edgingUsage: 10.12,
  },
  {
    code: '900DH',
    typeKey: 'DH',
    hwCost: 352.4,
    fcMasoniteUsage: 0.39,
    fcBoardUsage: 4.82,
    edgingUsage: 7.28,
  },
  {
    code: '900H',
    typeKey: 'H',
    hwCost: 334.6,
    fcMasoniteUsage: 0.36,
    fcBoardUsage: 4.44,
    edgingUsage: 6.82,
  },
  {
    code: '900S',
    typeKey: 'S',
    hwCost: 325.9,
    fcMasoniteUsage: 0.46,
    fcBoardUsage: 7.28,
    edgingUsage: 11.42,
  },
];

const buildDescription = (row) => {
  if (row.isComponents) return 'BIC Components';
  const typeLabel = TYPE_LABELS[row.typeKey] || row.typeKey;
  const width = String(row.code).match(/^(\d+)/)?.[1] || '';
  const side = row.side ? ` (${row.side} Drilling)` : '';
  return `BIC with Back - ${width} ${typeLabel}${side}`;
};

const sizeFactorFromCode = (code) => {
  const width = Number(String(code).match(/^(\d+)/)?.[1] || 1000);
  return width / 1000;
};

const buildCatalogueProducts = () =>
  CATALOGUE_ROWS.map((row) => {
    const hwCost = row.hwCost;
    const hwRetail = Math.round(hwCost * HW_MARKUP * 100) / 100;
    const sizeFactor = sizeFactorFromCode(row.code);
    const typeLabel = TYPE_LABELS[row.typeKey] || row.typeKey;
    const width = Number(String(row.code).match(/^(\d+)/)?.[1] || 0);

    const boardMaterial =
      Math.round(
        (row.fcMasoniteUsage * MASONITE_RATE +
          row.fcBoardUsage * MELAMINE_RATE +
          row.edgingUsage * EDGING_RATE) *
          100
      ) / 100;
    const manufacturing =
      Math.round((hwCost + boardMaterial * FC_MARKUP * WASTAGE) * 100) / 100;
    const retailPrice = Math.round(manufacturing * 1.15 * 100) / 100;

    return {
      componentCode: row.code,
      description: buildDescription(row),
      category: 'BIC',
      finish: 'Super White BisonLam',
      status: 'Active',
      retailPrice,
      range: 'EVOLUTION',
      type: typeLabel,
      modificationClass: row.side ? `${row.side} Drilling` : row.isComponents ? 'Components' : 'Standard',
      region: 'National',
      categoryDescription: row.isComponents
        ? 'BIC Components'
        : `BIC with Back — ${width} ${typeLabel}`,
      colourCode: 'SW-BL',
      hwIncluded: 'Y',
      fcIncluded: row.isComponents ? 'Y' : 'Y',
      matchStatus: 'Match',
      dimensions: {
        length: width || null,
        width: 560,
        height: row.typeKey === 'S' ? 720 : 2100,
        unit: 'mm',
      },
      catalogueMetrics: {
        hwCost,
        hwMarkup: HW_MARKUP,
        hwRetail,
        fcMasoniteUsage: row.fcMasoniteUsage,
        fcMasoniteCostPerM2: MASONITE_RATE,
        fcBoardUsage: row.fcBoardUsage,
        fcWhiteMelamineCostPerM2: MELAMINE_RATE,
        edgingUsage: row.edgingUsage,
        edgingCostPerM2: EDGING_RATE,
        fcMarkup: FC_MARKUP,
        wastage: WASTAGE,
      },
      sizeFactor,
    };
  });

module.exports = {
  buildCatalogueProducts,
  CATALOGUE_ROWS,
};
