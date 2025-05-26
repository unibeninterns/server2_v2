import mongoose from 'mongoose';
import agenda from './config/agenda';
import logger from './utils/logger';
import dotenv from 'dotenv';

dotenv.config();

async function startWorker() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI not set in environment.');
  }

  // Connect Mongoose (for Proposal and Review models)
  await mongoose.connect(mongoUri);
  logger.info('Mongoose connected in worker.');

  // Start Agenda after DB connection
  await agenda.start();
  logger.info('Agenda worker started and listening for jobs...');
}

startWorker().catch(err => {
  logger.error('Error starting Agenda worker:', err);
  process.exit(1);
});
