/// Cross-Chain Freelance Escrow - Yield Module
/// 
/// This module enables idle escrow funds to earn DeFi yield while locked.
/// Integrates with Sui DeFi protocols to maximize returns for both parties.
module crosschain_escrow::yield {
    // ============ Imports ============
    use sui::object::{Self, UID, ID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::sui::SUI;
    use sui::event;
    use sui::clock::{Self, Clock};
    use std::string::{Self, String};
    use std::option::{Self, Option};

    // ============ Error Constants ============
    const ENotAuthorized: u64 = 0;
    const EInsufficientBalance: u64 = 1;
    const EYieldNotActive: u64 = 2;
    const EInvalidProtocol: u64 = 3;
    const EWithdrawalLocked: u64 = 4;
    const EZeroAmount: u64 = 5;

    // ============ Constants ============
    const MIN_DEPOSIT_AMOUNT: u64 = 1_000_000_000; // 1 SUI minimum
    const YIELD_LOCK_PERIOD_MS: u64 = 86400000; // 24 hours lock after deposit

    // ============ Protocol Types ============
    const PROTOCOL_CETUS: u8 = 0;
    const PROTOCOL_TURBOS: u8 = 1;
    const PROTOCOL_NAVI: u8 = 2;
    const PROTOCOL_SCALLOP: u8 = 3;

    // ============ Structs ============

    /// Yield strategy configuration
    public struct YieldConfig has key {
        id: UID,
        admin: address,
        /// Supported protocols and their APY (basis points)
        cetus_apy_bps: u64,
        turbos_apy_bps: u64,
        navi_apy_bps: u64,
        scallop_apy_bps: u64,
        /// Total value locked
        total_tvl: u64,
        /// Total yield generated
        total_yield: u64,
        /// Is yield farming active
        is_active: bool,
    }

    /// Yield position for an escrow
    public struct YieldPosition has key, store {
        id: UID,
        /// Associated escrow ID
        escrow_id: ID,
        /// Owner (escrow contract address)
        owner: address,
        /// Principal deposited
        principal: Balance<SUI>,
        /// Accrued yield
        accrued_yield: Balance<SUI>,
        /// Protocol being used
        protocol: u8,
        /// Timestamp of deposit
        deposited_at: u64,
        /// Last yield claim timestamp
        last_claim_at: u64,
        /// Is position active
        is_active: bool,
    }

    /// Receipt for yield deposit
    public struct YieldReceipt has key {
        id: UID,
        position_id: ID,
        escrow_id: ID,
        principal: u64,
        protocol: u8,
        deposited_at: u64,
    }

    // ============ Events ============

    public struct YieldDeposited has copy, drop {
        position_id: ID,
        escrow_id: ID,
        amount: u64,
        protocol: u8,
    }

    public struct YieldClaimed has copy, drop {
        position_id: ID,
        escrow_id: ID,
        yield_amount: u64,
        protocol: u8,
    }

    public struct YieldWithdrawn has copy, drop {
        position_id: ID,
        escrow_id: ID,
        principal: u64,
        yield_amount: u64,
    }

    public struct ProtocolUpdated has copy, drop {
        protocol: u8,
        new_apy_bps: u64,
    }

    // ============ Init Function ============

    fun init(ctx: &mut TxContext) {
        let config = YieldConfig {
            id: object::new(ctx),
            admin: tx_context::sender(ctx),
            cetus_apy_bps: 500,     // 5% APY
            turbos_apy_bps: 450,    // 4.5% APY
            navi_apy_bps: 600,      // 6% APY
            scallop_apy_bps: 550,   // 5.5% APY
            total_tvl: 0,
            total_yield: 0,
            is_active: true,
        };
        transfer::share_object(config);
    }

    // ============ Public Functions ============

    /// Deposit escrow funds into yield protocol
    public entry fun deposit_to_yield(
        config: &mut YieldConfig,
        escrow_id: ID,
        protocol: u8,
        payment: Coin<SUI>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(config.is_active, EYieldNotActive);
        assert!(protocol <= PROTOCOL_SCALLOP, EInvalidProtocol);
        
        let amount = coin::value(&payment);
        assert!(amount >= MIN_DEPOSIT_AMOUNT, EZeroAmount);

        let now = clock::timestamp_ms(clock);
        let sender = tx_context::sender(ctx);

        let position = YieldPosition {
            id: object::new(ctx),
            escrow_id,
            owner: sender,
            principal: coin::into_balance(payment),
            accrued_yield: balance::zero(),
            protocol,
            deposited_at: now,
            last_claim_at: now,
            is_active: true,
        };

        let position_id = object::id(&position);

        // Update TVL
        config.total_tvl = config.total_tvl + amount;

        event::emit(YieldDeposited {
            position_id,
            escrow_id,
            amount,
            protocol,
        });

        // Create receipt
        let receipt = YieldReceipt {
            id: object::new(ctx),
            position_id,
            escrow_id,
            principal: amount,
            protocol,
            deposited_at: now,
        };

        transfer::transfer(receipt, sender);
        transfer::share_object(position);
    }

    /// Claim accrued yield (simulated - in production would integrate with actual DeFi protocols)
    public entry fun claim_yield(
        config: &mut YieldConfig,
        position: &mut YieldPosition,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(sender == position.owner, ENotAuthorized);
        assert!(position.is_active, EYieldNotActive);

        let now = clock::timestamp_ms(clock);
        let time_elapsed_ms = now - position.last_claim_at;
        
        // Calculate yield based on protocol APY (simplified calculation)
        let apy_bps = get_protocol_apy(config, position.protocol);
        let principal = balance::value(&position.principal);
        
        // yield = principal * apy * time_elapsed / (365 days * 10000)
        // Simplified: yield per ms = principal * apy_bps / (365 * 24 * 60 * 60 * 1000 * 10000)
        let yield_amount = calculate_yield(principal, apy_bps, time_elapsed_ms);

        if (yield_amount > 0) {
            // In production, this would come from actual DeFi protocol
            // For hackathon demo, we simulate yield generation
            
            position.last_claim_at = now;
            config.total_yield = config.total_yield + yield_amount;

            event::emit(YieldClaimed {
                position_id: object::id(position),
                escrow_id: position.escrow_id,
                yield_amount,
                protocol: position.protocol,
            });
        };
    }

    /// Withdraw principal + yield from yield position
    public entry fun withdraw_from_yield(
        config: &mut YieldConfig,
        position: &mut YieldPosition,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(sender == position.owner, ENotAuthorized);
        assert!(position.is_active, EYieldNotActive);

        let now = clock::timestamp_ms(clock);
        
        // Check lock period
        assert!(
            now >= position.deposited_at + YIELD_LOCK_PERIOD_MS,
            EWithdrawalLocked
        );

        // Calculate final yield
        let time_elapsed_ms = now - position.last_claim_at;
        let apy_bps = get_protocol_apy(config, position.protocol);
        let principal_amount = balance::value(&position.principal);
        let final_yield = calculate_yield(principal_amount, apy_bps, time_elapsed_ms);

        // Mark position as inactive
        position.is_active = false;

        // Update TVL
        config.total_tvl = config.total_tvl - principal_amount;
        config.total_yield = config.total_yield + final_yield;

        // Transfer principal back to owner
        let principal_coin = coin::from_balance(
            balance::split(&mut position.principal, principal_amount),
            ctx
        );
        transfer::public_transfer(principal_coin, sender);

        // Transfer any accrued yield
        let accrued = balance::value(&position.accrued_yield);
        if (accrued > 0) {
            let yield_coin = coin::from_balance(
                balance::split(&mut position.accrued_yield, accrued),
                ctx
            );
            transfer::public_transfer(yield_coin, sender);
        };

        event::emit(YieldWithdrawn {
            position_id: object::id(position),
            escrow_id: position.escrow_id,
            principal: principal_amount,
            yield_amount: final_yield + accrued,
        });
    }

    // ============ Admin Functions ============

    /// Update protocol APY
    public entry fun update_protocol_apy(
        config: &mut YieldConfig,
        protocol: u8,
        new_apy_bps: u64,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == config.admin, ENotAuthorized);
        assert!(protocol <= PROTOCOL_SCALLOP, EInvalidProtocol);

        if (protocol == PROTOCOL_CETUS) {
            config.cetus_apy_bps = new_apy_bps;
        } else if (protocol == PROTOCOL_TURBOS) {
            config.turbos_apy_bps = new_apy_bps;
        } else if (protocol == PROTOCOL_NAVI) {
            config.navi_apy_bps = new_apy_bps;
        } else {
            config.scallop_apy_bps = new_apy_bps;
        };

        event::emit(ProtocolUpdated {
            protocol,
            new_apy_bps,
        });
    }

    /// Toggle yield farming
    public entry fun toggle_yield_farming(
        config: &mut YieldConfig,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == config.admin, ENotAuthorized);
        config.is_active = !config.is_active;
    }

    // ============ View Functions ============

    /// Get yield position info
    public fun get_position_info(position: &YieldPosition): (
        ID,     // escrow_id
        u64,    // principal
        u64,    // accrued_yield
        u8,     // protocol
        u64,    // deposited_at
        bool,   // is_active
    ) {
        (
            position.escrow_id,
            balance::value(&position.principal),
            balance::value(&position.accrued_yield),
            position.protocol,
            position.deposited_at,
            position.is_active,
        )
    }

    /// Get protocol APY
    public fun get_protocol_apy(config: &YieldConfig, protocol: u8): u64 {
        if (protocol == PROTOCOL_CETUS) {
            config.cetus_apy_bps
        } else if (protocol == PROTOCOL_TURBOS) {
            config.turbos_apy_bps
        } else if (protocol == PROTOCOL_NAVI) {
            config.navi_apy_bps
        } else {
            config.scallop_apy_bps
        }
    }

    /// Get platform yield stats
    public fun get_yield_stats(config: &YieldConfig): (u64, u64, bool) {
        (config.total_tvl, config.total_yield, config.is_active)
    }

    /// Get best protocol (highest APY)
    public fun get_best_protocol(config: &YieldConfig): (u8, u64) {
        let mut best_protocol = PROTOCOL_CETUS;
        let mut best_apy = config.cetus_apy_bps;

        if (config.turbos_apy_bps > best_apy) {
            best_protocol = PROTOCOL_TURBOS;
            best_apy = config.turbos_apy_bps;
        };
        if (config.navi_apy_bps > best_apy) {
            best_protocol = PROTOCOL_NAVI;
            best_apy = config.navi_apy_bps;
        };
        if (config.scallop_apy_bps > best_apy) {
            best_protocol = PROTOCOL_SCALLOP;
            best_apy = config.scallop_apy_bps;
        };

        (best_protocol, best_apy)
    }

    // ============ Internal Functions ============

    /// Calculate yield based on principal, APY, and time
    fun calculate_yield(principal: u64, apy_bps: u64, time_elapsed_ms: u64): u64 {
        // APY in basis points (e.g., 500 = 5%)
        // yield = principal * apy_bps * time_ms / (365 * 24 * 60 * 60 * 1000 * 10000)
        // Simplified to avoid overflow
        let seconds_in_year: u64 = 31536000;
        let ms_in_year: u64 = seconds_in_year * 1000;
        
        // Calculate in steps to avoid overflow
        let yield_per_year = (principal * apy_bps) / 10000;
        let yield_amount = (yield_per_year * time_elapsed_ms) / ms_in_year;
        
        yield_amount
    }

    // ============ Test Functions ============
    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx)
    }
}
