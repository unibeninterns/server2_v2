import { UserRole } from '../../model/user.model';
import Review, { ReviewStatus } from '../models/review.model';
import { UnauthorizedError } from '../../utils/customErrors';
import asyncHandler from '../../utils/asyncHandler';
import logger from '../../utils/logger';

interface IPaginationOptions {
  page: number;
  limit: number;
  sort: Record<string, 1 | -1>;
}

interface AuthenticatedRequest extends Request {
  user: {
    _id: string;
    email?: string;
    role: string;
  };
}

// Get all reviewers with pagination, filtering, and statistics
getAllReviewers = asyncHandler(
  async (req: Request, res: Response<IReviewerResponse>): Promise<void> => {
    const user = (req as AuthenticatedRequest).user;
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
      faculty,
      department,
      sort = 'createdAt',
      order = 'desc',
    } = req.query;

    // Base query to filter only reviewers
    const query: any = {
      role: UserRole.REVIEWER, // Add this filter for reviewers only
    };

    // Apply additional filters if provided
    if (status) query.invitationStatus = status as string;
    if (faculty) query.faculty = faculty as string;
    if (department) query.department = department as string;

    // Build sort object
    const sortObj: Record<string, 1 | -1> = {};
    sortObj[sort as string] = order === 'asc' ? 1 : -1;

    const options: IPaginationOptions = {
      page: parseInt(page as string, 10),
      limit: parseInt(limit as string, 10),
      sort: sortObj,
    };

    const reviewers = await User.find(query)
      .sort(sortObj)
      .skip((options.page - 1) * options.limit)
      .limit(options.limit)
      .populate('faculty', 'title code')
      .populate('department', 'title code')
      .populate({
        path: 'assignedProposals',
        select: 'projectTitle submitter', // Select relevant fields from Proposal
        populate: {
          path: 'submitter',
          select: 'name email', // Select relevant fields from Submitter (User)
        },
      });

    const totalReviewers = await User.countDocuments(query);

    // Get statistics and assigned proposals for each reviewer
    const reviewersWithDetails = await Promise.all(
      reviewers.map(async (reviewer) => {
        // Get assigned reviews (all reviews assigned to this reviewer)
        // This count is based on the Review model, not directly from User.assignedProposals
        const assignedReviewsCount = await Review.countDocuments({
          reviewer: reviewer._id,
        });

        // Get completed reviews
        const completedReviewsCount = await Review.countDocuments({
          reviewer: reviewer._id,
          status: ReviewStatus.COMPLETED,
        });

        // Calculate completion rate
        const completionRate =
          assignedReviewsCount > 0
            ? Math.round((completedReviewsCount / assignedReviewsCount) * 100)
            : 0;

        // Fetch all reviews assigned to this reviewer
        const allAssignedReviews = await Review.find({
          reviewer: reviewer._id,
          reviewType: { $ne: 'ai' }, // Exclude AI reviews if necessary
        }).populate('proposal', 'projectTitle submitterType'); // Populate proposal details for each review

        return {
          ...reviewer.toObject(),
          statistics: {
            assigned: assignedReviewsCount,
            completed: completedReviewsCount,
            completionRate,
          },
          // Include the populated assignedProposals directly
          assignedProposals: reviewer.assignedProposals,
        };
      })
    );

    logger.info(`Admin ${user._id} retrieved reviewers list`);

    res.status(200).json({
      success: true,
      count: reviewers.length,
      totalPages: Math.ceil(totalReviewers / options.limit),
      currentPage: options.page,
      data: reviewersWithDetails,
    });
  }
);
