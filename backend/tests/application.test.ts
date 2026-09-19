import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/index.js';
import { activeCard, app, auth, makeUser, resetDb, submittedApplication, validApplication } from './helpers.js';

describe('application workflow', () => {
  let customer: string;
  let other: string;
  let officer: string;

  beforeEach(async () => {
    await resetDb();
    customer = await makeUser('c@test.com', 'CUSTOMER');
    other = await makeUser('c2@test.com', 'CUSTOMER');
    officer = await makeUser('o@test.com', 'CREDIT_OFFICER');
  });

  const decide = (id: string, body: object) =>
    request(app).post(`/officer/applications/${id}/decision`).set(auth(officer)).send(body);

  it('creates a DRAFT, allows edits, and submits to PENDING_CREDIT_REVIEW', async () => {
    const created = await request(app).post('/applications').set(auth(customer)).send(validApplication);
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('DRAFT');
    const patched = await request(app)
      .patch(`/applications/${created.body.id}`)
      .set(auth(customer))
      .send({ city: 'Metropolis' });
    expect(patched.body.city).toBe('Metropolis');
    const submitted = await request(app).post(`/applications/${created.body.id}/submit`).set(auth(customer));
    expect(submitted.body.status).toBe('PENDING_CREDIT_REVIEW');
  });

  it('validates input', async () => {
    const res = await request(app)
      .post('/applications')
      .set(auth(customer))
      .send({ ...validApplication, email: 'nope' });
    expect(res.status).toBe(400);
  });

  it('does not allow editing or re-submitting a submitted application', async () => {
    const id = await submittedApplication(customer);
    const edit = await request(app).patch(`/applications/${id}`).set(auth(customer)).send({ city: 'X' });
    expect(edit.status).toBe(409);
    expect((await request(app).post(`/applications/${id}/submit`).set(auth(customer))).status).toBe(409);
  });

  it('hides other customers applications', async () => {
    const id = await submittedApplication(customer);
    expect((await request(app).get(`/applications/${id}`).set(auth(other))).status).toBe(404);
    expect((await request(app).post(`/applications/${id}/submit`).set(auth(other))).status).toBe(404);
    expect((await request(app).get('/applications').set(auth(other))).body).toEqual([]);
  });

  it('approval creates an ISSUED card with the approved limit and sets CARD_ISSUED', async () => {
    const id = await submittedApplication(customer);
    const res = await decide(id, { decision: 'APPROVED', approvedLimit: 4500, comment: 'ok' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CARD_ISSUED');
    expect(res.body.card).toMatchObject({ status: 'ISSUED', creditLimit: 4500, availableLimit: 4500 });
    expect(res.body.card.activatedAt).toBeNull();
  });

  it('rejection requires a comment and issues no card', async () => {
    const id = await submittedApplication(customer);
    expect((await decide(id, { decision: 'REJECTED' })).status).toBe(400);
    const res = await decide(id, { decision: 'REJECTED', comment: 'income too low' });
    expect(res.body.status).toBe('REJECTED');
    expect(await prisma.card.count()).toBe(0);
  });

  it('cannot decide a DRAFT, and duplicate concurrent decisions are processed once', async () => {
    const draft = await request(app).post('/applications').set(auth(customer)).send(validApplication);
    // Officers cannot see drafts at all, so this is 404 (not 409).
    expect((await decide(draft.body.id, { decision: 'APPROVED', approvedLimit: 1000 })).status).toBe(404);

    const id = await submittedApplication(customer);
    const body = { decision: 'APPROVED', approvedLimit: 1000 };
    const results = await Promise.all([decide(id, body), decide(id, body)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await prisma.card.count()).toBe(1);
    expect(await prisma.creditDecision.count()).toBe(1);
  });

  it('a decided application cannot be decided again (rejected stays without card)', async () => {
    const id = await submittedApplication(customer);
    await decide(id, { decision: 'REJECTED', comment: 'no' });
    expect((await decide(id, { decision: 'APPROVED', approvedLimit: 1000 })).status).toBe(409);
    expect(await prisma.card.count()).toBe(0);
  });

  it('activation moves card to ACTIVE and application to CARD_ACTIVATED; second activation fails', async () => {
    const cardId = await activeCard(customer, officer);
    const card = await prisma.card.findUniqueOrThrow({ where: { id: cardId }, include: { application: true } });
    expect(card.status).toBe('ACTIVE');
    expect(card.activatedAt).not.toBeNull();
    expect(card.application.status).toBe('CARD_ACTIVATED');
    expect((await request(app).post(`/cards/${cardId}/activate`).set(auth(customer))).status).toBe(409);
  });

  it('other customers cannot see or activate a card', async () => {
    const id = await submittedApplication(customer);
    const decided = await decide(id, { decision: 'APPROVED', approvedLimit: 1000 });
    const cardId = decided.body.card.id;
    expect((await request(app).get(`/cards/${cardId}`).set(auth(other))).status).toBe(404);
    expect((await request(app).post(`/cards/${cardId}/activate`).set(auth(other))).status).toBe(404);
  });

  it('writes audit rows for the whole lifecycle', async () => {
    await activeCard(customer, officer);
    const actions = (await prisma.auditLog.findMany()).map((a) => a.action).sort();
    expect(actions).toEqual(
      ['APPLICATION_APPROVED', 'APPLICATION_CREATED', 'APPLICATION_SUBMITTED', 'CARD_ACTIVATED', 'CARD_ISSUED'].sort(),
    );
    const issued = await prisma.auditLog.findFirstOrThrow({ where: { action: 'CARD_ISSUED' } });
    expect(issued.entityType).toBe('Card');
    expect(issued.userId).toBeTruthy();
    expect(issued.timestamp).toBeInstanceOf(Date);
  });
});
