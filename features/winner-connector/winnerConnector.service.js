const crypto = require('crypto');
const path = require('path');
const mongoose = require('mongoose');
const WinnerImport = require('./winnerImport.model');
const Connector = require('./connector.model');
const asciiQuoteService = require('../ascii-quote/asciiQuote.service');
const {
  saveImportAsciiFile,
  readStoredAscii,
  resolveStoredAbsolutePath,
  newImportId,
} = require('./importStorage');
const AppError = require('../../utils/AppError');
const { parsePagination, buildPaginationMeta } = require('../../shared/pagination');
const {
  HTTP_STATUS,
  WINNER_IMPORT_STATUS,
  WINNER_CONNECTOR_ALLOWED_EXTENSIONS,
  WINNER_CONNECTOR_MAX_FILE_BYTES,
} = require('../../config/constants');

const SHA256_HEX = /^[a-f0-9]{64}$/i;

const getExtension = (fileName = '') => {
  const ext = path.extname(String(fileName)).toLowerCase();
  return ext.startsWith('.') ? ext : `.${ext}`;
};

const assertAllowedFile = (fileName, fileSize) => {
  const ext = getExtension(fileName);
  if (!WINNER_CONNECTOR_ALLOWED_EXTENSIONS.includes(ext)) {
    throw new AppError(
          'Upload a Winner ASCII file (.txt, .asc, .ascii, or .e01)',
      HTTP_STATUS.BAD_REQUEST
    );
  }

  if (!fileSize || fileSize <= 0) {
    throw new AppError('File is empty', HTTP_STATUS.BAD_REQUEST);
  }

  if (fileSize > WINNER_CONNECTOR_MAX_FILE_BYTES) {
    throw new AppError('File exceeds the 8MB upload limit', HTTP_STATUS.BAD_REQUEST);
  }

  return ext;
};

const verifySha256 = (buffer, claimedSha256) => {
  const claimed = String(claimedSha256 || '')
    .trim()
    .toLowerCase();

  if (!SHA256_HEX.test(claimed)) {
    throw new AppError('sha256 must be a 64-character hex digest', HTTP_STATUS.BAD_REQUEST);
  }

  const actual = crypto.createHash('sha256').update(buffer).digest('hex');
  if (actual !== claimed) {
    throw new AppError('File SHA-256 does not match claimed sha256', HTTP_STATUS.BAD_REQUEST);
  }

  return actual;
};

const mongooseIsValid = (id) => mongoose.Types.ObjectId.isValid(id);

const toListItem = (doc) => ({
  id: doc._id.toString(),
  importId: doc._id.toString(),
  fileName: doc.fileName,
  fileExtension: doc.fileExtension,
  fileSize: doc.fileSize,
  sha256: doc.sha256,
  jobName: doc.jobName || doc.quoteSummary?.jobName || '',
  city: doc.city || doc.quoteSummary?.city || '',
  status: doc.status,
  connectorId: doc.connectorId,
  quotedRetail: doc.quoteSummary?.quotedRetail ?? null,
  matchedCount: doc.quoteSummary?.matchedCount ?? null,
  unmatchedCount: doc.quoteSummary?.unmatchedCount ?? null,
  lineCount: doc.quoteSummary?.lineCount ?? null,
  modifiedAt: doc.modifiedAt,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

/**
 * Accept a connector upload with content-based idempotency (connectorId + sha256).
 * Persists original ASCII file + full quote for the Winner Imports web UI.
 */
const importWinnerFile = async ({
  connector,
  file,
  fileName,
  sha256,
  fileSize,
  modifiedAt,
  connectorVersion,
  role = null,
}) => {
  const resolvedName = String(fileName || file?.originalname || '').trim();
  if (!resolvedName) {
    throw new AppError('fileName is required', HTTP_STATUS.BAD_REQUEST);
  }

  const size = Number(fileSize) || file?.size || 0;
  const ext = assertAllowedFile(resolvedName, size);

  if (!file?.buffer) {
    throw new AppError('ASCII file is required', HTTP_STATUS.BAD_REQUEST);
  }

  const digest = verifySha256(file.buffer, sha256);

  const existing = await WinnerImport.findOne({
    connectorId: connector.connectorId,
    sha256: digest,
  }).lean();

  if (existing) {
    return {
      status: 'already_processed',
      importId: existing._id.toString(),
      fileName: existing.fileName,
      jobName: existing.jobName || existing.quoteSummary?.jobName || '',
      createdAt: existing.createdAt,
    };
  }

  let quote;
  try {
    const text = file.buffer.toString('utf8');
    quote = await asciiQuoteService.quoteAsciiDesign(text, { role });
  } catch (err) {
    throw new AppError(
      err.message || 'Failed to process Winner ASCII file',
      err.statusCode || HTTP_STATUS.BAD_REQUEST
    );
  }

  const quoteSummary = {
    jobName: quote?.header?.jobName || '',
    city: quote?.header?.city || '',
    lineCount: Array.isArray(quote?.lines) ? quote.lines.length : 0,
    matchedCount: quote?.summary?.matchedCount ?? null,
    unmatchedCount: quote?.summary?.unmatchedCount ?? null,
    quotedRetail: quote?.summary?.quotedRetail ?? null,
  };

  const importId = newImportId();
  let storedFilePath = null;
  try {
    storedFilePath = saveImportAsciiFile(importId, resolvedName, file.buffer);
  } catch (err) {
    throw new AppError(
      `Failed to store ASCII file: ${err.message}`,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }

  let doc;
  try {
    doc = await WinnerImport.create({
      _id: importId,
      connectorId: connector.connectorId,
      connectorRef: connector.id,
      fileName: resolvedName,
      fileExtension: ext,
      fileSize: file.buffer.length,
      sha256: digest,
      modifiedAt: modifiedAt ? new Date(modifiedAt) : null,
      connectorVersion: String(connectorVersion || '').trim(),
      storedFilePath,
      jobName: quoteSummary.jobName,
      city: quoteSummary.city,
      status: WINNER_IMPORT_STATUS.PROCESSED,
      quoteSummary,
      quote: {
        fileName: resolvedName,
        header: quote.header,
        summary: quote.summary,
        lines: quote.lines,
      },
    });
  } catch (err) {
    if (err.code === 11000) {
      const raced = await WinnerImport.findOne({
        connectorId: connector.connectorId,
        sha256: digest,
      }).lean();

      if (raced) {
        return {
          status: 'already_processed',
          importId: raced._id.toString(),
          fileName: raced.fileName,
          jobName: raced.jobName || '',
          createdAt: raced.createdAt,
        };
      }
    }
    throw err;
  }

  await Connector.updateOne({ _id: connector.id }, { $set: { lastSeenAt: new Date() } });

  return {
    status: 'accepted',
    importId: doc._id.toString(),
    fileName: doc.fileName,
    jobName: doc.jobName,
    createdAt: doc.createdAt,
    quoteSummary,
  };
};

const listImports = async (query = {}) => {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};

  const search = String(query.search || '').trim();
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ fileName: rx }, { jobName: rx }, { city: rx }, { connectorId: rx }];
  }

  if (query.connectorId) {
    filter.connectorId = String(query.connectorId).trim();
  }

  if (query.status) {
    filter.status = String(query.status).trim();
  }

  const [total, rows] = await Promise.all([
    WinnerImport.countDocuments(filter),
    WinnerImport.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-quote')
      .lean(),
  ]);

  return {
    items: rows.map(toListItem),
    pagination: buildPaginationMeta({ page, limit, total }),
  };
};

const getImportById = async (id) => {
  if (!mongooseIsValid(id)) {
    throw new AppError('Invalid import id', HTTP_STATUS.BAD_REQUEST);
  }

  const doc = await WinnerImport.findById(id).select('+quote').lean();
  if (!doc) {
    throw new AppError('Winner import not found', HTTP_STATUS.NOT_FOUND);
  }

  return {
    ...toListItem(doc),
    connectorVersion: doc.connectorVersion || '',
    storedFilePath: doc.storedFilePath || null,
    hasAsciiFile: Boolean(doc.storedFilePath),
    quote: doc.quote
      ? {
          fileName: doc.quote.fileName || doc.fileName,
          header: doc.quote.header || {},
          summary: doc.quote.summary || {},
          lines: doc.quote.lines || [],
        }
      : null,
    quoteSummary: doc.quoteSummary,
  };
};

const getAsciiFileForDownload = async (id) => {
  if (!mongooseIsValid(id)) {
    throw new AppError('Invalid import id', HTTP_STATUS.BAD_REQUEST);
  }

  const doc = await WinnerImport.findById(id).lean();
  if (!doc) {
    throw new AppError('Winner import not found', HTTP_STATUS.NOT_FOUND);
  }

  const absolute = resolveStoredAbsolutePath(doc.storedFilePath);
  if (!absolute) {
    throw new AppError('Original ASCII file is not available', HTTP_STATUS.NOT_FOUND);
  }

  const buffer = readStoredAscii(doc.storedFilePath);
  if (!buffer) {
    throw new AppError('Original ASCII file is missing on disk', HTTP_STATUS.NOT_FOUND);
  }

  return {
    fileName: doc.fileName,
    buffer,
    absolutePath: absolute,
  };
};

module.exports = {
  importWinnerFile,
  listImports,
  getImportById,
  getAsciiFileForDownload,
  assertAllowedFile,
  verifySha256,
  getExtension,
  toListItem,
};
