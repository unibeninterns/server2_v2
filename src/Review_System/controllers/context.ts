// frontend api.ts to use as context

export const getProposalsForDecision = async (params?: {
  page?: number;
  limit?: number;
  faculty?: string;
  sort?: string;
  order?: "asc" | "desc";
}): Promise<{
  success: boolean;
  data: ProposalDecision[];
  count: number;
  totalPages: number;
  currentPage: number;
}> => {
  const queryParams = new URLSearchParams();

  if (params?.page) queryParams.append("page", params.page.toString());
  if (params?.limit) queryParams.append("limit", params.limit.toString());
  if (params?.faculty) queryParams.append("faculty", params.faculty);
  if (params?.sort) queryParams.append("sort", params.sort);
  if (params?.order) queryParams.append("order", params.order);

  try {
    const response = await api.get("/admin/decisions/proposals-for-decision", {
      params: queryParams,
    });
    return response.data;

    // context for the faculty filtering: 

    const page = parseInt((req.query.page || '1').toString());
          const limit = parseInt((req.query.limit || '10').toString());
          const skip = (page - 1) * limit;
          const { status, faculty, discrepancy } = req.query;
    
          // Build aggregation pipeline
          const pipeline: any[] = [
            // Match proposals that have at least one review
            {
              $lookup: {
                from: 'Reviews',
                localField: '_id',
                foreignField: 'proposal',
                as: 'reviews',
              },
            },
            {
              $match: {
                'reviews.0': { $exists: true }, // Has at least one review
              },
            },
            // Populate submitter details
            {
              $lookup: {
                from: 'Users_2',
                localField: 'submitter',
                foreignField: '_id',
                as: 'submitterDetails',
              },
            },
            {
              $unwind: '$submitterDetails',
            },
            // Populate faculty details
            {
              $lookup: {
                from: 'faculties',
                localField: 'submitterDetails.faculty',
                foreignField: '_id',
                as: 'facultyDetails',
              },
            },
            {
              $unwind: {
                path: '$facultyDetails',
                preserveNullAndEmptyArrays: true,
              },
            },
            // Populate department details
            {
              $lookup: {
                from: 'departments',
                localField: 'submitterDetails.department',
                foreignField: '_id',
                as: 'departmentDetails',
              },
            },
            {
              $unwind: {
                path: '$departmentDetails',
                preserveNullAndEmptyArrays: true,
              },
            },
            // Add computed fields
            {
              $addFields: {
                totalReviews: { $size: '$reviews' },
                completedReviews: {
                  $size: {
                    $filter: {
                      input: '$reviews',
                      as: 'review',
                      cond: { $eq: ['$$review.status', 'completed'] },
                    },
                  },
                },
                hasReconciliation: {
                  $gt: [
                    {
                      $size: {
                        $filter: {
                          input: '$reviews',
                          as: 'review',
                          cond: { $eq: ['$$review.reviewType', 'reconciliation'] },
                        },
                      },
                    },
                    0,
                  ],
                },
                // Calculate review status
                currentStatus: {
                  $cond: {
                    if: {
                      $and: [
                        {
                          $gt: [
                            {
                              $size: {
                                $filter: {
                                  input: '$reviews',
                                  as: 'review',
                                  cond: {
                                    $and: [
                                      {
                                        $eq: [
                                          '$$review.reviewType',
                                          'reconciliation',
                                        ],
                                      },
                                      { $eq: ['$$review.status', 'completed'] },
                                    ],
                                  },
                                },
                              },
                            },
                            0,
                          ],
                        },
                      ],
                    },
                    then: 'reviewed',
                    else: {
                      $cond: {
                        if: { $eq: ['$reviewStatus', 'reviewed'] },
                        then: 'reviewed',
                        else: 'under_review',
                      },
                    },
                  },
                },
                // Check for discrepancy
                hasDiscrepancy: {
                  $cond: {
                    if: {
                      $gt: [
                        {
                          $size: {
                            $filter: {
                              input: '$reviews',
                              as: 'review',
                              cond: {
                                $and: [
                                  {
                                    $eq: ['$$review.reviewType', 'reconciliation'],
                                  },
                                  { $eq: ['$$review.status', 'completed'] },
                                ],
                              },
                            },
                          },
                        },
                        0,
                      ],
                    },
                    then: false, // Only if reconciliation review is completed
                    else: {
                      // ...existing discrepancy calculation logic...
                      $let: {
                        vars: {
                          completedNonReconciliation: {
                            $filter: {
                              input: '$reviews',
                              as: 'review',
                              cond: {
                                $and: [
                                  { $eq: ['$$review.status', 'completed'] },
                                  {
                                    $ne: ['$$review.reviewType', 'reconciliation'],
                                  },
                                ],
                              },
                            },
                          },
                        },
                        in: {
                          $cond: {
                            if: {
                              $gte: [{ $size: '$$completedNonReconciliation' }, 2],
                            },
                            then: {
                              $let: {
                                vars: {
                                  scores: {
                                    $map: {
                                      input: '$$completedNonReconciliation',
                                      as: 'review',
                                      in: '$$review.totalScore',
                                    },
                                  },
                                },
                                in: {
                                  $let: {
                                    vars: {
                                      avg: { $avg: '$$scores' },
                                      max: { $max: '$$scores' },
                                      min: { $min: '$$scores' },
                                    },
                                    in: {
                                      $gt: [
                                        {
                                          $max: [
                                            { $subtract: ['$$max', '$$avg'] },
                                            { $subtract: ['$$avg', '$$min'] },
                                          ],
                                        },
                                        { $multiply: ['$$avg', 0.2] },
                                      ],
                                    },
                                  },
                                },
                              },
                            },
                            else: false,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          ];
    
          // Apply filters
          const matchConditions: any = {};
    
          if (status) {
            matchConditions.currentStatus = status;
          }
    
          if (faculty) {
            matchConditions['facultyDetails._id'] = new mongoose.Types.ObjectId(
              faculty.toString()
            );
          }

          // extra context incase it helps:

          // Add faculty filter logic (existing code)
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