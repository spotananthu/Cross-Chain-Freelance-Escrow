/// Cross-Chain Freelance Escrow - Main Escrow Module
/// 
/// This module handles the core escrow logic for cross-chain freelance payments.
/// Clients deposit funds, freelancers complete milestones, and funds are released
/// upon approval or through dispute resolution.
module crosschain_escrow::escrow {
    // ============ Imports ============
    use sui::object::{Self, UID, ID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::sui::SUI;
    use sui::event;
    use sui::clock::{Self, Clock};
    use sui::table::{Self, Table};
    use std::string::{Self, String};
    use std::vector;
    use std::option::{Self, Option};

    // ============ Error Constants ============
    const ENotClient: u64 = 0;
    const ENotFreelancer: u64 = 1;
    const ENotArbiter: u64 = 2;
    const EInvalidMilestone: u64 = 3;
    const EMilestoneNotPending: u64 = 4;
    const EMilestoneNotApproved: u64 = 5;
    const EInsufficientFunds: u64 = 6;
    const EEscrowNotActive: u64 = 7;
    const EEscrowAlreadyDisputed: u64 = 8;
    const EDisputeNotActive: u64 = 9;
    const EDeadlineNotPassed: u64 = 10;
    const EAlreadyVoted: u64 = 11;
    const EInvalidAmount: u64 = 12;
    const ENoMilestones: u64 = 13;

    // ============ Constants ============
    const DISPUTE_TIMEOUT_MS: u64 = 604800000; // 7 days in milliseconds
    const MIN_ARBITERS: u64 = 3;
    const PLATFORM_FEE_BPS: u64 = 100; // 1% platform fee (100 basis points)

    // ============ Milestone Status ============
    const MILESTONE_PENDING: u8 = 0;
    const MILESTONE_IN_PROGRESS: u8 = 1;
    const MILESTONE_SUBMITTED: u8 = 2;
    const MILESTONE_APPROVED: u8 = 3;
    const MILESTONE_DISPUTED: u8 = 4;
    const MILESTONE_RELEASED: u8 = 5;
    const MILESTONE_REFUNDED: u8 = 6;

    // ============ Escrow Status ============
    const ESCROW_ACTIVE: u8 = 0;
    const ESCROW_COMPLETED: u8 = 1;
    const ESCROW_DISPUTED: u8 = 2;
    const ESCROW_CANCELLED: u8 = 3;
    const ESCROW_REFUNDED: u8 = 4;

    // ============ Structs ============

    /// Platform configuration - owned by admin
    public struct PlatformConfig has key {
        id: UID,
        admin: address,
        fee_bps: u64,
        treasury: address,
        total_escrows: u64,
        total_volume: u64,
        arbiter_registry: Table<address, ArbiterInfo>,
    }

    /// Arbiter information
    public struct ArbiterInfo has store, drop {
        reputation: u64,
        cases_resolved: u64,
        is_active: bool,
    }

    /// Milestone data
    public struct Milestone has store, drop, copy {
        id: u64,
        description: String,
        amount: u64,
        status: u8,
        deadline: u64,
        submission_note: String,
        submitted_at: u64,
    }

    /// Dispute data
    public struct Dispute has store, drop {
        initiated_by: address,
        initiated_at: u64,
        reason: String,
        milestone_id: u64,
        votes_for_client: u64,
        votes_for_freelancer: u64,
        voters: vector<address>,
        resolved: bool,
        resolution_note: String,
    }

    /// Main Escrow object - shared object
    public struct Escrow has key {
        id: UID,
        /// Unique escrow identifier
        escrow_id: u64,
        /// Client (payer) address
        client: address,
        /// Freelancer (payee) address  
        freelancer: address,
        /// Project title
        title: String,
        /// Project description
        description: String,
        /// Total escrow amount
        total_amount: u64,
        /// Deposited balance
        balance: Balance<SUI>,
        /// Milestones
        milestones: vector<Milestone>,
        /// Current milestone index
        current_milestone: u64,
        /// Escrow status
        status: u8,
        /// Active dispute (if any)
        dispute: Option<Dispute>,
        /// Arbiters assigned to this escrow
        arbiters: vector<address>,
        /// Creation timestamp
        created_at: u64,
        /// Last updated timestamp
        updated_at: u64,
        /// Cross-chain source (e.g., "ethereum", "base", "polygon")
        source_chain: String,
        /// Cross-chain transaction hash (for verification)
        source_tx_hash: String,
    }

    /// Receipt given to client after creating escrow
    public struct EscrowReceipt has key {
        id: UID,
        escrow_id: ID,
        client: address,
        amount: u64,
    }

    // ============ Events ============

    public struct EscrowCreated has copy, drop {
        escrow_id: ID,
        client: address,
        freelancer: address,
        total_amount: u64,
        milestone_count: u64,
        source_chain: String,
    }

    public struct FundsDeposited has copy, drop {
        escrow_id: ID,
        depositor: address,
        amount: u64,
        new_balance: u64,
    }

    public struct MilestoneSubmitted has copy, drop {
        escrow_id: ID,
        milestone_id: u64,
        freelancer: address,
        submission_note: String,
    }

    public struct MilestoneApproved has copy, drop {
        escrow_id: ID,
        milestone_id: u64,
        client: address,
    }

    public struct MilestoneReleased has copy, drop {
        escrow_id: ID,
        milestone_id: u64,
        freelancer: address,
        amount: u64,
    }

    public struct DisputeInitiated has copy, drop {
        escrow_id: ID,
        milestone_id: u64,
        initiated_by: address,
        reason: String,
    }

    public struct DisputeVoted has copy, drop {
        escrow_id: ID,
        arbiter: address,
        vote_for_client: bool,
    }

    public struct DisputeResolved has copy, drop {
        escrow_id: ID,
        milestone_id: u64,
        winner: address,
        resolution_note: String,
    }

    public struct EscrowCompleted has copy, drop {
        escrow_id: ID,
        total_released: u64,
    }

    public struct EscrowRefunded has copy, drop {
        escrow_id: ID,
        client: address,
        amount: u64,
    }

    // ============ Init Function ============

    fun init(ctx: &mut TxContext) {
        let config = PlatformConfig {
            id: object::new(ctx),
            admin: tx_context::sender(ctx),
            fee_bps: PLATFORM_FEE_BPS,
            treasury: tx_context::sender(ctx),
            total_escrows: 0,
            total_volume: 0,
            arbiter_registry: table::new(ctx),
        };
        transfer::share_object(config);
    }

    // ============ Public Functions ============

    /// Create a new escrow with milestones
    public entry fun create_escrow(
        config: &mut PlatformConfig,
        freelancer: address,
        title: vector<u8>,
        description: vector<u8>,
        milestone_descriptions: vector<vector<u8>>,
        milestone_amounts: vector<u64>,
        milestone_deadlines: vector<u64>,
        source_chain: vector<u8>,
        source_tx_hash: vector<u8>,
        payment: Coin<SUI>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        let payment_amount = coin::value(&payment);
        
        // Validate milestones
        let milestone_count = vector::length(&milestone_descriptions);
        assert!(milestone_count > 0, ENoMilestones);
        assert!(milestone_count == vector::length(&milestone_amounts), EInvalidMilestone);
        assert!(milestone_count == vector::length(&milestone_deadlines), EInvalidMilestone);

        // Calculate total from milestones
        let mut total_amount: u64 = 0;
        let mut i: u64 = 0;
        while (i < milestone_count) {
            total_amount = total_amount + *vector::borrow(&milestone_amounts, i);
            i = i + 1;
        };

        // Ensure payment covers total
        assert!(payment_amount >= total_amount, EInsufficientFunds);

        // Build milestones vector
        let mut milestones: vector<Milestone> = vector::empty();
        i = 0;
        while (i < milestone_count) {
            let milestone = Milestone {
                id: i,
                description: string::utf8(*vector::borrow(&milestone_descriptions, i)),
                amount: *vector::borrow(&milestone_amounts, i),
                status: MILESTONE_PENDING,
                deadline: *vector::borrow(&milestone_deadlines, i),
                submission_note: string::utf8(b""),
                submitted_at: 0,
            };
            vector::push_back(&mut milestones, milestone);
            i = i + 1;
        };

        let now = clock::timestamp_ms(clock);
        
        // Create escrow
        let escrow = Escrow {
            id: object::new(ctx),
            escrow_id: config.total_escrows + 1,
            client: sender,
            freelancer,
            title: string::utf8(title),
            description: string::utf8(description),
            total_amount,
            balance: coin::into_balance(payment),
            milestones,
            current_milestone: 0,
            status: ESCROW_ACTIVE,
            dispute: option::none(),
            arbiters: vector::empty(),
            created_at: now,
            updated_at: now,
            source_chain: string::utf8(source_chain),
            source_tx_hash: string::utf8(source_tx_hash),
        };

        let escrow_id = object::id(&escrow);

        // Update platform stats
        config.total_escrows = config.total_escrows + 1;
        config.total_volume = config.total_volume + total_amount;

        // Emit event
        event::emit(EscrowCreated {
            escrow_id,
            client: sender,
            freelancer,
            total_amount,
            milestone_count,
            source_chain: string::utf8(source_chain),
        });

        // Create receipt for client
        let receipt = EscrowReceipt {
            id: object::new(ctx),
            escrow_id,
            client: sender,
            amount: total_amount,
        };

        transfer::transfer(receipt, sender);
        transfer::share_object(escrow);
    }

    /// Freelancer submits work for a milestone
    public entry fun submit_milestone(
        escrow: &mut Escrow,
        milestone_id: u64,
        submission_note: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        
        // Verify sender is freelancer
        assert!(sender == escrow.freelancer, ENotFreelancer);
        assert!(escrow.status == ESCROW_ACTIVE, EEscrowNotActive);
        assert!(milestone_id < vector::length(&escrow.milestones), EInvalidMilestone);

        let milestone = vector::borrow_mut(&mut escrow.milestones, milestone_id);
        assert!(milestone.status == MILESTONE_PENDING || milestone.status == MILESTONE_IN_PROGRESS, EMilestoneNotPending);

        milestone.status = MILESTONE_SUBMITTED;
        milestone.submission_note = string::utf8(submission_note);
        milestone.submitted_at = clock::timestamp_ms(clock);
        escrow.updated_at = clock::timestamp_ms(clock);

        event::emit(MilestoneSubmitted {
            escrow_id: object::id(escrow),
            milestone_id,
            freelancer: sender,
            submission_note: string::utf8(submission_note),
        });
    }

    /// Client approves a submitted milestone
    public entry fun approve_milestone(
        escrow: &mut Escrow,
        milestone_id: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        
        // Verify sender is client
        assert!(sender == escrow.client, ENotClient);
        assert!(escrow.status == ESCROW_ACTIVE, EEscrowNotActive);
        assert!(milestone_id < vector::length(&escrow.milestones), EInvalidMilestone);

        let milestone = vector::borrow_mut(&mut escrow.milestones, milestone_id);
        assert!(milestone.status == MILESTONE_SUBMITTED, EMilestoneNotPending);

        milestone.status = MILESTONE_APPROVED;
        escrow.updated_at = clock::timestamp_ms(clock);

        event::emit(MilestoneApproved {
            escrow_id: object::id(escrow),
            milestone_id,
            client: sender,
        });
    }

    /// Release funds for an approved milestone to freelancer
    public entry fun release_milestone(
        escrow: &mut Escrow,
        config: &PlatformConfig,
        milestone_id: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        
        // Either client or system can release approved milestones
        assert!(sender == escrow.client || sender == config.admin, ENotClient);
        assert!(escrow.status == ESCROW_ACTIVE, EEscrowNotActive);
        assert!(milestone_id < vector::length(&escrow.milestones), EInvalidMilestone);

        let milestone = vector::borrow_mut(&mut escrow.milestones, milestone_id);
        assert!(milestone.status == MILESTONE_APPROVED, EMilestoneNotApproved);

        let amount = milestone.amount;
        assert!(balance::value(&escrow.balance) >= amount, EInsufficientFunds);

        // Calculate platform fee
        let fee = (amount * config.fee_bps) / 10000;
        let freelancer_amount = amount - fee;

        // Update milestone status
        milestone.status = MILESTONE_RELEASED;
        escrow.updated_at = clock::timestamp_ms(clock);

        // Transfer to freelancer
        let payment = coin::from_balance(
            balance::split(&mut escrow.balance, freelancer_amount),
            ctx
        );
        transfer::public_transfer(payment, escrow.freelancer);

        // Transfer fee to treasury
        if (fee > 0) {
            let fee_payment = coin::from_balance(
                balance::split(&mut escrow.balance, fee),
                ctx
            );
            transfer::public_transfer(fee_payment, config.treasury);
        };

        event::emit(MilestoneReleased {
            escrow_id: object::id(escrow),
            milestone_id,
            freelancer: escrow.freelancer,
            amount: freelancer_amount,
        });

        // Check if all milestones are released
        check_escrow_completion(escrow);
    }

    /// Initiate a dispute for a milestone
    public entry fun initiate_dispute(
        escrow: &mut Escrow,
        milestone_id: u64,
        reason: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        
        // Either party can initiate dispute
        assert!(sender == escrow.client || sender == escrow.freelancer, ENotClient);
        assert!(escrow.status == ESCROW_ACTIVE, EEscrowNotActive);
        assert!(option::is_none(&escrow.dispute), EEscrowAlreadyDisputed);
        assert!(milestone_id < vector::length(&escrow.milestones), EInvalidMilestone);

        let milestone = vector::borrow_mut(&mut escrow.milestones, milestone_id);
        milestone.status = MILESTONE_DISPUTED;

        let dispute = Dispute {
            initiated_by: sender,
            initiated_at: clock::timestamp_ms(clock),
            reason: string::utf8(reason),
            milestone_id,
            votes_for_client: 0,
            votes_for_freelancer: 0,
            voters: vector::empty(),
            resolved: false,
            resolution_note: string::utf8(b""),
        };

        escrow.dispute = option::some(dispute);
        escrow.status = ESCROW_DISPUTED;
        escrow.updated_at = clock::timestamp_ms(clock);

        event::emit(DisputeInitiated {
            escrow_id: object::id(escrow),
            milestone_id,
            initiated_by: sender,
            reason: string::utf8(reason),
        });
    }

    /// Arbiter votes on a dispute
    public entry fun vote_dispute(
        escrow: &mut Escrow,
        config: &PlatformConfig,
        vote_for_client: bool,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        
        assert!(escrow.status == ESCROW_DISPUTED, EDisputeNotActive);
        assert!(option::is_some(&escrow.dispute), EDisputeNotActive);
        
        // Verify sender is registered arbiter
        assert!(table::contains(&config.arbiter_registry, sender), ENotArbiter);

        let dispute = option::borrow_mut(&mut escrow.dispute);
        assert!(!dispute.resolved, EDisputeNotActive);
        
        // Check if already voted
        let mut has_voted = false;
        let mut i: u64 = 0;
        while (i < vector::length(&dispute.voters)) {
            if (*vector::borrow(&dispute.voters, i) == sender) {
                has_voted = true;
                break
            };
            i = i + 1;
        };
        assert!(!has_voted, EAlreadyVoted);

        // Record vote
        vector::push_back(&mut dispute.voters, sender);
        if (vote_for_client) {
            dispute.votes_for_client = dispute.votes_for_client + 1;
        } else {
            dispute.votes_for_freelancer = dispute.votes_for_freelancer + 1;
        };

        escrow.updated_at = clock::timestamp_ms(clock);

        event::emit(DisputeVoted {
            escrow_id: object::id(escrow),
            arbiter: sender,
            vote_for_client,
        });

        // Check if we have enough votes to resolve
        let total_votes = dispute.votes_for_client + dispute.votes_for_freelancer;
        if (total_votes >= MIN_ARBITERS) {
            resolve_dispute_internal(escrow, config, clock, ctx);
        };
    }

    /// Refund remaining balance to client (only if escrow cancelled/disputed in client's favor)
    public entry fun refund_to_client(
        escrow: &mut Escrow,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(sender == escrow.client, ENotClient);
        assert!(
            escrow.status == ESCROW_CANCELLED || escrow.status == ESCROW_REFUNDED,
            EEscrowNotActive
        );

        let remaining = balance::value(&escrow.balance);
        if (remaining > 0) {
            let refund = coin::from_balance(
                balance::split(&mut escrow.balance, remaining),
                ctx
            );
            transfer::public_transfer(refund, escrow.client);

            escrow.updated_at = clock::timestamp_ms(clock);

            event::emit(EscrowRefunded {
                escrow_id: object::id(escrow),
                client: escrow.client,
                amount: remaining,
            });
        };
    }

    // ============ Admin Functions ============

    /// Register a new arbiter
    public entry fun register_arbiter(
        config: &mut PlatformConfig,
        arbiter: address,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == config.admin, ENotArbiter);
        
        let info = ArbiterInfo {
            reputation: 100,
            cases_resolved: 0,
            is_active: true,
        };
        table::add(&mut config.arbiter_registry, arbiter, info);
    }

    /// Update platform fee
    public entry fun update_fee(
        config: &mut PlatformConfig,
        new_fee_bps: u64,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == config.admin, ENotArbiter);
        config.fee_bps = new_fee_bps;
    }

    /// Update treasury address
    public entry fun update_treasury(
        config: &mut PlatformConfig,
        new_treasury: address,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == config.admin, ENotArbiter);
        config.treasury = new_treasury;
    }

    // ============ View Functions ============

    /// Get escrow details
    public fun get_escrow_info(escrow: &Escrow): (
        address,    // client
        address,    // freelancer
        u64,        // total_amount
        u64,        // balance
        u8,         // status
        u64,        // milestone_count
        u64,        // current_milestone
    ) {
        (
            escrow.client,
            escrow.freelancer,
            escrow.total_amount,
            balance::value(&escrow.balance),
            escrow.status,
            vector::length(&escrow.milestones),
            escrow.current_milestone,
        )
    }

    /// Get milestone details
    public fun get_milestone(escrow: &Escrow, index: u64): (
        u64,        // id
        u64,        // amount
        u8,         // status
        u64,        // deadline
    ) {
        let milestone = vector::borrow(&escrow.milestones, index);
        (
            milestone.id,
            milestone.amount,
            milestone.status,
            milestone.deadline,
        )
    }

    /// Check if escrow has active dispute
    public fun has_dispute(escrow: &Escrow): bool {
        option::is_some(&escrow.dispute)
    }

    /// Get platform stats
    public fun get_platform_stats(config: &PlatformConfig): (u64, u64, u64) {
        (config.total_escrows, config.total_volume, config.fee_bps)
    }

    // ============ Internal Functions ============

    fun resolve_dispute_internal(
        escrow: &mut Escrow,
        config: &PlatformConfig,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let dispute = option::borrow_mut(&mut escrow.dispute);
        
        let milestone_id = dispute.milestone_id;
        let milestone = vector::borrow_mut(&mut escrow.milestones, milestone_id);
        let amount = milestone.amount;

        let (winner, resolution) = if (dispute.votes_for_client > dispute.votes_for_freelancer) {
            // Client wins - refund
            milestone.status = MILESTONE_REFUNDED;
            (escrow.client, b"Resolved in favor of client")
        } else {
            // Freelancer wins - release
            milestone.status = MILESTONE_RELEASED;
            
            // Transfer to freelancer
            let fee = (amount * config.fee_bps) / 10000;
            let freelancer_amount = amount - fee;
            
            if (balance::value(&escrow.balance) >= freelancer_amount) {
                let payment = coin::from_balance(
                    balance::split(&mut escrow.balance, freelancer_amount),
                    ctx
                );
                transfer::public_transfer(payment, escrow.freelancer);

                if (fee > 0 && balance::value(&escrow.balance) >= fee) {
                    let fee_payment = coin::from_balance(
                        balance::split(&mut escrow.balance, fee),
                        ctx
                    );
                    transfer::public_transfer(fee_payment, config.treasury);
                };
            };
            
            (escrow.freelancer, b"Resolved in favor of freelancer")
        };

        dispute.resolved = true;
        dispute.resolution_note = string::utf8(resolution);
        escrow.status = ESCROW_ACTIVE;
        escrow.updated_at = clock::timestamp_ms(clock);

        event::emit(DisputeResolved {
            escrow_id: object::id(escrow),
            milestone_id,
            winner,
            resolution_note: string::utf8(resolution),
        });

        check_escrow_completion(escrow);
    }

    fun check_escrow_completion(escrow: &mut Escrow) {
        let mut all_released = true;
        let mut i: u64 = 0;
        let len = vector::length(&escrow.milestones);
        
        while (i < len) {
            let milestone = vector::borrow(&escrow.milestones, i);
            if (milestone.status != MILESTONE_RELEASED && milestone.status != MILESTONE_REFUNDED) {
                all_released = false;
                break
            };
            i = i + 1;
        };

        if (all_released) {
            escrow.status = ESCROW_COMPLETED;
            event::emit(EscrowCompleted {
                escrow_id: object::id(escrow),
                total_released: escrow.total_amount,
            });
        };
    }

    // ============ Test Functions ============
    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx)
    }
}
