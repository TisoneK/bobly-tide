-- 0004_turn_position — payout order is first-come-first-served by who posts
-- their security first (user request 2026-10-25), not join order. A member's
-- turn_position is assigned when they secure their spot; join_order stays as
-- the join sequence (queue display).

ALTER TABLE membership ADD COLUMN turn_position INTEGER;
ALTER TABLE membership ADD COLUMN secured_at TIMESTAMPTZ;
