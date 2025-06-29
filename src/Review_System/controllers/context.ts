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