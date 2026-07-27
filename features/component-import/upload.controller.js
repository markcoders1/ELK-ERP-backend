const multer = require('multer');
const uploadService = require('./upload.service');
const sendResponse = require('../../utils/apiResponse');
const asyncHandler = require('../../utils/asyncHandler');
const AppError = require('../../utils/AppError');
const { HTTP_STATUS, IMPORT_MAX_FILE_BYTES } = require('../../config/constants');
const { assertAllowedWorkbook } = require('../hardware-import/excel.parser');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: IMPORT_MAX_FILE_BYTES,
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    try {
      assertAllowedWorkbook(file.originalname);
      cb(null, true);
    } catch (error) {
      cb(error);
    }
  },
});

const uploadMiddleware = (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError('File exceeds the 20MB upload limit', HTTP_STATUS.BAD_REQUEST));
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

const uploadWorkbook = asyncHandler(async (req, res) => {
  const sheetIndex =
    req.body.sheetIndex !== undefined && req.body.sheetIndex !== ''
      ? Number(req.body.sheetIndex)
      : undefined;

  const result = await uploadService.processUpload({
    file: req.file,
    user: req.user,
    batchName: req.body.batchName,
    sheetName: req.body.sheetName,
    sheetIndex: Number.isFinite(sheetIndex) ? sheetIndex : undefined,
  });

  return sendResponse(res, {
    message: 'Component workbook uploaded and preview ready',
    data: result,
    statusCode: HTTP_STATUS.CREATED,
  });
});

const getPreview = asyncHandler(async (req, res) => {
  const result = await uploadService.getPreview(req.params.batchId, req.query);

  return sendResponse(res, {
    message: 'Import preview fetched successfully',
    data: result,
    statusCode: HTTP_STATUS.OK,
  });
});

const confirmImport = asyncHandler(async (req, res) => {
  const batch = await uploadService.confirmImport(req.params.batchId, req.body, req.user);

  return sendResponse(res, {
    message: 'Component import completed',
    data: { batch },
    statusCode: HTTP_STATUS.OK,
  });
});

const cancelImport = asyncHandler(async (req, res) => {
  const batch = await uploadService.cancelImport(req.params.batchId, req.user);

  return sendResponse(res, {
    message: 'Import cancelled',
    data: { batch },
    statusCode: HTTP_STATUS.OK,
  });
});

const listBatches = asyncHandler(async (req, res) => {
  const result = await uploadService.listBatches(req.query);

  return sendResponse(res, {
    message: 'Import batches fetched successfully',
    data: result,
    statusCode: HTTP_STATUS.OK,
  });
});

const getBatch = asyncHandler(async (req, res) => {
  const batch = await uploadService.getBatchById(req.params.batchId);

  return sendResponse(res, {
    message: 'Import batch fetched successfully',
    data: { batch },
    statusCode: HTTP_STATUS.OK,
  });
});

module.exports = {
  uploadMiddleware,
  uploadWorkbook,
  getPreview,
  confirmImport,
  cancelImport,
  listBatches,
  getBatch,
};
