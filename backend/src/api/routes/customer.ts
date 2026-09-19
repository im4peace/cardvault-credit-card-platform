import { Router } from 'express';
import { applicationService } from '../../service/application.js';
import { cardService } from '../../service/card.js';
import { limitService } from '../../service/limit.js';
import {
  applicationPatchSchema,
  applicationSchema,
  limitRequestSchema,
  type AuthUser,
} from '../../types/index.js';
import { authenticate, parse, requireRole, wrap } from '../middleware/index.js';

export const customerRouter = Router();
customerRouter.use(authenticate, requireRole('CUSTOMER'));

const me = (req: { user?: AuthUser }): AuthUser => req.user as AuthUser;
const id = (req: { params: Record<string, string | undefined> }): string => String(req.params['id']);

customerRouter.post('/applications', wrap(async (req, res) => {
  res.status(201).json(await applicationService.create(me(req), parse(applicationSchema, req.body)));
}));
customerRouter.get('/applications', wrap(async (req, res) => {
  res.json(await applicationService.listMine(me(req)));
}));
customerRouter.get('/applications/:id', wrap(async (req, res) => {
  res.json(await applicationService.getMine(me(req), id(req)));
}));
customerRouter.patch('/applications/:id', wrap(async (req, res) => {
  res.json(await applicationService.update(me(req), id(req), parse(applicationPatchSchema, req.body)));
}));
customerRouter.post('/applications/:id/submit', wrap(async (req, res) => {
  res.json(await applicationService.submit(me(req), id(req)));
}));

customerRouter.get('/cards', wrap(async (req, res) => {
  res.json(await cardService.listMine(me(req)));
}));
customerRouter.get('/cards/:id', wrap(async (req, res) => {
  res.json(await cardService.getMine(me(req), id(req)));
}));
customerRouter.post('/cards/:id/activate', wrap(async (req, res) => {
  res.json(await cardService.activate(me(req), id(req)));
}));
customerRouter.post('/cards/:id/limit-requests', wrap(async (req, res) => {
  res.status(201).json(await limitService.request(me(req), id(req), parse(limitRequestSchema, req.body)));
}));

customerRouter.get('/limit-requests', wrap(async (req, res) => {
  res.json(await limitService.listMine(me(req)));
}));
customerRouter.post('/limit-requests/:id/cancel', wrap(async (req, res) => {
  res.json(await limitService.cancel(me(req), id(req)));
}));
