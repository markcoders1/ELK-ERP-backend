const app = require('./app');
const connectDatabase = require('./config/database');
const env = require('./config/env');

const startServer = async () => {
  await connectDatabase();

  app.listen(env.port, () => {
    console.log(`ELK ERP server running on port ${env.port}`);
  });
};

startServer().catch((error) => {
  console.error('Failed to start server:', error.message);
  process.exit(1);
});
