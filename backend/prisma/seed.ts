// Demo-only seed data. All people, cards and amounts are fictional; no real card data is stored.
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_CUSTOMER_PASSWORD = 'Customer123!';
const DEMO_OFFICER_PASSWORD = 'Officer123!';

const baseApp = {
  phone: '+1-555-0100',
  dateOfBirth: new Date('1990-05-14'),
  address: '12 Example Street',
  city: 'Springfield',
  country: 'USA',
  employmentStatus: 'EMPLOYED',
  employerName: 'Acme Demo Corp',
  monthlyIncome: 5000,
  requestedCreditLimit: 5000,
};

async function reset(): Promise<void> {
  await prisma.auditLog.deleteMany();
  await prisma.limitDecision.deleteMany();
  await prisma.creditLimitRequest.deleteMany();
  await prisma.card.deleteMany();
  await prisma.creditDecision.deleteMany();
  await prisma.creditCardApplication.deleteMany();
  await prisma.customerProfile.deleteMany();
  await prisma.user.deleteMany();
}

async function makeUser(email: string, role: string, password: string, firstName: string, lastName: string) {
  return prisma.user.create({
    data: {
      email,
      role,
      passwordHash: await bcrypt.hash(password, 10),
      profile: { create: { firstName, lastName } },
    },
  });
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV?.trim().toLowerCase() === 'production') throw new Error('Refusing to run the destructive demo seed in production');
  await reset();
  const [alice, bob, carol, dave] = await Promise.all([
    makeUser('customer@test.com', 'CUSTOMER', DEMO_CUSTOMER_PASSWORD, 'Alice', 'Anderson'),
    makeUser('customer2@test.com', 'CUSTOMER', DEMO_CUSTOMER_PASSWORD, 'Bob', 'Brown'),
    makeUser('customer3@test.com', 'CUSTOMER', DEMO_CUSTOMER_PASSWORD, 'Carol', 'Clark'),
    makeUser('customer4@test.com', 'CUSTOMER', DEMO_CUSTOMER_PASSWORD, 'Dave', 'Davis'),
  ]);
  const officer = await makeUser('officer@test.com', 'CREDIT_OFFICER', DEMO_OFFICER_PASSWORD, 'Olivia', 'Officer');
  await makeUser('officer2@test.com', 'CREDIT_OFFICER', DEMO_OFFICER_PASSWORD, 'Owen', 'Officer');

  const app = (u: typeof alice, status: string, extra: Partial<typeof baseApp> = {}) =>
    prisma.creditCardApplication.create({
      data: {
        ...baseApp,
        ...extra,
        customerId: u.id,
        status,
        firstName: u.email.split('@')[0] ?? 'Demo',
        lastName: 'Demo',
        email: u.email,
        submittedAt: status === 'DRAFT' ? null : new Date(),
      },
    });

  // Pending applications (Bob, Carol) + a draft for Dave.
  await app(bob, 'PENDING_CREDIT_REVIEW', { requestedCreditLimit: 8000, monthlyIncome: 7000 });
  await app(carol, 'PENDING_CREDIT_REVIEW', { requestedCreditLimit: 3000, employmentStatus: 'STUDENT' });
  await app(dave, 'DRAFT');

  // Alice: approved + activated card, with a pending limit request.
  const aliceApp = await app(alice, 'CARD_ACTIVATED');
  await prisma.creditDecision.create({
    data: { applicationId: aliceApp.id, officerId: officer.id, decision: 'APPROVED', approvedLimit: 5000, comment: 'Good standing' },
  });
  const activeCard = await prisma.card.create({
    data: {
      customerId: alice.id, applicationId: aliceApp.id, status: 'ACTIVE',
      creditLimit: 5000, availableLimit: 4200, activatedAt: new Date(),
    },
  });
  await prisma.creditLimitRequest.create({
    data: {
      cardId: activeCard.id, customerId: alice.id, type: 'CREDIT_LIMIT_INCREASE',
      currentLimit: 5000, requestedLimit: 8000, reason: 'Upcoming travel expenses',
    },
  });

  // Dave-style approved-but-not-activated card and a rejected application use extra customers.
  const eve = await makeUser('customer5@test.com', 'CUSTOMER', DEMO_CUSTOMER_PASSWORD, 'Eve', 'Evans');
  const frank = await makeUser('customer6@test.com', 'CUSTOMER', DEMO_CUSTOMER_PASSWORD, 'Frank', 'Foster');

  const eveApp = await app(eve, 'CARD_ISSUED', { requestedCreditLimit: 4000 });
  await prisma.creditDecision.create({
    data: { applicationId: eveApp.id, officerId: officer.id, decision: 'APPROVED', approvedLimit: 3500, comment: 'Approved at reduced limit' },
  });
  await prisma.card.create({
    data: { customerId: eve.id, applicationId: eveApp.id, status: 'ISSUED', creditLimit: 3500, availableLimit: 3500 },
  });

  const frankApp = await app(frank, 'REJECTED', { monthlyIncome: 500, requestedCreditLimit: 20000 });
  await prisma.creditDecision.create({
    data: { applicationId: frankApp.id, officerId: officer.id, decision: 'REJECTED', comment: 'Income insufficient for requested limit' },
  });

  const audit = (userId: string, action: string, entityType: string, entityId: string, comment?: string) =>
    prisma.auditLog.create({ data: { userId, action, entityType, entityId, comment: comment ?? null } });
  await audit(alice.id, 'APPLICATION_SUBMITTED', 'CreditCardApplication', aliceApp.id);
  await audit(officer.id, 'APPLICATION_APPROVED', 'CreditCardApplication', aliceApp.id, 'Good standing');
  await audit(officer.id, 'CARD_ISSUED', 'Card', activeCard.id);
  await audit(alice.id, 'CARD_ACTIVATED', 'Card', activeCard.id);
  await audit(officer.id, 'APPLICATION_REJECTED', 'CreditCardApplication', frankApp.id, 'Income insufficient for requested limit');

  console.log('Seeded demo data. Customers: customer@test.com (+2..6@test.com), officers: officer@test.com, officer2@test.com');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
