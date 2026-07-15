const Board = require('./board.model');
const AppError = require('../../utils/AppError');
const { HTTP_STATUS, BOARDS_SORT_FIELDS } = require('../../config/constants');
const { parsePagination, buildPaginationMeta } = require('../../shared/pagination');
const { escapeRegex } = require('../../shared/escapeRegex');

const normalizeBoardCode = (boardCode) => boardCode.trim().toUpperCase();

const notDeletedFilter = { deletedAt: null };

const findActiveById = (id) => Board.findOne({ _id: id, ...notDeletedFilter });

const optionalTrimmed = (value) => (value === undefined || value === null ? undefined : value.trim());

const buildListFilter = (query) => {
  const filter = { ...notDeletedFilter };

  if (query.supplier) {
    filter.supplier = query.supplier.trim();
  }

  if (query.range) {
    filter.range = query.range.trim();
  }

  if (query.colour) {
    filter.colour = query.colour.trim();
  }

  if (query.finish) {
    filter.finish = query.finish.trim();
  }

  if (query.boardType) {
    filter.boardType = query.boardType.trim();
  }

  if (query.isActive !== undefined) {
    filter.isActive = query.isActive === 'true';
  }

  if (query.search) {
    const term = escapeRegex(query.search.trim());
    filter.$or = [
      { boardCode: new RegExp(term, 'i') },
      { description: new RegExp(term, 'i') },
    ];
  }

  return filter;
};

const buildSort = (query) => {
  const sortBy = BOARDS_SORT_FIELDS.includes(query.sortBy) ? query.sortBy : 'boardCode';
  const sortOrder = query.sortOrder === 'desc' ? -1 : 1;

  return { [sortBy]: sortOrder };
};

const findAll = async (query) => {
  const { page, limit, skip } = parsePagination(query);
  const filter = buildListFilter(query);
  const sort = buildSort(query);

  const [items, total] = await Promise.all([
    Board.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    Board.countDocuments(filter),
  ]);

  return {
    items: items.map(Board.toListObjectFromLean),
    pagination: buildPaginationMeta({ page, limit, total }),
  };
};

const findById = async (id) => {
  const item = await findActiveById(id);

  if (!item) {
    throw new AppError('Board not found', HTTP_STATUS.NOT_FOUND);
  }

  return item.toSafeObject();
};

const create = async (payload, userId) => {
  const boardCode = normalizeBoardCode(payload.boardCode);

  const existing = await Board.findOne({ boardCode }).lean();

  if (existing) {
    throw new AppError('Board code already exists', HTTP_STATUS.CONFLICT);
  }

  try {
    const item = await Board.create({
      boardCode,
      description: payload.description.trim(),
      supplier: payload.supplier?.trim() || '',
      range: payload.range?.trim() || '',
      colour: payload.colour?.trim() || '',
      finish: payload.finish?.trim() || '',
      boardType: payload.boardType?.trim() || '',
      height: payload.height,
      width: payload.width,
      thickness: payload.thickness,
      isActive: payload.isActive ?? true,
      createdBy: userId,
      updatedBy: userId,
    });

    return item.toSafeObject();
  } catch (error) {
    if (error.code === 11000) {
      throw new AppError('Board code already exists', HTTP_STATUS.CONFLICT);
    }
    throw error;
  }
};

const update = async (id, payload, userId) => {
  const item = await findActiveById(id);

  if (!item) {
    throw new AppError('Board not found', HTTP_STATUS.NOT_FOUND);
  }

  if (payload.description !== undefined) {
    item.description = payload.description.trim();
  }

  if (payload.supplier !== undefined) {
    item.supplier = optionalTrimmed(payload.supplier) ?? '';
  }

  if (payload.range !== undefined) {
    item.range = optionalTrimmed(payload.range) ?? '';
  }

  if (payload.colour !== undefined) {
    item.colour = optionalTrimmed(payload.colour) ?? '';
  }

  if (payload.finish !== undefined) {
    item.finish = optionalTrimmed(payload.finish) ?? '';
  }

  if (payload.boardType !== undefined) {
    item.boardType = optionalTrimmed(payload.boardType) ?? '';
  }

  if (payload.height !== undefined) {
    item.height = payload.height;
  }

  if (payload.width !== undefined) {
    item.width = payload.width;
  }

  if (payload.thickness !== undefined) {
    item.thickness = payload.thickness;
  }

  if (payload.isActive !== undefined) {
    item.isActive = payload.isActive;
  }

  item.updatedBy = userId;
  await item.save();

  return item.toSafeObject();
};

const softDelete = async (id, userId) => {
  const item = await findActiveById(id);

  if (!item) {
    throw new AppError('Board not found', HTTP_STATUS.NOT_FOUND);
  }

  item.deletedAt = new Date();
  item.updatedBy = userId;
  await item.save();

  return item.toSafeObject();
};

module.exports = {
  findAll,
  findById,
  create,
  update,
  softDelete,
};
