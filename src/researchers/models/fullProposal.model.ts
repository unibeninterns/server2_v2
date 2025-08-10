import mongoose, { Document, Schema, Types } from 'mongoose';

export const FullProposalStatus = {
  SUBMITTED: 'submitted',
  UNDER_REVIEW: 'under_review',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;

export type FullProposalStatus =
  (typeof FullProposalStatus)[keyof typeof FullProposalStatus];

export interface IFullProposal extends Document {
  proposal: Types.ObjectId; // Reference to the original approved proposal
  submitter: Types.ObjectId; // Reference to the user who submitted
  docFile: string; // URL/path to uploaded document
  status: FullProposalStatus;
  score?: number;
  submittedAt: Date;
  deadline: Date; // July 31, 2025
  reviewedAt?: Date;
  reviewComments?: string;
  finalSubmission?: string; // URL/path to uploaded document
  submitted: boolean;
  finalSubmissionDeadline: Date; // August 15, 2025
  finalSubmittedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const FullProposalSchema: Schema<IFullProposal> = new Schema(
  {
    proposal: {
      type: Schema.Types.ObjectId,
      ref: 'Proposal',
      required: [true, 'Original proposal reference is required'],
      unique: true, // Ensures only one full proposal per approved proposal
    },
    submitter: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Submitter reference is required'],
    },
    docFile: {
      type: String,
      required: [true, 'Document file is required'],
    },
    status: {
      type: String,
      enum: Object.values(FullProposalStatus),
      default: FullProposalStatus.SUBMITTED,
    },
    score: {
      type: Number,
      min: [1, 'Score must be at least 1'],
      max: [100, 'Score cannot exceed 100'],
    },
    submittedAt: {
      type: Date,
      default: Date.now,
    },
    deadline: {
      type: Date,
      default: () => new Date('2025-07-31T23:59:59.999Z'), // July 31, 2025
    },
    reviewedAt: {
      type: Date,
    },
    reviewComments: {
      type: String,
    },
    finalSubmission: {
      type: String,
    },
    submitted: {
      type: Boolean,
      default: false,
    },
    finalSubmissionDeadline: {
      type: Date,
      default: () => new Date('2025-08-14T23:59:59.999Z'), // August 15, 2025
    },
    finalSubmittedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
FullProposalSchema.index({ proposal: 1, submitter: 1 });
FullProposalSchema.index({ status: 1, submittedAt: -1 });
FullProposalSchema.index({ status: 1, submitted: 1 });

export default mongoose.model<IFullProposal>(
  'FullProposal',
  FullProposalSchema
);
