import express from 'express';
import facultyController from '../controllers/faculty.controller.js';

const router = express.Router();

router.get('/', facultyController.getFaculties);
router.get('/:code', facultyController.getFacultyByCode);
router.get('/id/:id', facultyController.getFacultyById);

export default router;
