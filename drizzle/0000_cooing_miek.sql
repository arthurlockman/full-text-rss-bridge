CREATE TABLE `articles` (
	`id` text PRIMARY KEY NOT NULL,
	`feed_id` text NOT NULL,
	`guid` text NOT NULL,
	`url` text NOT NULL,
	`title` text,
	`author` text,
	`summary` text,
	`content_html` text,
	`content_hash` text,
	`extraction_status` text DEFAULT 'pending' NOT NULL,
	`extraction_error` text,
	`published_at` integer,
	`fetched_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`feed_id`) REFERENCES `feeds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `articles_feed_guid_idx` ON `articles` (`feed_id`,`guid`);--> statement-breakpoint
CREATE INDEX `articles_feed_published_idx` ON `articles` (`feed_id`,`published_at`);--> statement-breakpoint
CREATE TABLE `feeds` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`source_url` text NOT NULL,
	`site_id` text,
	`extraction_mode` text DEFAULT 'readability' NOT NULL,
	`selector_config` text,
	`output_format` text DEFAULT 'rss' NOT NULL,
	`access_token` text NOT NULL,
	`refresh_interval_minutes` integer DEFAULT 60 NOT NULL,
	`max_items` integer DEFAULT 50 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_refreshed_at` integer,
	`last_error` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `feeds_access_token_idx` ON `feeds` (`access_token`);--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`feed_id` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`items_seen` integer DEFAULT 0 NOT NULL,
	`items_extracted` integer DEFAULT 0 NOT NULL,
	`error` text,
	`started_at` integer DEFAULT (unixepoch()) NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`feed_id`) REFERENCES `feeds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sites` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`domain` text NOT NULL,
	`login_url` text,
	`storage_state` text,
	`storage_encrypted` integer DEFAULT false NOT NULL,
	`session_status` text DEFAULT 'unknown' NOT NULL,
	`validation_url` text,
	`logged_in_selector` text,
	`last_validated_at` integer,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
