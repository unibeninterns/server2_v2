import agenda from './config/agenda';
import logger from './utils/logger'; // Assuming you have a logger utility

async function startWorker() {
  await agenda.start();
  logger.info('Agenda worker started and listening for jobs...');
}

startWorker().catch(err => {
  logger.error('Error starting Agenda worker:', err);
  process.exit(1);
});
