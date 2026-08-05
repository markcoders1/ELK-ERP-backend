const mongoose = require('mongoose');
const Component = require('./component.model');
const ComponentSection = require('../component-sections/componentSection.model');
const SectionItem = require('../section-items/sectionItem.model');
const HardwareItem = require('../hardware/hardwareItem.model');
const Board = require('../boards/board.model');
const AppError = require('../../utils/AppError');
const {
  HTTP_STATUS,
  COMPONENT_SORT_FIELDS,
  COMPONENT_VERSION_STATUS,
  SECTION_TYPES,
  ROLES,
} = require('../../config/constants');
const { parsePagination, buildPaginationMeta } = require('../../shared/pagination');
const { escapeRegex } = require('../../shared/escapeRegex');
const {
  calculateComponentPricing,
  toRoleAwarePricing,
  buildPricingSummary,
  calculateSection,
} = require('../calculations/calculation.service');

const notDeletedFilter = { deletedAt: null };
const liveFilter = {
  ...notDeletedFilter,
  versionStatus: COMPONENT_VERSION_STATUS.APPROVED,
};

const normalizeCode = (code) => String(code || '').trim().toUpperCase();

const toOptionalNumber = (value) => {
  if (value === '' || value === null || value === undefined) return undefined;
  const number = Number(value);
  return Number.isNaN(number) ? undefined : number;
};

const DEFAULT_SECTIONS = [
  { sectionType: SECTION_TYPES.BOARD, name: 'Board Components', sortOrder: 0 },
  { sectionType: SECTION_TYPES.HARDWARE, name: 'Hardware Components', sortOrder: 1 },
  { sectionType: SECTION_TYPES.FACTORY, name: 'Factory Components', sortOrder: 2 },
  { sectionType: SECTION_TYPES.VARIANT, name: 'Finish Pricing', sortOrder: 3 },
];

const pickStringField = (payload, base, key, fallback = '') => {
  if (payload[key] !== undefined) return String(payload[key] ?? '').trim();
  if (base[key] !== undefined) return base[key] || fallback;
  return fallback;
};

const pickCatalogueMetrics = (payload, existingMetrics = {}) => {
  const incoming =
    payload.catalogueMetrics && typeof payload.catalogueMetrics === 'object'
      ? payload.catalogueMetrics
      : payload;
  const keys = [
    'hwCost',
    'hwMarkup',
    'hwRetail',
    'fcMasoniteUsage',
    'fcMasoniteCostPerM2',
    'fcBoardUsage',
    'fcWhiteMelamineCostPerM2',
    'edgingUsage',
    'edgingCostPerM2',
    'fcMarkup',
    'wastage',
  ];
  const next = { ...existingMetrics };
  for (const key of keys) {
    if (incoming[key] !== undefined) {
      next[key] = toOptionalNumber(incoming[key]) ?? null;
    } else if (next[key] === undefined) {
      next[key] = null;
    }
  }
  return next;
};

const buildHeaderPayload = (payload, { existing = null } = {}) => {
  const base = existing
    ? {
        componentCode: existing.componentCode,
        description: existing.description,
        category: existing.category || '',
        finish: existing.finish || '',
        dimensions: existing.dimensions || {},
        status: existing.status || 'Active',
        retailPrice: existing.retailPrice ?? null,
        isActive: existing.isActive !== false,
        range: existing.range || '',
        type: existing.type || '',
        modificationClass: existing.modificationClass || '',
        region: existing.region || '',
        categoryDescription: existing.categoryDescription || '',
        colourCode: existing.colourCode || '',
        hwIncluded: existing.hwIncluded || '',
        fcIncluded: existing.fcIncluded || '',
        matchStatus: existing.matchStatus || '',
        catalogueMetrics: existing.catalogueMetrics || {},
      }
    : {};

  const dims = payload.dimensions || {};
  const existingDims = base.dimensions || {};

  return {
    componentCode: payload.componentCode
      ? normalizeCode(payload.componentCode)
      : base.componentCode,
    description:
      payload.description !== undefined
        ? String(payload.description).trim()
        : base.description,
    category:
      payload.category !== undefined
        ? String(payload.category).trim()
        : base.category || '',
    finish:
      payload.finish !== undefined
        ? String(payload.finish).trim()
        : base.finish || '',
    dimensions: {
      length:
        dims.length !== undefined
          ? toOptionalNumber(dims.length) ?? null
          : existingDims.length ?? null,
      width:
        dims.width !== undefined
          ? toOptionalNumber(dims.width) ?? null
          : existingDims.width ?? null,
      height:
        dims.height !== undefined
          ? toOptionalNumber(dims.height) ?? null
          : existingDims.height ?? null,
      unit:
        dims.unit !== undefined
          ? String(dims.unit).trim() || 'mm'
          : existingDims.unit || 'mm',
    },
    status:
      payload.status !== undefined
        ? String(payload.status).trim() || 'Active'
        : base.status || 'Active',
    retailPrice:
      payload.retailPrice !== undefined
        ? toOptionalNumber(payload.retailPrice) ?? null
        : base.retailPrice ?? null,
    isActive:
      payload.isActive !== undefined
        ? Boolean(payload.isActive)
        : base.isActive !== false,
    range: pickStringField(payload, base, 'range'),
    type: pickStringField(payload, base, 'type'),
    modificationClass: pickStringField(payload, base, 'modificationClass'),
    region: pickStringField(payload, base, 'region'),
    categoryDescription: pickStringField(payload, base, 'categoryDescription'),
    colourCode: pickStringField(payload, base, 'colourCode'),
    hwIncluded: pickStringField(payload, base, 'hwIncluded'),
    fcIncluded: pickStringField(payload, base, 'fcIncluded'),
    matchStatus: pickStringField(payload, base, 'matchStatus'),
    catalogueMetrics: pickCatalogueMetrics(payload, base.catalogueMetrics || {}),
  };
};

const normalizeItemInput = (item, sectionType, index = 0) => {
  const attrs = { ...(item.attributes || {}) };
  let hardwareId = item.hardwareId || attrs.hardwareId || null;
  if (hardwareId) hardwareId = hardwareId.toString();

  if (sectionType === SECTION_TYPES.HARDWARE && hardwareId) {
    attrs.hardwareId = hardwareId;
  }

  let unitCost =
    item.unitCost !== undefined
      ? toOptionalNumber(item.unitCost) ?? null
      : null;

  if (sectionType === SECTION_TYPES.HARDWARE) {
    unitCost = null;
  } else if (unitCost == null && attrs.cost != null) {
    unitCost = toOptionalNumber(attrs.cost) ?? null;
  } else if (unitCost == null && attrs.calculatedCost != null) {
    unitCost = toOptionalNumber(attrs.calculatedCost) ?? null;
  }

  return {
    sectionType,
    quantity: toOptionalNumber(item.quantity) ?? 1,
    notes: item.notes != null ? String(item.notes).trim() : '',
    unitCost,
    hardwareId: sectionType === SECTION_TYPES.HARDWARE ? hardwareId : null,
    attributes: attrs,
    sortOrder: item.sortOrder ?? index,
  };
};

/**
 * Full snapshot for change requests / versioning (header + sections + items).
 */
const buildFullSnapshot = async (componentId) => {
  const component = await Component.findById(componentId).lean();
  if (!component) return null;

  const sections = await ComponentSection.find({ componentId })
    .sort({ sortOrder: 1 })
    .lean();
  const items = await SectionItem.find({ componentId }).sort({ sortOrder: 1 }).lean();

  const itemsBySection = new Map();
  for (const item of items) {
    const key = item.sectionId.toString();
    if (!itemsBySection.has(key)) itemsBySection.set(key, []);
    itemsBySection.get(key).push({
      quantity: item.quantity,
      notes: item.notes,
      unitCost: item.unitCost,
      hardwareId: item.hardwareId,
      attributes: item.attributes || {},
      sortOrder: item.sortOrder,
    });
  }

  return {
    header: Component.buildSourceObject(component),
    sections: sections.map((section) => ({
      sectionType: section.sectionType,
      name: section.name,
      sortOrder: section.sortOrder,
      meta: section.meta || {},
      items: itemsBySection.get(section._id.toString()) || [],
    })),
  };
};

const snapshotFromDocs = (component, sections, items) => {
  const itemsBySection = new Map();
  for (const item of items) {
    const key = (item.sectionId?._id || item.sectionId).toString();
    if (!itemsBySection.has(key)) itemsBySection.set(key, []);
    itemsBySection.get(key).push({
      quantity: item.quantity,
      notes: item.notes,
      unitCost: item.unitCost,
      hardwareId: item.hardwareId,
      attributes: item.attributes || {},
      sortOrder: item.sortOrder,
    });
  }

  return {
    header: Component.buildSourceObject(component),
    sections: sections.map((section) => ({
      sectionType: section.sectionType,
      name: section.name,
      sortOrder: section.sortOrder,
      meta: section.meta || {},
      items: itemsBySection.get(section._id.toString()) || [],
    })),
  };
};

const loadHardwareMap = async (items) => {
  const ids = [
    ...new Set(
      items
        .map((i) => (i.hardwareId || i.attributes?.hardwareId || '').toString())
        .filter(Boolean)
    ),
  ];

  if (ids.length === 0) return new Map();

  const hardwareRows = await HardwareItem.find({
    _id: { $in: ids },
    deletedAt: null,
  }).lean();

  const map = new Map();
  for (const row of hardwareRows) {
    map.set(row._id.toString(), row);
  }
  return map;
};

/**
 * Resolve Boards Master rows for BOARD section items (by attributes.boardId / boardCode).
 * No schema change — enrichment only for read/display + calculator attrs.
 */
const loadBoardMap = async (items) => {
  const boardItems = items.filter(
    (i) => String(i.sectionType || '').toUpperCase() === SECTION_TYPES.BOARD
  );
  const ids = [
    ...new Set(
      boardItems
        .map((i) => (i.attributes?.boardId || '').toString())
        .filter(Boolean)
    ),
  ];
  const codes = [
    ...new Set(
      boardItems
        .map((i) => String(i.attributes?.boardCode || '').trim().toUpperCase())
        .filter(Boolean)
    ),
  ];

  if (ids.length === 0 && codes.length === 0) return new Map();

  const boards = await Board.find({
    deletedAt: null,
    $or: [
      ...(ids.length ? [{ _id: { $in: ids } }] : []),
      ...(codes.length ? [{ boardCode: { $in: codes } }] : []),
    ],
  }).lean();

  const map = new Map();
  for (const row of boards) {
    map.set(row._id.toString(), row);
    if (row.boardCode) map.set(`code:${String(row.boardCode).toUpperCase()}`, row);
  }
  return map;
};

const enrichBoardAttributes = (item, boardByKey) => {
  const attrs = { ...(item.attributes || {}) };
  const board =
    boardByKey.get(String(attrs.boardId || '')) ||
    boardByKey.get(`code:${String(attrs.boardCode || '').toUpperCase()}`) ||
    null;
  if (!board) return item;

  return {
    ...item,
    attributes: {
      ...attrs,
      boardId: attrs.boardId || board._id?.toString() || board.id,
      boardCode: attrs.boardCode || board.boardCode || '',
      partName: attrs.partName || board.description || board.boardCode || '',
      boardName: attrs.boardName || board.description || '',
      boardType: attrs.boardType || board.boardType || '',
      material: attrs.material || board.boardType || '',
      thickness: attrs.thickness ?? board.thickness ?? null,
      colour: attrs.colour || board.colour || '',
      finish: attrs.finish || board.finish || '',
      supplier: attrs.supplier || board.supplier || '',
      range: attrs.range || board.range || '',
      // Keep user-entered cut size; fill from master sheet size only if empty
      length: attrs.length ?? board.height ?? null,
      width: attrs.width ?? board.width ?? null,
    },
  };
};

const attachPricing = async (componentLean, { role = null, includeSectionDetails = false } = {}) => {
  const sections = await ComponentSection.find({ componentId: componentLean._id })
    .sort({ sortOrder: 1 })
    .lean();
  const items = await SectionItem.find({ componentId: componentLean._id })
    .sort({ sortOrder: 1 })
    .lean();

  const hardwareById = await loadHardwareMap(items);
  const boardByKey = await loadBoardMap(items);

  const sectionsForCalc = sections.map((section) => ({
    sectionType: section.sectionType,
    items: items
      .filter((i) => i.sectionId.toString() === section._id.toString())
      .map((i) => {
        const safe = SectionItem.toSafeObjectFromLean(i);
        return String(section.sectionType).toUpperCase() === SECTION_TYPES.BOARD
          ? enrichBoardAttributes(safe, boardByKey)
          : safe;
      }),
  }));

  const pricing = calculateComponentPricing({
    retailPrice: componentLean.retailPrice,
    sections: sectionsForCalc,
    hardwareById,
  });

  const roleAware = toRoleAwarePricing(pricing, role);
  const counts = {};
  for (const section of sections) {
    const type = section.sectionType;
    counts[type] = (counts[type] || 0) + 0;
  }
  for (const item of items) {
    counts[item.sectionType] = (counts[item.sectionType] || 0) + 1;
  }

  const sectionSummaries = sections.map((section) => {
    const sectionPricing = roleAware.sectionResults?.find(
      (r) => r.sectionType === section.sectionType
    );
    return ComponentSection.toSafeObjectFromLean(section, {
      itemCount: counts[section.sectionType] || 0,
      sectionCost:
        role === ROLES.CONSULTANT ? undefined : sectionPricing?.sectionCost ?? null,
    });
  });

  const extras = {
    sectionCounts: counts,
    sections: sectionSummaries,
    pricingSummary:
      role === ROLES.CONSULTANT
        ? { retailPrice: roleAware.retailPrice }
        : buildPricingSummary(roleAware),
  };

  if (includeSectionDetails && role !== ROLES.CONSULTANT) {
    extras.pricingDetails = roleAware;
  } else if (includeSectionDetails && role === ROLES.CONSULTANT) {
    extras.pricingDetails = roleAware;
  }

  return Component.toListObjectFromLean(componentLean, extras);
};

const buildListFilter = async (query) => {
  const filter = { ...liveFilter };

  if (query.category) filter.category = String(query.category).trim();
  if (query.finish) filter.finish = String(query.finish).trim();
  if (query.status) filter.status = String(query.status).trim();
  if (query.versionStatus) filter.versionStatus = query.versionStatus;
  if (query.createdBy) filter.createdBy = query.createdBy;

  if (query.updatedFrom || query.updatedTo) {
    filter.updatedAt = {};
    if (query.updatedFrom) filter.updatedAt.$gte = new Date(query.updatedFrom);
    if (query.updatedTo) {
      const end = new Date(query.updatedTo);
      end.setHours(23, 59, 59, 999);
      filter.updatedAt.$lte = end;
    }
  }

  if (query.approvalStatus) {
    // Alias for versionStatus filter from UI
    filter.versionStatus = query.approvalStatus;
  }

  const andClauses = [];

  if (query.search) {
    const term = escapeRegex(query.search.trim());
    const codeRegex = new RegExp(term, 'i');

    const matchingHardware = await HardwareItem.find({
      deletedAt: null,
      $or: [{ stockCode: codeRegex }, { description: codeRegex }],
    })
      .select('_id')
      .lean();

    const hardwareIds = matchingHardware.map((h) => h._id);
    let componentIdsFromChildren = [];

    if (hardwareIds.length > 0) {
      const linkRows = await SectionItem.find({
        sectionType: SECTION_TYPES.HARDWARE,
        hardwareId: { $in: hardwareIds },
      })
        .select('componentId')
        .lean();
      componentIdsFromChildren = linkRows.map((r) => r.componentId);
    }

    const boardRows = await SectionItem.find({
      sectionType: SECTION_TYPES.BOARD,
      $or: [
        { 'attributes.partName': codeRegex },
        { 'attributes.boardType': codeRegex },
        { 'attributes.material': codeRegex },
        { 'attributes.boardCode': codeRegex },
        { 'attributes.childPartCode': codeRegex },
        { 'attributes.childDescription': codeRegex },
      ],
    })
      .select('componentId')
      .lean();

    const hardwareAttrRows = await SectionItem.find({
      sectionType: SECTION_TYPES.HARDWARE,
      $or: [
        { 'attributes.stockCode': codeRegex },
        { 'attributes.description': codeRegex },
      ],
    })
      .select('componentId')
      .lean();

    const factoryRows = await SectionItem.find({
      sectionType: SECTION_TYPES.FACTORY,
      'attributes.name': codeRegex,
    })
      .select('componentId')
      .lean();

    const finishRows = await SectionItem.find({
      sectionType: SECTION_TYPES.VARIANT,
      $or: [
        { 'attributes.finishName': codeRegex },
        { 'attributes.priceGroup': codeRegex },
      ],
    })
      .select('componentId')
      .lean();

    componentIdsFromChildren = [
      ...componentIdsFromChildren,
      ...boardRows.map((r) => r.componentId),
      ...hardwareAttrRows.map((r) => r.componentId),
      ...factoryRows.map((r) => r.componentId),
      ...finishRows.map((r) => r.componentId),
    ];

    andClauses.push({
      $or: [
        { componentCode: codeRegex },
        { description: codeRegex },
        { category: codeRegex },
        { finish: codeRegex },
        ...(componentIdsFromChildren.length
          ? [{ _id: { $in: componentIdsFromChildren } }]
          : []),
      ],
    });
  }

  if (andClauses.length) filter.$and = andClauses;
  return filter;
};

const buildSort = (query) => {
  const sortBy = COMPONENT_SORT_FIELDS.includes(query.sortBy)
    ? query.sortBy
    : 'componentCode';
  const sortOrder = query.sortOrder === 'desc' ? -1 : 1;
  return { [sortBy]: sortOrder };
};

const findAll = async (query, { role } = {}) => {
  const { page, limit, skip } = parsePagination(query);
  const filter = await buildListFilter(query);
  const sort = buildSort(query);

  const [items, total] = await Promise.all([
    Component.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    Component.countDocuments(filter),
  ]);

  // Aggregation counts without loading all child rows (N+1 avoided via two group queries)
  const ids = items.map((i) => i._id);
  const countRows =
    ids.length === 0
      ? []
      : await SectionItem.aggregate([
          { $match: { componentId: { $in: ids } } },
          {
            $group: {
              _id: { componentId: '$componentId', sectionType: '$sectionType' },
              count: { $sum: 1 },
            },
          },
        ]);

  const countsByComponent = new Map();
  for (const row of countRows) {
    const cid = row._id.componentId.toString();
    if (!countsByComponent.has(cid)) countsByComponent.set(cid, {});
    countsByComponent.get(cid)[row._id.sectionType] = row.count;
  }

  // Lightweight pricing for list (section totals only)
  const sectionMeta =
    ids.length === 0
      ? []
      : await ComponentSection.find({ componentId: { $in: ids } })
          .select('componentId sectionType')
          .lean();

  const allItems =
    ids.length === 0
      ? []
      : await SectionItem.find({ componentId: { $in: ids } }).lean();

  const hardwareById = await loadHardwareMap(allItems);

  const enriched = items.map((item) => {
    const cid = item._id.toString();
    const counts = countsByComponent.get(cid) || {};
    const componentItems = allItems.filter((i) => i.componentId.toString() === cid);
    const componentSections = sectionMeta.filter(
      (s) => s.componentId.toString() === cid
    );

    const pricing = calculateComponentPricing({
      retailPrice: item.retailPrice,
      sections: componentSections.map((section) => ({
        sectionType: section.sectionType,
        items: componentItems
          .filter((i) => i.sectionType === section.sectionType)
          .map((i) => SectionItem.toSafeObjectFromLean(i)),
      })),
      hardwareById,
    });

    const roleAware = toRoleAwarePricing(pricing, role);

    return Component.toListObjectFromLean(item, {
      sectionCounts: counts,
      pricingSummary:
        role === ROLES.CONSULTANT
          ? { retailPrice: roleAware.retailPrice }
          : buildPricingSummary(roleAware),
    });
  });

  return {
    items: enriched,
    pagination: buildPaginationMeta({ page, limit, total }),
  };
};

const findById = async (id, { role } = {}) => {
  const item = await Component.findOne({ _id: id, ...notDeletedFilter }).lean();
  if (!item) {
    throw new AppError('Component not found', HTTP_STATUS.NOT_FOUND);
  }
  return attachPricing(item, { role, includeSectionDetails: true });
};

const findLiveByCode = (componentCode) =>
  Component.findOne({
    componentCode: normalizeCode(componentCode),
    ...liveFilter,
  });

const ensureDefaultSections = async (componentId, session = null) => {
  const existing = await ComponentSection.find({ componentId }).session(session).lean();
  if (existing.length > 0) return existing;

  const docs = DEFAULT_SECTIONS.map((s) => ({
    componentId,
    ...s,
    meta: {},
  }));

  const created = await ComponentSection.insertMany(docs, { session });
  return created;
};

const replaceSectionsFromSnapshot = async (
  componentId,
  sectionsPayload = [],
  { session = null } = {}
) => {
  await SectionItem.deleteMany({ componentId }).session(session);
  await ComponentSection.deleteMany({ componentId }).session(session);

  const sectionInputs =
    sectionsPayload.length > 0
      ? sectionsPayload
      : DEFAULT_SECTIONS.map((s) => ({ ...s, items: [], meta: {} }));

  const createdSections = [];
  for (let i = 0; i < sectionInputs.length; i += 1) {
    const input = sectionInputs[i];
    const sectionType = String(input.sectionType || '').toUpperCase();
    const [section] = await ComponentSection.create(
      [
        {
          componentId,
          sectionType,
          name: input.name || sectionType,
          sortOrder: input.sortOrder ?? i,
          meta: input.meta || {},
        },
      ],
      { session }
    );

    const itemDocs = (input.items || []).map((item, idx) => ({
      componentId,
      sectionId: section._id,
      ...normalizeItemInput(item, sectionType, idx),
    }));

    if (itemDocs.length > 0) {
      await SectionItem.insertMany(itemDocs, { session });
    }

    createdSections.push(section);
  }

  return createdSections;
};

/**
 * Create live APPROVED component (used by approve CREATE + import).
 */
const create = async (snapshot, userId, extras = {}) => {
  const header = snapshot.header || snapshot;
  const sections = snapshot.sections || [];

  const code = normalizeCode(header.componentCode);
  const existing = await findLiveByCode(code);
  if (existing) {
    throw new AppError('Component code already exists', HTTP_STATUS.CONFLICT);
  }

  const lineageId = new mongoose.Types.ObjectId();
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const [component] = await Component.create(
      [
        {
          ...buildHeaderPayload(header),
          lineageId,
          version: 1,
          versionStatus: COMPONENT_VERSION_STATUS.APPROVED,
          createdBy: userId,
          updatedBy: userId,
          importBatchId: extras.importBatchId || null,
          importedBy: extras.importedBy || null,
          importedAt: extras.importedAt || null,
        },
      ],
      { session }
    );

    await replaceSectionsFromSnapshot(component._id, sections, { session });
    await session.commitTransaction();

    return findById(component._id.toString());
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Clone live APPROVED component + children → SUPERSEDED historical version.
 */
const supersedeCurrentVersion = async (liveComponent, { session }) => {
  const sections = await ComponentSection.find({ componentId: liveComponent._id })
    .session(session)
    .lean();
  const items = await SectionItem.find({ componentId: liveComponent._id })
    .session(session)
    .lean();

  const [archived] = await Component.create(
    [
      {
        lineageId: liveComponent.lineageId,
        version: liveComponent.version,
        versionStatus: COMPONENT_VERSION_STATUS.SUPERSEDED,
        componentCode: liveComponent.componentCode,
        description: liveComponent.description,
        category: liveComponent.category,
        finish: liveComponent.finish,
        dimensions: liveComponent.dimensions,
        status: liveComponent.status,
        retailPrice: liveComponent.retailPrice,
        range: liveComponent.range || '',
        type: liveComponent.type || '',
        modificationClass: liveComponent.modificationClass || '',
        region: liveComponent.region || '',
        categoryDescription: liveComponent.categoryDescription || '',
        colourCode: liveComponent.colourCode || '',
        hwIncluded: liveComponent.hwIncluded || '',
        fcIncluded: liveComponent.fcIncluded || '',
        matchStatus: liveComponent.matchStatus || '',
        catalogueMetrics: liveComponent.catalogueMetrics || {},
        isActive: liveComponent.isActive,
        deletedAt: null,
        importBatchId: liveComponent.importBatchId,
        importedBy: liveComponent.importedBy,
        importedAt: liveComponent.importedAt,
        createdBy: liveComponent.createdBy,
        updatedBy: liveComponent.updatedBy,
        createdAt: liveComponent.createdAt,
        updatedAt: liveComponent.updatedAt,
      },
    ],
    { session }
  );

  const sectionIdMap = new Map();
  for (const section of sections) {
    const [clonedSection] = await ComponentSection.create(
      [
        {
          componentId: archived._id,
          sectionType: section.sectionType,
          name: section.name,
          sortOrder: section.sortOrder,
          meta: section.meta || {},
        },
      ],
      { session }
    );
    sectionIdMap.set(section._id.toString(), clonedSection._id);
  }

  const clonedItems = items.map((item) => ({
    componentId: archived._id,
    sectionId: sectionIdMap.get(item.sectionId.toString()),
    sectionType: item.sectionType,
    quantity: item.quantity,
    notes: item.notes,
    unitCost: item.unitCost,
    hardwareId: item.hardwareId,
    attributes: item.attributes || {},
    sortOrder: item.sortOrder,
  }));

  if (clonedItems.length > 0) {
    await SectionItem.insertMany(clonedItems, { session });
  }

  return archived;
};

/**
 * Apply update snapshot to live component: supersede old, bump version, replace children.
 */
const update = async (componentId, snapshot, userId) => {
  const live = await Component.findOne({ _id: componentId, ...liveFilter });
  if (!live) {
    throw new AppError('Component not found', HTTP_STATUS.NOT_FOUND);
  }

  const header = snapshot.header || snapshot;
  const sections = snapshot.sections;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    await supersedeCurrentVersion(live, { session });

    const nextHeader = buildHeaderPayload(header, { existing: live });
    // componentCode is immutable on update for lineage stability
    nextHeader.componentCode = live.componentCode;

    live.set({
      ...nextHeader,
      version: live.version + 1,
      versionStatus: COMPONENT_VERSION_STATUS.APPROVED,
      updatedBy: userId,
    });
    await live.save({ session });

    if (Array.isArray(sections)) {
      await replaceSectionsFromSnapshot(live._id, sections, { session });
    }

    await session.commitTransaction();
    return findById(live._id.toString());
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

const softDelete = async (id, userId) => {
  const item = await Component.findOne({ _id: id, ...liveFilter });
  if (!item) {
    throw new AppError('Component not found', HTTP_STATUS.NOT_FOUND);
  }

  item.deletedAt = new Date();
  item.isActive = false;
  item.updatedBy = userId;
  await item.save();

  return item.toSafeObject();
};

const listSections = async (componentId) => {
  const component = await Component.findOne({ _id: componentId, ...notDeletedFilter }).lean();
  if (!component) {
    throw new AppError('Component not found', HTTP_STATUS.NOT_FOUND);
  }

  const sections = await ComponentSection.find({ componentId })
    .sort({ sortOrder: 1 })
    .lean();

  const counts = await SectionItem.aggregate([
    { $match: { componentId: new mongoose.Types.ObjectId(componentId) } },
    { $group: { _id: '$sectionId', count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c) => [c._id.toString(), c.count]));

  return sections.map((section) =>
    ComponentSection.toSafeObjectFromLean(section, {
      itemCount: countMap.get(section._id.toString()) || 0,
    })
  );
};

const listSectionItems = async (componentId, sectionId, { role } = {}) => {
  const section = await ComponentSection.findOne({
    _id: sectionId,
    componentId,
  }).lean();

  if (!section) {
    throw new AppError('Section not found', HTTP_STATUS.NOT_FOUND);
  }

  const items = await SectionItem.find({ sectionId, componentId })
    .sort({ sortOrder: 1 })
    .lean();

  const hardwareById = await loadHardwareMap(items);
  const boardByKey = await loadBoardMap(items);
  const safeItems = items
    .map((i) => SectionItem.toSafeObjectFromLean(i))
    .map((i) =>
      String(i.sectionType || '').toUpperCase() === SECTION_TYPES.BOARD
        ? enrichBoardAttributes(i, boardByKey)
        : i
    );
  const calculated = calculateSection(section.sectionType, safeItems, {
    hardwareById,
  });

  const hideCosts = role === ROLES.CONSULTANT;

  return {
    section: ComponentSection.toSafeObjectFromLean(section, {
      itemCount: items.length,
      sectionCost: hideCosts ? undefined : calculated.sectionCost,
    }),
    items: safeItems.map((item, idx) => {
      const row = calculated.breakdown[idx] || {};
      if (hideCosts) {
        const { unitCost, lineCost, cost, labourCost, machineCost, totalFinishCost, ...rest } = {
          ...item,
          ...row,
        };
        return rest;
      }
      return { ...item, ...row };
    }),
  };
};

const listVersions = async (componentId) => {
  const live = await Component.findOne({ _id: componentId, ...notDeletedFilter }).lean();
  if (!live) {
    throw new AppError('Component not found', HTTP_STATUS.NOT_FOUND);
  }

  const versions = await Component.find({
    lineageId: live.lineageId,
    deletedAt: null,
  })
    .sort({ version: -1 })
    .lean();

  return versions.map((v) => Component.toListObjectFromLean(v));
};

/**
 * Bulk create from import (one BOM transaction).
 */
const createManyFromImport = async (snapshots, userId, batchMeta) => {
  const results = { created: 0, skipped: 0, errors: [] };

  for (const snapshot of snapshots) {
    try {
      const code = normalizeCode(snapshot.header?.componentCode || snapshot.componentCode);
      const existing = await findLiveByCode(code);
      if (existing) {
        results.skipped += 1;
        continue;
      }

      await create(snapshot, userId, {
        importBatchId: batchMeta.batchCode,
        importedBy: userId,
        importedAt: new Date(),
      });
      results.created += 1;
    } catch (error) {
      results.errors.push({
        componentCode: snapshot.header?.componentCode || snapshot.componentCode,
        message: error.message,
      });
    }
  }

  return results;
};

module.exports = {
  findAll,
  findById,
  findLiveByCode,
  create,
  update,
  softDelete,
  listSections,
  listSectionItems,
  listVersions,
  buildHeaderPayload,
  buildFullSnapshot,
  snapshotFromDocs,
  normalizeItemInput,
  ensureDefaultSections,
  replaceSectionsFromSnapshot,
  createManyFromImport,
  DEFAULT_SECTIONS,
  normalizeCode,
};
