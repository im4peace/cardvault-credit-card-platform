import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodType } from 'zod';
import { authService } from '../../service/auth.js';
import { AppError, type AuthUser, type Role } from '../../types/index.js';

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(new AppError(401, 'Missing bearer token'));
  authService
    .authenticate(header.slice(7))
    .then((user) => {
      req.user = user;
      next();
    })
    .catch(next);
};

export const requireRole =
  (role: Role): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(new AppError(401, 'Not authenticated'));
    if (req.user.role !== role) return next(new AppError(403, `Requires role ${role}`));
    next();
  };

export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) throw new AppError(400, 'Validation failed', result.error.flatten());
  return result.data;
}

/** Wraps async handlers so rejections reach the error middleware (Express 4). */
export const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

function isBodyParserError(err: unknown): err is { status: number } {
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === 'number' && status >= 400 && status < 500 && (err as { type?: unknown }).type !== undefined;
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message, details: err.details });
  } else if (isBodyParserError(err)) {
    res.status(err.status).json({ error: 'Invalid request body' });
  } else if (err instanceof ZodError) {
    res.status(400).json({ error: 'Validation failed', details: err.flatten() });
  } else {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
