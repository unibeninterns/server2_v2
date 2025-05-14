import express from 'express';
import researcherController from '../controllers/researcher.controller';
import {
  rateLimiter,
  authenticateResearcherToken,
} from '../../middleware/auth.middleware';

const router = express.Router();

// Apply rate limiting to all researcher endpoints
const researcherRateLimiter = rateLimiter(50, 60 * 60 * 1000); // 50 requests per hour

// Protect all routes with researcher authentication
router.use(authenticateResearcherToken);
router.use(researcherRateLimiter);

// Dashboard route
router.get('/dashboard', researcherController.getResearcherDashboard);

// Get specific proposal details
router.get('/proposals/:proposalId', researcherController.getProposalDetails);

export default router;
