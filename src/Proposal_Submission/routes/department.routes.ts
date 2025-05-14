import express from 'express';
import departmentController from '../controllers/department.controller';

const router = express.Router();

router.get('/', departmentController.getDepartments);
router.get('/:code', departmentController.getDepartmentByCode);
router.get(
  '/by-faculty-code/:facultyCode',
  departmentController.getDepartmentsByFacultyCode
);
router.get(
  '/by-faculty/:facultyId',
  departmentController.getDepartmentsByFaculty
);

export default router;
