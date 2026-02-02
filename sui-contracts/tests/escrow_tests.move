#[test_only]
module crosschain_escrow::escrow_tests {
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::clock::{Self, Clock};
    use sui::test_utils;
    
    use crosschain_escrow::escrow::{Self, PlatformConfig, Escrow, EscrowReceipt};

    // Test addresses
    const ADMIN: address = @0xAD;
    const CLIENT: address = @0xC1;
    const FREELANCER: address = @0xF1;
    const ARBITER1: address = @0xA1;
    const ARBITER2: address = @0xA2;
    const ARBITER3: address = @0xA3;

    // Test amounts (in MIST, 1 SUI = 1_000_000_000 MIST)
    const ONE_SUI: u64 = 1_000_000_000;
    const ESCROW_AMOUNT: u64 = 10_000_000_000; // 10 SUI

    // ============ Helper Functions ============

    fun setup_test(): Scenario {
        let mut scenario = ts::begin(ADMIN);
        
        // Initialize platform config
        {
            escrow::init_for_testing(ts::ctx(&mut scenario));
        };
        
        scenario
    }

    fun create_clock(scenario: &mut Scenario): Clock {
        ts::next_tx(scenario, ADMIN);
        clock::create_for_testing(ts::ctx(scenario))
    }

    fun mint_sui(amount: u64, scenario: &mut Scenario): Coin<SUI> {
        coin::mint_for_testing<SUI>(amount, ts::ctx(scenario))
    }

    // ============ Test Cases ============

    #[test]
    fun test_create_escrow() {
        let mut scenario = setup_test();
        let clock = create_clock(&mut scenario);

        // Register arbiters
        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut config = ts::take_shared<PlatformConfig>(&scenario);
            escrow::register_arbiter(&mut config, ARBITER1, ts::ctx(&mut scenario));
            escrow::register_arbiter(&mut config, ARBITER2, ts::ctx(&mut scenario));
            escrow::register_arbiter(&mut config, ARBITER3, ts::ctx(&mut scenario));
            ts::return_shared(config);
        };

        // Client creates escrow
        ts::next_tx(&mut scenario, CLIENT);
        {
            let mut config = ts::take_shared<PlatformConfig>(&scenario);
            
            let payment = mint_sui(ESCROW_AMOUNT, &mut scenario);
            
            let milestone_descriptions = vector[
                b"Design mockups",
                b"Frontend implementation",
                b"Backend integration",
            ];
            let milestone_amounts = vector[
                3_000_000_000u64, // 3 SUI
                4_000_000_000u64, // 4 SUI
                3_000_000_000u64, // 3 SUI
            ];
            let milestone_deadlines = vector[
                1000000u64,
                2000000u64,
                3000000u64,
            ];

            escrow::create_escrow(
                &mut config,
                FREELANCER,
                b"Website Redesign",
                b"Complete website redesign with modern UI",
                milestone_descriptions,
                milestone_amounts,
                milestone_deadlines,
                b"ethereum",
                b"0x1234567890abcdef",
                payment,
                &clock,
                ts::ctx(&mut scenario)
            );

            // Verify platform stats
            let (total_escrows, total_volume, _) = escrow::get_platform_stats(&config);
            assert!(total_escrows == 1, 0);
            assert!(total_volume == ESCROW_AMOUNT, 1);

            ts::return_shared(config);
        };

        // Verify client received receipt
        ts::next_tx(&mut scenario, CLIENT);
        {
            let receipt = ts::take_from_sender<EscrowReceipt>(&scenario);
            ts::return_to_sender(&scenario, receipt);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    fun test_milestone_workflow() {
        let mut scenario = setup_test();
        let clock = create_clock(&mut scenario);

        // Setup: Create escrow
        ts::next_tx(&mut scenario, CLIENT);
        {
            let mut config = ts::take_shared<PlatformConfig>(&scenario);
            let payment = mint_sui(ESCROW_AMOUNT, &mut scenario);
            
            escrow::create_escrow(
                &mut config,
                FREELANCER,
                b"Test Project",
                b"Test description",
                vector[b"Milestone 1", b"Milestone 2"],
                vector[5_000_000_000u64, 5_000_000_000u64],
                vector[1000000u64, 2000000u64],
                b"base",
                b"0xabc123",
                payment,
                &clock,
                ts::ctx(&mut scenario)
            );

            ts::return_shared(config);
        };

        // Freelancer submits milestone
        ts::next_tx(&mut scenario, FREELANCER);
        {
            let mut escrow = ts::take_shared<Escrow>(&scenario);
            
            escrow::submit_milestone(
                &mut escrow,
                0, // milestone_id
                b"Work completed, please review",
                &clock,
                ts::ctx(&mut scenario)
            );

            // Verify milestone status
            let (_, _, status, _) = escrow::get_milestone(&escrow, 0);
            assert!(status == 2, 0); // MILESTONE_SUBMITTED

            ts::return_shared(escrow);
        };

        // Client approves milestone
        ts::next_tx(&mut scenario, CLIENT);
        {
            let mut escrow = ts::take_shared<Escrow>(&scenario);
            
            escrow::approve_milestone(
                &mut escrow,
                0, // milestone_id
                &clock,
                ts::ctx(&mut scenario)
            );

            // Verify milestone status
            let (_, _, status, _) = escrow::get_milestone(&escrow, 0);
            assert!(status == 3, 0); // MILESTONE_APPROVED

            ts::return_shared(escrow);
        };

        // Client releases funds
        ts::next_tx(&mut scenario, CLIENT);
        {
            let config = ts::take_shared<PlatformConfig>(&scenario);
            let mut escrow = ts::take_shared<Escrow>(&scenario);
            
            escrow::release_milestone(
                &mut escrow,
                &config,
                0, // milestone_id
                &clock,
                ts::ctx(&mut scenario)
            );

            // Verify milestone status
            let (_, _, status, _) = escrow::get_milestone(&escrow, 0);
            assert!(status == 5, 0); // MILESTONE_RELEASED

            // Verify balance decreased
            let (_, _, _, balance, _, _, _) = escrow::get_escrow_info(&escrow);
            assert!(balance < ESCROW_AMOUNT, 1);

            ts::return_shared(config);
            ts::return_shared(escrow);
        };

        // Verify freelancer received payment
        ts::next_tx(&mut scenario, FREELANCER);
        {
            let payment = ts::take_from_sender<Coin<SUI>>(&scenario);
            // Should be 5 SUI minus 1% fee = 4.95 SUI
            let expected = 5_000_000_000 - (5_000_000_000 / 100);
            assert!(coin::value(&payment) == expected, 0);
            ts::return_to_sender(&scenario, payment);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    fun test_dispute_resolution() {
        let mut scenario = setup_test();
        let clock = create_clock(&mut scenario);

        // Setup: Register arbiters
        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut config = ts::take_shared<PlatformConfig>(&scenario);
            escrow::register_arbiter(&mut config, ARBITER1, ts::ctx(&mut scenario));
            escrow::register_arbiter(&mut config, ARBITER2, ts::ctx(&mut scenario));
            escrow::register_arbiter(&mut config, ARBITER3, ts::ctx(&mut scenario));
            ts::return_shared(config);
        };

        // Client creates escrow
        ts::next_tx(&mut scenario, CLIENT);
        {
            let mut config = ts::take_shared<PlatformConfig>(&scenario);
            let payment = mint_sui(ONE_SUI, &mut scenario);
            
            escrow::create_escrow(
                &mut config,
                FREELANCER,
                b"Dispute Test",
                b"Test",
                vector[b"Single Milestone"],
                vector[ONE_SUI],
                vector[1000000u64],
                b"polygon",
                b"0xdef456",
                payment,
                &clock,
                ts::ctx(&mut scenario)
            );

            ts::return_shared(config);
        };

        // Freelancer submits work
        ts::next_tx(&mut scenario, FREELANCER);
        {
            let mut escrow = ts::take_shared<Escrow>(&scenario);
            escrow::submit_milestone(&mut escrow, 0, b"Done", &clock, ts::ctx(&mut scenario));
            ts::return_shared(escrow);
        };

        // Client initiates dispute
        ts::next_tx(&mut scenario, CLIENT);
        {
            let mut escrow = ts::take_shared<Escrow>(&scenario);
            
            escrow::initiate_dispute(
                &mut escrow,
                0,
                b"Work does not meet requirements",
                &clock,
                ts::ctx(&mut scenario)
            );

            // Verify escrow is disputed
            let (_, _, _, _, status, _, _) = escrow::get_escrow_info(&escrow);
            assert!(status == 2, 0); // ESCROW_DISPUTED
            assert!(escrow::has_dispute(&escrow), 1);

            ts::return_shared(escrow);
        };

        // Arbiters vote (2 for freelancer, 1 for client)
        ts::next_tx(&mut scenario, ARBITER1);
        {
            let config = ts::take_shared<PlatformConfig>(&scenario);
            let mut escrow = ts::take_shared<Escrow>(&scenario);
            
            escrow::vote_dispute(&mut escrow, &config, false, &clock, ts::ctx(&mut scenario));

            ts::return_shared(config);
            ts::return_shared(escrow);
        };

        ts::next_tx(&mut scenario, ARBITER2);
        {
            let config = ts::take_shared<PlatformConfig>(&scenario);
            let mut escrow = ts::take_shared<Escrow>(&scenario);
            
            escrow::vote_dispute(&mut escrow, &config, false, &clock, ts::ctx(&mut scenario));

            ts::return_shared(config);
            ts::return_shared(escrow);
        };

        // This vote should trigger resolution (3 votes minimum)
        ts::next_tx(&mut scenario, ARBITER3);
        {
            let config = ts::take_shared<PlatformConfig>(&scenario);
            let mut escrow = ts::take_shared<Escrow>(&scenario);
            
            escrow::vote_dispute(&mut escrow, &config, true, &clock, ts::ctx(&mut scenario));

            // After 3 votes, dispute should be resolved
            // Freelancer won (2-1), so escrow should be active again
            let (_, _, _, _, status, _, _) = escrow::get_escrow_info(&escrow);
            assert!(status == 0 || status == 1, 0); // ESCROW_ACTIVE or COMPLETED

            ts::return_shared(config);
            ts::return_shared(escrow);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    fun test_view_functions() {
        let mut scenario = setup_test();
        let clock = create_clock(&mut scenario);

        // Create escrow
        ts::next_tx(&mut scenario, CLIENT);
        {
            let mut config = ts::take_shared<PlatformConfig>(&scenario);
            let payment = mint_sui(ESCROW_AMOUNT, &mut scenario);
            
            escrow::create_escrow(
                &mut config,
                FREELANCER,
                b"View Test",
                b"Testing view functions",
                vector[b"M1", b"M2", b"M3"],
                vector[3_000_000_000u64, 3_000_000_000u64, 4_000_000_000u64],
                vector[100u64, 200u64, 300u64],
                b"ethereum",
                b"0x123",
                payment,
                &clock,
                ts::ctx(&mut scenario)
            );

            ts::return_shared(config);
        };

        // Test view functions
        ts::next_tx(&mut scenario, CLIENT);
        {
            let escrow = ts::take_shared<Escrow>(&scenario);
            
            // get_escrow_info
            let (client, freelancer, total, balance, status, count, current) = 
                escrow::get_escrow_info(&escrow);
            
            assert!(client == CLIENT, 0);
            assert!(freelancer == FREELANCER, 1);
            assert!(total == ESCROW_AMOUNT, 2);
            assert!(balance == ESCROW_AMOUNT, 3);
            assert!(status == 0, 4); // ESCROW_ACTIVE
            assert!(count == 3, 5);
            assert!(current == 0, 6);

            // get_milestone
            let (id, amount, m_status, deadline) = escrow::get_milestone(&escrow, 1);
            assert!(id == 1, 7);
            assert!(amount == 3_000_000_000, 8);
            assert!(m_status == 0, 9); // MILESTONE_PENDING
            assert!(deadline == 200, 10);

            // has_dispute
            assert!(!escrow::has_dispute(&escrow), 11);

            ts::return_shared(escrow);
        };

        // Test platform stats
        ts::next_tx(&mut scenario, ADMIN);
        {
            let config = ts::take_shared<PlatformConfig>(&scenario);
            
            let (total_escrows, total_volume, fee_bps) = escrow::get_platform_stats(&config);
            assert!(total_escrows == 1, 0);
            assert!(total_volume == ESCROW_AMOUNT, 1);
            assert!(fee_bps == 100, 2); // 1%

            ts::return_shared(config);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = escrow::ENotFreelancer)]
    fun test_only_freelancer_can_submit() {
        let mut scenario = setup_test();
        let clock = create_clock(&mut scenario);

        // Create escrow
        ts::next_tx(&mut scenario, CLIENT);
        {
            let mut config = ts::take_shared<PlatformConfig>(&scenario);
            let payment = mint_sui(ONE_SUI, &mut scenario);
            
            escrow::create_escrow(
                &mut config,
                FREELANCER,
                b"Test",
                b"Test",
                vector[b"M1"],
                vector[ONE_SUI],
                vector[100u64],
                b"ethereum",
                b"0x123",
                payment,
                &clock,
                ts::ctx(&mut scenario)
            );

            ts::return_shared(config);
        };

        // Client tries to submit (should fail)
        ts::next_tx(&mut scenario, CLIENT);
        {
            let mut escrow = ts::take_shared<Escrow>(&scenario);
            escrow::submit_milestone(&mut escrow, 0, b"Fake", &clock, ts::ctx(&mut scenario));
            ts::return_shared(escrow);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = escrow::ENotClient)]
    fun test_only_client_can_approve() {
        let mut scenario = setup_test();
        let clock = create_clock(&mut scenario);

        // Create escrow
        ts::next_tx(&mut scenario, CLIENT);
        {
            let mut config = ts::take_shared<PlatformConfig>(&scenario);
            let payment = mint_sui(ONE_SUI, &mut scenario);
            
            escrow::create_escrow(
                &mut config,
                FREELANCER,
                b"Test",
                b"Test",
                vector[b"M1"],
                vector[ONE_SUI],
                vector[100u64],
                b"ethereum",
                b"0x123",
                payment,
                &clock,
                ts::ctx(&mut scenario)
            );

            ts::return_shared(config);
        };

        // Freelancer submits
        ts::next_tx(&mut scenario, FREELANCER);
        {
            let mut escrow = ts::take_shared<Escrow>(&scenario);
            escrow::submit_milestone(&mut escrow, 0, b"Done", &clock, ts::ctx(&mut scenario));
            ts::return_shared(escrow);
        };

        // Freelancer tries to approve (should fail)
        ts::next_tx(&mut scenario, FREELANCER);
        {
            let mut escrow = ts::take_shared<Escrow>(&scenario);
            escrow::approve_milestone(&mut escrow, 0, &clock, ts::ctx(&mut scenario));
            ts::return_shared(escrow);
        };

        clock::destroy_for_testing(clock);
        ts::end(scenario);
    }
}
