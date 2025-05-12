import { Request, Response } from 'express';
import Faculty from '../models/faculty.model';
import logger from '../../utils/logger';
import mongoose from 'mongoose';

interface IFacultyResponse {
  msg?: string;
  [key: string]: any;
}

class FacultyController {
  getFaculties = async (req: Request, res: Response<IFacultyResponse | any[]>): Promise<void> => {
    try {
      const faculties = await Faculty.find();
      res.json(faculties);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error(`Error retrieving faculties: ${errorMessage}`);
      res.status(500).send({ error: 'Server Error' });
    }
  };

  // Get faculty by code
  getFacultyByCode = async (req: Request<{ code: string }>, res: Response<IFacultyResponse>): Promise<void> => {
    try {
      const faculty = await Faculty.findOne({ code: req.params.code });

      if (!faculty) {
        logger.warn(`Faculty not found with code: ${req.params.code}`);
        res.status(404).json({ msg: 'Faculty not found' });
        return;
      }

      res.json(faculty);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error(`Error retrieving faculty by code: ${errorMessage}`);
      res.status(500).send({ error: 'Server Error' });
    }
  };

  getFacultyById = async (req: Request<{ id: string }>, res: Response<IFacultyResponse>): Promise<void> => {
    try {
      // Validate if the ID is a valid MongoDB ObjectId
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        logger.warn(`Invalid faculty ID format: ${req.params.id}`);
        res.status(400).json({ msg: 'Invalid faculty ID format' });
        return;
      }

      const faculty = await Faculty.findById(req.params.id);

      if (!faculty) {
        logger.warn(`Faculty not found with ID: ${req.params.id}`);
        res.status(404).json({ msg: 'Faculty not found' });
        return;
      }

      res.json(faculty);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error(`Error retrieving faculty by ID: ${errorMessage}`);
      res.status(500).send({ error: 'Server Error' });
    }
  };
}

export default new FacultyController();