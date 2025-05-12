import { z } from 'zod';

// Common validators
const emailValidator = z
  .string()
  .email({ message: 'Invalid email address' })
  .regex(/^.+@.+\.uniben\.edu$/, { message: 'Please provide a valid UNIBEN email address' });

const alternativeEmailValidator = z
  .string()
  .email({ message: 'Invalid alternative email address' })
  .optional();

const phoneValidator = z
  .string()
  .min(10, { message: 'Phone number must be at least 10 digits' })
  .max(15, { message: 'Phone number must not exceed 15 digits' });

// Co-investigator schema
const coInvestigatorSchema = z.object({
  name: z.string().min(2, { message: 'Co-investigator name is required' }),
  department: z.string().optional(),
  faculty: z.string().optional(),
});

// Staff proposal validation schema
export const staffProposalSchema = z.object({
  body: z.object({
    fullName: z.string().min(2, { message: 'Full name must be at least 2 characters' }),
    academicTitle: z.string().min(2, { message: 'Academic title is required' }),
    department: z.string().min(2, { message: 'Department is required' }),
    faculty: z.string().min(2, { message: 'Faculty is required' }),
    email: emailValidator,
    alternativeEmail: alternativeEmailValidator,
    phoneNumber: phoneValidator,
    projectTitle: z.string().min(5, { message: 'Project title must be at least 5 characters' }),
    backgroundProblem: z
      .string()
      .min(10, { message: 'Background problem statement is required' })
      .max(200, { message: 'Background problem statement must not exceed 200 words' }),
    researchObjectives: z.string().min(10, { message: 'Research objectives are required' }),
    methodologyOverview: z
      .string()
      .min(10, { message: 'Methodology overview is required' })
      .max(250, { message: 'Methodology overview must not exceed 250 words' }),
    expectedOutcomes: z.string().min(10, { message: 'Expected outcomes are required' }),
    workPlan: z.string().min(10, { message: 'Work plan is required' }),
    estimatedBudget: z
      .union([z.string(), z.number()])
      .transform((value) => parseFloat(value.toString())),
    coInvestigators: z.array(coInvestigatorSchema).optional(),
  }),
});

// Master student proposal validation schema
export const masterStudentProposalSchema = z.object({
  body: z.object({
    fullName: z.string().min(2, { message: 'Full name must be at least 2 characters' }),
    matricNumber: z.string().min(2, { message: 'Matriculation number is required' }),
    programme: z.string().min(2, { message: 'Programme is required' }),
    department: z.string().min(24, { message: 'Valid department ID is required' }),
    faculty: z.string().min(24, { message: 'Valid faculty ID is required' }),
    email: emailValidator,
    alternativeEmail: alternativeEmailValidator,
    phoneNumber: phoneValidator,
    projectTitle: z.string().min(5, { message: 'Project title must be at least 5 characters' }),
    problemStatement: z.string().min(10, { message: 'Problem statement is required' }),
    objectivesOutcomes: z.string().min(10, { message: 'Objectives and outcomes are required' }),
    researchApproach: z.string().min(10, { message: 'Research approach is required' }),
    innovationNovelty: z.string().min(10, { message: 'Innovation novelty is required' }),
    innovationContribution: z.string().min(10, { message: 'Innovation contribution is required' }),
    interdisciplinaryRelevance: z.string().min(10, { message: 'Interdisciplinary relevance is required' }),
    implementationPlan: z.string().min(10, { message: 'Implementation plan is required' }),
    estimatedBudget: z
      .union([z.string(), z.number()])
      .transform((value) => parseFloat(value.toString())),
  }),
});

// Export inferred types
export type StaffProposalInput = z.infer<typeof staffProposalSchema>;
export type MasterStudentProposalInput = z.infer<typeof masterStudentProposalSchema>;
export type CoInvestigator = z.infer<typeof coInvestigatorSchema>;