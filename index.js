const app = require('./app');
const connectDatabase = require('./config/database');
const env = require('./config/env');
const { startKeepAlive } = require('./utils/keepAlive');

const startServer = async () => {
  await connectDatabase();

  app.listen(env.port, () => {
    console.log(`ELK ERP server running on port ${env.port}`);
    startKeepAlive(env);
  });
};

startServer().catch((error) => {
  console.error('Failed to start server:', error.message);
  process.exit(1);
});
