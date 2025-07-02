import { Router, Request } from 'express';
import submitFullProposalController from '../controllers/submitFullProposal.controller';
import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import { rateLimiter } from '../../middleware/auth.middleware';

const router = Router();

// Configure multer for full proposal document uploads
const storage = multer.diskStorage({
  destination: function (
    _req: Request,
    file: Express.Multer.File,
    cb: (error: Error | null, destination: string) => void
  ) {
    cb(
      null,
      path.join(process.cwd(), 'src', 'uploads', 'documents', 'fullproposals')
    );
  },
  filename: function (
    _req: Request,
    file: Express.Multer.File,
    cb: (error: Error | null, filename: string) => void
  ) {
    cb(null, `fullproposal-${Date.now()}-${path.basename(file.originalname)}`);
  },
});

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
) => {
  // Only allow PDF, DOC, DOCX files
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error('Invalid file type. Only PDF, DOC, and DOCX files are allowed.')
    );
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit for full proposals
  },
  fileFilter,
});

const documentUpload = upload.fields([{ name: 'docFile', maxCount: 1 }]);

// Apply rate limiting to submission endpoints
const submissionRateLimiter = rateLimiter(5, 60 * 60 * 1000); // 5 requests per hour

// Submit full proposal
router.post(
  '/submit-full-proposal',
  submissionRateLimiter,
  documentUpload,
  submitFullProposalController.submitFullProposal
);

// Check if user can submit full proposal
router.get(
  '/can-submit/:proposalId',
  submitFullProposalController.canSubmitFullProposal
);

export default router;
