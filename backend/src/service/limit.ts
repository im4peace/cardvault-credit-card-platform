import { Prisma } from '@prisma/client';
import { config, prisma } from '../config/index.js';
import { auditRepo, cardRepo, limitDecisionRepo, limitRequestRepo } from '../repository/index.js';
import { AppError, type AuthUser, type LimitRequestType } from '../types/index.js';
import { withPublicDecision } from './views.js';

async function getOwned(customerId: string, id: string) {
  const req = await limitRequestRepo.findById(id);
  if (!req || req.customerId !== customerId) throw new AppError(404, 'Limit request not found');
  return req;
}

export const limitService = {
  async request(user: AuthUser, cardId: string, input: { requestedLimit: number; reason?: string }) {
    const card = await cardRepo.findById(cardId);
    if (!card || card.customerId !== user.id) throw new AppError(404, 'Card not found');
    if (card.status !== 'ACTIVE') throw new AppError(409, 'Only ACTIVE cards can request a limit change');
    if (input.requestedLimit > config.maxApprovedLimit) {
      throw new AppError(400, `Requested limit cannot exceed the system maximum (${config.maxApprovedLimit})`);
    }
    if (input.requestedLimit === card.creditLimit) throw new AppError(400, 'Requested limit equals the current limit');
    if (await limitRequestRepo.findPendingForCard(cardId)) {
      throw new AppError(409, 'This card already has a pending limit request');
    }
    const type: LimitRequestType =
      input.requestedLimit > card.creditLimit ? 'CREDIT_LIMIT_INCREASE' : 'CREDIT_LIMIT_DECREASE';
    return prisma
      .$transaction(async (tx) => {
        const req = await limitRequestRepo.create(
          {
            cardId,
            customerId: user.id,
            type,
            currentLimit: card.creditLimit,
            requestedLimit: input.requestedLimit,
            reason: input.reason ?? null,
          },
          tx,
        );
        await auditRepo.record(
          { userId: user.id, action: 'LIMIT_CHANGE_REQUESTED', entityType: 'CreditLimitRequest', entityId: req.id, comment: input.reason },
          tx,
        );
        return req;
      })
      .catch((err: unknown) => {
        // The DB enforces one PENDING request per card (partial unique index); map the race loser to 409.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new AppError(409, 'This card already has a pending limit request');
        }
        throw err;
      });
  },

  async listMine(user: AuthUser) {
    const rows = await limitRequestRepo.listByCustomer(user.id);
    return rows.map((r) => withPublicDecision(r));
  },

  async cancel(user: AuthUser, id: string) {
    await getOwned(user.id, id);
    return prisma.$transaction(async (tx) => {
      const changed = await limitRequestRepo.transition(id, 'PENDING', 'CANCELLED', tx);
      if (changed === 0) throw new AppError(409, 'Only PENDING requests can be cancelled');
      await auditRepo.record(
        { userId: user.id, action: 'LIMIT_CHANGE_CANCELLED', entityType: 'CreditLimitRequest', entityId: id },
        tx,
      );
      return withPublicDecision(await limitRequestRepo.findById(id, tx));
    });
  },

  listForReview: (status?: string) => limitRequestRepo.listByStatus(status),

  async decide(officer: AuthUser, id: string, input: { decision: 'APPROVED' | 'REJECTED'; comment?: string }) {
    const existing = await limitRequestRepo.findById(id);
    if (!existing) throw new AppError(404, 'Limit request not found');
    return prisma.$transaction(async (tx) => {
      const changed = await limitRequestRepo.transition(id, 'PENDING', input.decision, tx);
      if (changed === 0) throw new AppError(409, 'Only PENDING limit requests can be decided');
      await limitDecisionRepo.create(
        { requestId: id, officerId: officer.id, decision: input.decision, comment: input.comment ?? null },
        tx,
      );
      if (input.decision === 'APPROVED') {
        if (existing.requestedLimit > config.maxApprovedLimit) {
          throw new AppError(400, `Approved limit cannot exceed the system maximum (${config.maxApprovedLimit})`);
        }
        // Fresh read inside the tx so availableLimit is adjusted by the delta against the current card state.
        const card = await cardRepo.findById(existing.cardId, tx);
        if (!card) throw new AppError(404, 'Card not found');
        if (card.status !== 'ACTIVE') throw new AppError(409, 'Card is no longer ACTIVE; limit cannot change');
        const delta = existing.requestedLimit - card.creditLimit;
        await cardRepo.update(
          card.id,
          { creditLimit: existing.requestedLimit, availableLimit: Math.max(0, card.availableLimit + delta) },
          tx,
        );
      }
      await auditRepo.record(
        {
          userId: officer.id,
          action: input.decision === 'APPROVED' ? 'LIMIT_CHANGE_APPROVED' : 'LIMIT_CHANGE_REJECTED',
          entityType: 'CreditLimitRequest',
          entityId: id,
          comment: input.comment,
        },
        tx,
      );
      return limitRequestRepo.findById(id, tx);
    });
  },
};
