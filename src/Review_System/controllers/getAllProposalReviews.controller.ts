// Get all reviews for a specific proposal (admin only)
getAllProposalReviews = asyncHandler(
  async (
    req: GetProposalReviewRequest,
    res: Response<IReviewResponse>
  ): Promise<void> => {
    const { proposalId } = req.params;

    const reviews = await Review.find({
      proposal: proposalId,
    })
      .populate('reviewer', 'name email faculty department')
      .sort({ createdAt: 1 });

    res.status(200).json({
      success: true,
      count: reviews.length,
      data: reviews,
    });
  }
);

// To be used as context
// Get all proposals with pagination and filtering
getAllProposals = asyncHandler(
  async (req: Request, res: Response<IProposalResponse>): Promise<void> => {
    const user = (req as AdminAuthenticatedRequest).user;
    // Check if user is admin
    if (user.role !== 'admin') {
      throw new UnauthorizedError(
        'You do not have permission to access this resource'
      );
    }

    const {
      page = 1,
      limit = 10,
      status,
      submitterType,
      faculty,
      sort = 'createdAt',
      order = 'desc',
      isArchived, // Add this new query parameter
    } = req.query;

    const query: IProposalQuery = {};

    // Apply filters if provided
    if (status) query.status = status as string;
    if (submitterType) query.submitterType = submitterType as string;
    // Apply isArchived filter
    if (isArchived !== undefined) {
      query.isArchived = isArchived === 'true'; // Convert string to boolean
    } else {
      query.isArchived = false; // Default to fetching non-archived proposals
    }

    // Build sort object
    const sortObj: Record<string, 1 | -1> = {};
    sortObj[sort as string] = order === 'asc' ? 1 : -1;

    const options: IPaginationOptions = {
      page: parseInt(page as string, 10),
      limit: parseInt(limit as string, 10),
      sort: sortObj,
    };

    // Add faculty filter logic
    let proposals;

    if (faculty) {
      // Since faculty is stored in the User model, we need to first find users with the specified faculty
      const usersWithFaculty = await User.find({
        faculty: faculty as string,
      }).select('_id');
      const userIds = usersWithFaculty.map((user) => user._id);

      // Then find proposals submitted by those users
      proposals = await Proposal.find({
        ...query,
        submitter: { $in: userIds },
      })
        .sort({ [sort as string]: order === 'asc' ? 1 : -1 })
        .skip(
          (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10)
        )
        .limit(parseInt(limit as string, 10))
        .populate(
          'submitter',
          'name email userType phoneNumber alternativeEmail'
        );

      // Count total for pagination
      const totalProposals = await Proposal.countDocuments({
        ...query,
        submitter: { $in: userIds },
      });

      logger.info(
        `Admin ${user.id} retrieved proposals list filtered by faculty`
      );

      res.status(200).json({
        success: true,
        count: proposals.length,
        totalPages: Math.ceil(totalProposals / parseInt(limit as string, 10)),
        currentPage: parseInt(page as string, 10),
        data: proposals,
      });
    } else {
      const proposals = await Proposal.find(query)
        .sort(sortObj)
        .skip((options.page - 1) * options.limit)
        .limit(options.limit)
        .populate(
          'submitter',
          'name email userType phoneNumber alternativeEmail'
        );

      const totalProposals = await Proposal.countDocuments(query);

      logger.info(`Admin ${user.id} retrieved proposals list`);

      res.status(200).json({
        success: true,
        count: proposals.length,
        totalPages: Math.ceil(totalProposals / options.limit),
        currentPage: options.page,
        data: proposals,
      });
    }
  }
);
// The way imtegrating APi's looks like in my Api.ts file in the frontend, to be used as context so you'll send something following similar structure for the controller(S) you create

export const getProposals = async (params = {}) => {
  try {
    const response = await api.get('/admin/proposals', { params });
    return response.data;
  } catch (error) {
    console.error('Error fetching proposals:', error);
    throw error;
  }
};

export const getProposalById = async (id: string) => {
  try {
    const response = await api.get(`/admin/proposals/${id}`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching proposal with ID ${id}:`, error);
    throw error;
  }
};
