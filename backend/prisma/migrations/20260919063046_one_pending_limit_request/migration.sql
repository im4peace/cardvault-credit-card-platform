-- At most one PENDING limit request per card, enforced by the database (closes a check-then-insert race).
-- Prisma cannot express partial indexes, so this lives only in SQL.
CREATE UNIQUE INDEX "CreditLimitRequest_one_pending_per_card" ON "CreditLimitRequest"("cardId") WHERE "status" = 'PENDING';
