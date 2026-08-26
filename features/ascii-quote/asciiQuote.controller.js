const multer = require('multer');
const asciiQuoteService = require('./asciiQuote.service');
const sendApiResponse = require('../../utils/apiResponse');
const asyncHandler = require('../../utils/asyncHandler');
const AppError = require('../../utils/AppError');
const { HTTP_STATUS } = require('../../config/constants');

const MAX_ASCII_BYTES = 8 * 1024 * 1024;

const allowedName = (filename = '') => {
  const lower = String(filename).toLowerCase();
  return ['.txt', '.asc', '.ascii'].some((ext) => lower.endsWith(ext));
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ASCII_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!allowedName(file.originalname)) {
      cb(
        new AppError(
          'Upload a Winner ASCII file (.txt, .asc, or .ascii)',
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

const quoteAscii = asyncHandler(async (req, res) => {
  if (!req.file?.buffer) {
    throw new AppError('ASCII file is required', HTTP_STATUS.BAD_REQUEST);
  }

  const text = req.file.buffer.toString('utf8');
  const quote = await asciiQuoteService.quoteAsciiDesign(text, {
    role: req.user?.role,
  });

  return sendApiResponse(res, {
    message:
      'Design parsed. Winner prices were ignored; matched lines use ELK catalogue / Hardware Master.',
    data: {
      fileName: req.file.originalname,
      ...quote,
    },
    statusCode: HTTP_STATUS.OK,
  });
});

module.exports = {
  uploadMiddleware,
  quoteAscii,
};
