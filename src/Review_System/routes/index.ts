import { Router } from 'express';
import assignReviewRoutes from './assignReview.routes';
import reconciliationRoutes from './reconciliation.routes';
import reviewRoutes from './review.routes';

const router = Router();

// Mount route groups
router.use('/', assignReviewRoutes);
router.use('/', reconciliationRoutes);
router.use('/', reviewRoutes);

export default router;
