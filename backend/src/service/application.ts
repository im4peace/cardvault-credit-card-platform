import { config, prisma } from '../config/index.js';
import { applicationRepo, auditRepo, cardRepo, decisionRepo } from '../repository/index.js';
import { AppError, type ApplicationDecisionInput, type ApplicationInput, type AuthUser } from '../types/index.js';
import { withPublicDecision } from './views.js';

async function getOwned(customerId: string, id: string) {
  const app = await applicationRepo.findById(id);
  // Not-owner is reported as 404 so other customers' records are not disclosed.
  if (!app || app.customerId !== customerId) throw new AppError(404, 'Application not found');
  return app;
}

/** DRAFTs are private to the customer: the Credit Team only ever sees submitted applications. */
async function getSubmitted(id: string) {
  const app = await applicationRepo.findById(id);
  if (!app || app.status === 'DRAFT') throw new AppError(404, 'Application not found');
  return app;
}

function assertApprovable(approvedLimit: number, requested: number): void {
  if (approvedLimit > requested) {
    throw new AppError(400, `Approved limit cannot exceed the requested limit (${requested})`);
  }
  if (approvedLimit > config.maxApprovedLimit) {
    throw new AppError(400, `Approved limit cannot exceed the system maximum (${config.maxApprovedLimit})`);
  }
}

export const applicationService = {
  async create(user: AuthUser, input: ApplicationInput) {
    return prisma.$transaction(async (tx) => {
      const app = await applicationRepo.create({ ...input, customerId: user.id, status: 'DRAFT' }, tx);
      await auditRepo.record(
        { userId: user.id, action: 'APPLICATION_CREATED', entityType: 'CreditCardApplication', entityId: app.id },
        tx,
      );
      return app;
    });
  },

  async update(user: AuthUser, id: string, patch: Partial<ApplicationInput>) {
    const app = await getOwned(user.id, id);
    if (app.status !== 'DRAFT') throw new AppError(409, 'Only DRAFT applications can be edited');
    // Atomic guard: a concurrent submit between the read above and this write must not allow the edit.
    const hasChanges = Object.values(patch).some((v) => v !== undefined);
    if (hasChanges && (await applicationRepo.updateDraft(id, patch)) === 0) {
      throw new AppError(409, 'Only DRAFT applications can be edited');
    }
    return withPublicDecision(await applicationRepo.findById(id));
  },

  async submit(user: AuthUser, id: string) {
    await getOwned(user.id, id);
    return prisma.$transaction(async (tx) => {
      // DRAFT -> SUBMITTED -> PENDING_CREDIT_REVIEW happen in one action; the CAS guards double-submit.
      const changed = await applicationRepo.transition(id, 'DRAFT', 'PENDING_CREDIT_REVIEW', tx, {
        submittedAt: new Date(),
      });
      if (changed === 0) throw new AppError(409, 'Only DRAFT applications can be submitted');
      await auditRepo.record(
        { userId: user.id, action: 'APPLICATION_SUBMITTED', entityType: 'CreditCardApplication', entityId: id },
        tx,
      );
      return withPublicDecision(await applicationRepo.findById(id, tx));
    });
  },

  async listMine(user: AuthUser) {
    const apps = await applicationRepo.listByCustomer(user.id);
    return apps.map((a) => withPublicDecision(a));
  },
  async getMine(user: AuthUser, id: string) {
    return withPublicDecision(await getOwned(user.id, id));
  },

  async listForReview(status?: string) {
    if (status === 'DRAFT') return [];
    return applicationRepo.listSubmitted(status);
  },
  getForReview: (id: string) => getSubmitted(id),

  async decide(officer: AuthUser, id: string, input: ApplicationDecisionInput) {
    const existing = await getSubmitted(id);
    if (input.decision === 'APPROVED') assertApprovable(input.approvedLimit, existing.requestedCreditLimit);
    return prisma.$transaction(async (tx) => {
      const approved = input.decision === 'APPROVED';
      const target = approved ? 'CARD_ISSUED' : 'REJECTED';
      const changed = await applicationRepo.transition(id, 'PENDING_CREDIT_REVIEW', target, tx);
      if (changed === 0) throw new AppError(409, 'Only PENDING_CREDIT_REVIEW applications can be decided');

      await decisionRepo.create(
        {
          applicationId: id,
          officerId: officer.id,
          decision: input.decision,
          approvedLimit: approved ? input.approvedLimit : null,
          comment: input.comment ?? null,
        },
        tx,
      );
      const entity = { entityType: 'CreditCardApplication', entityId: id };
      await auditRepo.record(
        { userId: officer.id, action: approved ? 'APPLICATION_APPROVED' : 'APPLICATION_REJECTED', ...entity, comment: input.comment },
        tx,
      );
      if (approved) {
        const card = await cardRepo.create(
          {
            customerId: existing.customerId,
            applicationId: id,
            status: 'ISSUED',
            creditLimit: input.approvedLimit,
            availableLimit: input.approvedLimit,
          },
          tx,
        );
        await auditRepo.record(
          { userId: officer.id, action: 'CARD_ISSUED', entityType: 'Card', entityId: card.id, comment: `Limit ${input.approvedLimit}` },
          tx,
        );
      }
      return applicationRepo.findById(id, tx);
    });
  },
};
