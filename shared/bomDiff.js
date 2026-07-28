/**
 * BOM diff engine — business-friendly change list for Component approvals & audit.
 *
 * Input:  snapshotBefore, snapshotAfter  ({ header, sections })
 * Output: [
 *   { section, field, action, oldValue, newValue, itemKey?, itemLabel?, path? }
 * ]
 *
 * Keep in sync with client: features/approvals/utils/bomDiff.js
 */

const SECTION_LABELS = {
  BOARD: 'Boards',
  HARDWARE: 'Hardware',
  FACTORY: 'Factory Operations',
  VARIANT: 'Finish Variants',
};

const HEADER_SECTION = 'General Information';

const ACTIONS = {
  ADDED: 'ADDED',
  REMOVED: 'REMOVED',
  MODIFIED: 'MODIFIED',
};

const HEADER_FIELDS = [
  { path: 'componentCode', label: 'Component Code' },
  { path: 'description', label: 'Description' },
  { path: 'category', label: 'Category' },
  { path: 'finish', label: 'Finish' },
  { path: 'status', label: 'Status' },
  { path: 'retailPrice', label: 'Retail Price', money: true },
  { path: 'isActive', label: 'Active' },
  { path: 'dimensions.length', label: 'Length' },
  { path: 'dimensions.width', label: 'Width' },
  { path: 'dimensions.height', label: 'Height' },
  { path: 'dimensions.unit', label: 'Dimension Unit' },
];

const BOARD_FIELDS = [
  { path: 'attributes.partName', label: 'Part Name' },
  { path: 'attributes.boardType', label: 'Board Type' },
  { path: 'attributes.material', label: 'Material' },
  { path: 'quantity', label: 'Quantity' },
  { path: 'attributes.length', label: 'Length' },
  { path: 'attributes.width', label: 'Width' },
  { path: 'attributes.thickness', label: 'Thickness' },
  { path: 'attributes.area', label: 'Area' },
  { path: 'attributes.linearMetres', label: 'Linear Metres' },
  { path: 'unitCost', label: 'Unit Cost', money: true },
  { path: 'attributes.wastePercent', label: 'Waste %' },
  { path: 'notes', label: 'Notes' },
];

const HARDWARE_FIELDS = [
  { path: 'attributes.stockCode', label: 'Stock Code' },
  { path: 'attributes.description', label: 'Description' },
  { path: 'quantity', label: 'Quantity' },
  { path: 'unitCost', label: 'Unit Cost', money: true },
  { path: 'notes', label: 'Notes' },
];

const FACTORY_FIELDS = [
  { path: 'attributes.name', label: 'Operation' },
  { path: 'unitCost', label: 'Cost', money: true, fallbackPath: 'attributes.cost' },
  { path: 'attributes.unit', label: 'Duration / Unit' },
  { path: 'quantity', label: 'Quantity' },
  { path: 'notes', label: 'Notes' },
];

const VARIANT_FIELDS = [
  { path: 'attributes.finishName', label: 'Finish' },
  { path: 'attributes.retailPrice', label: 'Price Adjustment', money: true },
  { path: 'attributes.cost', label: 'Cost', money: true },
  { path: 'attributes.markup', label: 'Markup' },
  { path: 'notes', label: 'Notes' },
];

const SECTION_FIELD_MAP = {
  BOARD: BOARD_FIELDS,
  HARDWARE: HARDWARE_FIELDS,
  FACTORY: FACTORY_FIELDS,
  VARIANT: VARIANT_FIELDS,
};

const getPathValue = (obj, path) => {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
};

const valuesEqual = (a, b) => {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a === '' && b == null) return true;
  if (b === '' && a == null) return true;
  if (typeof a === 'number' || typeof b === 'number') {
    if (a == null || b == null || a === '' || b === '') {
      return (a == null || a === '') && (b == null || b === '');
    }
    return Number(a) === Number(b);
  }
  if (typeof a === 'object' || typeof b === 'object') {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  }
  return String(a) === String(b);
};

const isEmptyValue = (value) =>
  value === undefined || value === null || value === '';

const readFieldValue = (item, fieldDef) => {
  const primary = getPathValue(item, fieldDef.path);
  if (!isEmptyValue(primary)) return primary;
  if (fieldDef.fallbackPath) return getPathValue(item, fieldDef.fallbackPath);
  return primary;
};

const formatMoneyLike = (value) => {
  if (isEmptyValue(value) || Number.isNaN(Number(value))) return value;
  const num = Number(value);
  return `R ${num.toLocaleString('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const displayValue = (value, fieldDef = {}) => {
  if (isEmptyValue(value)) return null;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (fieldDef.money) return formatMoneyLike(value);
  return value;
};

const changeRecord = ({
  section,
  field,
  action,
  oldValue = null,
  newValue = null,
  itemKey = null,
  itemLabel = null,
  path = null,
}) => ({
  section,
  field,
  action,
  oldValue,
  newValue,
  itemKey,
  itemLabel,
  path,
});

const itemStableKey = (sectionType, item, index) => {
  const attrs = item?.attributes || {};
  if (sectionType === 'HARDWARE') {
    const id = item?.hardwareId || attrs.hardwareId;
    if (id) return `hw:${String(id)}`;
    if (attrs.stockCode) return `hw:code:${String(attrs.stockCode).toUpperCase()}`;
  }
  if (sectionType === 'BOARD') {
    if (attrs.boardId) return `bd:${String(attrs.boardId)}`;
    if (attrs.boardCode) return `bd:code:${String(attrs.boardCode).toUpperCase()}`;
    if (attrs.partName) return `bd:name:${String(attrs.partName).toLowerCase()}`;
  }
  if (sectionType === 'FACTORY') {
    if (attrs.name) return `fc:${String(attrs.name).toLowerCase()}`;
  }
  if (sectionType === 'VARIANT') {
    if (attrs.finishName) return `vr:${String(attrs.finishName).toLowerCase()}`;
  }
  return `${sectionType.toLowerCase()}:idx:${index}`;
};

const itemLabelFor = (sectionType, item) => {
  const attrs = item?.attributes || {};
  if (sectionType === 'HARDWARE') {
    return attrs.stockCode || attrs.description || 'Hardware line';
  }
  if (sectionType === 'BOARD') {
    return attrs.partName || attrs.boardCode || 'Board line';
  }
  if (sectionType === 'FACTORY') {
    return attrs.name || 'Factory operation';
  }
  if (sectionType === 'VARIANT') {
    return attrs.finishName || 'Finish variant';
  }
  return 'Line';
};

const sectionsByType = (snapshot) => {
  const map = new Map();
  for (const section of snapshot?.sections || []) {
    const type = String(section.sectionType || '').toUpperCase();
    if (!type) continue;
    map.set(type, section);
  }
  return map;
};

const indexItems = (sectionType, items = []) => {
  const map = new Map();
  items.forEach((item, index) => {
    const key = itemStableKey(sectionType, item, index);
    // Prefer first occurrence for stable matching
    if (!map.has(key)) map.set(key, { item, index });
  });
  return map;
};

const diffHeader = (before, after) => {
  const changes = [];
  const beforeHeader = before?.header || null;
  const afterHeader = after?.header || after || {};

  for (const fieldDef of HEADER_FIELDS) {
    const oldRaw = beforeHeader ? getPathValue(beforeHeader, fieldDef.path) : null;
    const newRaw = getPathValue(afterHeader, fieldDef.path);

    if (!beforeHeader) {
      if (isEmptyValue(newRaw)) continue;
      changes.push(
        changeRecord({
          section: HEADER_SECTION,
          field: fieldDef.label,
          action: ACTIONS.ADDED,
          oldValue: null,
          newValue: displayValue(newRaw, fieldDef),
          path: `header.${fieldDef.path}`,
        })
      );
      continue;
    }

    if (valuesEqual(oldRaw, newRaw)) continue;

    changes.push(
      changeRecord({
        section: HEADER_SECTION,
        field: fieldDef.label,
        action: ACTIONS.MODIFIED,
        oldValue: displayValue(oldRaw, fieldDef),
        newValue: displayValue(newRaw, fieldDef),
        path: `header.${fieldDef.path}`,
      })
    );
  }

  return changes;
};

const diffItemFields = (sectionType, beforeItem, afterItem, action) => {
  const fieldDefs = SECTION_FIELD_MAP[sectionType] || [];
  const section = SECTION_LABELS[sectionType] || sectionType;
  const label = itemLabelFor(sectionType, afterItem || beforeItem);
  const key = itemStableKey(sectionType, afterItem || beforeItem, 0);
  const rows = [];

  for (const fieldDef of fieldDefs) {
    const oldRaw = beforeItem ? readFieldValue(beforeItem, fieldDef) : null;
    const newRaw = afterItem ? readFieldValue(afterItem, fieldDef) : null;

    if (action === ACTIONS.ADDED) {
      if (isEmptyValue(newRaw)) continue;
      rows.push(
        changeRecord({
          section,
          field: fieldDef.label,
          action: ACTIONS.ADDED,
          oldValue: null,
          newValue: displayValue(newRaw, fieldDef),
          itemKey: key,
          itemLabel: label,
          path: `${sectionType}.${fieldDef.path}`,
        })
      );
      continue;
    }

    if (action === ACTIONS.REMOVED) {
      if (isEmptyValue(oldRaw)) continue;
      rows.push(
        changeRecord({
          section,
          field: fieldDef.label,
          action: ACTIONS.REMOVED,
          oldValue: displayValue(oldRaw, fieldDef),
          newValue: null,
          itemKey: key,
          itemLabel: label,
          path: `${sectionType}.${fieldDef.path}`,
        })
      );
      continue;
    }

    if (valuesEqual(oldRaw, newRaw)) continue;

    rows.push(
      changeRecord({
        section,
        field: fieldDef.label,
        action: ACTIONS.MODIFIED,
        oldValue: displayValue(oldRaw, fieldDef),
        newValue: displayValue(newRaw, fieldDef),
        itemKey: key,
        itemLabel: label,
        path: `${sectionType}.${fieldDef.path}`,
      })
    );
  }

  // Always emit at least one row for add/remove so the line is visible
  if ((action === ACTIONS.ADDED || action === ACTIONS.REMOVED) && rows.length === 0) {
    rows.push(
      changeRecord({
        section,
        field: label,
        action,
        oldValue: action === ACTIONS.REMOVED ? label : null,
        newValue: action === ACTIONS.ADDED ? label : null,
        itemKey: key,
        itemLabel: label,
        path: `${sectionType}.line`,
      })
    );
  }

  return rows;
};

const diffSectionType = (sectionType, beforeSection, afterSection) => {
  const changes = [];
  const beforeItems = beforeSection?.items || [];
  const afterItems = afterSection?.items || [];
  const beforeMap = indexItems(sectionType, beforeItems);
  const afterMap = indexItems(sectionType, afterItems);

  for (const [key, { item: afterItem }] of afterMap.entries()) {
    if (!beforeMap.has(key)) {
      changes.push(...diffItemFields(sectionType, null, afterItem, ACTIONS.ADDED));
      continue;
    }
    const beforeItem = beforeMap.get(key).item;
    changes.push(...diffItemFields(sectionType, beforeItem, afterItem, ACTIONS.MODIFIED));
  }

  for (const [key, { item: beforeItem }] of beforeMap.entries()) {
    if (!afterMap.has(key)) {
      changes.push(...diffItemFields(sectionType, beforeItem, null, ACTIONS.REMOVED));
    }
  }

  return changes;
};

const diffSections = (before, after) => {
  const changes = [];
  const beforeMap = sectionsByType(before);
  const afterMap = sectionsByType(after);
  const types = new Set([...beforeMap.keys(), ...afterMap.keys()]);

  for (const type of types) {
    if (!SECTION_FIELD_MAP[type]) continue;
    changes.push(...diffSectionType(type, beforeMap.get(type), afterMap.get(type)));
  }

  return changes;
};

/**
 * Primary API — business-friendly BOM change list.
 */
const computeBomChanges = (snapshotBefore, snapshotAfter) => {
  if (!snapshotAfter) return [];
  return [...diffHeader(snapshotBefore, snapshotAfter), ...diffSections(snapshotBefore, snapshotAfter)];
};

/**
 * Compact labels for audit list / filters (human readable, no raw paths).
 */
const summarizeBomChangedFields = (changes = []) => {
  const labels = [];
  const seen = new Set();

  for (const change of changes) {
    let label = change.field;
    if (change.action === ACTIONS.ADDED && change.itemLabel) {
      label =
        change.section === SECTION_LABELS.HARDWARE
          ? `Added Hardware`
          : change.section === SECTION_LABELS.BOARD
            ? `Added Board`
            : change.section === SECTION_LABELS.FACTORY
              ? `Added Operation`
              : change.section === SECTION_LABELS.VARIANT
                ? `Added Finish`
                : `Added ${change.itemLabel}`;
    } else if (change.action === ACTIONS.REMOVED && change.itemLabel) {
      label =
        change.section === SECTION_LABELS.HARDWARE
          ? `Removed Hardware`
          : change.section === SECTION_LABELS.BOARD
            ? `Removed Board`
            : change.section === SECTION_LABELS.FACTORY
              ? `Removed Operation`
              : change.section === SECTION_LABELS.VARIANT
                ? `Removed Finish`
                : `Removed ${change.itemLabel}`;
    } else if (change.section && change.section !== HEADER_SECTION) {
      label = `${change.section.replace(/s$/, '')} ${change.field}`.replace(/\s+/g, ' ').trim();
      // Prefer clearer short labels
      if (change.section === SECTION_LABELS.BOARD) label = `Board ${change.field}`;
      if (change.section === SECTION_LABELS.HARDWARE) label = `Hardware ${change.field}`;
      if (change.section === SECTION_LABELS.FACTORY) label = `Factory ${change.field}`;
      if (change.section === SECTION_LABELS.VARIANT) label = `Variant ${change.field}`;
    }

    if (!seen.has(label)) {
      seen.add(label);
      labels.push(label);
    }
  }

  return labels;
};

/**
 * Persistable changedFields for ChangeRequest / AuditLog.
 * Stores the full structured change objects (Mixed schema).
 */
const toPersistedChangedFields = (snapshotBefore, snapshotAfter) =>
  computeBomChanges(snapshotBefore, snapshotAfter);

module.exports = {
  ACTIONS,
  HEADER_SECTION,
  SECTION_LABELS,
  computeBomChanges,
  summarizeBomChangedFields,
  toPersistedChangedFields,
  valuesEqual,
  getPathValue,
};
