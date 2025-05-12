import { Router } from 'express';
import authController from '../controllers/auth.controller';
import {
  rateLimiter,
  authenticateToken,
} from '../middleware/auth.middleware.js';

const router = Router();

const standardLimit = rateLimiter(20, 60 * 60 * 1000);

router.post('/admin-login', standardLimit, authController.adminLogin);
router.post('/refresh-token', standardLimit, authController.refreshToken);
router.post('/logout', authController.logout);

// Token verification route - protected by auth middleware
router.get('/verify-token', authenticateToken, authController.verifyToken);

export default router;
