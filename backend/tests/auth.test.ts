import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/index.js';
import { app, auth, makeUser, resetDb } from './helpers.js';

describe('auth and RBAC', () => {
  beforeEach(resetDb);

  it('registers a customer with a hashed password and logs in', async () => {
    const reg = await request(app)
      .post('/auth/register')
      .send({ email: 'new@test.com', password: 'password123', firstName: 'N', lastName: 'C' });
    expect(reg.status).toBe(201);
    expect(reg.body.user.role).toBe('CUSTOMER');
    const stored = await prisma.user.findUnique({ where: { email: 'new@test.com' } });
    expect(stored?.passwordHash).not.toBe('password123');
    const login = await request(app).post('/auth/login').send({ email: 'new@test.com', password: 'password123' });
    expect(login.status).toBe(200);
  });

  it('rejects duplicate registration and bad credentials', async () => {
    await makeUser('a@test.com', 'CUSTOMER');
    const dup = await request(app)
      .post('/auth/register')
      .send({ email: 'a@test.com', password: 'password123', firstName: 'N', lastName: 'C' });
    expect(dup.status).toBe(409);
    const bad = await request(app).post('/auth/login').send({ email: 'a@test.com', password: 'wrong' });
    expect(bad.status).toBe(401);
  });

  it('requires a valid token', async () => {
    expect((await request(app).get('/applications')).status).toBe(401);
    expect((await request(app).get('/applications').set(auth('garbage'))).status).toBe(401);
  });

  it('blocks customers from officer endpoints and officers from customer endpoints', async () => {
    const customer = await makeUser('c@test.com', 'CUSTOMER');
    const officer = await makeUser('o@test.com', 'CREDIT_OFFICER');
    expect((await request(app).get('/officer/applications').set(auth(customer))).status).toBe(403);
    expect((await request(app).get('/applications').set(auth(officer))).status).toBe(403);
    expect((await request(app).get('/officer/applications').set(auth(officer))).status).toBe(200);
  });
});
