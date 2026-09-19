import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/index.js';
import { authService } from '../src/service/auth.js';
import { activeCard, app, auth, makeUser, resetDb, submittedApplication } from './helpers.js';

describe('customer data isolation (Customer A vs Customer B)', () => {
  let a: string;
  let b: string;
  let officer: string;
  let bApp: string;
  let bCard: string;
  let bRequest: string;

  beforeEach(async () => {
    await resetDb();
    a = await makeUser('a@test.com', 'CUSTOMER');
    b = await makeUser('b@test.com', 'CUSTOMER');
    officer = await makeUser('o@test.com', 'CREDIT_OFFICER');
    bCard = await activeCard(b, officer, 5000);
    bApp = (await prisma.card.findUniqueOrThrow({ where: { id: bCard } })).applicationId;
    const req = await request(app).post(`/cards/${bCard}/limit-requests`).set(auth(b)).send({ requestedLimit: 9000 });
    bRequest = req.body.id;
  });

  it('cannot view B\'s application', async () => {
    const res = await request(app).get(`/applications/${bApp}`).set(auth(a));
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain('b@test.com');
  });

  it('cannot view B\'s card', async () => {
    const res = await request(app).get(`/cards/${bCard}`).set(auth(a));
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain(bCard);
  });

  it('cannot activate B\'s card', async () => {
    const issued = await request(app).post('/applications').set(auth(b)).send(validApp());
    await request(app).post(`/applications/${issued.body.id}/submit`).set(auth(b));
    const decided = await request(app)
      .post(`/officer/applications/${issued.body.id}/decision`)
      .set(auth(officer))
      .send({ decision: 'APPROVED', approvedLimit: 1000 });
    const res = await request(app).post(`/cards/${decided.body.card.id}/activate`).set(auth(a));
    expect(res.status).toBe(404);
    expect((await prisma.card.findUniqueOrThrow({ where: { id: decided.body.card.id } })).status).toBe('ISSUED');
  });

  it('cannot view B\'s limit requests', async () => {
    const list = await request(app).get('/limit-requests').set(auth(a));
    expect(list.status).toBe(200);
    expect(list.body).toEqual([]);
    const cancel = await request(app).post(`/limit-requests/${bRequest}/cancel`).set(auth(a));
    expect(cancel.status).toBe(404);
    expect((await prisma.creditLimitRequest.findUniqueOrThrow({ where: { id: bRequest } })).status).toBe('PENDING');
  });

  it('cannot submit a limit request for B\'s card', async () => {
    await request(app).post(`/limit-requests/${bRequest}/cancel`).set(auth(b));
    const res = await request(app).post(`/cards/${bCard}/limit-requests`).set(auth(a)).send({ requestedLimit: 100 });
    expect(res.status).toBe(404);
    expect(await prisma.creditLimitRequest.count({ where: { customerId: (await userId('a@test.com')) } })).toBe(0);
  });

  it('cannot edit or submit B\'s application', async () => {
    expect((await request(app).patch(`/applications/${bApp}`).set(auth(a)).send({ city: 'X' })).status).toBe(404);
    expect((await request(app).post(`/applications/${bApp}/submit`).set(auth(a))).status).toBe(404);
  });

  it('returns identical 404 bodies for nonexistent and foreign ids (no existence oracle)', async () => {
    const foreign = await request(app).get(`/applications/${bApp}`).set(auth(a));
    const missing = await request(app).get('/applications/does-not-exist').set(auth(a));
    expect(foreign.status).toBe(missing.status);
    expect(foreign.body).toEqual(missing.body);
  });

  it('customers cannot reach the audit log or officer history', async () => {
    expect((await request(app).get('/officer/audit').set(auth(a))).status).toBe(403);
    expect((await request(app).get('/officer/history').set(auth(a))).status).toBe(403);
  });
});

describe('authentication hardening', () => {
  beforeEach(async () => {
    await resetDb();
    authService.resetLoginThrottle();
  });

  it('registration cannot choose a role', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'x@test.com', password: 'password123', firstName: 'X', lastName: 'Y', role: 'CREDIT_OFFICER' });
    expect(res.body.user.role).toBe('CUSTOMER');
    expect((await prisma.user.findUniqueOrThrow({ where: { email: 'x@test.com' } })).role).toBe('CUSTOMER');
  });

  it('rejects tokens signed with a different secret, alg=none, and expired tokens', async () => {
    await makeUser('c@test.com', 'CUSTOMER');
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'c@test.com' } });
    const forged = jwt.sign({ sub: user.id, role: 'CREDIT_OFFICER' }, 'wrong-secret');
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(
      JSON.stringify({ sub: user.id, role: 'CREDIT_OFFICER' }),
    ).toString('base64url')}.`;
    const expired = jwt.sign({ sub: user.id }, 'test-secret', { expiresIn: -10 });
    for (const t of [forged, none, expired]) {
      expect((await request(app).get('/auth/me').set(auth(t))).status).toBe(401);
    }
  });

  it('uses the stored role, not the role claim in the token', async () => {
    const token = await makeUser('c@test.com', 'CUSTOMER');
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'c@test.com' } });
    const claimed = jwt.sign({ sub: user.id, role: 'CREDIT_OFFICER' }, 'test-secret');
    expect((await request(app).get('/officer/applications').set(auth(claimed))).status).toBe(403);
    expect((await request(app).get('/auth/me').set(auth(token))).body.role).toBe('CUSTOMER');
  });

  it('rejects a valid token once the user no longer exists', async () => {
    const token = await makeUser('gone@test.com', 'CUSTOMER');
    await prisma.customerProfile.deleteMany();
    await prisma.user.deleteMany();
    expect((await request(app).get('/auth/me').set(auth(token))).status).toBe(401);
  });

  it('never returns the password hash', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'h@test.com', password: 'password123', firstName: 'H', lastName: 'H' });
    expect(JSON.stringify(res.body)).not.toMatch(/hash|\$2[aby]\$/i);
  });

  it('rejects overlong passwords and malformed JSON with 400 (not 500)', async () => {
    const long = await request(app)
      .post('/auth/register')
      .send({ email: 'l@test.com', password: 'x'.repeat(100), firstName: 'L', lastName: 'L' });
    expect(long.status).toBe(400);
    const bad = await request(app).post('/auth/login').set('Content-Type', 'application/json').send('{not json');
    expect(bad.status).toBe(400);
  });

  it('only allows configured CORS origins and sends security headers', async () => {
    const ok = await request(app).get('/health').set('Origin', 'http://localhost:5173');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const evil = await request(app).get('/health').set('Origin', 'https://evil.example');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
    expect(ok.headers['x-content-type-options']).toBe('nosniff');
    expect(ok.headers['x-powered-by']).toBeUndefined();
  });
});

describe('input validation and state guards', () => {
  let customer: string;
  let officer: string;

  beforeEach(async () => {
    await resetDb();
    customer = await makeUser('c@test.com', 'CUSTOMER');
    officer = await makeUser('o@test.com', 'CREDIT_OFFICER');
  });

  it('ignores attempts to set status/customerId through the API (mass assignment)', async () => {
    const res = await request(app)
      .post('/applications')
      .set(auth(customer))
      .send({ ...validApp(), status: 'APPROVED', customerId: 'someone-else' });
    expect(res.body.status).toBe('DRAFT');
    expect(res.body.customerId).not.toBe('someone-else');
    const patched = await request(app)
      .patch(`/applications/${res.body.id}`)
      .set(auth(customer))
      .send({ status: 'CARD_ACTIVATED' });
    expect(patched.body.status).toBe('DRAFT');
  });

  it('rejects absurd or non-finite amounts', async () => {
    expect((await request(app).post('/applications').set(auth(customer)).send({ ...validApp(), requestedCreditLimit: 1e12 })).status).toBe(400);
    expect((await request(app).post('/applications').set(auth(customer)).send({ ...validApp(), monthlyIncome: -1 })).status).toBe(400);
    const id = await submittedApplication(customer);
    const res = await request(app)
      .post(`/officer/applications/${id}/decision`)
      .set(auth(officer))
      .send({ decision: 'APPROVED', approvedLimit: 1e12 });
    expect(res.status).toBe(400);
  });

  it('two concurrent limit requests for one card create only one', async () => {
    const cardId = await activeCard(customer, officer, 5000);
    const send = (n: number) =>
      request(app).post(`/cards/${cardId}/limit-requests`).set(auth(customer)).send({ requestedLimit: n });
    const results = await Promise.all([send(6000), send(7000)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.creditLimitRequest.count({ where: { status: 'PENDING' } })).toBe(1);
  });

  it('refuses to approve a limit change if the card is no longer ACTIVE', async () => {
    const cardId = await activeCard(customer, officer, 5000);
    const req = await request(app).post(`/cards/${cardId}/limit-requests`).set(auth(customer)).send({ requestedLimit: 8000 });
    await prisma.card.update({ where: { id: cardId }, data: { status: 'BLOCKED' } });
    const res = await request(app)
      .post(`/officer/limit-requests/${req.body.id}/decision`)
      .set(auth(officer))
      .send({ decision: 'APPROVED' });
    expect(res.status).toBe(409);
    const after = await prisma.creditLimitRequest.findUniqueOrThrow({ where: { id: req.body.id } });
    expect(after.status).toBe('PENDING'); // transaction rolled back, request stays reviewable
    expect((await prisma.card.findUniqueOrThrow({ where: { id: cardId } })).creditLimit).toBe(5000);
  });

  it('audit rows record actor, entity and comment', async () => {
    const id = await submittedApplication(customer);
    await request(app)
      .post(`/officer/applications/${id}/decision`)
      .set(auth(officer))
      .send({ decision: 'REJECTED', comment: 'policy' });
    const row = await prisma.auditLog.findFirstOrThrow({ where: { action: 'APPLICATION_REJECTED' } });
    expect(row).toMatchObject({ entityType: 'CreditCardApplication', entityId: id, comment: 'policy' });
    const officerRow = await prisma.user.findUniqueOrThrow({ where: { email: 'o@test.com' } });
    expect(row.userId).toBe(officerRow.id);
  });
});

function validApp() {
  return {
    firstName: 'Bo',
    lastName: 'Lee',
    email: 'bo@test.com',
    phone: '+1-555-0101',
    dateOfBirth: '1990-01-01',
    address: '1 Main St',
    city: 'Town',
    country: 'USA',
    employmentStatus: 'EMPLOYED',
    monthlyIncome: 4000,
    requestedCreditLimit: 5000,
  };
}

async function userId(email: string): Promise<string> {
  return (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
}
