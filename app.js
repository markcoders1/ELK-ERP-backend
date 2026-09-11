const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const env = require('./config/env');
const apiRoutes = require('./routes');
const errorHandler = require('./middlewares/errorHandler');
const { isAllowedCorsOrigin } = require('./features/hardware-excel-sync/excelSync.cors');

const app = express();

app.use(
  helmet({
    // Required for Excel Online / Office Scripts cross-origin fetch to this API.
    // Default helmet CORP "same-origin" causes browser "Failed to fetch".
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

/**
 * Office Scripts docs: ACAO must often be `*` because the runtime Origin can change.
 * Apply only to Excel Sync (Bearer auth, no cookies) — do not open cookie-auth routes.
 * @see https://learn.microsoft.com/en-us/office/dev/scripts/develop/external-calls
 */
app.use('/api/hardware-excel-sync', (req, res, next) => {
  cors({
    origin: '*',
    methods: ['POST', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-Id',
      'Idempotency-Key',
    ],
    credentials: false,
  })(req, res, next);
});

/**
 * CORS: web client + Office Scripts hosts for the rest of the API.
 */
app.use(
  cors({
    origin: (origin, callback) => {
      callback(null, isAllowedCorsOrigin(origin));
    },
    credentials: true,
  })
);
app.use(morgan(env.nodeEnv === 'development' ? 'dev' : 'combined'));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use('/api', apiRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    data: null,
    errors: null,
  });
});

app.use(errorHandler);

module.exports = app;
