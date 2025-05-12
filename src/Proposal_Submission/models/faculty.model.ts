import mongoose, { Document, Schema } from 'mongoose';

export interface IFaculty extends Document {
  code: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

const FacultySchema: Schema<IFaculty> = new Schema(
  {
    code: {
      type: String,
      required: [true, 'Faculty code is required'],
      maxlength: [10, 'Faculty code cannot exceed 10 characters'],
      unique: true,
    },
    title: {
      type: String,
      required: [true, 'Faculty title is required'],
      maxlength: [255, 'Faculty title cannot exceed 255 characters'],
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IFaculty>('Faculty', FacultySchema);