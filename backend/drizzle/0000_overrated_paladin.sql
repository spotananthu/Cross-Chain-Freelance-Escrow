CREATE TABLE `arbiter_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`dispute_id` text NOT NULL,
	`arbiter_id` text NOT NULL,
	`vote_for_client` integer NOT NULL,
	`voted_at` integer,
	FOREIGN KEY (`dispute_id`) REFERENCES `disputes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`arbiter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `bridge_transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`transfer_id` text NOT NULL,
	`source_chain` text NOT NULL,
	`destination_chain` text NOT NULL,
	`sender` text NOT NULL,
	`recipient` text NOT NULL,
	`amount` real NOT NULL,
	`token_symbol` text DEFAULT 'ETH',
	`status` text DEFAULT 'initiated',
	`confirmations` integer DEFAULT 0,
	`required_confirmations` integer DEFAULT 2,
	`source_tx_hash` text,
	`destination_tx_hash` text,
	`initiated_at` integer,
	`completed_at` integer
);
--> statement-breakpoint
CREATE TABLE `disputes` (
	`id` text PRIMARY KEY NOT NULL,
	`escrow_id` text NOT NULL,
	`milestone_id` text,
	`initiated_by` text,
	`reason` text NOT NULL,
	`votes_for_client` integer DEFAULT 0,
	`votes_for_freelancer` integer DEFAULT 0,
	`status` text DEFAULT 'open',
	`resolution_note` text,
	`resolved_at` integer,
	`created_at` integer,
	FOREIGN KEY (`escrow_id`) REFERENCES `escrows`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`milestone_id`) REFERENCES `milestones`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`initiated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `escrows` (
	`id` text PRIMARY KEY NOT NULL,
	`on_chain_id` text,
	`chain` text NOT NULL,
	`tx_hash` text,
	`client_id` text,
	`freelancer_id` text,
	`title` text NOT NULL,
	`description` text,
	`total_amount` real NOT NULL,
	`token_address` text,
	`token_symbol` text DEFAULT 'ETH',
	`status` text DEFAULT 'pending',
	`is_cross_chain` integer DEFAULT false,
	`sui_recipient` text,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`client_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`freelancer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `milestones` (
	`id` text PRIMARY KEY NOT NULL,
	`escrow_id` text NOT NULL,
	`on_chain_id` integer,
	`description` text NOT NULL,
	`amount` real NOT NULL,
	`deadline` integer,
	`status` text DEFAULT 'pending',
	`submission_note` text,
	`submitted_at` integer,
	`approved_at` integer,
	`released_at` integer,
	`release_tx_hash` text,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`escrow_id`) REFERENCES `escrows`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`data` text,
	`read` integer DEFAULT false,
	`read_at` integer,
	`created_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`evm_address` text,
	`sui_address` text,
	`ens_name` text,
	`display_name` text,
	`email` text,
	`avatar_url` text,
	`role` text DEFAULT 'freelancer',
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bridge_transfers_transfer_id_unique` ON `bridge_transfers` (`transfer_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_evm_address_unique` ON `users` (`evm_address`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_sui_address_unique` ON `users` (`sui_address`);