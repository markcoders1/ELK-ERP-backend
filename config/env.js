require('dotenv').config();

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/elk-erp',
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  cookieName: process.env.COOKIE_NAME || 'elk_erp_token',
  /** Public health URL for Render keep-alive, e.g. https://your-app.onrender.com/api/health */
  keepAliveUrl: process.env.KEEP_ALIVE_URL || '',
  /** Render sets this automatically on their platform */
  renderExternalUrl: process.env.RENDER_EXTERNAL_URL || '',
  keepAliveIntervalMs: Number(process.env.KEEP_ALIVE_INTERVAL_MS) || 10 * 60 * 1000,
  keepAliveEnabled:
    process.env.KEEP_ALIVE_ENABLED === 'true'
      ? true
      : process.env.KEEP_ALIVE_ENABLED === 'false'
        ? false
        : undefined,
};

if (!env.jwtSecret) {
  throw new Error('JWT_SECRET is required. Copy server/.env.example to server/.env and set it.');
}

module.exports = env;
