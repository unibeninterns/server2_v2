import User from '../model/user.model.js';
import connectDB from '../db/database.js';
import validateEnv from '../utils/validateEnv.js';
import logger from '../utils/logger.js';

validateEnv();

interface IUser {
  name: string;
  email: string;
  password: string;
  role: string;
  isActive: boolean;
  phoneNumber: string;
  userType: string;
}

export const createAdminUser = async (): Promise<void> => {
  try {
    await connectDB();
    logger.info('Connected to database');

    if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
      logger.error('Add admin info to the .env records.');
      return;
    }

    // Check if admin already exists
    const adminExists = await User.findOne({ email: process.env.ADMIN_EMAIL });

    if (adminExists) {
      logger.info('Admin user already exists');
      return;
    }

    // Create admin user with required fields
    const adminData: IUser = {
      name: process.env.ADMIN_NAME || 'System Administrator',
      email: process.env.ADMIN_EMAIL.endsWith('.uniben.edu')
        ? process.env.ADMIN_EMAIL
        : `${process.env.ADMIN_EMAIL.split('@')[0]}@admin.uniben.edu`,
      password: process.env.ADMIN_PASSWORD,
      role: 'admin',
      isActive: true,
      phoneNumber: process.env.ADMIN_PHONE || '0000000000',
      userType: 'staff',
    };

    const admin = await User.create(adminData);

    logger.info(`Admin user created with email: ${admin.email}`);
  } catch (error) {
    if (error instanceof Error) {
      logger.error('Error creating admin user:', error.message);
    } else {
      logger.error('Unknown error occurred while creating admin user');
    }
  }
};

createAdminUser();
