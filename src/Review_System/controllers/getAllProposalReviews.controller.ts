// Get all reviews for a specific proposal (admin only)
getProposalReviews = asyncHandler(
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

// If my task will require two controllers or just one, evaluate which is better, One to get all proposal that have been have been put under or already reviewed or in reconcilaition
// and it will be ordered by the latest always at the top, meaning I'm just creating a controller(s) so I can be able to get all scores and comment for a proposal,
// if a proposal is assigned to a reviewer the AI score will be processed automatically,
// So when a proposal is under review it already has a score, when It is reviewed by a human it then has two scores which I want to view,
// if it flagged for discrepancy and it is reviewed by a reconciler, it will have three scores.
// Now If it is flagged for discrepancy I want a seperate functionality that will allow me see the proposals flagged for discrepancy only,
//  meaning like a filter for the frontend where there will be an all proposals page where you see all I have described above
// showing all review scores for the respective proposals only when you click on any proposal and then the discrepancy filter that only shows list of proposals with discrepancy
//  and lets you view all the scores and comments including the discrepancy own when clicked just like the all proposals reviews page.
