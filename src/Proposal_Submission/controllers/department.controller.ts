import { Request, Response } from 'express';
import Department from '../../Proposal_Submission/models/department.model';
import logger from '../../utils/logger';

interface IDepartmentResponse {
  msg?: string;
  [key: string]: any;
}

class DepartmentController {
  getDepartments = async (req: Request, res: Response<IDepartmentResponse | any[]>): Promise<void> => {
    try {
      const departments = await Department.find();
      res.json(departments);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error(`Error retrieving departments: ${errorMessage}`);
      res.status(500).send({ error: 'Server Error' });
    }
  };

  // Get department by code
  getDepartmentByCode = async (req: Request<{ code: string }>, res: Response<IDepartmentResponse>): Promise<void> => {
    try {
      const department = await Department.findOne({ code: req.params.code });

      if (!department) {
        logger.warn(`Department not found with code: ${req.params.code}`);
        res.status(404).json({ msg: 'Department not found' });
        return;
      }

      res.json(department);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error(`Error retrieving department by code: ${errorMessage}`);
      res.status(500).send({ error: 'Server Error' });
    }
  };

  getDepartmentsByFaculty = async (req: Request<{ facultyId: string }>, res: Response<IDepartmentResponse | any[]>): Promise<void> => {
    try {
      const { facultyId } = req.params;

      const departments = await Department.find({ faculty: facultyId });

      if (!departments.length) {
        logger.warn(`No departments found for faculty ID: ${facultyId}`);
        res.status(404).json({ msg: 'No departments found for this faculty' });
        return;
      }

      res.json(departments);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error(`Error retrieving departments by faculty: ${errorMessage}`);
      res.status(500).send({ error: 'Server Error' });
    }
  };

  getDepartmentsByFacultyCode = async (req: Request<{ facultyCode: string }>, res: Response<IDepartmentResponse | any[]>): Promise<void> => {
    try {
      const { facultyCode } = req.params;

      const departments = await Department.find({ faculty: facultyCode });

      if (!departments.length) {
        logger.warn(`No departments found for faculty code: ${facultyCode}`);
        res.status(404).json({ msg: 'No departments found for this faculty' });
        return;
      }

      res.json(departments);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error(`Error retrieving departments by faculty code: ${errorMessage}`);
      res.status(500).send({ error: 'Server Error' });
    }
  };
}

export default new DepartmentController();