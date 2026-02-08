/// Cross-Chain Workspace Escrow with HTLC
/// 
/// This module implements Hash Time-Locked Contract (HTLC) pattern for
/// atomic cross-chain payments via 1inch Fusion+.
/// 
/// Flow:
/// 1. Client creates workspace with secret_hash from 1inch order
/// 2. Funds are locked until secret is revealed or timeout expires
/// 3. Freelancer reveals secret to claim funds (atomic with EVM side)
/// 4. If timeout expires, client can refund
module crosschain_escrow::workspace {
    // ============ Imports ============
    use sui::object::{Self, UID, ID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::sui::SUI;
    use sui::event;
    use sui::clock::{Self, Clock};
    use sui::hash;
    use std::string::{Self, String};
    use std::vector;

    // ============ Error Constants ============
    const ENotClient: u64 = 0;
    const ENotFreelancer: u64 = 1;
    const EInvalidSecretHash: u64 = 2;
    const ESecretMismatch: u64 = 3;
    const EAlreadyReleased: u64 = 4;
    const EAlreadyRefunded: u64 = 5;
    const ETimelockNotExpired: u64 = 6;
    const ETimelockExpired: u64 = 7;
    const EInvalidAmount: u64 = 8;
    const EInvalidStatus: u64 = 9;

    // ============ Status Constants ============
    const STATUS_LOCKED: u8 = 0;
    const STATUS_RELEASED: u8 = 1;
    const STATUS_REFUNDED: u8 = 2;

    // ============ Timelock Constants ============
    const DEFAULT_TIMELOCK_MS: u64 = 86400000; // 24 hours in milliseconds

    // ============ Structs ============

    /// Workspace object representing a cross-chain escrow with HTLC
    /// This is a shared object that can be accessed by both client and freelancer
    public struct Workspace has key {
        id: UID,
        /// Client's EVM address (as bytes for cross-chain reference)
        client_evm_address: vector<u8>,
        /// Client's Sui address (for refund)
        client_sui_address: address,
        /// Freelancer's Sui address (for release)
        freelancer_address: address,
        /// Total locked amount
        amount: u64,
        /// Locked funds
        balance: Balance<SUI>,
        /// SHA256 hash of the secret (from 1inch Fusion+ order)
        secret_hash: vector<u8>,
        /// Current status
        status: u8,
        /// Timelock expiry timestamp (milliseconds)
        timelock_expiry: u64,
        /// Project title for reference
        title: String,
        /// Milestone description
        milestone_description: String,
        /// Source chain identifier (e.g., "base", "ethereum")
        source_chain: String,
        /// 1inch order hash for cross-reference
        fusion_order_hash: vector<u8>,
        /// Creation timestamp
        created_at: u64,
        /// Release timestamp (if released)
        released_at: u64,
        /// Revealed secret (stored after successful release)
        revealed_secret: vector<u8>,
    }

    /// Capability for workspace creator
    public struct WorkspaceCreatorCap has key, store {
        id: UID,
        workspace_id: ID,
    }

    // ============ Events ============

    public struct WorkspaceCreated has copy, drop {
        workspace_id: ID,
        client_sui_address: address,
        freelancer_address: address,
        amount: u64,
        secret_hash: vector<u8>,
        timelock_expiry: u64,
        source_chain: String,
    }

    public struct FundsLocked has copy, drop {
        workspace_id: ID,
        amount: u64,
        locked_at: u64,
    }

    public struct FundsReleased has copy, drop {
        workspace_id: ID,
        freelancer: address,
        amount: u64,
        secret: vector<u8>,
        released_at: u64,
    }

    public struct FundsRefunded has copy, drop {
        workspace_id: ID,
        client: address,
        amount: u64,
        refunded_at: u64,
    }

    // ============ Public Functions ============

    /// Create a new workspace with HTLC
    /// Called by the bridge relayer after 1inch Fusion+ order is created on EVM
    public entry fun create_workspace(
        client_evm_address: vector<u8>,
        freelancer_address: address,
        secret_hash: vector<u8>,
        title: vector<u8>,
        milestone_description: vector<u8>,
        source_chain: vector<u8>,
        fusion_order_hash: vector<u8>,
        timelock_duration_ms: u64,
        payment: Coin<SUI>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let amount = coin::value(&payment);
        assert!(amount > 0, EInvalidAmount);
        assert!(vector::length(&secret_hash) == 32, EInvalidSecretHash);

        let current_time = clock::timestamp_ms(clock);
        let timelock = if (timelock_duration_ms > 0) {
            timelock_duration_ms
        } else {
            DEFAULT_TIMELOCK_MS
        };

        let workspace_uid = object::new(ctx);
        let workspace_id = object::uid_to_inner(&workspace_uid);

        let workspace = Workspace {
            id: workspace_uid,
            client_evm_address,
            client_sui_address: tx_context::sender(ctx),
            freelancer_address,
            amount,
            balance: coin::into_balance(payment),
            secret_hash,
            status: STATUS_LOCKED,
            timelock_expiry: current_time + timelock,
            title: string::utf8(title),
            milestone_description: string::utf8(milestone_description),
            source_chain: string::utf8(source_chain),
            fusion_order_hash,
            created_at: current_time,
            released_at: 0,
            revealed_secret: vector::empty(),
        };

        // Emit creation event
        event::emit(WorkspaceCreated {
            workspace_id,
            client_sui_address: tx_context::sender(ctx),
            freelancer_address,
            amount,
            secret_hash: workspace.secret_hash,
            timelock_expiry: workspace.timelock_expiry,
            source_chain: workspace.source_chain,
        });

        event::emit(FundsLocked {
            workspace_id,
            amount,
            locked_at: current_time,
        });

        // Create capability for creator
        let cap = WorkspaceCreatorCap {
            id: object::new(ctx),
            workspace_id,
        };

        // Share the workspace so both parties can interact
        transfer::share_object(workspace);
        // Transfer capability to creator
        transfer::transfer(cap, tx_context::sender(ctx));
    }

    /// Release funds to freelancer by revealing the secret (preimage)
    /// This is the atomic operation - freelancer reveals secret to claim funds
    /// The same secret unlocks funds on both EVM (1inch) and Sui side
    public entry fun release_funds(
        workspace: &mut Workspace,
        secret: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        // Verify caller is the freelancer
        assert!(tx_context::sender(ctx) == workspace.freelancer_address, ENotFreelancer);
        
        // Verify workspace is still locked
        assert!(workspace.status == STATUS_LOCKED, EAlreadyReleased);
        
        // Verify timelock has not expired
        let current_time = clock::timestamp_ms(clock);
        assert!(current_time < workspace.timelock_expiry, ETimelockExpired);

        // Verify secret matches hash: sha256(secret) == secret_hash
        let computed_hash = hash::keccak256(&secret);
        assert!(computed_hash == workspace.secret_hash, ESecretMismatch);

        // Update status
        workspace.status = STATUS_RELEASED;
        workspace.released_at = current_time;
        workspace.revealed_secret = secret;

        // Transfer funds to freelancer
        let amount = balance::value(&workspace.balance);
        let payment = coin::from_balance(
            balance::withdraw_all(&mut workspace.balance),
            ctx
        );
        transfer::public_transfer(payment, workspace.freelancer_address);

        // Emit release event
        event::emit(FundsReleased {
            workspace_id: object::uid_to_inner(&workspace.id),
            freelancer: workspace.freelancer_address,
            amount,
            secret,
            released_at: current_time,
        });
    }

    /// Refund funds to client after timelock expires
    /// Client can only refund if freelancer didn't reveal secret in time
    public entry fun refund(
        workspace: &mut Workspace,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        // Verify caller is the client
        assert!(tx_context::sender(ctx) == workspace.client_sui_address, ENotClient);
        
        // Verify workspace is still locked
        assert!(workspace.status == STATUS_LOCKED, EAlreadyRefunded);
        
        // Verify timelock has expired
        let current_time = clock::timestamp_ms(clock);
        assert!(current_time >= workspace.timelock_expiry, ETimelockNotExpired);

        // Update status
        workspace.status = STATUS_REFUNDED;

        // Transfer funds back to client
        let amount = balance::value(&workspace.balance);
        let payment = coin::from_balance(
            balance::withdraw_all(&mut workspace.balance),
            ctx
        );
        transfer::public_transfer(payment, workspace.client_sui_address);

        // Emit refund event
        event::emit(FundsRefunded {
            workspace_id: object::uid_to_inner(&workspace.id),
            client: workspace.client_sui_address,
            amount,
            refunded_at: current_time,
        });
    }

    // ============ View Functions ============

    /// Get workspace status
    public fun get_status(workspace: &Workspace): u8 {
        workspace.status
    }

    /// Get locked amount
    public fun get_amount(workspace: &Workspace): u64 {
        workspace.amount
    }

    /// Get remaining balance
    public fun get_balance(workspace: &Workspace): u64 {
        balance::value(&workspace.balance)
    }

    /// Get secret hash
    public fun get_secret_hash(workspace: &Workspace): vector<u8> {
        workspace.secret_hash
    }

    /// Get timelock expiry
    public fun get_timelock_expiry(workspace: &Workspace): u64 {
        workspace.timelock_expiry
    }

    /// Get freelancer address
    public fun get_freelancer(workspace: &Workspace): address {
        workspace.freelancer_address
    }

    /// Get client Sui address
    public fun get_client_sui(workspace: &Workspace): address {
        workspace.client_sui_address
    }

    /// Check if timelock has expired
    public fun is_timelock_expired(workspace: &Workspace, clock: &Clock): bool {
        clock::timestamp_ms(clock) >= workspace.timelock_expiry
    }

    /// Check if funds are released
    public fun is_released(workspace: &Workspace): bool {
        workspace.status == STATUS_RELEASED
    }

    /// Check if funds are refunded  
    public fun is_refunded(workspace: &Workspace): bool {
        workspace.status == STATUS_REFUNDED
    }

    /// Get revealed secret (only available after release)
    public fun get_revealed_secret(workspace: &Workspace): vector<u8> {
        workspace.revealed_secret
    }

    // ============ Status Constants Accessors ============
    
    public fun status_locked(): u8 { STATUS_LOCKED }
    public fun status_released(): u8 { STATUS_RELEASED }
    public fun status_refunded(): u8 { STATUS_REFUNDED }
}
