import mongoose, { Document, Schema } from 'mongoose';

export interface IDepartment extends Document {
  code: string;
  title: string;
  faculty: string;
  createdAt: Date;
  updatedAt: Date;
}

const DepartmentSchema: Schema<IDepartment> = new Schema(
  {
    code: {
      type: String,
      required: [true, 'Department code is required'],
      maxlength: [10, 'Department code cannot exceed 10 characters'],
      unique: true,
    },
    title: {
      type: String,
      required: [true, 'Department title is required'],
      maxlength: [255, 'Department title cannot exceed 255 characters'],
    },
    faculty: {
      type: String,
      ref: 'Faculty',
      required: [true, 'Faculty reference is required'],
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IDepartment>('Department', DepartmentSchema);
