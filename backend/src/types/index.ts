import { z } from 'zod';

/** Upper bound for any money input; keeps floats exact and rejects absurd values. */
export const MAX_AMOUNT = 1_000_000;

export const ROLES = ['CUSTOMER', 'CREDIT_OFFICER'] as const;
export type Role = (typeof ROLES)[number];

export type ApplicationStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'PENDING_CREDIT_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'CARD_ISSUED'
  | 'CARD_ACTIVATED';
export type CardStatus = 'ISSUED' | 'ACTIVE' | 'BLOCKED' | 'CLOSED';
export type LimitRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type LimitRequestType = 'CREDIT_LIMIT_INCREASE' | 'CREDIT_LIMIT_DECREASE';

export type AuditAction =
  | 'APPLICATION_CREATED'
  | 'APPLICATION_SUBMITTED'
  | 'APPLICATION_APPROVED'
  | 'APPLICATION_REJECTED'
  | 'CARD_ISSUED'
  | 'CARD_ACTIVATED'
  | 'LIMIT_CHANGE_REQUESTED'
  | 'LIMIT_CHANGE_APPROVED'
  | 'LIMIT_CHANGE_REJECTED'
  | 'LIMIT_CHANGE_CANCELLED';

export interface AuthUser {
  id: string;
  role: Role;
  email: string;
}

export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

const name = z.string().trim().min(1).max(100);
const MIN_DOB = new Date('1900-01-01');
/** Free-text length caps keep records and audit rows bounded. */
export const MAX_COMMENT = 1000;

export const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(72), // bcrypt ignores bytes past 72
  firstName: name,
  lastName: name,
});
export const loginSchema = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(72) });

export const applicationSchema = z.object({
  firstName: name,
  lastName: name,
  email: z.string().email().max(254),
  phone: z.string().trim().min(5).max(30),
  dateOfBirth: z.coerce.date().min(MIN_DOB).refine((d) => d <= new Date(), 'Date of birth cannot be in the future'),
  address: z.string().trim().min(1).max(200),
  city: name,
  country: name,
  employmentStatus: z.enum(['EMPLOYED', 'SELF_EMPLOYED', 'UNEMPLOYED', 'RETIRED', 'STUDENT']),
  employerName: z.string().trim().max(200).optional(),
  monthlyIncome: z.number().nonnegative().max(MAX_AMOUNT),
  requestedCreditLimit: z.number().positive().max(MAX_AMOUNT),
});
export const applicationPatchSchema = applicationSchema.partial();
export type ApplicationInput = z.infer<typeof applicationSchema>;

const comment = z.string().trim().max(MAX_COMMENT);

/** approvedLimit must be > 0 here; the <= requested limit and <= system maximum rules are enforced in the service. */
export const applicationDecisionSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('APPROVED'), approvedLimit: z.number().positive().max(MAX_AMOUNT), comment: comment.optional() }),
  z.object({ decision: z.literal('REJECTED'), comment: comment.min(1, 'A comment is required to reject') }),
]);
export type ApplicationDecisionInput = z.infer<typeof applicationDecisionSchema>;

export const limitRequestSchema = z.object({
  requestedLimit: z.number().positive().max(MAX_AMOUNT),
  reason: z.string().trim().max(500).optional(),
});
export const limitDecisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  comment: comment.optional(),
});
