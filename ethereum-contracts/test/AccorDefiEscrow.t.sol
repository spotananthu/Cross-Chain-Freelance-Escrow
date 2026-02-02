// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/AccorDefiEscrow.sol";
import "../src/AccorDefiBridge.sol";
import "../src/interfaces/IAccorDefiEscrow.sol";

contract AccorDefiEscrowTest is Test {
    AccorDefiEscrow public escrow;
    AccorDefiBridge public bridge;

    address public owner;
    address public treasury;
    address public client;
    address public freelancer;
    address public arbiter1;
    address public arbiter2;
    address public arbiter3;

    bytes32 public suiRecipient = bytes32(uint256(0x123456789));

    event EscrowCreated(
        uint256 indexed escrowId,
        address indexed client,
        address indexed freelancer,
        uint256 totalAmount,
        uint256 milestoneCount,
        bool crossChain
    );

    function setUp() public {
        owner = address(this);
        treasury = makeAddr("treasury");
        client = makeAddr("client");
        freelancer = makeAddr("freelancer");
        arbiter1 = makeAddr("arbiter1");
        arbiter2 = makeAddr("arbiter2");
        arbiter3 = makeAddr("arbiter3");

        // Fund accounts
        vm.deal(client, 100 ether);
        vm.deal(freelancer, 10 ether);

        // Deploy bridge with relayers
        address[] memory relayers = new address[](3);
        relayers[0] = arbiter1;
        relayers[1] = arbiter2;
        relayers[2] = arbiter3;
        bridge = new AccorDefiBridge(relayers);

        // Deploy escrow
        escrow = new AccorDefiEscrow(treasury, address(bridge));

        // Setup arbiters
        escrow.registerArbiter(arbiter1);
        escrow.registerArbiter(arbiter2);
        escrow.registerArbiter(arbiter3);

        // Configure bridge
        bridge.setEscrowContract(address(escrow));
    }

    // ============ Create Escrow Tests ============

    function test_CreateEscrow() public {
        string[] memory descriptions = new string[](2);
        descriptions[0] = "Design Phase";
        descriptions[1] = "Development Phase";

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1 ether;
        amounts[1] = 2 ether;

        uint256[] memory deadlines = new uint256[](2);
        deadlines[0] = block.timestamp + 7 days;
        deadlines[1] = block.timestamp + 14 days;

        vm.prank(client);
        uint256 escrowId = escrow.createEscrow{value: 3 ether}(
            freelancer,
            "Website Project",
            "Build a website",
            descriptions,
            amounts,
            deadlines,
            bytes32(0),
            false
        );

        assertEq(escrowId, 1);

        IAccorDefiEscrow.Escrow memory e = escrow.getEscrow(escrowId);
        assertEq(e.client, client);
        assertEq(e.freelancer, freelancer);
        assertEq(e.totalAmount, 3 ether);
        assertEq(e.balance, 3 ether);
        assertEq(uint256(e.status), uint256(IAccorDefiEscrow.EscrowStatus.Active));
        assertFalse(e.crossChain);
    }

    function test_CreateCrossChainEscrow() public {
        string[] memory descriptions = new string[](1);
        descriptions[0] = "Design Phase";

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1 ether;

        uint256[] memory deadlines = new uint256[](1);
        deadlines[0] = block.timestamp + 7 days;

        vm.prank(client);
        uint256 escrowId = escrow.createEscrow{value: 1 ether}(
            address(0), // No EVM freelancer
            "Cross-Chain Project",
            "Build something",
            descriptions,
            amounts,
            deadlines,
            suiRecipient,
            true
        );

        IAccorDefiEscrow.Escrow memory e = escrow.getEscrow(escrowId);
        assertTrue(e.crossChain);
        assertEq(e.suiRecipient, suiRecipient);
    }

    function test_CreateEscrow_RefundsExcess() public {
        string[] memory descriptions = new string[](1);
        descriptions[0] = "Phase 1";

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1 ether;

        uint256[] memory deadlines = new uint256[](1);
        deadlines[0] = block.timestamp + 7 days;

        uint256 balanceBefore = client.balance;

        vm.prank(client);
        escrow.createEscrow{value: 2 ether}(
            freelancer,
            "Test",
            "Desc",
            descriptions,
            amounts,
            deadlines,
            bytes32(0),
            false
        );

        // Should refund 1 ether
        assertEq(client.balance, balanceBefore - 1 ether);
    }

    function test_CreateEscrow_RevertWhen_InsufficientPayment() public {
        string[] memory descriptions = new string[](1);
        descriptions[0] = "Phase 1";

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 2 ether;

        uint256[] memory deadlines = new uint256[](1);
        deadlines[0] = block.timestamp + 7 days;

        vm.prank(client);
        vm.expectRevert("Insufficient payment");
        escrow.createEscrow{value: 1 ether}(
            freelancer,
            "Test",
            "Desc",
            descriptions,
            amounts,
            deadlines,
            bytes32(0),
            false
        );
    }

    // ============ Milestone Tests ============

    function test_SubmitMilestone() public {
        uint256 escrowId = _createBasicEscrow();

        vm.prank(freelancer);
        escrow.submitMilestone(escrowId, 0, "Work completed!");

        IAccorDefiEscrow.Milestone memory m = escrow.getMilestone(escrowId, 0);
        assertEq(uint256(m.status), uint256(IAccorDefiEscrow.MilestoneStatus.Submitted));
        assertEq(m.submissionNote, "Work completed!");
    }

    function test_SubmitMilestone_RevertWhen_NotFreelancer() public {
        uint256 escrowId = _createBasicEscrow();

        vm.prank(client);
        vm.expectRevert("Not freelancer");
        escrow.submitMilestone(escrowId, 0, "Work completed!");
    }

    function test_ApproveMilestone() public {
        uint256 escrowId = _createBasicEscrow();

        vm.prank(freelancer);
        escrow.submitMilestone(escrowId, 0, "Done");

        vm.prank(client);
        escrow.approveMilestone(escrowId, 0);

        IAccorDefiEscrow.Milestone memory m = escrow.getMilestone(escrowId, 0);
        assertEq(uint256(m.status), uint256(IAccorDefiEscrow.MilestoneStatus.Approved));
    }

    function test_ReleaseMilestone() public {
        uint256 escrowId = _createBasicEscrow();

        vm.prank(freelancer);
        escrow.submitMilestone(escrowId, 0, "Done");

        vm.prank(client);
        escrow.approveMilestone(escrowId, 0);

        uint256 freelancerBalanceBefore = freelancer.balance;
        uint256 treasuryBalanceBefore = treasury.balance;

        vm.prank(client);
        escrow.releaseMilestone(escrowId, 0);

        // Check balances (1 ether - 1% fee = 0.99 ether)
        assertEq(freelancer.balance, freelancerBalanceBefore + 0.99 ether);
        assertEq(treasury.balance, treasuryBalanceBefore + 0.01 ether);

        IAccorDefiEscrow.Milestone memory m = escrow.getMilestone(escrowId, 0);
        assertEq(uint256(m.status), uint256(IAccorDefiEscrow.MilestoneStatus.Released));
    }

    function test_EscrowCompletion() public {
        uint256 escrowId = _createBasicEscrow();

        // Submit and approve
        vm.prank(freelancer);
        escrow.submitMilestone(escrowId, 0, "Done");

        vm.prank(client);
        escrow.approveMilestone(escrowId, 0);

        vm.prank(client);
        escrow.releaseMilestone(escrowId, 0);

        IAccorDefiEscrow.Escrow memory e = escrow.getEscrow(escrowId);
        assertEq(uint256(e.status), uint256(IAccorDefiEscrow.EscrowStatus.Completed));
    }

    // ============ Dispute Tests ============

    function test_InitiateDispute() public {
        uint256 escrowId = _createBasicEscrow();

        vm.prank(freelancer);
        escrow.submitMilestone(escrowId, 0, "Done");

        vm.prank(client);
        escrow.initiateDispute(escrowId, 0, "Quality not acceptable");

        IAccorDefiEscrow.Dispute memory d = escrow.getDispute(escrowId);
        assertEq(d.initiatedBy, client);
        assertEq(d.reason, "Quality not acceptable");
        assertFalse(d.resolved);

        IAccorDefiEscrow.Escrow memory e = escrow.getEscrow(escrowId);
        assertEq(uint256(e.status), uint256(IAccorDefiEscrow.EscrowStatus.Disputed));
    }

    function test_VoteDispute_FreelancerWins() public {
        uint256 escrowId = _createBasicEscrow();

        // Submit work and initiate dispute
        vm.prank(freelancer);
        escrow.submitMilestone(escrowId, 0, "Done");

        vm.prank(client);
        escrow.initiateDispute(escrowId, 0, "Not happy");

        uint256 freelancerBalanceBefore = freelancer.balance;

        // Vote in favor of freelancer
        vm.prank(arbiter1);
        escrow.voteDispute(escrowId, false); // false = vote for freelancer

        vm.prank(arbiter2);
        escrow.voteDispute(escrowId, false);

        vm.prank(arbiter3);
        escrow.voteDispute(escrowId, false);

        // Freelancer should receive funds
        assertEq(freelancer.balance, freelancerBalanceBefore + 0.99 ether);

        IAccorDefiEscrow.Dispute memory d = escrow.getDispute(escrowId);
        assertTrue(d.resolved);
        assertEq(d.votesForFreelancer, 3);
    }

    function test_VoteDispute_ClientWins() public {
        uint256 escrowId = _createBasicEscrow();

        vm.prank(freelancer);
        escrow.submitMilestone(escrowId, 0, "Done");

        vm.prank(client);
        escrow.initiateDispute(escrowId, 0, "Not happy");

        // Vote in favor of client
        vm.prank(arbiter1);
        escrow.voteDispute(escrowId, true);

        vm.prank(arbiter2);
        escrow.voteDispute(escrowId, true);

        vm.prank(arbiter3);
        escrow.voteDispute(escrowId, true);

        IAccorDefiEscrow.Dispute memory d = escrow.getDispute(escrowId);
        assertTrue(d.resolved);
        assertEq(d.votesForClient, 3);
    }

    function test_VoteDispute_RevertWhen_NotArbiter() public {
        uint256 escrowId = _createBasicEscrow();

        vm.prank(freelancer);
        escrow.submitMilestone(escrowId, 0, "Done");

        vm.prank(client);
        escrow.initiateDispute(escrowId, 0, "Not happy");

        // Non-arbiter tries to vote
        vm.prank(client);
        vm.expectRevert("Not arbiter");
        escrow.voteDispute(escrowId, true);
    }

    // ============ Admin Tests ============

    function test_UpdateFee() public {
        escrow.updateFee(200); // 2%
        (, , uint256 fee) = escrow.getPlatformStats();
        assertEq(fee, 200);
    }

    function test_UpdateFee_RevertWhen_TooHigh() public {
        vm.expectRevert("Fee too high");
        escrow.updateFee(600); // 6% - should fail
    }

    function test_RegisterArbiter() public {
        address newArbiter = makeAddr("newArbiter");
        escrow.registerArbiter(newArbiter);
        assertTrue(escrow.isArbiter(newArbiter));
    }

    // ============ View Function Tests ============

    function test_GetMilestones() public {
        uint256 escrowId = _createMultiMilestoneEscrow();

        IAccorDefiEscrow.Milestone[] memory milestones = escrow.getMilestones(escrowId);
        assertEq(milestones.length, 3);
        assertEq(milestones[0].amount, 1 ether);
        assertEq(milestones[1].amount, 2 ether);
        assertEq(milestones[2].amount, 3 ether);
    }

    function test_GetPlatformStats() public {
        _createBasicEscrow();
        _createBasicEscrow();

        (uint256 totalEscrows, uint256 totalVolume, uint256 feeBps) = escrow.getPlatformStats();
        assertEq(totalEscrows, 2);
        assertEq(totalVolume, 2 ether);
        assertEq(feeBps, 100);
    }

    // ============ Helpers ============

    function _createBasicEscrow() internal returns (uint256) {
        string[] memory descriptions = new string[](1);
        descriptions[0] = "Phase 1";

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1 ether;

        uint256[] memory deadlines = new uint256[](1);
        deadlines[0] = block.timestamp + 7 days;

        vm.prank(client);
        return escrow.createEscrow{value: 1 ether}(
            freelancer,
            "Test Project",
            "Description",
            descriptions,
            amounts,
            deadlines,
            bytes32(0),
            false
        );
    }

    function _createMultiMilestoneEscrow() internal returns (uint256) {
        string[] memory descriptions = new string[](3);
        descriptions[0] = "Design";
        descriptions[1] = "Development";
        descriptions[2] = "Testing";

        uint256[] memory amounts = new uint256[](3);
        amounts[0] = 1 ether;
        amounts[1] = 2 ether;
        amounts[2] = 3 ether;

        uint256[] memory deadlines = new uint256[](3);
        deadlines[0] = block.timestamp + 7 days;
        deadlines[1] = block.timestamp + 14 days;
        deadlines[2] = block.timestamp + 21 days;

        vm.prank(client);
        return escrow.createEscrow{value: 6 ether}(
            freelancer,
            "Multi-Phase Project",
            "Description",
            descriptions,
            amounts,
            deadlines,
            bytes32(0),
            false
        );
    }
}
