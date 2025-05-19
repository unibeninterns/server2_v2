// Update to submitReview controller in review.controller.ts
submitReview = asyncHandler(
  async (
    req: Request<{ id: string }, {}, ISubmitReviewRequest>,
    res: Response<IReviewResponse>
  ): Promise<void> => {
    const { id } = req.params;
    const reviewerId = req.user.id;
    const { scores, comments } = req.body;

    // Find review and check permission
    const review = await Review.findOne({
      _id: id,
      reviewer: reviewerId,
      status: { $ne: ReviewStatus.COMPLETED },
    });

    if (!review) {
      throw new NotFoundError(
        'Review not found, unauthorized, or already completed'
      );
    }

    // Update review with submission
    review.scores = scores;
    review.comments = comments;
    review.status = ReviewStatus.COMPLETED;
    review.completedAt = new Date();

    await review.save();

    // Check if proposal is already in reconciliation
    const reconciliationReview = await Review.findOne({
      proposal: review.proposal,
      reviewType: ReviewType.RECONCILIATION,
    });

    if (
      reconciliationReview &&
      reconciliationReview.status === ReviewStatus.COMPLETED
    ) {
      // Process the completed reconciliation review
      try {
        // Call processReconciliationReview logic directly
        const proposal = await Proposal.findById(review.proposal);
        if (!proposal) {
          throw new NotFoundError('Proposal not found');
        }

        // Get all reviews for this proposal
        const allReviews = await Review.find({
          proposal: review.proposal,
        });

        // Calculate final score with reconciliation review weighted higher
        const regularReviews = allReviews.filter(
          (r) => r.reviewType !== ReviewType.RECONCILIATION
        );
        const regularAvg =
          regularReviews.reduce((sum, r) => sum + r.totalScore, 0) /
          regularReviews.length;

        // Final score: 60% reconciliation review + 40% average of regular reviews
        const finalScore =
          reconciliationReview.totalScore * 0.6 + regularAvg * 0.4;

        // Update proposal status
        proposal.reviewStatus = 'reviewed';
        await proposal.save();

        // Create or update award record
        let award = await Award.findOne({ proposal: proposal._id });

        if (award) {
          award.finalScore = finalScore;
          award.feedbackComments =
            'Your proposal has been reviewed after reconciliation. Final decision pending.';
        } else {
          award = new Award({
            proposal: proposal._id,
            submitter: proposal.submitter,
            finalScore: finalScore,
            status: AwardStatus.PENDING,
            fundingAmount: proposal.estimatedBudget || 0,
            feedbackComments:
              'Your proposal has been reviewed after reconciliation. Final decision pending.',
          });
        }

        await award.save();
      } catch (error) {
        logger.error('Error processing reconciliation review:', error);
      }
    } else {
      // Update proposal's review status if all regular reviews are complete
      const allReviews = await Review.find({
        proposal: review.proposal,
        reviewType: { $ne: 'reconciliation' },
      });

      const allCompleted = allReviews.every(
        (r) => r.status === ReviewStatus.COMPLETED
      );

      if (allCompleted) {
        // Always generate discrepancy details for analytical purposes
        try {
          // Get discrepancy details logic
          const reviews = await Review.find({
            proposal: review.proposal,
            reviewType: { $ne: ReviewType.RECONCILIATION },
          });

          // Calculate discrepancy for each criterion (similar to getDiscrepancyDetails)
          const criteriaNames = [
            'relevanceToNationalPriorities',
            'originalityAndInnovation',
            'clarityOfResearchProblem',
            'methodology',
            'literatureReview',
            'teamComposition',
            'feasibilityAndTimeline',
            'budgetJustification',
            'expectedOutcomes',
            'sustainabilityAndScalability',
          ];

          const discrepancyAnalysis = criteriaNames.map((criterion) => {
            const scores = reviews.map(
              (r) => r.scores[criterion as keyof typeof r.scores] as number
            );
            const max = Math.max(...scores);
            const min = Math.min(...scores);
            const avg =
              scores.reduce((sum, score) => sum + score, 0) / scores.length;

            return {
              criterion,
              percentDifference: ((max - min) / avg) * 100,
            };
          });

          // Calculate overall score discrepancy
          const totalScores = reviews.map((r) => r.totalScore);
          const maxTotal = Math.max(...totalScores);
          const minTotal = Math.min(...totalScores);
          const avgScore =
            totalScores.reduce((sum, score) => sum + score, 0) /
            totalScores.length;
          const overallDiscrepancyPercentage =
            ((maxTotal - minTotal) / avgScore) * 100;

          // Log the discrepancy analysis for all reviews
          logger.info(`Discrepancy analysis for proposal ${review.proposal}:`, {
            overallDiscrepancyPercentage,
            criteriaWithHighestDiscrepancies: discrepancyAnalysis
              .sort((a, b) => b.percentDifference - a.percentDifference)
              .slice(0, 3),
          });

          // Check for discrepancies that require reconciliation
          const discrepancyThreshold = avgScore * 0.2;
          const hasDiscrepancy = totalScores.some(
            (score) => Math.abs(score - avgScore) > discrepancyThreshold
          );

          if (hasDiscrepancy && !reconciliationReview) {
            // If there's a discrepancy, initiate reconciliation process
            logger.info(
              `Discrepancy detected for proposal ${review.proposal}. Initiating reconciliation.`
            );

            // Call checkReviewDiscrepancies logic directly
            // Find all completed reviews for this proposal
            const reviews = await Review.find({
              proposal: review.proposal,
              status: ReviewStatus.COMPLETED,
            });

            // Need at least 2 reviews to check for discrepancies
            if (reviews.length >= 2) {
              // Use the same logic as in checkReviewDiscrepancies
              const submitterFaculty = await Proposal.findById(
                review.proposal
              ).populate({
                path: 'submitter',
                select: 'faculty',
                populate: { path: 'faculty', select: 'title code' },
              });

              if (!submitterFaculty) {
                throw new NotFoundError('Proposal not found');
              }

              // The rest of the reconciliation logic would be called here
              // This would involve finding a reviewer and creating a reconciliation review
              // Using the same logic from reconciliation.controller.ts

              // For brevity, we're not including the entire faculty cluster mapping here
              // but it would call the same logic to find an eligible reviewer

              // Create a new task or job to handle this asynchronously
              // This could be a queue job or a separate process
              await fetch(
                '/api/reconciliation/check-discrepancies/' + review.proposal,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${req.headers.authorization?.split(' ')[1]}`,
                  },
                }
              );
            }
          } else if (!hasDiscrepancy) {
            // If there's no discrepancy, mark proposal as reviewed
            const proposal = await Proposal.findById(review.proposal);
            if (proposal) {
              proposal.reviewStatus = 'reviewed';
              await proposal.save();

              // Create preliminary award record
              const award = new Award({
                proposal: proposal._id,
                submitter: proposal.submitter,
                finalScore: avgScore,
                status: AwardStatus.PENDING,
                fundingAmount: proposal.estimatedBudget || 0,
                feedbackComments:
                  'Your proposal has been reviewed. Final decision pending.',
              });

              await award.save();
            }
          }
        } catch (error) {
          logger.error('Error checking for discrepancies:', error);
        }
      }
    }

    // Notify user of successful submission
    res.status(200).json({
      success: true,
      message: 'Review submitted successfully',
      data: { review },
    });
  }
);
