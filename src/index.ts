import app from './app';
import connectDB from './db/database';
import logger from './utils/logger';
import validateEnv from './utils/validateEnv';
import path from 'path';
import fs from 'fs';
import type { AddressInfo } from 'net';

const __dirname: string = path.dirname(__filename);
const uploadsDir = path.join(__dirname, 'uploads');
const documentsUploadDir = path.join(uploadsDir, 'documents');

// Create directories if they don't exist
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  logger.info(`Uploads directory created: ${uploadsDir}`);
}

[documentsUploadDir].forEach((dir: string) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    logger.info(`Directory created: ${dir}`);
  }
});

validateEnv();

const PORT: number = parseInt(process.env.PORT || '3000', 10);

const startServer = async (): Promise<void> => {
  try {
    await connectDB();
    const server = app.listen(PORT, () => {
      const { port } = server.address() as AddressInfo;
      logger.info(
        `Server running in ${process.env.NODE_ENV} mode on port ${port}`
      );
    });
  } catch (error: unknown) {
    logger.error('Failed to start server:', error instanceof Error ? error : String(error));
    process.exit(1);
  }
};

startServer();