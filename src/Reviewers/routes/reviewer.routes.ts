import express from 'express';
import reviewerController from '../controllers/reviewer.controller';
import {
  authenticateAdminToken,
  authenticateReviewerToken,
} from '../../middleware/auth.middleware';
import validateRequest from '../../middleware/validateRequest';
import { z } from 'zod';

const router = express.Router();

// Validation schemas
const inviteReviewerSchema = z.object({
  body: z.object({
    email: z.string().email('Please provide a valid email address'),
  }),
});

const completeProfileSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    facultyId: z.string().min(1, 'Faculty is required'),
    departmentId: z.string().min(1, 'Department is required'),
    phoneNumber: z.string().min(10, 'Please provide a valid phone number'),
    academicTitle: z.string().optional(),
    alternativeEmail: z
      .string()
      .email('Please provide a valid email address')
      .optional(),
  }),
  params: z.object({
    token: z.string().min(1, 'Token is required'),
  }),
});

const addReviewerSchema = z.object({
  body: z.object({
    email: z.string().email('Please provide a valid email address'),
    name: z.string().min(2, 'Name must be at least 2 characters'),
    facultyId: z.string().min(1, 'Faculty is required'),
    departmentId: z.string().min(1, 'Department is required'),
    phoneNumber: z.string().min(10, 'Please provide a valid phone number'),
    academicTitle: z.string().optional(),
    alternativeEmail: z
      .string()
      .email('Please provide a valid email address')
      .optional(),
  }),
});

// Admin routes - need admin authentication
router.post(
  '/invite',
  authenticateAdminToken,
  validateRequest(inviteReviewerSchema),
  reviewerController.inviteReviewer
);

router.post(
  '/add',
  authenticateAdminToken,
  validateRequest(addReviewerSchema),
  reviewerController.addReviewerProfile
);

router.get(
  '/invitations',
  authenticateAdminToken,
  reviewerController.getInvitations
);

// Reviewer dashboard - needs reviewer authentication
router.get(
  '/dashboard',
  authenticateReviewerToken,
  reviewerController.getReviewerDashboard
);

router.get('/', authenticateAdminToken, reviewerController.getAllReviewers);

router.get('/:id', authenticateAdminToken, reviewerController.getReviewerById);

router.delete(
  '/:id',
  authenticateAdminToken,
  reviewerController.deleteReviewer
);

router.post(
  '/:id/resend-invitation',
  authenticateAdminToken,
  reviewerController.resendInvitation
);

// Public route for profile completion
router.post(
  '/complete-profile/:token',
  validateRequest(completeProfileSchema),
  reviewerController.completeReviewerProfile
);

export default router;
