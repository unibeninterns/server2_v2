import { Router } from 'express';
import submitRoutes from '../Proposal_Submission/routes/submit.routes';
import facultyRoutes from '../Proposal_Submission/routes/faculty.routes';
import departmentRoutes from '../Proposal_Submission/routes/department.routes';
import adminRoutes from './admin.routes';
import authRoutes from './auth.routes';
import researcherRoutes from '../researchers/routes/index';
import reviewerRoutes from '../Reviewers/routes/reviewer.routes';
import reviewSystemRoutes from '../Review_System/routes/review.routes';

const router = Router();

// Mount route groups
router.use('/submit', submitRoutes);
router.use('/faculties', facultyRoutes);
router.use('/departments', departmentRoutes);
router.use('/admin', adminRoutes);
router.use('/auth', authRoutes);
router.use('/', researcherRoutes);
router.use('/reviewer', reviewerRoutes);
router.use('/reviewsys', reviewSystemRoutes);

// Root route
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'UNIBEN Research Submission Portal API is running',
  });
});

export default router;
