import mongoose, { Document, Schema, Types } from 'mongoose';

export const ReviewType = {
  HUMAN: 'human',
  AI: 'ai',
  RECONCILIATION: 'reconciliation',
} as const;

export type ReviewType = (typeof ReviewType)[keyof typeof ReviewType];

export const ReviewStatus = {
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  OVERDUE: 'overdue',
} as const;

export type ReviewStatus = (typeof ReviewStatus)[keyof typeof ReviewStatus];

export interface IScore {
  relevanceToNationalPriorities: number;
  originalityAndInnovation: number;
  clarityOfResearchProblem: number;
  methodology: number;
  literatureReview: number;
  teamComposition: number;
  feasibilityAndTimeline: number;
  budgetJustification: number;
  expectedOutcomes: number;
  sustainabilityAndScalability: number;
}

export interface IReview extends Document {
  proposal: Types.ObjectId;
  reviewer: Types.ObjectId | null; // null for AI reviews
  reviewType: ReviewType;
  scores: IScore;
  comments: string;
  totalScore: number;
  status: ReviewStatus;
  dueDate: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ReviewSchema: Schema<IReview> = new Schema(
  {
    proposal: {
      type: Schema.Types.ObjectId,
      ref: 'Proposal',
      required: [true, 'Proposal reference is required'],
    },
    reviewer: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null, // null for AI reviews
    },
    reviewType: {
      type: String,
      enum: Object.values(ReviewType),
      required: [true, 'Review type is required'],
    },
    scores: {
      relevanceToNationalPriorities: {
        type: Number,
        min: 0,
        max: 10,
        default: 0,
      },
      originalityAndInnovation: {
        type: Number,
        min: 0,
        max: 15,
        default: 0,
      },
      clarityOfResearchProblem: {
        type: Number,
        min: 0,
        max: 10,
        default: 0,
      },
      methodology: {
        type: Number,
        min: 0,
        max: 15,
        default: 0,
      },
      literatureReview: {
        type: Number,
        min: 0,
        max: 10,
        default: 0,
      },
      teamComposition: {
        type: Number,
        min: 0,
        max: 10,
        default: 0,
      },
      feasibilityAndTimeline: {
        type: Number,
        min: 0,
        max: 10,
        default: 0,
      },
      budgetJustification: {
        type: Number,
        min: 0,
        max: 10,
        default: 0,
      },
      expectedOutcomes: {
        type: Number,
        min: 0,
        max: 5,
        default: 0,
      },
      sustainabilityAndScalability: {
        type: Number,
        min: 0,
        max: 5,
        default: 0,
      },
    },
    comments: {
      type: String,
      default: '',
    },
    totalScore: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: Object.values(ReviewStatus),
      default: ReviewStatus.IN_PROGRESS,
    },
    dueDate: {
      type: Date,
      required: [true, 'Due date is required'],
    },
    completedAt: {
      type: Date,
    },
    createdAt: Date,
    updatedAt: Date,
  },
  {
    timestamps: true,
  }
);

// Calculate total score before saving
ReviewSchema.pre<IReview>('save', function (next) {
  const scores = this.scores;
  if (scores) {
    this.totalScore =
      (scores.relevanceToNationalPriorities || 0) +
      (scores.originalityAndInnovation || 0) +
      (scores.clarityOfResearchProblem || 0) +
      (scores.methodology || 0) +
      (scores.literatureReview || 0) +
      (scores.teamComposition || 0) +
      (scores.feasibilityAndTimeline || 0) +
      (scores.budgetJustification || 0) +
      (scores.expectedOutcomes || 0) +
      (scores.sustainabilityAndScalability || 0);
  }
  next();
});

export default mongoose.model<IReview>('Review', ReviewSchema, 'Reviews');
