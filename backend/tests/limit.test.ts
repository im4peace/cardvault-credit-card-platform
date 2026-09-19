import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/index.js';
import { activeCard, app, auth, makeUser, resetDb, submittedApplication } from './helpers.js';

describe('credit limit workflow', () => {
  let customer: string;
  let other: string;
  let officer: string;
  let cardId: string;

  beforeEach(async () => {
    await resetDb();
    customer = await makeUser('c@test.com', 'CUSTOMER');
    other = await makeUser('c2@test.com', 'CUSTOMER');
    officer = await makeUser('o@test.com', 'CREDIT_OFFICER');
    cardId = await activeCard(customer, officer, 5000);
  });

  const requestLimit = (token: string, requestedLimit: number) =>
    request(app).post(`/cards/${cardId}/limit-requests`).set(auth(token)).send({ requestedLimit, reason: 'need' });
  const decide = (id: string, body: object) =>
    request(app).post(`/officer/limit-requests/${id}/decision`).set(auth(officer)).send(body);
  const getCard = () => prisma.card.findUniqueOrThrow({ where: { id: cardId } });

  it('creates a PENDING request; direction derived from the amount; no auto-approval', async () => {
    const inc = await requestLimit(customer, 8000);
    expect(inc.status).toBe(201);
    expect(inc.body).toMatchObject({ status: 'PENDING', type: 'CREDIT_LIMIT_INCREASE', currentLimit: 5000 });
    expect((await getCard()).creditLimit).toBe(5000);
  });

  it('decrease also goes to review; one pending request per card; equal limit rejected', async () => {
    const dec = await requestLimit(customer, 2000);
    expect(dec.body).toMatchObject({ status: 'PENDING', type: 'CREDIT_LIMIT_DECREASE' });
    expect((await requestLimit(customer, 3000)).status).toBe(409);
    await request(app).post(`/limit-requests/${dec.body.id}/cancel`).set(auth(customer));
    expect((await requestLimit(customer, 5000)).status).toBe(400);
  });

  it('only the owner can request, and only on ACTIVE cards', async () => {
    expect((await requestLimit(other, 6000)).status).toBe(404);
    const appId = await submittedApplication(other);
    const decided = await request(app)
      .post(`/officer/applications/${appId}/decision`)
      .set(auth(officer))
      .send({ decision: 'APPROVED', approvedLimit: 1000 });
    const issued = await request(app)
      .post(`/cards/${decided.body.card.id}/limit-requests`)
      .set(auth(other))
      .send({ requestedLimit: 2000 });
    expect(issued.status).toBe(409);
  });

  it('approval updates creditLimit and shifts availableLimit by the delta', async () => {
    await prisma.card.update({ where: { id: cardId }, data: { availableLimit: 4000 } });
    const req = await requestLimit(customer, 8000);
    const res = await decide(req.body.id, { decision: 'APPROVED', comment: 'fine' });
    expect(res.body.status).toBe('APPROVED');
    expect(await getCard()).toMatchObject({ creditLimit: 8000, availableLimit: 7000 });
  });

  it('approved decrease floors availableLimit at 0', async () => {
    await prisma.card.update({ where: { id: cardId }, data: { availableLimit: 500 } });
    const req = await requestLimit(customer, 1000);
    await decide(req.body.id, { decision: 'APPROVED' });
    expect(await getCard()).toMatchObject({ creditLimit: 1000, availableLimit: 0 });
  });

  it('rejection keeps the limit and stores the comment', async () => {
    const req = await requestLimit(customer, 8000);
    await decide(req.body.id, { decision: 'REJECTED', comment: 'no' });
    expect((await getCard()).creditLimit).toBe(5000);
    expect((await prisma.limitDecision.findFirstOrThrow()).comment).toBe('no');
  });

  it('only PENDING requests can be decided or cancelled; duplicate processing is prevented', async () => {
    const req = await requestLimit(customer, 8000);
    const both = await Promise.all([
      decide(req.body.id, { decision: 'APPROVED' }),
      decide(req.body.id, { decision: 'APPROVED' }),
    ]);
    expect(both.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await getCard()).creditLimit).toBe(8000);
    expect((await request(app).post(`/limit-requests/${req.body.id}/cancel`).set(auth(customer))).status).toBe(409);
  });

  it('customers see only their own requests and audit rows are written', async () => {
    const req = await requestLimit(customer, 8000);
    expect((await request(app).get('/limit-requests').set(auth(other))).body).toEqual([]);
    expect((await request(app).post(`/limit-requests/${req.body.id}/cancel`).set(auth(other))).status).toBe(404);
    await decide(req.body.id, { decision: 'REJECTED' });
    const rows = await prisma.auditLog.findMany({ where: { entityType: 'CreditLimitRequest' } });
    expect(rows.map((a) => a.action).sort()).toEqual(['LIMIT_CHANGE_REJECTED', 'LIMIT_CHANGE_REQUESTED']);
  });

  it('officer history and audit endpoints return processed items', async () => {
    const req = await requestLimit(customer, 8000);
    await decide(req.body.id, { decision: 'APPROVED' });
    const hist = await request(app).get('/officer/history').set(auth(officer));
    expect(hist.body.limitRequests).toHaveLength(1);
    expect(hist.body.applications).toHaveLength(1);
    const audit = await request(app).get('/officer/audit').set(auth(officer));
    expect(audit.body.length).toBeGreaterThan(3);
  });
});
