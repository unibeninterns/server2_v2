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