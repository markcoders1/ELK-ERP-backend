const multer = require('multer');
const path = require('path');
const winnerConnectorService = require('./winnerConnector.service');
const sendApiResponse = require('../../utils/apiResponse');
const asyncHandler = require('../../utils/asyncHandler');
const AppError = require('../../utils/AppError');
const {
  HTTP_STATUS,
  WINNER_CONNECTOR_MAX_FILE_BYTES,
  WINNER_CONNECTOR_ALLOWED_EXTENSIONS,
} = require('../../config/constants');

const allowedName = (filename = '') => {
  const lower = String(filename).toLowerCase();
  return WINNER_CONNECTOR_ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: WINNER_CONNECTOR_MAX_FILE_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!allowedName(file.originalname)) {
      cb(
        new AppError(
          'Upload a Winner ASCII file (.txt, .asc, .ascii, or .e01)',
          HTTP_STATUS.BAD_REQUEST
        )
      );
      return;
    }
    cb(null, true);
  },
});

const uploadMiddleware = (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(
          new AppError('File exceeds the 8MB upload limit', HTTP_STATUS.BAD_REQUEST)
        );
      }
      return next(new AppError(err.message, HTTP_STATUS.BAD_REQUEST));
    }
    return next(
      err.statusCode
        ? err
        : new AppError(err.message || 'Upload failed', HTTP_STATUS.BAD_REQUEST)
    );
  });
};

const importWinnerAscii = asyncHandler(async (req, res) => {
  if (!req.connector) {
    throw new AppError('Connector authentication required', HTTP_STATUS.UNAUTHORIZED);
  }

  const result = await winnerConnectorService.importWinnerFile({
    connector: req.connector,
    file: req.file,
    fileName: req.body?.fileName,
    sha256: req.body?.sha256,
    fileSize: req.body?.fileSize,
    modifiedAt: req.body?.modifiedAt,
    connectorVersion: req.body?.connectorVersion,
  });

  const isDuplicate = result.status === 'already_processed';

  return sendApiResponse(res, {
    message: isDuplicate
      ? 'File already processed (idempotent)'
      : 'Winner ASCII accepted and processed',
    data: result,
    statusCode: isDuplicate ? HTTP_STATUS.OK : HTTP_STATUS.CREATED,
  });
});

const listImports = asyncHandler(async (req, res) => {
  const data = await winnerConnectorService.listImports(req.query);
  return sendApiResponse(res, {
    message: 'Winner imports retrieved',
    data,
    statusCode: HTTP_STATUS.OK,
  });
});

const getImport = asyncHandler(async (req, res) => {
  const data = await winnerConnectorService.getImportById(req.params.id);
  return sendApiResponse(res, {
    message: 'Winner import retrieved',
    data,
    statusCode: HTTP_STATUS.OK,
  });
});

const downloadAscii = asyncHandler(async (req, res) => {
  const file = await winnerConnectorService.getAsciiFileForDownload(req.params.id);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${path.basename(file.fileName).replace(/"/g, '')}"`
  );
  return res.status(HTTP_STATUS.OK).send(file.buffer);
});

module.exports = {
  uploadMiddleware,
  importWinnerAscii,
  listImports,
  getImport,
  downloadAscii,
};
