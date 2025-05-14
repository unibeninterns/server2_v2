import mongoose, { Document, Schema, Types } from 'mongoose';
import bcrypt from 'bcryptjs';

export enum ReviewerStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  INACTIVE = 'inactive'
}

export interface IReviewer extends Document {
  name?: string;
  email: string;
  alternativeEmail?: string;
  password?: string;
  phoneNumber?: string;
  faculty?: Types.ObjectId;
  department?: Types.ObjectId;
  academicTitle?: string;
  status: ReviewerStatus;
  inviteToken?: string;
  inviteTokenExpires?: Date;
  refreshToken?: string;
  assignedProposals: Types.ObjectId[];
  lastLogin?: Date;
  createdAt: Date;
  completedAt?: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const ReviewerSchema: Schema<IReviewer> = new Schema({
  name: {
    type: String,
    trim: true,
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
  },
  alternativeEmail: {
    type: String,
    lowercase: true,
    trim: true,
    unique: true,
    sparse: true,
    match: [
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      'Please provide a valid email address',
    ],
  },
  password: {
    type: String,
    select: false,
  },
  phoneNumber: {
    type: String,
    trim: true,
  },
  faculty: {
    type: Schema.Types.ObjectId,
    ref: 'Faculty',
  },
  department: {
    type: Schema.Types.ObjectId,
    ref: 'Department',
  },
  academicTitle: {
    type: String,
    trim: true,
  },
  status: {
    type: String,
    enum: Object.values(ReviewerStatus),
    default: ReviewerStatus.PENDING,
  },
  inviteToken: {
    type: String,
  },
  inviteTokenExpires: {
    type: Date,
  },
  refreshToken: {
    type: String,
    select: false,
  },
  assignedProposals: [
    {
      type: Schema.Types.ObjectId,
      ref: 'Proposal',
    },
  ],
  lastLogin: {
    type: Date,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  completedAt: {
    type: Date,
  },
});

ReviewerSchema.pre('save', async function (next) {
  if (this.password && this.isModified('password')) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  next();
});

ReviewerSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model<IReviewer>('Reviewer', ReviewerSchema, 'Reviewers');