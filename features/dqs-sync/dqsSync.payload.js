const Component = require('../components/component.model');
const ComponentSection = require('../component-sections/componentSection.model');
const SectionItem = require('../section-items/sectionItem.model');
const {
  COMPONENT_VERSION_STATUS,
  SECTION_TYPES,
} = require('../../config/constants');

const liveComponentFilter = {
  deletedAt: null,
  versionStatus: COMPONENT_VERSION_STATUS.APPROVED,
};

/**
 * Collapse internal whitespace so "Sonae  Classic" matches DQS "Sonae Classic".
 */
const canonicalizeFinishName = (name) =>
  String(name || '')
    .trim()
    .replace(/\s+/g, ' ');

const normalizeItemCode = (code) => String(code || '').trim();

const isSendablePrice = (price) => {
  const n = Number(price);
  return Number.isFinite(n) && n > 0;
};

/**
 * Build one DQS item from live VARIANT finish rows.
 * Omits null / 0 prices (Excel unused / #N/A cells).
 */
const buildFinishesFromVariantItems = (items = []) => {
  const finishes = [];
  const seen = new Set();

  items.forEach((item) => {
    const attrs = item.attributes || {};
    const finishName = canonicalizeFinishName(
      attrs.finishName || attrs.name || ''
    );
    if (!finishName) return;
    if (!isSendablePrice(attrs.retailPrice)) return;

    const key = finishName.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);

    finishes.push({
      finishName,
      price: Number(attrs.retailPrice),
    });
  });

  return finishes;
};

/**
 * Load live APPROVED components + VARIANT finish prices for the given codes.
 * @returns {Promise<Array<{ itemCode: string, finishes: Array<{ finishName, price }> }>>}
 */
const buildItemsForProductCodes = async (productCodes = []) => {
  const codes = [
    ...new Set(
      (productCodes || []).map(normalizeItemCode).filter(Boolean)
    ),
  ];

  if (codes.length === 0) return [];

  // Prefer exact codes as stored; also try uppercase match (catalogue codes are uppercased).
  const codeSet = new Set(codes);
  codes.forEach((c) => codeSet.add(c.toUpperCase()));

  const components = await Component.find({
    componentCode: { $in: [...codeSet] },
    ...liveComponentFilter,
  })
    .select('_id componentCode updatedAt')
    .lean();

  if (!components.length) return [];

  const componentIds = components.map((c) => c._id);
  const sections = await ComponentSection.find({
    componentId: { $in: componentIds },
    sectionType: SECTION_TYPES.VARIANT,
  })
    .select('_id componentId')
    .lean();

  if (!sections.length) {
    return components
      .map((c) => ({ itemCode: normalizeItemCode(c.componentCode), finishes: [] }))
      .filter((row) => row.itemCode);
  }

  const sectionIds = sections.map((s) => s._id);
  const sectionByComponent = new Map(
    sections.map((s) => [String(s.componentId), s._id])
  );

  const variantItems = await SectionItem.find({
    sectionId: { $in: sectionIds },
    sectionType: SECTION_TYPES.VARIANT,
  })
    .select('sectionId attributes')
    .lean();

  const itemsBySection = new Map();
  variantItems.forEach((item) => {
    const key = String(item.sectionId);
    if (!itemsBySection.has(key)) itemsBySection.set(key, []);
    itemsBySection.get(key).push(item);
  });

  const items = [];
  components.forEach((component) => {
    const itemCode = normalizeItemCode(component.componentCode);
    if (!itemCode) return;

    const sectionId = sectionByComponent.get(String(component._id));
    const finishes = sectionId
      ? buildFinishesFromVariantItems(itemsBySection.get(String(sectionId)) || [])
      : [];

    if (finishes.length === 0) return;

    items.push({ itemCode, finishes });
  });

  return items;
};

/**
 * Full live catalogue matrix for snapshot / first cutover.
 */
const buildSnapshotItems = async () => {
  const components = await Component.find({
    ...liveComponentFilter,
  })
    .select('_id componentCode')
    .lean();

  const codes = components.map((c) => c.componentCode).filter(Boolean);
  return buildItemsForProductCodes(codes);
};

/**
 * Latest updatedAt among live components for the given codes (ISO), or now.
 */
const resolveSourceUpdatedAt = async (productCodes = []) => {
  const codes = [
    ...new Set(
      (productCodes || []).map(normalizeItemCode).filter(Boolean)
    ),
  ];

  if (codes.length === 0) {
    return new Date().toISOString();
  }

  const codeSet = new Set(codes);
  codes.forEach((c) => codeSet.add(c.toUpperCase()));

  const latest = await Component.findOne({
    componentCode: { $in: [...codeSet] },
    ...liveComponentFilter,
  })
    .sort({ updatedAt: -1 })
    .select('updatedAt')
    .lean();

  return latest?.updatedAt
    ? new Date(latest.updatedAt).toISOString()
    : new Date().toISOString();
};

module.exports = {
  canonicalizeFinishName,
  normalizeItemCode,
  isSendablePrice,
  buildFinishesFromVariantItems,
  buildItemsForProductCodes,
  buildSnapshotItems,
  resolveSourceUpdatedAt,
};
