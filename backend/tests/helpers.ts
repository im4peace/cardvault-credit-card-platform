import bcrypt from 'bcryptjs';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/index.js';

export const app = createApp();
/** Same app behind one trusted proxy hop (uses the LAST X-Forwarded-For entry), so tests can simulate distinct client IPs. */
export const proxiedApp = createApp({ trustProxy: 1 });

export async function resetDb(): Promise<void> {
  await prisma.auditLog.deleteMany();
  await prisma.limitDecision.deleteMany();
  await prisma.creditLimitRequest.deleteMany();
  await prisma.card.deleteMany();
  await prisma.creditDecision.deleteMany();
  await prisma.creditCardApplication.deleteMany();
  await prisma.customerProfile.deleteMany();
  await prisma.user.deleteMany();
}

export async function makeUser(email: string, role: 'CUSTOMER' | 'CREDIT_OFFICER'): Promise<string> {
  await prisma.user.create({
    data: {
      email,
      role,
      passwordHash: await bcrypt.hash('password123', 4),
      profile: { create: { firstName: 'T', lastName: 'U' } },
    },
  });
  const res = await request(app).post('/auth/login').send({ email, password: 'password123' });
  return res.body.token as string;
}

export const validApplication = {
  firstName: 'Ann',
  lastName: 'Lee',
  email: 'ann@test.com',
  phone: '+1-555-0101',
  dateOfBirth: '1990-01-01',
  address: '1 Main St',
  city: 'Town',
  country: 'USA',
  employmentStatus: 'EMPLOYED',
  employerName: 'Acme',
  monthlyIncome: 4000,
  requestedCreditLimit: 5000,
};

export const auth = (token: string): Record<string, string> => ({ Authorization: `Bearer ${token}` });

/** Creates and submits an application as the customer; returns its id. */
export async function submittedApplication(token: string): Promise<string> {
  const created = await request(app).post('/applications').set(auth(token)).send(validApplication);
  await request(app).post(`/applications/${created.body.id}/submit`).set(auth(token));
  return created.body.id as string;
}

/** Runs the full flow up to an ACTIVE card; returns the card id. */
export async function activeCard(customer: string, officer: string, limit = 5000): Promise<string> {
  const appId = await submittedApplication(customer);
  const decided = await request(app)
    .post(`/officer/applications/${appId}/decision`)
    .set(auth(officer))
    .send({ decision: 'APPROVED', approvedLimit: limit });
  const cardId = decided.body.card.id as string;
  await request(app).post(`/cards/${cardId}/activate`).set(auth(customer));
  return cardId;
}
