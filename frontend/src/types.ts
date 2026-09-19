export type Role = 'CUSTOMER' | 'CREDIT_OFFICER';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}

export interface Decision {
  decision: 'APPROVED' | 'REJECTED';
  approvedLimit?: number | null;
  comment?: string | null;
  decidedAt: string;
}

export interface Card {
  id: string;
  applicationId: string;
  status: 'ISSUED' | 'ACTIVE' | 'BLOCKED' | 'CLOSED';
  creditLimit: number;
  availableLimit: number;
  issuedAt: string;
  activatedAt: string | null;
}

export interface Application {
  id: string;
  customerId: string;
  status: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  address: string;
  city: string;
  country: string;
  employmentStatus: string;
  employerName: string | null;
  monthlyIncome: number;
  requestedCreditLimit: number;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  decision?: Decision | null;
  card?: Card | null;
}

export interface LimitRequest {
  id: string;
  cardId: string;
  type: 'CREDIT_LIMIT_INCREASE' | 'CREDIT_LIMIT_DECREASE';
  currentLimit: number;
  requestedLimit: number;
  reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  createdAt: string;
  decision?: Decision | null;
  card?: Card | null;
}

export interface History {
  applications: Application[];
  limitRequests: LimitRequest[];
}

export type ApplicationForm = Pick<
  Application,
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'phone'
  | 'dateOfBirth'
  | 'address'
  | 'city'
  | 'country'
  | 'employmentStatus'
  | 'monthlyIncome'
  | 'requestedCreditLimit'
> & { employerName: string };
