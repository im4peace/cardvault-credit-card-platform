import type { Prisma } from '@prisma/client';
import { prisma } from '../config/index.js';
import type { AuditAction } from '../types/index.js';

export type Tx = Prisma.TransactionClient;
export type Db = Tx | typeof prisma;

export const userRepo = {
  findByEmail: (email: string) => prisma.user.findUnique({ where: { email }, include: { profile: true } }),
  findById: (id: string) => prisma.user.findUnique({ where: { id }, include: { profile: true } }),
  create: (data: { email: string; passwordHash: string; role: string; firstName: string; lastName: string }) =>
    prisma.user.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
        role: data.role,
        profile: { create: { firstName: data.firstName, lastName: data.lastName } },
      },
    }),
};

export const applicationRepo = {
  create: (data: Prisma.CreditCardApplicationUncheckedCreateInput, db: Db = prisma) =>
    db.creditCardApplication.create({ data }),
  findById: (id: string, db: Db = prisma) =>
    db.creditCardApplication.findUnique({ where: { id }, include: { decision: true, card: true } }),
  listByCustomer: (customerId: string) =>
    prisma.creditCardApplication.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      include: { decision: true, card: true },
    }),
  /** Officer view: never includes DRAFTs. */
  listSubmitted: (status?: string) =>
    prisma.creditCardApplication.findMany({
      where: status ? { status } : { status: { not: 'DRAFT' } },
      orderBy: { createdAt: 'asc' },
      include: { decision: true },
    }),
  /** Updates only while the application is still DRAFT (atomic). Returns rows changed. */
  updateDraft: async (id: string, data: Prisma.CreditCardApplicationUpdateManyMutationInput) =>
    (await prisma.creditCardApplication.updateMany({ where: { id, status: 'DRAFT' }, data })).count,
  /** Atomic compare-and-set on status. Returns rows changed (0 = another request won the race). */
  transition: async (
    id: string,
    from: string,
    to: string,
    db: Db = prisma,
    extra: Prisma.CreditCardApplicationUpdateManyMutationInput = {},
  ) => (await db.creditCardApplication.updateMany({ where: { id, status: from }, data: { status: to, ...extra } })).count,
  draftIds: async () =>
    (await prisma.creditCardApplication.findMany({ where: { status: 'DRAFT' }, select: { id: true } })).map((d) => d.id),
  listDecided: () =>
    prisma.creditCardApplication.findMany({
      where: { decision: { isNot: null } },
      include: { decision: true },
      orderBy: { updatedAt: 'desc' },
    }),
};

export const decisionRepo = {
  create: (data: Prisma.CreditDecisionUncheckedCreateInput, db: Db = prisma) => db.creditDecision.create({ data }),
};

export const cardRepo = {
  create: (data: Prisma.CardUncheckedCreateInput, db: Db = prisma) => db.card.create({ data }),
  findById: (id: string, db: Db = prisma) => db.card.findUnique({ where: { id }, include: { application: true } }),
  listByCustomer: (customerId: string) =>
    prisma.card.findMany({ where: { customerId }, orderBy: { issuedAt: 'desc' } }),
  /** Atomic compare-and-set on status. */
  transition: async (id: string, from: string, data: Prisma.CardUpdateManyMutationInput, db: Db = prisma) =>
    (await db.card.updateMany({ where: { id, status: from }, data })).count,
  update: (id: string, data: Prisma.CardUpdateInput, db: Db = prisma) => db.card.update({ where: { id }, data }),
};

export const limitRequestRepo = {
  create: (data: Prisma.CreditLimitRequestUncheckedCreateInput, db: Db = prisma) =>
    db.creditLimitRequest.create({ data }),
  findById: (id: string, db: Db = prisma) =>
    db.creditLimitRequest.findUnique({ where: { id }, include: { decision: true, card: true } }),
  listByCustomer: (customerId: string) =>
    prisma.creditLimitRequest.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      include: { decision: true },
    }),
  listByStatus: (status?: string) =>
    prisma.creditLimitRequest.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'asc' },
      include: { decision: true, card: true },
    }),
  findPendingForCard: (cardId: string) => prisma.creditLimitRequest.findFirst({ where: { cardId, status: 'PENDING' } }),
  transition: async (id: string, from: string, to: string, db: Db = prisma) =>
    (await db.creditLimitRequest.updateMany({ where: { id, status: from }, data: { status: to } })).count,
  listDecided: () =>
    prisma.creditLimitRequest.findMany({
      where: { decision: { isNot: null } },
      include: { decision: true },
      orderBy: { updatedAt: 'desc' },
    }),
};

export const limitDecisionRepo = {
  create: (data: Prisma.LimitDecisionUncheckedCreateInput, db: Db = prisma) => db.limitDecision.create({ data }),
};

export const auditRepo = {
  record: (
    entry: { userId: string; action: AuditAction; entityType: string; entityId: string; comment?: string | null },
    db: Db = prisma,
  ) => db.auditLog.create({ data: { ...entry, comment: entry.comment ?? null } }),
  list: (filter: { entityType?: string; entityId?: string } = {}, excludeApplicationIds: string[] = []) =>
    prisma.auditLog.findMany({
      where: {
        ...filter,
        NOT: { entityType: 'CreditCardApplication', entityId: { in: excludeApplicationIds } },
      },
      orderBy: { timestamp: 'desc' },
    }),
};
