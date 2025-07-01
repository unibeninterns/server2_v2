import mongoose, { Document, Schema, Types } from 'mongoose';

// Replace enum with const objects and type definitions
export const SubmitterType = {
  STAFF: 'staff',
  MASTER_STUDENT: 'master_student',
} as const;

export type SubmitterType = (typeof SubmitterType)[keyof typeof SubmitterType];

export const ProposalStatus = {
  SUBMITTED: 'submitted',
  UNDER_REVIEW: 'under_review',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  REVISION_REQUESTED: 'revision_requested',
} as const;

export type ProposalStatus =
  (typeof ProposalStatus)[keyof typeof ProposalStatus];

interface ICoInvestigator {
  name: string;
  department?: string;
  faculty?: string;
}

export interface IProposal extends Document {
  submitterType: SubmitterType;
  projectTitle?: string;
  submitter: Types.ObjectId;
  problemStatement?: string;
  objectives?: string;
  methodology?: string;
  expectedOutcomes?: string;
  workPlan?: string;
  estimatedBudget?: number;
  coInvestigators?: ICoInvestigator[];
  cvFile?: string;
  docFile?: string;
  status: ProposalStatus;
  reviewStatus?: 'pending' | 'reviewed';
  finalScore?: number; // New field
  fundingAmount?: number; // New field
  feedbackComments?: string; // New field
  isArchived?: boolean; // New field for archiving
  archiveReason?: string; // New field for archiving/unarchiving comment
  lastNotifiedAt?: Date; // New field for last notification time
  notificationCount?: number; // New field for notification count
  createdAt: Date;
  updatedAt: Date;
}

const ProposalSchema: Schema<IProposal> = new Schema(
  {
    submitterType: {
      type: String,
      enum: Object.values(SubmitterType),
      required: [true, 'Submitter type is required'],
    },

    // common fields
    projectTitle: {
      type: String,
      required: [
        function (this: IProposal) {
          return this.submitterType === 'staff';
        },
        'Project title is required',
      ],
      trim: true,
    },
    submitter: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Submitter is required'],
    },
    problemStatement: {
      type: String,
      required: [
        function (this: IProposal) {
          return this.submitterType === 'staff';
        },
        'Problem statement is required',
      ],
    },
    objectives: {
      type: String,
      required: [
        function (this: IProposal) {
          return this.submitterType === 'staff';
        },
        'Research objectives are required',
      ],
    },
    methodology: {
      type: String,
      required: [
        function (this: IProposal) {
          return this.submitterType === 'staff';
        },
        'Methodology is required',
      ],
    },

    // staff-only fields
    expectedOutcomes: {
      type: String,
      required: [
        function (this: IProposal) {
          return this.submitterType === 'staff';
        },
        'Expected outcomes are required for staff proposals',
      ],
    },
    workPlan: {
      type: String,
      required: [
        function (this: IProposal) {
          return this.submitterType === 'staff';
        },
        'Work plan is required for staff proposals',
      ],
    },
    estimatedBudget: {
      type: Number,
      required: [
        function (this: IProposal) {
          return this.submitterType === 'staff';
        },
        'Estimated budget is required for staff proposals',
      ],
    },
    coInvestigators: [
      {
        name: { type: String },
        department: String,
        faculty: String,
      },
    ],
    cvFile: {
      type: String,
      required: [
        function (this: IProposal) {
          return this.submitterType === 'staff';
        },
        'CV file is required for staff proposals',
      ],
    },
    docFile: {
      type: String,
      required: [
        function (this: IProposal) {
          return this.submitterType === 'master_student';
        },
        'Document file is required for master student proposals',
      ],
    },

    // status & timestamps
    status: {
      type: String,
      enum: Object.values(ProposalStatus),
      default: ProposalStatus.SUBMITTED,
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
    archiveReason: {
      type: String,
    },
    reviewStatus: {
      type: String,
      enum: ['pending', 'reviewed'],
      default: 'pending',
    },
    finalScore: { type: Number }, // New field
    fundingAmount: { type: Number }, // New field
    feedbackComments: { type: String }, // New field
    lastNotifiedAt: {
      type: Date,
      default: null,
    },
    notificationCount: {
      type: Number,
      default: 0,
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: false, // Using custom createdAt/updatedAt
  }
);

// Update timestamp on save
ProposalSchema.pre<IProposal>('save', function (next) {
  this.updatedAt = new Date();
  next();
});

export default mongoose.model<IProposal>(
  'Proposal',
  ProposalSchema,
  'Proposals'
);
