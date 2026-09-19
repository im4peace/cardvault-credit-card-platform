import { applicationRepo, auditRepo, limitRequestRepo } from '../repository/index.js';

export const historyService = {
  async officerHistory() {
    const [applications, limitRequests] = await Promise.all([
      applicationRepo.listDecided(),
      limitRequestRepo.listDecided(),
    ]);
    return { applications, limitRequests };
  },
  /** Audit rows about still-DRAFT applications are private to the customer, like the drafts themselves. */
  async auditTrail(filter: { entityType?: string; entityId?: string }) {
    return auditRepo.list(filter, await applicationRepo.draftIds());
  },
};
