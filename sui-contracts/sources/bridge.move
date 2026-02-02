/// Cross-Chain Freelance Escrow - Cross-Chain Bridge Module
/// 
/// This module handles cross-chain message verification and fund bridging
/// between EVM chains (Ethereum, Base, Polygon) and Sui.
module crosschain_escrow::bridge {
    // ============ Imports ============
    use sui::object::{Self, UID, ID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::sui::SUI;
    use sui::event;
    use sui::table::{Self, Table};
    use sui::clock::{Self, Clock};
    use std::string::{Self, String};
    use std::vector;

    // ============ Error Constants ============
    const ENotRelayer: u64 = 0;
    const EInvalidChain: u64 = 1;
    const ETxAlreadyProcessed: u64 = 2;
    const EInvalidSignature: u64 = 3;
    const EInsufficientLiquidity: u64 = 4;
    const EBridgePaused: u64 = 5;
    const EInvalidAmount: u64 = 6;

    // ============ Constants ============
    const CHAIN_ETHEREUM: u8 = 1;
    const CHAIN_BASE: u8 = 2;
    const CHAIN_POLYGON: u8 = 3;
    const CHAIN_ARBITRUM: u8 = 4;
    const CHAIN_OPTIMISM: u8 = 5;

    const BRIDGE_FEE_BPS: u64 = 30; // 0.3% bridge fee

    // ============ Structs ============

    /// Bridge configuration
    public struct BridgeConfig has key {
        id: UID,
        admin: address,
        /// Registered relayers
        relayers: Table<address, RelayerInfo>,
        /// Processed transaction hashes (to prevent replay)
        processed_txs: Table<vector<u8>, bool>,
        /// Liquidity pool for bridging
        liquidity_pool: Balance<SUI>,
        /// Bridge fee in basis points
        fee_bps: u64,
        /// Total bridged volume
        total_volume: u64,
        /// Is bridge active
        is_active: bool,
    }

    /// Relayer information
    public struct RelayerInfo has store, drop {
        is_active: bool,
        total_relayed: u64,
        reputation: u64,
    }

    /// Incoming bridge request (from EVM)
    public struct BridgeRequest has key, store {
        id: UID,
        /// Source chain ID
        source_chain: u8,
        /// Source transaction hash
        source_tx_hash: vector<u8>,
        /// Sender address on source chain (as bytes)
        sender: vector<u8>,
        /// Recipient address on Sui
        recipient: address,
        /// Amount in source chain native units
        source_amount: u64,
        /// Amount to receive on Sui (after fees)
        sui_amount: u64,
        /// Timestamp
        created_at: u64,
        /// Is processed
        is_processed: bool,
    }

    /// Outgoing bridge request (to EVM)
    public struct OutgoingBridgeRequest has key {
        id: UID,
        /// Target chain ID
        target_chain: u8,
        /// Sender on Sui
        sender: address,
        /// Recipient address on target chain (as bytes)
        recipient: vector<u8>,
        /// Amount being bridged
        amount: u64,
        /// Timestamp
        created_at: u64,
        /// Nonce for ordering
        nonce: u64,
    }

    // ============ Events ============

    public struct BridgeIncoming has copy, drop {
        request_id: ID,
        source_chain: u8,
        source_tx_hash: vector<u8>,
        recipient: address,
        amount: u64,
    }

    public struct BridgeOutgoing has copy, drop {
        request_id: ID,
        target_chain: u8,
        sender: address,
        recipient: vector<u8>,
        amount: u64,
    }

    public struct BridgeProcessed has copy, drop {
        request_id: ID,
        recipient: address,
        amount: u64,
    }

    public struct LiquidityAdded has copy, drop {
        provider: address,
        amount: u64,
        new_total: u64,
    }

    public struct LiquidityRemoved has copy, drop {
        provider: address,
        amount: u64,
        new_total: u64,
    }

    // ============ Init Function ============

    fun init(ctx: &mut TxContext) {
        let config = BridgeConfig {
            id: object::new(ctx),
            admin: tx_context::sender(ctx),
            relayers: table::new(ctx),
            processed_txs: table::new(ctx),
            liquidity_pool: balance::zero(),
            fee_bps: BRIDGE_FEE_BPS,
            total_volume: 0,
            is_active: true,
        };
        transfer::share_object(config);
    }

    // ============ Relayer Functions ============

    /// Process incoming bridge request (called by relayer)
    public entry fun process_incoming_bridge(
        config: &mut BridgeConfig,
        source_chain: u8,
        source_tx_hash: vector<u8>,
        sender_bytes: vector<u8>,
        recipient: address,
        source_amount: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let relayer = tx_context::sender(ctx);
        
        // Verify relayer
        assert!(table::contains(&config.relayers, relayer), ENotRelayer);
        let relayer_info = table::borrow(&config.relayers, relayer);
        assert!(relayer_info.is_active, ENotRelayer);

        // Verify bridge is active
        assert!(config.is_active, EBridgePaused);

        // Verify chain is valid
        assert!(source_chain >= CHAIN_ETHEREUM && source_chain <= CHAIN_OPTIMISM, EInvalidChain);

        // Check if already processed
        assert!(!table::contains(&config.processed_txs, source_tx_hash), ETxAlreadyProcessed);

        // Calculate fees
        let fee = (source_amount * config.fee_bps) / 10000;
        let sui_amount = source_amount - fee;

        // Verify liquidity
        assert!(balance::value(&config.liquidity_pool) >= sui_amount, EInsufficientLiquidity);

        // Mark as processed
        table::add(&mut config.processed_txs, source_tx_hash, true);

        let now = clock::timestamp_ms(clock);

        // Create request record
        let request = BridgeRequest {
            id: object::new(ctx),
            source_chain,
            source_tx_hash,
            sender: sender_bytes,
            recipient,
            source_amount,
            sui_amount,
            created_at: now,
            is_processed: true,
        };

        let request_id = object::id(&request);

        // Transfer funds to recipient
        let payment = coin::from_balance(
            balance::split(&mut config.liquidity_pool, sui_amount),
            ctx
        );
        transfer::public_transfer(payment, recipient);

        // Update stats
        config.total_volume = config.total_volume + source_amount;

        // Update relayer stats
        let relayer_info_mut = table::borrow_mut(&mut config.relayers, relayer);
        relayer_info_mut.total_relayed = relayer_info_mut.total_relayed + source_amount;

        event::emit(BridgeIncoming {
            request_id,
            source_chain,
            source_tx_hash,
            recipient,
            amount: sui_amount,
        });

        event::emit(BridgeProcessed {
            request_id,
            recipient,
            amount: sui_amount,
        });

        transfer::share_object(request);
    }

    /// Initiate outgoing bridge (user wants to bridge Sui to EVM)
    public entry fun initiate_outgoing_bridge(
        config: &mut BridgeConfig,
        target_chain: u8,
        recipient: vector<u8>,
        payment: Coin<SUI>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(config.is_active, EBridgePaused);
        assert!(target_chain >= CHAIN_ETHEREUM && target_chain <= CHAIN_OPTIMISM, EInvalidChain);
        
        let amount = coin::value(&payment);
        assert!(amount > 0, EInvalidAmount);

        let sender = tx_context::sender(ctx);
        let now = clock::timestamp_ms(clock);

        // Add to liquidity pool (will be used for incoming bridges)
        balance::join(&mut config.liquidity_pool, coin::into_balance(payment));

        // Create outgoing request (relayers watch for this event)
        let request = OutgoingBridgeRequest {
            id: object::new(ctx),
            target_chain,
            sender,
            recipient,
            amount,
            created_at: now,
            nonce: config.total_volume,
        };

        let request_id = object::id(&request);

        config.total_volume = config.total_volume + amount;

        event::emit(BridgeOutgoing {
            request_id,
            target_chain,
            sender,
            recipient,
            amount,
        });

        transfer::transfer(request, sender);
    }

    // ============ Liquidity Provider Functions ============

    /// Add liquidity to bridge pool
    public entry fun add_liquidity(
        config: &mut BridgeConfig,
        payment: Coin<SUI>,
        ctx: &mut TxContext
    ) {
        let amount = coin::value(&payment);
        assert!(amount > 0, EInvalidAmount);

        let provider = tx_context::sender(ctx);
        
        balance::join(&mut config.liquidity_pool, coin::into_balance(payment));

        event::emit(LiquidityAdded {
            provider,
            amount,
            new_total: balance::value(&config.liquidity_pool),
        });
    }

    /// Remove liquidity (admin only for now)
    public entry fun remove_liquidity(
        config: &mut BridgeConfig,
        amount: u64,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == config.admin, ENotRelayer);
        assert!(balance::value(&config.liquidity_pool) >= amount, EInsufficientLiquidity);

        let withdrawal = coin::from_balance(
            balance::split(&mut config.liquidity_pool, amount),
            ctx
        );
        transfer::public_transfer(withdrawal, config.admin);

        event::emit(LiquidityRemoved {
            provider: config.admin,
            amount,
            new_total: balance::value(&config.liquidity_pool),
        });
    }

    // ============ Admin Functions ============

    /// Register a new relayer
    public entry fun register_relayer(
        config: &mut BridgeConfig,
        relayer: address,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == config.admin, ENotRelayer);
        
        let info = RelayerInfo {
            is_active: true,
            total_relayed: 0,
            reputation: 100,
        };
        table::add(&mut config.relayers, relayer, info);
    }

    /// Toggle relayer status
    public entry fun toggle_relayer(
        config: &mut BridgeConfig,
        relayer: address,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == config.admin, ENotRelayer);
        assert!(table::contains(&config.relayers, relayer), ENotRelayer);
        
        let info = table::borrow_mut(&mut config.relayers, relayer);
        info.is_active = !info.is_active;
    }

    /// Update bridge fee
    public entry fun update_fee(
        config: &mut BridgeConfig,
        new_fee_bps: u64,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == config.admin, ENotRelayer);
        config.fee_bps = new_fee_bps;
    }

    /// Toggle bridge active status
    public entry fun toggle_bridge(
        config: &mut BridgeConfig,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == config.admin, ENotRelayer);
        config.is_active = !config.is_active;
    }

    // ============ View Functions ============

    /// Get bridge stats
    public fun get_bridge_stats(config: &BridgeConfig): (u64, u64, u64, bool) {
        (
            balance::value(&config.liquidity_pool),
            config.total_volume,
            config.fee_bps,
            config.is_active,
        )
    }

    /// Check if relayer is registered and active
    public fun is_relayer_active(config: &BridgeConfig, relayer: address): bool {
        if (table::contains(&config.relayers, relayer)) {
            let info = table::borrow(&config.relayers, relayer);
            info.is_active
        } else {
            false
        }
    }

    /// Check if transaction was processed
    public fun is_tx_processed(config: &BridgeConfig, tx_hash: vector<u8>): bool {
        table::contains(&config.processed_txs, tx_hash)
    }

    /// Get chain name from ID
    public fun get_chain_name(chain_id: u8): String {
        if (chain_id == CHAIN_ETHEREUM) {
            string::utf8(b"Ethereum")
        } else if (chain_id == CHAIN_BASE) {
            string::utf8(b"Base")
        } else if (chain_id == CHAIN_POLYGON) {
            string::utf8(b"Polygon")
        } else if (chain_id == CHAIN_ARBITRUM) {
            string::utf8(b"Arbitrum")
        } else if (chain_id == CHAIN_OPTIMISM) {
            string::utf8(b"Optimism")
        } else {
            string::utf8(b"Unknown")
        }
    }

    // ============ Test Functions ============
    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx)
    }
}
