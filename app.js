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

app.use(helmet());
/**
 * CORS: web client + Office Scripts hosts (Excel Sync uses Bearer, not cookies).
 * Office Scripts runtime Origin is not a fixed single value — see FEATURE_README.
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
