import { Router } from 'express';
import researcherRoutes from './researcher.routes';
import fullProposalRoutes from './submitFullProposal.routes';

const router = Router();

router.use('/researcher', researcherRoutes);
router.use('/', fullProposalRoutes);

export default router;
