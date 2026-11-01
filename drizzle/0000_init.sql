CREATE TABLE `activity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`user` text,
	`action` text NOT NULL,
	`details` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `activity_at_ix` ON `activity` (`created_at`);--> statement-breakpoint
CREATE TABLE `condition_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`condition` integer NOT NULL,
	`notes` text,
	`source` text NOT NULL,
	`user` text,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `condition_log_item_ix` ON `condition_log` (`item_id`);--> statement-breakpoint
CREATE TABLE `item_photos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`file` text NOT NULL,
	`caption` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`created_by` text,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `item_photos_item_ix` ON `item_photos` (`item_id`);--> statement-breakpoint
CREATE TABLE `items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tag` text NOT NULL,
	`name` text NOT NULL,
	`category` text,
	`subcategory` text,
	`description` text,
	`era` text,
	`gender` text,
	`size` text,
	`chest` real,
	`waist` real,
	`hips` real,
	`inseam` real,
	`neck` real,
	`sleeve` real,
	`head` real,
	`shoe_size` text,
	`color` text,
	`material` text,
	`pattern` text,
	`quantity` integer DEFAULT 1 NOT NULL,
	`condition` integer DEFAULT 4 NOT NULL,
	`condition_notes` text,
	`location` text,
	`acquired_date` text,
	`acquired_from` text,
	`cost` real,
	`replacement_value` real,
	`rentable` integer DEFAULT true NOT NULL,
	`rental_rate` real,
	`status` text DEFAULT 'active' NOT NULL,
	`keywords` text,
	`notes` text,
	`main_photo` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`created_by` text,
	`updated_at` text,
	`updated_by` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `items_tag_uq` ON `items` (`tag`);--> statement-breakpoint
CREATE INDEX `items_category_ix` ON `items` (`category`);--> statement-breakpoint
CREATE INDEX `items_status_ix` ON `items` (`status`);--> statement-breakpoint
CREATE TABLE `lookups` (
	`list` text NOT NULL,
	`value` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`list`, `value`)
);
--> statement-breakpoint
CREATE TABLE `programs` (
	`show_id` integer PRIMARY KEY NOT NULL,
	`doc` text NOT NULL,
	`updated_at` text,
	`updated_by` text,
	FOREIGN KEY (`show_id`) REFERENCES `shows`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `rental_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`rental_id` integer NOT NULL,
	`item_id` integer NOT NULL,
	`qty` integer DEFAULT 1 NOT NULL,
	`condition_out` integer NOT NULL,
	`notes_out` text,
	`condition_in` integer,
	`notes_in` text,
	`damage_charge` real,
	FOREIGN KEY (`rental_id`) REFERENCES `rentals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `rental_items_rental_ix` ON `rental_items` (`rental_id`);--> statement-breakpoint
CREATE INDEX `rental_items_item_ix` ON `rental_items` (`item_id`);--> statement-breakpoint
CREATE TABLE `rentals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`renter_id` integer NOT NULL,
	`purpose` text,
	`date_out` text NOT NULL,
	`date_due` text,
	`date_returned` text,
	`fee` real,
	`deposit` real,
	`deposit_returned` integer,
	`status` text DEFAULT 'out' NOT NULL,
	`rating` integer,
	`rating_notes` text,
	`notes` text,
	`returned_by` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`created_by` text,
	`updated_at` text,
	`updated_by` text,
	FOREIGN KEY (`renter_id`) REFERENCES `renters`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `rentals_renter_ix` ON `rentals` (`renter_id`);--> statement-breakpoint
CREATE INDEX `rentals_status_ix` ON `rentals` (`status`);--> statement-breakpoint
CREATE TABLE `renters` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`organization` text,
	`contact_name` text,
	`email` text,
	`phone` text,
	`address` text,
	`approved` integer DEFAULT true NOT NULL,
	`approved_date` text,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`created_by` text,
	`updated_at` text,
	`updated_by` text
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `show_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`show_id` integer NOT NULL,
	`kind` text NOT NULL,
	`file` text NOT NULL,
	`original_name` text,
	`size` integer,
	`category` text,
	`caption` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`created_by` text,
	FOREIGN KEY (`show_id`) REFERENCES `shows`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `show_files_show_ix` ON `show_files` (`show_id`);--> statement-breakpoint
CREATE TABLE `show_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`show_id` integer NOT NULL,
	`item_id` integer NOT NULL,
	`qty` integer DEFAULT 1 NOT NULL,
	`character` text,
	`actor` text,
	`scene` text,
	`usage_notes` text,
	`alterations` text,
	`date_out` text NOT NULL,
	`condition_out` integer NOT NULL,
	`date_returned` text,
	`condition_in` integer,
	`notes_in` text,
	`created_by` text,
	`returned_by` text,
	FOREIGN KEY (`show_id`) REFERENCES `shows`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `show_items_show_ix` ON `show_items` (`show_id`);--> statement-breakpoint
CREATE INDEX `show_items_item_ix` ON `show_items` (`item_id`);--> statement-breakpoint
CREATE TABLE `show_numbers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`show_id` integer NOT NULL,
	`act` text,
	`number` text,
	`title` text NOT NULL,
	`singers` text,
	`scene` text,
	`notes` text,
	`sort` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`show_id`) REFERENCES `shows`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `show_numbers_show_ix` ON `show_numbers` (`show_id`);--> statement-breakpoint
CREATE TABLE `show_people` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`show_id` integer NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`role` text,
	`voice_part` text,
	`grade` text,
	`email` text,
	`phone` text,
	`notes` text,
	`sort` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`show_id`) REFERENCES `shows`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `show_people_show_ix` ON `show_people` (`show_id`);--> statement-breakpoint
CREATE TABLE `shows` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`type` text DEFAULT 'Play' NOT NULL,
	`season` text,
	`year` integer,
	`director` text,
	`venue` text,
	`open_date` text,
	`close_date` text,
	`status` text DEFAULT 'planning' NOT NULL,
	`notes` text,
	`cover` text,
	`written_by` text,
	`book_by` text,
	`music_by` text,
	`lyrics_by` text,
	`based_on` text,
	`additional_credits` text,
	`licensor` text,
	`licensing_notice` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`created_by` text,
	`updated_at` text,
	`updated_by` text
);
--> statement-breakpoint
CREATE INDEX `shows_status_ix` ON `shows` (`status`);--> statement-breakpoint
CREATE TABLE `sponsors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`tier` text,
	`ad_size` text,
	`message` text,
	`website` text,
	`contact_name` text,
	`email` text,
	`phone` text,
	`amount` real,
	`logo` text,
	`active` integer DEFAULT true NOT NULL,
	`notes` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`created_by` text,
	`updated_at` text,
	`updated_by` text
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text DEFAULT 'assistant' NOT NULL,
	`password_hash` text NOT NULL,
	`must_change_password` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`last_login_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_uq` ON `users` (`username`);