import mongoose, { Document, Schema, Types } from 'mongoose';
import bcrypt from 'bcryptjs';

export enum UserRole {
  ADMIN = 'admin',
  RESEARCHER = 'researcher',
  REVIEWER = 'reviewer',
}

export enum UserType {
  STAFF = 'staff',
  MASTER_STUDENT = 'master_student',
}

export interface IUser extends Document {
  name: string;
  email: string;
  alternativeEmail?: string;
  password?: string;
  role: UserRole;
  userType: UserType;
  department?: Types.ObjectId;
  faculty?: Types.ObjectId;
  academicTitle?: string;
  matricNumber?: string;
  programme?: string;
  phoneNumber: string;
  refreshToken?: string;
  inviteToken?: string;
  inviteTokenExpires?: Date;
  proposals: Types.ObjectId[];
  assignedProposals: Types.ObjectId[];
  completedReviews: Types.ObjectId[];
  isActive: boolean;
  invitationStatus: 'pending' | 'added' | 'accepted' | 'expired';
  credentialsSent: boolean;
  credentialsSentAt?: Date;
  lastLogin?: Date;
  createdAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const UserSchema: Schema<IUser> = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^.+@(.+\.)*uniben\.edu$/,
        'Please provide a valid UNIBEN email address',
      ],
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
    role: {
      type: String,
      enum: Object.values(UserRole),
      default: UserRole.RESEARCHER,
      required: true,
    },
    userType: {
      type: String,
      enum: Object.values(UserType),
      required: [true, 'User type is required'],
    },
    department: {
      type: Schema.Types.ObjectId,
      ref: 'Department',
      trim: true,
    },
    faculty: {
      type: Schema.Types.ObjectId,
      ref: 'Faculty',
      trim: true,
    },
    academicTitle: {
      type: String,
      trim: true,
    },
    matricNumber: {
      type: String,
      trim: true,
    },
    programme: {
      type: String,
      trim: true,
    },
    phoneNumber: {
      type: String,
      trim: true,
      required: [true, 'Phone number is required'],
    },
    refreshToken: {
      type: String,
      select: false,
    },
    inviteToken: {
      type: String,
    },
    inviteTokenExpires: {
      type: Date,
    },
    proposals: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Proposal',
      },
    ],
    assignedProposals: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Proposal',
      },
    ],
    completedReviews: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Review',
      },
    ],
    isActive: {
      type: Boolean,
      default: false,
    },
    invitationStatus: {
      type: String,
      enum: ['pending', 'accepted', 'added', 'expired'],
      default: 'pending',
    },
    credentialsSent: {
      type: Boolean,
      default: false,
    },
    credentialsSentAt: {
      type: Date,
    },
    lastLogin: {
      type: Date,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false, // Using custom createdAt field
  }
);

UserSchema.pre('save', async function (next) {
  if (this.password && this.isModified('password')) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  next();
});

UserSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

UserSchema.index({ faculty: 1, role: 1, isActive: 1 });

export default mongoose.model<IUser>('User', UserSchema, 'Users_2');
