ALTER TABLE `project` ADD `owner_id` text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `project_owner_id_idx` ON `project` (`owner_id`);
