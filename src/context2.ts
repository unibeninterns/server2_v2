import { Request, Response } from 'express';
import { NotFoundError, UnauthorizedError } from '../utils/customErrors';
import asyncHandler from '../utils/asyncHandler';
import logger from '../utils/logger';

// use getFullProposalById controller as context for the id page in the frontend for the full proposal

getFullProposalById = asyncHandler(
  async (req: Request, res: Response<IAdminResponse>): Promise<void> => {
    const user = (req as AdminAuthenticatedRequest).user;
    if (user.role !== 'admin') {
      throw new UnauthorizedError(
        'You do not have permission to access this resource'
      );
    }

    const { id } = req.params;

    const fullProposal = await FullProposal.findById(id)
      .populate({
        path: 'proposal',
        select: 'projectTitle estimatedBudget submitterType',
      })
      .populate({
        path: 'submitter',
        select:
          'name email userType phoneNumber alternativeEmail faculty department',
        populate: [
          { path: 'faculty', select: 'title code' },
          { path: 'department', select: 'title code' },
        ],
      });

    if (!fullProposal) {
      throw new NotFoundError('Full proposal not found');
    }

    // Check if the original proposal has an approved award
    const award = await Award.findOne({
      proposal: fullProposal.proposal,
      status: AwardStatus.APPROVED,
    });

    if (!award) {
      throw new UnauthorizedError(
        'This full proposal is not associated with an approved award'
      );
    }

    logger.info(`Admin ${user.id} retrieved full proposal ${id}`);

    res.status(200).json({
      success: true,
      data: {
        ...fullProposal.toObject(),
        award: {
          fundingAmount: award.fundingAmount,
          approvedAt: award.approvedAt,
        },
      },
    });
  }
);

// use this in the frontend to get the full proposal details

import { getFullProposalById } from '@/services/api';

// this is how it is gotten in the api.ts file of the frontend, use it as context to something similar for the analytics routes before using them in the frontend page for the analytics

export const getFullProposalById = async (fullProposalId: string) => {
  try {
    const response = await api.get(
      `/admin/decisions_2/full-proposal/${fullProposalId}`
    );
    return response.data;
  } catch (error) {
    console.error(
      `Error fetching full proposal with ID ${fullProposalId}:`,
      error
    );
    throw error;
  }
};
