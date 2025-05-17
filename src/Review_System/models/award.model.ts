import mongoose, { Document, Schema, Types } from 'mongoose';

export const AwardStatus = {
  PENDING: 'pending',
  APPROVED: 'approved',
  DECLINED: 'declined',
} as const;

export type AwardStatus = (typeof AwardStatus)[keyof typeof AwardStatus];

export interface IAward extends Document {
  proposal: Types.ObjectId;
  submitter: Types.ObjectId;
  finalScore: number;
  status: AwardStatus;
  fundingAmount: number;
  approvedBy?: Types.ObjectId;
  approvedAt?: Date;
  feedbackComments: string;
  decisionRationale?: string;
  disbursementSchedule?: {
    date: Date;
    amount: number;
    description: string;
    status: 'pending' | 'completed';
  }[];
  contractFile?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AwardSchema: Schema<IAward> = new Schema(
  {
    proposal: {
      type: Schema.Types.ObjectId,
      ref: 'Proposal',
      required: [true, 'Proposal reference is required'],
      unique: true,
    },
    submitter: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Submitter reference is required'],
    },
    finalScore: {
      type: Number,
      required: [true, 'Final score is required'],
    },
    status: {
      type: String,
      enum: Object.values(AwardStatus),
      default: AwardStatus.PENDING,
    },
    fundingAmount: {
      type: Number,
      required: [true, 'Funding amount is required'],
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User', // Admin user who approved
    },
    approvedAt: {
      type: Date,
    },
    feedbackComments: {
      type: String,
      default: '',
    },
    decisionRationale: {
      type: String,
    },
    disbursementSchedule: [
      {
        date: {
          type: Date,
          required: true,
        },
        amount: {
          type: Number,
          required: true,
        },
        description: {
          type: String,
          required: true,
        },
        status: {
          type: String,
          enum: ['pending', 'completed'],
          default: 'pending',
        },
      },
    ],
    contractFile: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IAward>('Award', AwardSchema);
