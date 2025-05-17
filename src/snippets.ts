// Authenticate researcher access token
const authenticateResearcherToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) {
      throw new UnauthorizedError('Access token required');
    }

    const payload = (await tokenService.verifyAccessToken(
      token
    )) as UserPayload;
    const user = await User.findById(payload.userId);

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    if (user.role !== 'researcher') {
      throw new ForbiddenError('Access denied: Researcher privileges required');
    }

    if (!user.isActive) {
      throw new UnauthorizedError('Your account is not active');
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

// To be used in the authenticateToken middleware
if (user.role === 'researcher' && !user.isActive) {
  throw new UnauthorizedError('Your account is not active');
}

// this would be used as a controller in the admin controller file
// Update proposal status

type ProposalStatus =
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'revision_requested';

updateProposalStatus = asyncHandler(
  async (
    req: AdminAuthenticatedRequest,
    res: Response<IProposalResponse>
  ): Promise<void> => {
    const { id } = req.params;
    const { status, comment } = req.body;

    // Check if user is admin
    if (req.user.role !== 'admin') {
      throw new UnauthorizedError(
        'You do not have permission to perform this action'
      );
    }

    // Valid status values
    const validStatuses: ProposalStatus[] = [
      'submitted',
      'under_review',
      'approved',
      'rejected',
      'revision_requested',
    ];

    if (!validStatuses.includes(status as ProposalStatus)) {
      throw new BadRequestError('Invalid status value');
    }

    const proposal = await Proposal.findById(id).populate('submitter');

    if (!proposal) {
      throw new NotFoundError('Proposal not found');
    }

    // Update proposal status
    proposal.status = status as ProposalStatus;
    await proposal.save();

    // Send email notification to the submitter if email service is available
    try {
      if (proposal.submitter && proposal.submitter.email) {
        await emailService.sendProposalStatusUpdateEmail(
          proposal.submitter.email,
          proposal.submitter.name || 'Researcher',
          proposal.projectTitle || 'Your proposal',
          status
        );
      }
    } catch (error) {
      logger.error(
        'Failed to send status update email:',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }

    logger.info(
      `Proposal ${id} status updated to ${status} by admin ${req.user.id}`
    );

    res.status(200).json({
      success: true,
      message: `Proposal status updated to ${status}`,
      data: { proposalId: proposal._id, status: proposal.status },
    });
  }
);

// It'll be used in the admin routes file
// Update proposal status
router.put(
  '/proposals/:id/status',
  authenticateAdminToken,
  adminRateLimiter,
  validateRequest(proposalStatusUpdateSchema),
  adminController.updateProposalStatus
);

#### 3.3.3 Future AI Scoring Capabilities (Design Only)

- Document structure for integration with NLP models
- Scoring based on TETFund's evaluation criteria
- Pattern for explanation generation for each score
- Framework for bias detection and mitigation
- System for model performance monitoring