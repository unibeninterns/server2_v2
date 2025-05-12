import { z } from 'zod';

// Define ProposalStatus enum for better type safety
export const ProposalStatusEnum = z.enum([
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'revision_requested',
]);
export type ProposalStatus = z.infer<typeof ProposalStatusEnum>;

// Proposal status update validation schema
export const proposalStatusUpdateSchema = z.object({
  body: z.object({
    status: ProposalStatusEnum.refine(
      (val): val is 'submitted' | 'under_review' | 'approved' | 'rejected' | 'revision_requested' =>
        ['submitted', 'under_review', 'approved', 'rejected', 'revision_requested'].includes(val),
      { message: 'Invalid status value' }
    ),
  }),
  params: z.object({
    id: z.string().min(24, { message: 'Invalid proposal ID' }),
  }),
});

// Admin login validation schema
export const adminLoginSchema = z.object({
  body: z.object({
    email: z.string({ 
      required_error: 'Email is required',
      invalid_type_error: 'Email must be a string'
    })
      .email({ message: 'Invalid email address' }),
    password: z.string({
      required_error: 'Password is required',
      invalid_type_error: 'Password must be a string'
    })
      .min(6, { message: 'Password must be at least 6 characters' }),
  }),
});

// Export inferred types for use in your application
export type ProposalStatusUpdateInput = z.infer<typeof proposalStatusUpdateSchema>;
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;