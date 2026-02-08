import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// ============ Users Table ============
export const users = sqliteTable('users', {
  id: text('id').primaryKey(), // UUID
  evmAddress: text('evm_address').unique(),
  suiAddress: text('sui_address').unique(),
  ensName: text('ens_name'),
  displayName: text('display_name'),
  email: text('email'),
  avatarUrl: text('avatar_url'),
  role: text('role', { enum: ['client', 'freelancer', 'arbiter'] }).default('freelancer'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// ============ Escrows Table ============
export const escrows = sqliteTable('escrows', {
  id: text('id').primaryKey(), // UUID
  onChainId: text('on_chain_id'), // Contract escrow ID
  chain: text('chain', { enum: ['evm', 'sui'] }).notNull(),
  txHash: text('tx_hash'),
  
  clientId: text('client_id').references(() => users.id),
  freelancerId: text('freelancer_id').references(() => users.id),
  
  title: text('title').notNull(),
  description: text('description'),
  
  totalAmount: real('total_amount').notNull(),
  tokenAddress: text('token_address'), // null for native token
  tokenSymbol: text('token_symbol').default('ETH'),
  
  status: text('status', { 
    enum: ['pending', 'active', 'completed', 'disputed', 'cancelled', 'refunded'] 
  }).default('pending'),
  
  isCrossChain: integer('is_cross_chain', { mode: 'boolean' }).default(false),
  suiRecipient: text('sui_recipient'), // For cross-chain escrows
  
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// ============ Milestones Table ============
export const milestones = sqliteTable('milestones', {
  id: text('id').primaryKey(),
  escrowId: text('escrow_id').references(() => escrows.id).notNull(),
  onChainId: integer('on_chain_id'), // Milestone index on-chain
  
  description: text('description').notNull(),
  amount: real('amount').notNull(),
  deadline: integer('deadline', { mode: 'timestamp' }),
  
  status: text('status', { 
    enum: ['pending', 'in_progress', 'submitted', 'approved', 'released', 'disputed', 'refunded'] 
  }).default('pending'),
  
  submissionNote: text('submission_note'),
  submittedAt: integer('submitted_at', { mode: 'timestamp' }),
  approvedAt: integer('approved_at', { mode: 'timestamp' }),
  releasedAt: integer('released_at', { mode: 'timestamp' }),
  releaseTxHash: text('release_tx_hash'),
  
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// ============ Disputes Table ============
export const disputes = sqliteTable('disputes', {
  id: text('id').primaryKey(),
  escrowId: text('escrow_id').references(() => escrows.id).notNull(),
  milestoneId: text('milestone_id').references(() => milestones.id),
  
  initiatedBy: text('initiated_by').references(() => users.id),
  reason: text('reason').notNull(),
  
  votesForClient: integer('votes_for_client').default(0),
  votesForFreelancer: integer('votes_for_freelancer').default(0),
  
  status: text('status', { 
    enum: ['open', 'voting', 'resolved_client', 'resolved_freelancer'] 
  }).default('open'),
  
  resolutionNote: text('resolution_note'),
  resolvedAt: integer('resolved_at', { mode: 'timestamp' }),
  
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// ============ Arbiter Votes Table ============
export const arbiterVotes = sqliteTable('arbiter_votes', {
  id: text('id').primaryKey(),
  disputeId: text('dispute_id').references(() => disputes.id).notNull(),
  arbiterId: text('arbiter_id').references(() => users.id).notNull(),
  voteForClient: integer('vote_for_client', { mode: 'boolean' }).notNull(),
  votedAt: integer('voted_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// ============ Bridge Transfers Table ============
export const bridgeTransfers = sqliteTable('bridge_transfers', {
  id: text('id').primaryKey(),
  transferId: text('transfer_id').notNull().unique(), // On-chain transfer ID
  
  sourceChain: text('source_chain', { enum: ['evm', 'sui'] }).notNull(),
  destinationChain: text('destination_chain', { enum: ['evm', 'sui'] }).notNull(),
  
  sender: text('sender').notNull(),
  recipient: text('recipient').notNull(),
  amount: real('amount').notNull(),
  tokenSymbol: text('token_symbol').default('ETH'),
  
  status: text('status', { 
    enum: ['initiated', 'confirming', 'confirmed', 'completed', 'failed', 'refunded'] 
  }).default('initiated'),
  
  confirmations: integer('confirmations').default(0),
  requiredConfirmations: integer('required_confirmations').default(2),
  
  sourceTxHash: text('source_tx_hash'),
  destinationTxHash: text('destination_tx_hash'),
  
  initiatedAt: integer('initiated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
});

// ============ Notifications Table ============
export const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id).notNull(),
  
  type: text('type', { 
    enum: [
      'escrow_created', 'escrow_funded', 
      'milestone_submitted', 'milestone_approved', 'milestone_released',
      'dispute_initiated', 'dispute_resolved',
      'bridge_initiated', 'bridge_completed',
      'payment_received'
    ] 
  }).notNull(),
  
  title: text('title').notNull(),
  message: text('message').notNull(),
  data: text('data'), // JSON stringified extra data
  
  read: integer('read', { mode: 'boolean' }).default(false),
  readAt: integer('read_at', { mode: 'timestamp' }),
  
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// ============ Relations ============
export const usersRelations = relations(users, ({ many }) => ({
  escrowsAsClient: many(escrows, { relationName: 'client' }),
  escrowsAsFreelancer: many(escrows, { relationName: 'freelancer' }),
  notifications: many(notifications),
}));

export const escrowsRelations = relations(escrows, ({ one, many }) => ({
  client: one(users, {
    fields: [escrows.clientId],
    references: [users.id],
    relationName: 'client',
  }),
  freelancer: one(users, {
    fields: [escrows.freelancerId],
    references: [users.id],
    relationName: 'freelancer',
  }),
  milestones: many(milestones),
  disputes: many(disputes),
}));

export const milestonesRelations = relations(milestones, ({ one }) => ({
  escrow: one(escrows, {
    fields: [milestones.escrowId],
    references: [escrows.id],
  }),
}));

export const disputesRelations = relations(disputes, ({ one, many }) => ({
  escrow: one(escrows, {
    fields: [disputes.escrowId],
    references: [escrows.id],
  }),
  milestone: one(milestones, {
    fields: [disputes.milestoneId],
    references: [milestones.id],
  }),
  initiator: one(users, {
    fields: [disputes.initiatedBy],
    references: [users.id],
  }),
  votes: many(arbiterVotes),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));
