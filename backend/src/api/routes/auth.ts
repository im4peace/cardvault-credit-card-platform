import { Router } from 'express';
import { authService } from '../../service/auth.js';
import { loginSchema, registerSchema } from '../../types/index.js';
import { authenticate, parse, wrap } from '../middleware/index.js';

export const authRouter = Router();

authRouter.post('/register', wrap(async (req, res) => {
  res.status(201).json(await authService.register(parse(registerSchema, req.body)));
}));
authRouter.post('/login', wrap(async (req, res) => {
  const { email, password } = parse(loginSchema, req.body);
  res.json(await authService.login(email, password, req.ip ?? 'unknown'));
}));
authRouter.get('/me', authenticate, (req, res) => {
  res.json(req.user);
});
