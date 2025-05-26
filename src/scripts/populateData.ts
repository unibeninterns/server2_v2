import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';
import Faculty from '../Proposal_Submission/models/faculty.model';
import Department from '../Proposal_Submission/models/department.model';
import connectDB from '../db/database';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

// Load environment variables
dotenv.config();

interface FacultyData {
  code: string;
  title: string;
}

interface DepartmentData {
  code: string;
  title: string;
  faculty: string;
}

interface PopulationResult {
  facultiesCount: number;
  departmentsCount: number;
}

async function populateFacultiesAndDepartments(): Promise<PopulationResult> {
  try {
    // Connect to the database first
    await connectDB();
    logger.info('Connected to database');

    const filePath = path.join(
      __dirname,
      './list_of_faculties_and_dept_in_uniben.md'
    );
    const data = fs.readFileSync(filePath, 'utf8');

    // Parse the markdown file
    const lines = data.split('\n');

    let currentFaculty: FacultyData | null = null;
    const faculties: FacultyData[] = [];
    const departments: DepartmentData[] = [];

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Skip empty lines and headers
      if (
        !trimmedLine ||
        trimmedLine === 'Academic Section' ||
        trimmedLine === 'Faculties' ||
        trimmedLine === 'Code Title'
      ) {
        continue;
      }

      // Check for faculty pattern by looking for "Faculty of" or "School of" or "Institute of"
      if (
        trimmedLine.includes('Faculty of') ||
        trimmedLine.includes('School of') ||
        trimmedLine.includes('INSTITUTE OF') ||
        trimmedLine.includes('Institute of') ||
        trimmedLine.includes('Centre of')
      ) {
        const parts = trimmedLine.split(' ');
        const code = parts[0];
        const title = trimmedLine.substring(code.length + 1);

        currentFaculty = { code, title };
        faculties.push(currentFaculty);

        logger.debug(`Found faculty: ${code} - ${title}`);
        continue;
      }

      // Check for department line (starts with a code and has "Department of")
      if (
        trimmedLine.includes('Department of') &&
        trimmedLine.match(/\([A-Z]+\)$/) && // ends with code in parentheses
        currentFaculty // ensure we have a current faculty
      ) {
        const deptCode = trimmedLine.substring(
          trimmedLine.lastIndexOf('(') + 1,
          trimmedLine.lastIndexOf(')')
        );

        // Get the title between the department code and the parentheses code
        const title = trimmedLine.substring(
          trimmedLine.indexOf(' ') + 1,
          trimmedLine.lastIndexOf('(') - 1
        );

        departments.push({
          code: deptCode,
          title,
          faculty: currentFaculty.code,
        });

        logger.debug(
          `Found department: ${deptCode} - ${title} in faculty ${currentFaculty.code}`
        );
      }
    }

    logger.info(
      `Found ${faculties.length} faculties and ${departments.length} departments to insert`
    );

    // Clear existing data before inserting
    await Faculty.deleteMany({});
    await Department.deleteMany({});
    logger.info('Cleared existing faculty and department data');

    // Save faculties to database
    if (faculties.length > 0) {
      const insertedFaculties = await Faculty.insertMany(
        faculties.map((f) => ({ code: f.code, title: f.title }))
      );
      logger.info(
        `Inserted ${insertedFaculties.length} faculties into the database`
      );
    }

    // Save departments to database
    if (departments.length > 0) {
      const insertedDepartments = await Department.insertMany(departments);
      logger.info(
        `Inserted ${insertedDepartments.length} departments into the database`
      );
    }

    logger.info(
      `Database populated with ${faculties.length} faculties and ${departments.length} departments`
    );

    return {
      facultiesCount: faculties.length,
      departmentsCount: departments.length,
    };
  } catch (error: unknown) {
    if (error instanceof Error) {
      logger.error(`Error populating database: ${error.message}`);
    } else {
      logger.error('Unknown error occurred while populating database');
    }
    throw error;
  } finally {
    // Disconnect from the database
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      logger.info('Disconnected from database');
    }
  }
}

// If this script is run directly (not imported)
if (require.main === module) {
  populateFacultiesAndDepartments()
    .then(() => {
      logger.info('Population script completed successfully');
      process.exit(0);
    })
    .catch((error: unknown) => {
      if (error instanceof Error) {
        logger.error('Population script failed:', error);
      } else {
        logger.error('Population script failed with unknown error');
      }
      process.exit(1);
    });
}

export default populateFacultiesAndDepartments;
