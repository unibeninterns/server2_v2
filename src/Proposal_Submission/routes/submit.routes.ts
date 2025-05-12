import { Router, Request, Response, NextFunction } from 'express';
import submitController from '../controllers/submit.controller';
import multer, { FileFilterCallback, diskStorage } from 'multer';
import path from 'path';
import { rateLimiter } from '../../middleware/auth.middleware';

const router = Router();
const __dirname: string = path.dirname(__filename);

// Configure multer for file uploads
export const storage = diskStorage({
  destination: function (req: Request, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) {
    // Different destinations based on file type
    if (file.fieldname === 'cvFile' || file.fieldname === 'docFile') {
      cb(null, path.join(__dirname, '../uploads/documents/'));
    } else {
      cb(null, path.join(__dirname, '../uploads/'));
    }
  },
  filename: function (req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) {
    cb(null, `${Date.now()}-${path.basename(file.originalname)}`);
  },
});

export const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
) => {
  // Check file types
  if (file.fieldname === 'cvFile' || file.fieldname === 'docFile') {
    // Document files - PDF, DOC, DOCX
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error('Invalid file type. Only PDF, DOC, and DOCX are allowed.'),
        false
      );
    }
  } else {
    cb(null, true);
  }
};

export const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter,
});

const documentUpload = upload.fields([
  { name: 'cvFile', maxCount: 1 },
  { name: 'docFile', maxCount: 1 },
]);

// Apply rate limiting to all submission endpoints
const submissionRateLimiter = rateLimiter(10, 60 * 60 * 1000); // 10 requests per hour

// Staff proposal submission route
router.post(
  '/staff-proposal',
  submissionRateLimiter,
  documentUpload,
  submitController.submitStaffProposal
);

// Master student proposal submission route
router.post(
  '/master-proposal',
  submissionRateLimiter,
  documentUpload,
  submitController.submitMasterStudentProposal
);

// Get user's proposals by email
router.get('/proposals/email/:email', submitController.getUserProposalsByEmail);

// Get proposal by ID
router.get('/proposal/:id', submitController.getProposalById);

export default router;