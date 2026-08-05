/**
 * Replace demo Components & BOM data with Carcasses & BIC Catalogue dataset.
 *
 * Development only. DELETES all existing components, sections, and section items,
 * then inserts workbook-style catalogue products with finish / PG / SB matrices
 * and supporting BOARD / HARDWARE / FACTORY lines.
 *
 * Usage (from server/):
 *   npm run seed:components
 *
 * Optional:
 *   SEED_COMPONENTS_KEEP=1  — skip wipe (upsert by code only; default is wipe)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const connectDatabase = require('../config/database');
const Component = require('../features/components/component.model');
const ComponentSection = require('../features/component-sections/componentSection.model');
const SectionItem = require('../features/section-items/sectionItem.model');
const HardwareItem = require('../features/hardware/hardwareItem.model');
const { SECTION_TYPES, COMPONENT_VERSION_STATUS } = require('../config/constants');
const { buildCatalogueProducts } = require('./data/catalogueProducts');
const { buildVariantItems, CATALOGUE_FINISHES } = require('./data/catalogueFinishes');

const DEMO_CODE_PATTERN = /^(BU-|DR-|TW-|DEMO)/i;

const buildBoardItems = (product) => {
  const m = product.catalogueMetrics;
  const widthMm = product.dimensions?.length || 1000;
  return [
    {
      quantity: 1,
      unitCost: Math.round(m.fcMasoniteUsage * m.fcMasoniteCostPerM2 * 100) / 100,
      sortOrder: 0,
      attributes: {
        partName: 'FC Masonite Back',
        childPartCode: 'FC-BACK',
        boardCode: 'MAS-3MM',
        boardName: 'FC Masonite 3mm Back',
        description: 'FC Masonite 3mm Back',
        length: widthMm,
        width: Math.round((m.fcMasoniteUsage * 1000000) / Math.max(widthMm, 1)),
        area: m.fcMasoniteUsage,
        usageM2: m.fcMasoniteUsage,
        costPerM2: m.fcMasoniteCostPerM2,
        edging: 'None',
        colourCode: product.colourCode,
        boardMasterRef: 'Board Master — Masonite',
      },
      notes: 'FC Component List → Masonite usage',
    },
    {
      quantity: 1,
      unitCost: Math.round(m.fcBoardUsage * m.fcWhiteMelamineCostPerM2 * 100) / 100,
      sortOrder: 1,
      attributes: {
        partName: 'FC Carcass Panels',
        childPartCode: 'FC-PANEL',
        boardCode: 'WM-16',
        boardName: 'FC White Melamine 16mm',
        description: 'FC White Melamine 16mm',
        length: widthMm,
        width: Math.round((m.fcBoardUsage * 1000000) / Math.max(widthMm, 1)),
        area: m.fcBoardUsage,
        usageM2: m.fcBoardUsage,
        costPerM2: m.fcWhiteMelamineCostPerM2,
        edging: 'ABS 1mm',
        colourCode: product.colourCode,
        boardMasterRef: 'Board Master — White Melamine',
      },
      notes: 'FC Component List → Board usage',
    },
    {
      quantity: 1,
      unitCost: Math.round(m.edgingUsage * m.edgingCostPerM2 * 100) / 100,
      sortOrder: 2,
      attributes: {
        partName: 'ABS Edging',
        childPartCode: 'FC-EDGE',
        boardCode: 'EDG-ABS',
        boardName: 'ABS Edging',
        description: 'ABS Edging',
        length: Math.round(m.edgingUsage * 1000),
        width: 22,
        area: m.edgingUsage,
        usageM2: m.edgingUsage,
        costPerM2: m.edgingCostPerM2,
        edging: 'PG3',
        colourCode: product.colourCode,
        edgingPriceGroup: 'PG3',
        boardMasterRef: 'Colour Master / Edging',
      },
      notes: 'Edging usage — rate from Edging Price Group (colour PG)',
    },
  ];
};

const buildFactoryItems = (product) => {
  const base = 18 + product.sizeFactor * 22;
  const ops = [
    {
      name: 'Panel cutting & nesting',
      operationCode: 'CUT',
      workCenter: 'CNC Nest',
      minutes: Math.round(8 + product.sizeFactor * 6),
      factor: 1,
    },
    {
      name: 'Edge banding',
      operationCode: 'EDGE',
      workCenter: 'Edgebander',
      minutes: Math.round(6 + product.sizeFactor * 4),
      factor: 0.65,
    },
    {
      name: 'Carcass assembly',
      operationCode: 'ASSY',
      workCenter: 'Assembly',
      minutes: Math.round(10 + product.sizeFactor * 5),
      factor: 0.45,
    },
  ];
  return ops.map((op, index) => ({
    quantity: 1,
    unitCost: Math.round(base * op.factor * 100) / 100,
    sortOrder: index,
    attributes: {
      name: op.name,
      operationName: op.name,
      operationCode: op.operationCode,
      description: op.name,
      workCenter: op.workCenter,
      workCentre: op.workCenter,
      department: op.workCenter,
      minutes: op.minutes,
      runTime: op.minutes,
      unit: `${op.minutes} min`,
    },
    notes: 'Factory Operations',
  }));
};

const buildHardwareItems = (hardwareDocs, product) => {
  if (!hardwareDocs.length) {
    return [
      {
        quantity: 4,
        unitCost: Math.round((product.catalogueMetrics.hwCost / 4) * 100) / 100,
        sortOrder: 0,
        attributes: {
          stockCode: 'HW-PLACEHOLDER',
          description: 'Shelf support (seed — run seed:hardware for live links)',
          supplierName: 'Blum',
          groupCode: 'ACC',
          priceGroup: 'ACC',
        },
        notes: 'Hardware Components — placeholder until Hardware Master is seeded',
      },
    ];
  }

  const picks = hardwareDocs.slice(0, 4);
  return picks.map((hw, index) => ({
    quantity: index === 0 ? 4 : index === 1 ? 2 : 1,
    sortOrder: index,
    hardwareId: hw._id,
    attributes: {
      hardwareId: hw._id.toString(),
      stockCode: hw.stockCode,
      description: hw.description,
      groupCode: hw.groupCode,
      priceGroup: hw.groupCode,
      supplierName: hw.supplierName || '',
      supplierCode: hw.supplierCode || '',
    },
    notes: 'Hardware Components → Hardware Master',
  }));
};

const buildSections = (product, hardwareDocs) => [
  {
    sectionType: SECTION_TYPES.BOARD,
    name: 'Boards',
    sortOrder: 0,
    meta: { source: 'FC Component List' },
    items: buildBoardItems(product),
  },
  {
    sectionType: SECTION_TYPES.HARDWARE,
    name: 'Hardware',
    sortOrder: 1,
    meta: { source: 'Hardware Components' },
    items: buildHardwareItems(hardwareDocs, product),
  },
  {
    sectionType: SECTION_TYPES.FACTORY,
    name: 'Factory',
    sortOrder: 2,
    meta: { source: 'Factory Operations' },
    items: buildFactoryItems(product),
  },
  {
    sectionType: SECTION_TYPES.VARIANT,
    name: 'Finish Pricing',
    sortOrder: 3,
    meta: {
      source: 'Carcasses & BIC Catalogue',
      finishCount: CATALOGUE_FINISHES.length,
    },
    items: buildVariantItems(product.sizeFactor),
  },
];

const wipeAllComponents = async () => {
  const itemResult = await SectionItem.deleteMany({});
  const sectionResult = await ComponentSection.deleteMany({});
  const componentResult = await Component.deleteMany({});
  return {
    items: itemResult.deletedCount || 0,
    sections: sectionResult.deletedCount || 0,
    components: componentResult.deletedCount || 0,
  };
};

const seedOne = async (product, hardwareDocs, userId) => {
  const lineageId = new mongoose.Types.ObjectId();
  const [component] = await Component.create([
    {
      lineageId,
      version: 1,
      versionStatus: COMPONENT_VERSION_STATUS.APPROVED,
      componentCode: product.componentCode,
      description: product.description,
      category: product.category,
      finish: product.finish,
      dimensions: product.dimensions,
      status: product.status,
      retailPrice: product.retailPrice,
      range: product.range,
      type: product.type,
      modificationClass: product.modificationClass,
      region: product.region,
      categoryDescription: product.categoryDescription,
      colourCode: product.colourCode,
      hwIncluded: product.hwIncluded,
      fcIncluded: product.fcIncluded,
      matchStatus: product.matchStatus,
      catalogueMetrics: product.catalogueMetrics,
      isActive: true,
      createdBy: userId,
      updatedBy: userId,
    },
  ]);

  const sections = buildSections(product, hardwareDocs);
  for (const sectionInput of sections) {
    const [section] = await ComponentSection.create([
      {
        componentId: component._id,
        sectionType: sectionInput.sectionType,
        name: sectionInput.name,
        sortOrder: sectionInput.sortOrder,
        meta: sectionInput.meta || {},
      },
    ]);

    const itemDocs = (sectionInput.items || []).map((item, index) => ({
      componentId: component._id,
      sectionId: section._id,
      sectionType: sectionInput.sectionType,
      quantity: item.quantity ?? 1,
      notes: item.notes || '',
      unitCost: sectionInput.sectionType === SECTION_TYPES.HARDWARE ? null : item.unitCost ?? null,
      hardwareId:
        sectionInput.sectionType === SECTION_TYPES.HARDWARE ? item.hardwareId || null : null,
      attributes: item.attributes || {},
      sortOrder: item.sortOrder ?? index,
    }));

    if (itemDocs.length > 0) {
      await SectionItem.insertMany(itemDocs);
    }
  }

  return component;
};

const seedComponents = async () => {
  const keepExisting = process.env.SEED_COMPONENTS_KEEP === '1';
  const products = buildCatalogueProducts();

  await connectDatabase();

  const hardwareDocs = await HardwareItem.find({ isActive: true })
    .sort({ stockCode: 1 })
    .limit(12)
    .lean();

  if (hardwareDocs.length === 0) {
    console.warn(
      'Warning: No Hardware Master rows found. Run `npm run seed:hardware` for live HW links.'
    );
  }

  if (!keepExisting) {
    const wiped = await wipeAllComponents();
    console.log(
      `Wiped existing Components & BOM: ${wiped.components} components, ${wiped.sections} sections, ${wiped.items} items`
    );
  } else {
    console.log('SEED_COMPONENTS_KEEP=1 — skipping wipe; will skip codes that already exist');
  }

  let inserted = 0;
  let skipped = 0;
  const demoLike = [];

  for (const product of products) {
    if (DEMO_CODE_PATTERN.test(product.componentCode)) {
      demoLike.push(product.componentCode);
    }

    if (keepExisting) {
      const existing = await Component.findOne({
        componentCode: product.componentCode,
        versionStatus: COMPONENT_VERSION_STATUS.APPROVED,
        deletedAt: null,
      }).lean();
      if (existing) {
        skipped += 1;
        continue;
      }
    }

    await seedOne(product, hardwareDocs, null);
    inserted += 1;
  }

  if (demoLike.length) {
    console.warn(`Unexpected demo-like codes in seed set: ${demoLike.join(', ')}`);
  }

  const remainingDemo = await Component.find({
    componentCode: DEMO_CODE_PATTERN,
    versionStatus: COMPONENT_VERSION_STATUS.APPROVED,
    deletedAt: null,
  })
    .select('componentCode')
    .lean();

  console.log(`Catalogue finishes per product: ${CATALOGUE_FINISHES.length}`);
  console.log(`Products inserted: ${inserted}`);
  console.log(`Products skipped: ${skipped}`);
  console.log(`Hardware Master links available: ${hardwareDocs.length}`);
  if (remainingDemo.length) {
    console.warn(
      `Demo codes still present: ${remainingDemo.map((d) => d.componentCode).join(', ')}`
    );
  } else {
    console.log('No legacy demo codes (BU-/DR-/TW-) remain.');
  }

  process.exit(0);
};

seedComponents().catch((error) => {
  console.error('Components seed failed:', error);
  process.exit(1);
});
