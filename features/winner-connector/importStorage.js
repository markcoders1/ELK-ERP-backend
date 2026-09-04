const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const UPLOADS_ROOT = path.join(__dirname, '..', '..', 'uploads');
const IMPORTS_SUBDIR = 'winner-imports';

const sanitizeFileName = (fileName = '') => {
  const base = path.basename(String(fileName)).replace(/[^\w.\- ()[\]]+/g, '_');
  return base || 'winner-export.asc';
};

const ensureImportsRoot = () => {
  const root = path.join(UPLOADS_ROOT, IMPORTS_SUBDIR);
  fs.mkdirSync(root, { recursive: true });
  return root;
};

/**
 * Persist ASCII bytes under uploads/winner-imports/<importId>/<safeName>
 * Returns path relative to uploads/ for DB storage.
 */
const saveImportAsciiFile = (importId, fileName, buffer) => {
  const safeName = sanitizeFileName(fileName);
  const dir = path.join(ensureImportsRoot(), String(importId));
  fs.mkdirSync(dir, { recursive: true });
  const absolute = path.join(dir, safeName);
  fs.writeFileSync(absolute, buffer);
  return path.join(IMPORTS_SUBDIR, String(importId), safeName);
};

const resolveStoredAbsolutePath = (storedFilePath) => {
  if (!storedFilePath) return null;
  const absolute = path.join(UPLOADS_ROOT, storedFilePath);
  const normalizedRoot = path.resolve(UPLOADS_ROOT);
  const normalizedFile = path.resolve(absolute);
  if (!normalizedFile.startsWith(normalizedRoot + path.sep) && normalizedFile !== normalizedRoot) {
    return null;
  }
  return normalizedFile;
};

const readStoredAscii = (storedFilePath) => {
  const absolute = resolveStoredAbsolutePath(storedFilePath);
  if (!absolute || !fs.existsSync(absolute)) {
    return null;
  }
  return fs.readFileSync(absolute);
};

const newImportId = () => new mongoose.Types.ObjectId();

module.exports = {
  UPLOADS_ROOT,
  sanitizeFileName,
  saveImportAsciiFile,
  resolveStoredAbsolutePath,
  readStoredAscii,
  newImportId,
};
