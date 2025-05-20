getProposalDetails = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const user = (req as ResearcherAuthenticatedRequest).user;

      const userId = user._id;
      const { proposalId } = req.params;

      // Find the proposal and verify ownership
      const proposal = await Proposal.findById(proposalId);

      // for the assignReview controller
      assignReviewers = asyncHandler(
          async (
            req: Request<{ proposalId: string }>,
            res: Response<IAssignReviewResponse>
          ): Promise<void> => {
            const { proposalId } = req.params;

            // another
            