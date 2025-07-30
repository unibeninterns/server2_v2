import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';

const migrateUploads = async (): Promise<void> => {
  try {
    const srcUploadsPath = path.join(process.cwd(), 'src', 'uploads');
    const distUploadsPath = path.join(process.cwd(), 'dist', 'uploads');

    // Check if source uploads directory exists
    if (!fs.existsSync(srcUploadsPath)) {
      logger.info('No src/uploads directory found. Migration not needed.');
      return;
    }

    // Create dist uploads directory if it doesn't exist
    if (!fs.existsSync(distUploadsPath)) {
      fs.mkdirSync(distUploadsPath, { recursive: true });
      logger.info('Created dist/uploads directory');
    }

    const srcDocumentsPath = path.join(srcUploadsPath, 'documents');
    const distDocumentsPath = path.join(distUploadsPath, 'documents');

    if (fs.existsSync(srcDocumentsPath)) {
      // Create documents directory in dist
      if (!fs.existsSync(distDocumentsPath)) {
        fs.mkdirSync(distDocumentsPath, { recursive: true });
        logger.info('Created dist/uploads/documents directory');
      }

      // Copy files from src to dist
      const files = fs.readdirSync(srcDocumentsPath);
      let copiedCount = 0;

      for (const file of files) {
        const srcFilePath = path.join(srcDocumentsPath, file);
        const distFilePath = path.join(distDocumentsPath, file);

        // Only copy if file doesn't exist in destination
        if (!fs.existsSync(distFilePath)) {
          fs.copyFileSync(srcFilePath, distFilePath);
          copiedCount++;
          logger.info(`Copied: ${file}`);
        }
      }

      logger.info(`Migration completed. Copied ${copiedCount} files.`);
    } else {
      logger.info('No src/uploads/documents directory found.');
    }
  } catch (error) {
    logger.error('Migration failed:', error);
    throw error;
  }
};

// Run migration if called directly
if (require.main === module) {
  migrateUploads()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

export default migrateUploads;
