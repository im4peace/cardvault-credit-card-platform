import { Router } from 'express';
import { applicationService } from '../../service/application.js';
import { historyService } from '../../service/history.js';
import { limitService } from '../../service/limit.js';
import { applicationDecisionSchema, limitDecisionSchema, type AuthUser } from '../../types/index.js';
import { authenticate, parse, requireRole, wrap } from '../middleware/index.js';

export const officerRouter = Router();
officerRouter.use(authenticate, requireRole('CREDIT_OFFICER'));

const me = (req: { user?: AuthUser }): AuthUser => req.user as AuthUser;
const id = (req: { params: Record<string, string | undefined> }): string => String(req.params['id']);
const status = (req: { query: Record<string, unknown> }): string | undefined =>
  typeof req.query['status'] === 'string' ? req.query['status'] : undefined;

officerRouter.get('/applications', wrap(async (req, res) => {
  res.json(await applicationService.listForReview(status(req)));
}));
officerRouter.get('/applications/:id', wrap(async (req, res) => {
  res.json(await applicationService.getForReview(id(req)));
}));
officerRouter.post('/applications/:id/decision', wrap(async (req, res) => {
  res.json(await applicationService.decide(me(req), id(req), parse(applicationDecisionSchema, req.body)));
}));

officerRouter.get('/limit-requests', wrap(async (req, res) => {
  res.json(await limitService.listForReview(status(req)));
}));
officerRouter.post('/limit-requests/:id/decision', wrap(async (req, res) => {
  res.json(await limitService.decide(me(req), id(req), parse(limitDecisionSchema, req.body)));
}));

officerRouter.get('/history', wrap(async (_req, res) => {
  res.json(await historyService.officerHistory());
}));
officerRouter.get('/audit', wrap(async (req, res) => {
  const { entityType, entityId } = req.query;
  res.json(
    await historyService.auditTrail({
      ...(typeof entityType === 'string' ? { entityType } : {}),
      ...(typeof entityId === 'string' ? { entityId } : {}),
    }),
  );
}));
