import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/config/index.js';
import { LOGIN_LIMITS, authService } from '../src/service/auth.js';
import { activeCard, app, auth, makeUser, proxiedApp, resetDb, submittedApplication, validApplication } from './helpers.js';

describe('officers cannot see DRAFT applications', () => {
  let customer: string;
  let officer: string;
  let draftId: string;

  beforeEach(async () => {
    await resetDb();
    customer = await makeUser('c@test.com', 'CUSTOMER');
    officer = await makeUser('o@test.com', 'CREDIT_OFFICER');
    draftId = (await request(app).post('/applications').set(auth(customer)).send(validApplication)).body.id;
  });

  it('hides drafts from the default list, the status filter, the detail view and decisions', async () => {
    const list = await request(app).get('/officer/applications').set(auth(officer));
    expect(list.body).toEqual([]);
    const filtered = await request(app).get('/officer/applications?status=DRAFT').set(auth(officer));
    expect(filtered.body).toEqual([]);
    const detail = await request(app).get(`/officer/applications/${draftId}`).set(auth(officer));
    expect(detail.status).toBe(404);
    const decision = await request(app)
      .post(`/officer/applications/${draftId}/decision`)
      .set(auth(officer))
      .send({ decision: 'REJECTED', comment: 'peek' });
    expect(decision.status).toBe(404);
    expect((await prisma.creditCardApplication.findUniqueOrThrow({ where: { id: draftId } })).status).toBe('DRAFT');
  });

  it('the owning customer still sees their draft, and the officer sees it once submitted', async () => {
    expect((await request(app).get(`/applications/${draftId}`).set(auth(customer))).body.status).toBe('DRAFT');
    await request(app).post(`/applications/${draftId}/submit`).set(auth(customer));
    const list = await request(app).get('/officer/applications').set(auth(officer));
    expect(list.body.map((a: { id: string }) => a.id)).toEqual([draftId]);
    expect((await request(app).get(`/officer/applications/${draftId}`).set(auth(officer))).status).toBe(200);
  });
});

describe('login throttling (no account-lockout DoS)', () => {
  const login = (email: string, password: string, ip = '10.0.0.1') =>
    request(proxiedApp).post('/auth/login').set('X-Forwarded-For', ip).send({ email, password });

  beforeEach(async () => {
    await resetDb();
    authService.resetLoginThrottle();
    await makeUser('victim@test.com', 'CUSTOMER');
    authService.resetLoginThrottle();
  });

  it('throttles repeated failures from one client for one account', async () => {
    for (let i = 0; i < LOGIN_LIMITS.perPairPerWindow; i++) {
      expect((await login('victim@test.com', 'bad', '6.6.6.6')).status).toBe(401);
    }
    const blocked = await login('victim@test.com', 'password123', '6.6.6.6');
    expect(blocked.status).toBe(429);
  });

  it('an attacker guessing a victim\'s email cannot lock the victim out (different client)', async () => {
    for (let i = 0; i < 20; i++) await login('victim@test.com', 'bad', '6.6.6.6');
    const legit = await login('victim@test.com', 'password123', '203.0.113.9');
    expect(legit.status).toBe(200);
    expect(legit.body.token).toBeTruthy();
  });

  it('parallel guesses cannot exceed the attempt threshold while bcrypt is running', async () => {
    const results = await Promise.all(Array.from({ length: 25 }, () => login('victim@test.com', 'bad', '7.7.7.7')));
    const reached = results.filter((r) => r.status === 401).length;
    const throttled = results.filter((r) => r.status === 429).length;
    expect(reached).toBe(LOGIN_LIMITS.perPairPerWindow);
    expect(throttled).toBe(25 - LOGIN_LIMITS.perPairPerWindow);
  });

  it('successful logins do not consume the budget', async () => {
    for (let i = 0; i < LOGIN_LIMITS.perPairPerWindow * 3; i++) {
      expect((await login('victim@test.com', 'password123', '8.8.8.8')).status).toBe(200);
    }
  });

  it('a client spraying many accounts is limited per IP', async () => {
    const results: number[] = [];
    for (let i = 0; i < LOGIN_LIMITS.perIpPerWindow + 3; i++) {
      results.push((await login(`nobody${i}@test.com`, 'bad', '9.9.9.9')).status);
    }
    expect(results.slice(0, LOGIN_LIMITS.perIpPerWindow).every((s) => s === 401)).toBe(true);
    expect(results.slice(LOGIN_LIMITS.perIpPerWindow)).toEqual([429, 429, 429]);
  });

  it('the window expires', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      for (let i = 0; i < LOGIN_LIMITS.perPairPerWindow; i++) await login('victim@test.com', 'bad', '5.5.5.5');
      expect((await login('victim@test.com', 'password123', '5.5.5.5')).status).toBe(429);
      vi.setSystemTime(Date.now() + LOGIN_LIMITS.windowMs + 1000);
      expect((await login('victim@test.com', 'password123', '5.5.5.5')).status).toBe(200);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('credit approval bounds', () => {
  let customer: string;
  let officer: string;

  beforeEach(async () => {
    await resetDb();
    customer = await makeUser('c@test.com', 'CUSTOMER');
    officer = await makeUser('o@test.com', 'CREDIT_OFFICER');
  });

  async function pending(requestedCreditLimit: number): Promise<string> {
    const created = await request(app)
      .post('/applications')
      .set(auth(customer))
      .send({ ...validApplication, requestedCreditLimit });
    await request(app).post(`/applications/${created.body.id}/submit`).set(auth(customer));
    return created.body.id;
  }
  const approve = (id: string, approvedLimit: number) =>
    request(app).post(`/officer/applications/${id}/decision`).set(auth(officer)).send({ decision: 'APPROVED', approvedLimit });

  it('approves exactly the requested amount', async () => {
    const res = await approve(await pending(5000), 5000);
    expect(res.status).toBe(200);
    expect(res.body.card.creditLimit).toBe(5000);
  });

  it('approves a lower amount', async () => {
    const res = await approve(await pending(5000), 2500);
    expect(res.status).toBe(200);
    expect(res.body.card.creditLimit).toBe(2500);
  });

  it.each([0, -1, -5000])('rejects a non-positive approved limit (%s)', async (limit) => {
    const id = await pending(5000);
    expect((await approve(id, limit)).status).toBe(400);
    expect(await prisma.card.count()).toBe(0);
  });

  it('rejects an approved limit above the requested limit and leaves the application pending', async () => {
    const id = await pending(5000);
    const res = await approve(id, 5001);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/requested limit/);
    expect((await prisma.creditCardApplication.findUniqueOrThrow({ where: { id } })).status).toBe('PENDING_CREDIT_REVIEW');
    expect(await prisma.card.count()).toBe(0);
  });

  it('rejects an approved limit above the system maximum even if the customer requested more', async () => {
    const id = await pending(500_000);
    const res = await approve(id, 100_001);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/system maximum/);
    expect((await approve(id, 100_000)).status).toBe(200);
  });

  it('rejects a limit change request above the system maximum', async () => {
    const cardId = await activeCard(customer, officer, 5000);
    const res = await request(app).post(`/cards/${cardId}/limit-requests`).set(auth(customer)).send({ requestedLimit: 100_001 });
    expect(res.status).toBe(400);
  });
});

describe('information exposure to customers', () => {
  let customer: string;
  let officer: string;
  let officerId: string;

  beforeEach(async () => {
    await resetDb();
    customer = await makeUser('c@test.com', 'CUSTOMER');
    officer = await makeUser('o@test.com', 'CREDIT_OFFICER');
    officerId = (await prisma.user.findUniqueOrThrow({ where: { email: 'o@test.com' } })).id;
  });

  it('customer application responses show the decision without any officer id', async () => {
    const id = await submittedApplication(customer);
    await request(app)
      .post(`/officer/applications/${id}/decision`)
      .set(auth(officer))
      .send({ decision: 'APPROVED', approvedLimit: 3000, comment: 'welcome' });
    const list = await request(app).get('/applications').set(auth(customer));
    const one = await request(app).get(`/applications/${id}`).set(auth(customer));
    for (const body of [list.body, one.body]) {
      expect(JSON.stringify(body)).not.toContain(officerId);
      expect(JSON.stringify(body)).not.toContain('officerId');
    }
    expect(one.body.decision).toMatchObject({ decision: 'APPROVED', approvedLimit: 3000, comment: 'welcome' });
    expect(one.body.decision.decidedAt).toBeTruthy();
  });

  it('customer limit request responses show the decision without any officer id', async () => {
    const cardId = await activeCard(customer, officer, 5000);
    const req = await request(app).post(`/cards/${cardId}/limit-requests`).set(auth(customer)).send({ requestedLimit: 7000 });
    await request(app)
      .post(`/officer/limit-requests/${req.body.id}/decision`)
      .set(auth(officer))
      .send({ decision: 'REJECTED', comment: 'later' });
    const list = await request(app).get('/limit-requests').set(auth(customer));
    expect(JSON.stringify(list.body)).not.toContain(officerId);
    expect(list.body[0].decision).toMatchObject({ decision: 'REJECTED', comment: 'later' });
  });

  it('officers still see who decided (internal back-office data)', async () => {
    const id = await submittedApplication(customer);
    await request(app).post(`/officer/applications/${id}/decision`).set(auth(officer)).send({ decision: 'REJECTED', comment: 'no' });
    const hist = await request(app).get('/officer/history').set(auth(officer));
    expect(hist.body.applications[0].decision.officerId).toBe(officerId);
  });
});

describe('registration and input length limits', () => {
  let customer: string;

  beforeEach(async () => {
    await resetDb();
    authService.resetLoginThrottle();
    customer = await makeUser('c@test.com', 'CUSTOMER');
  });

  it('concurrent registration of the same email yields one 201 and one 409 (never 500)', async () => {
    const body = { email: 'race@test.com', password: 'password123', firstName: 'R', lastName: 'R' };
    const results = await Promise.all([
      request(app).post('/auth/register').send(body),
      request(app).post('/auth/register').send(body),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.user.count({ where: { email: 'race@test.com' } })).toBe(1);
  });

  it.each([
    ['firstName', 'x'.repeat(101)],
    ['address', 'x'.repeat(201)],
    ['employerName', 'x'.repeat(201)],
    ['phone', '1'.repeat(31)],
    ['dateOfBirth', '2999-01-01'],
    ['dateOfBirth', '1800-01-01'],
  ])('rejects an application with an invalid %s', async (field, value) => {
    const res = await request(app).post('/applications').set(auth(customer)).send({ ...validApplication, [field]: value });
    expect(res.status).toBe(400);
  });

  it('rejects overlong comments and reasons', async () => {
    const officer = await makeUser('o@test.com', 'CREDIT_OFFICER');
    const id = await submittedApplication(customer);
    const long = await request(app)
      .post(`/officer/applications/${id}/decision`)
      .set(auth(officer))
      .send({ decision: 'REJECTED', comment: 'x'.repeat(1001) });
    expect(long.status).toBe(400);
    const cardId = await activeCard(customer, officer, 5000);
    const reason = await request(app)
      .post(`/cards/${cardId}/limit-requests`)
      .set(auth(customer))
      .send({ requestedLimit: 6000, reason: 'x'.repeat(501) });
    expect(reason.status).toBe(400);
  });

  it('audits limit-request cancellation', async () => {
    const officer = await makeUser('o@test.com', 'CREDIT_OFFICER');
    const cardId = await activeCard(customer, officer, 5000);
    const req = await request(app).post(`/cards/${cardId}/limit-requests`).set(auth(customer)).send({ requestedLimit: 6000 });
    await request(app).post(`/limit-requests/${req.body.id}/cancel`).set(auth(customer));
    const row = await prisma.auditLog.findFirstOrThrow({ where: { action: 'LIMIT_CHANGE_CANCELLED' } });
    expect(row).toMatchObject({ entityType: 'CreditLimitRequest', entityId: req.body.id });
  });
});

describe('JWT secret resolution', () => {
  it('requires a strong, non-demo secret in production', async () => {
    const { resolveJwtSecret, DEMO_SECRET } = await import('../src/config/index.js');
    expect(() => resolveJwtSecret({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET/);
    expect(() => resolveJwtSecret({ NODE_ENV: 'production', JWT_SECRET: DEMO_SECRET })).toThrow();
    expect(() => resolveJwtSecret({ NODE_ENV: 'production', JWT_SECRET: 'short' })).toThrow();
    const strong = 'a'.repeat(40);
    expect(resolveJwtSecret({ NODE_ENV: 'production', JWT_SECRET: strong })).toBe(strong);
  });

  it('outside production uses JWT_SECRET if given, otherwise a random per-process secret (no built-in default)', async () => {
    const { resolveJwtSecret, DEMO_SECRET } = await import('../src/config/index.js');
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(resolveJwtSecret({ JWT_SECRET: 'dev-secret' })).toBe('dev-secret');
    const a = resolveJwtSecret({});
    const b = resolveJwtSecret({});
    expect(a).not.toBe(b);
    expect(a).not.toBe(DEMO_SECRET);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });
});

describe('throttle hardening (re-review findings)', () => {
  const login = (email: string, ip: string) =>
    request(proxiedApp).post('/auth/login').set('X-Forwarded-For', ip).send({ email, password: 'bad' });

  beforeEach(async () => {
    await resetDb();
    authService.resetLoginThrottle();
  });

  it('a flood of random emails from one IP is cut off at the IP budget and cannot reset its own counters', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < LOGIN_LIMITS.perIpPerWindow + 40; i++) statuses.push((await login(`rand${i}@x.test`, '4.4.4.4')).status);
    expect(statuses.filter((s) => s === 401)).toHaveLength(LOGIN_LIMITS.perIpPerWindow);
    expect(statuses.slice(LOGIN_LIMITS.perIpPerWindow).every((s) => s === 429)).toBe(true);
    // Later attempts from the same IP are still blocked (the budget was not evicted/reset by the flood).
    expect((await login('anyone@x.test', '4.4.4.4')).status).toBe(429);
  });

  it('with one trusted proxy hop, client-supplied X-Forwarded-For values cannot dodge the limit', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) {
      // The client rotates the left-most (spoofable) value; the trusted proxy appended 6.6.6.6.
      statuses.push((await login('victim@x.test', `10.0.0.${i}, 6.6.6.6`)).status);
    }
    expect(statuses.filter((s) => s === 401)).toHaveLength(LOGIN_LIMITS.perPairPerWindow);
    expect(statuses.filter((s) => s === 429)).toHaveLength(8 - LOGIN_LIMITS.perPairPerWindow);
  });

  it('without a trusted proxy, X-Forwarded-For is ignored entirely', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      statuses.push((await request(app).post('/auth/login').set('X-Forwarded-For', `10.9.9.${i}`).send({ email: 'v@x.test', password: 'bad' })).status);
    }
    expect(statuses.filter((s) => s === 429)).toHaveLength(7 - LOGIN_LIMITS.perPairPerWindow);
  });

  it('TRUST_PROXY must be a hop count, MAX_APPROVED_LIMIT must be a positive number', async () => {
    const { resolveTrustProxy, positiveNumber } = await import('../src/config/index.js');
    expect(resolveTrustProxy(undefined)).toBe(0);
    expect(resolveTrustProxy('0')).toBe(0);
    expect(resolveTrustProxy('1')).toBe(1);
    expect(() => resolveTrustProxy('true')).toThrow(/hop count/);
    expect(() => resolveTrustProxy('-1')).toThrow();
    expect(positiveNumber('X', undefined, 5)).toBe(5);
    expect(positiveNumber('X', '250', 5)).toBe(250);
    for (const bad of ['abc', '0', '-5', 'Infinity']) expect(() => positiveNumber('X', bad, 5)).toThrow(/positive number/);
  });
});

describe('officer audit view hides draft applications', () => {
  it('audit rows for a DRAFT are hidden until the application is submitted', async () => {
    await resetDb();
    const customer = await makeUser('c@test.com', 'CUSTOMER');
    const officer = await makeUser('o@test.com', 'CREDIT_OFFICER');
    const draft = (await request(app).post('/applications').set(auth(customer)).send(validApplication)).body.id;
    const before = await request(app).get('/officer/audit').set(auth(officer));
    expect(JSON.stringify(before.body)).not.toContain(draft);
    const filtered = await request(app).get(`/officer/audit?entityId=${draft}`).set(auth(officer));
    expect(filtered.body).toEqual([]);
    await request(app).post(`/applications/${draft}/submit`).set(auth(customer));
    const after = await request(app).get('/officer/audit').set(auth(officer));
    expect(after.body.map((r: { action: string }) => r.action).sort()).toEqual(['APPLICATION_CREATED', 'APPLICATION_SUBMITTED']);
  });
});

describe('client identity for throttling', () => {
  it('groups IPv6 by /64 and unwraps IPv4-mapped addresses', async () => {
    const { clientKey } = await import('../src/service/clientKey.js');
    expect(clientKey('203.0.113.9')).toBe('203.0.113.9');
    expect(clientKey('::ffff:203.0.113.9')).toBe('203.0.113.9');
    expect(clientKey('2001:db8:abcd:12::1')).toBe(clientKey('2001:DB8:ABCD:12:ffff:ffff:ffff:ffff'));
    expect(clientKey('2001:db8:abcd:12::1')).toBe('2001:db8:abcd:12::/64');
    expect(clientKey('2001:db8:abcd:13::1')).not.toBe(clientKey('2001:db8:abcd:12::1'));
    expect(clientKey('::1')).toBe('0:0:0:0::/64');
    expect(clientKey('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
  });

  it('rotating addresses inside one IPv6 /64 does not reset the login budget', async () => {
    await resetDb();
    authService.resetLoginThrottle();
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) {
      const res = await request(proxiedApp)
        .post('/auth/login')
        .set('X-Forwarded-For', `2001:db8:1:2::${i + 1}`)
        .send({ email: 'victim@x.test', password: 'bad' });
      statuses.push(res.status);
    }
    expect(statuses.filter((s) => s === 401)).toHaveLength(LOGIN_LIMITS.perPairPerWindow);
    expect(statuses.filter((s) => s === 429)).toHaveLength(8 - LOGIN_LIMITS.perPairPerWindow);
  });

  it('treats NODE_ENV=Production (any case/whitespace) as production and rejects odd number formats', async () => {
    const { resolveJwtSecret, positiveNumber } = await import('../src/config/index.js');
    expect(() => resolveJwtSecret({ NODE_ENV: ' Production ' })).toThrow(/JWT_SECRET/);
    for (const bad of ['0x10', '1e3', ' 5', '5 ']) expect(() => positiveNumber('X', bad, 1)).toThrow();
    expect(positiveNumber('X', '2500.5', 1)).toBe(2500.5);
  });
});
