import { prisma } from '../config/index.js';
import { applicationRepo, auditRepo, cardRepo } from '../repository/index.js';
import { AppError, type AuthUser } from '../types/index.js';

export const cardService = {
  listMine: (user: AuthUser) => cardRepo.listByCustomer(user.id),

  async getMine(user: AuthUser, id: string) {
    const card = await cardRepo.findById(id);
    if (!card || card.customerId !== user.id) throw new AppError(404, 'Card not found');
    return card;
  },

  async activate(user: AuthUser, id: string) {
    const card = await this.getMine(user, id);
    return prisma.$transaction(async (tx) => {
      const changed = await cardRepo.transition(id, 'ISSUED', { status: 'ACTIVE', activatedAt: new Date() }, tx);
      if (changed === 0) throw new AppError(409, `Only ISSUED cards can be activated (card is ${card.status})`);
      await applicationRepo.transition(card.applicationId, 'CARD_ISSUED', 'CARD_ACTIVATED', tx);
      await auditRepo.record({ userId: user.id, action: 'CARD_ACTIVATED', entityType: 'Card', entityId: id }, tx);
      return cardRepo.findById(id, tx);
    });
  },
};
