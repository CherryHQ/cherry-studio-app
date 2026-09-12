-- ON DELETE SET NULL is written by hand: drizzle-kit drops the referential
-- action from SQLite ADD COLUMN output even though the snapshot records it.
-- Without it the default NO ACTION would block deleting any Session that has
-- been forked from.
ALTER TABLE `agent_session` ADD `forked_from_session_id` text REFERENCES agent_session(id) ON DELETE SET NULL;
