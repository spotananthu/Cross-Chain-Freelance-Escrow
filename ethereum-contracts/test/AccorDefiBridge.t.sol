// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/AccorDefiBridge.sol";

contract AccorDefiBridgeTest is Test {
    AccorDefiBridge public bridge;

    address public owner;
    address public relayer1;
    address public relayer2;
    address public relayer3;
    address public user;

    bytes32 public suiRecipient = bytes32(uint256(0x123456789));

    event BridgeInitiated(
        bytes32 indexed transferId,
        bytes32 indexed suiRecipient,
        uint256 amount,
        uint256 timestamp
    );

    event BridgeExecuted(
        bytes32 indexed transferId,
        bytes32 suiRecipient,
        uint256 amount
    );

    function setUp() public {
        owner = address(this);
        relayer1 = makeAddr("relayer1");
        relayer2 = makeAddr("relayer2");
        relayer3 = makeAddr("relayer3");
        user = makeAddr("user");

        // Fund accounts
        vm.deal(user, 100 ether);

        // Deploy bridge
        address[] memory relayers = new address[](3);
        relayers[0] = relayer1;
        relayers[1] = relayer2;
        relayers[2] = relayer3;

        bridge = new AccorDefiBridge(relayers);
    }

    // ============ Constructor Tests ============

    function test_Constructor() public view {
        assertEq(bridge.owner(), owner);
        assertTrue(bridge.isRelayer(relayer1));
        assertTrue(bridge.isRelayer(relayer2));
        assertTrue(bridge.isRelayer(relayer3));
        assertEq(bridge.getRelayerCount(), 3);
    }

    function test_Constructor_RevertWhen_NotEnoughRelayers() public {
        address[] memory relayers = new address[](1);
        relayers[0] = relayer1;
        vm.expectRevert("Not enough relayers");
        new AccorDefiBridge(relayers);
    }

    // ============ Initiate Bridge Tests ============

    function test_InitiateBridge() public {
        vm.prank(user);
        bridge.initiateBridge{value: 1 ether}(suiRecipient, 1 ether);

        assertEq(bridge.totalBridged(), 1 ether);
        assertEq(bridge.bridgeNonce(), 1);
    }

    function test_InitiateBridge_RefundsExcess() public {
        uint256 balanceBefore = user.balance;

        vm.prank(user);
        bridge.initiateBridge{value: 2 ether}(suiRecipient, 1 ether);

        assertEq(user.balance, balanceBefore - 1 ether);
    }

    function test_InitiateBridge_RevertWhen_ZeroRecipient() public {
        vm.prank(user);
        vm.expectRevert("Invalid recipient");
        bridge.initiateBridge{value: 1 ether}(bytes32(0), 1 ether);
    }

    function test_InitiateBridge_RevertWhen_ZeroAmount() public {
        vm.prank(user);
        vm.expectRevert("Invalid amount");
        bridge.initiateBridge{value: 1 ether}(suiRecipient, 0);
    }

    function test_InitiateBridge_RevertWhen_InsufficientValue() public {
        vm.prank(user);
        vm.expectRevert("Insufficient value");
        bridge.initiateBridge{value: 0.5 ether}(suiRecipient, 1 ether);
    }

    // ============ Confirm Bridge Tests ============

    function test_ConfirmBridge() public {
        // Initiate
        vm.prank(user);
        bridge.initiateBridge{value: 1 ether}(suiRecipient, 1 ether);

        // Get transfer ID
        bytes32 transferId = keccak256(
            abi.encodePacked(
                suiRecipient,
                uint256(1 ether),
                block.timestamp,
                uint256(1)
            )
        );

        // Confirm
        vm.prank(relayer1);
        bridge.confirmBridge(transferId);

        assertTrue(bridge.hasConfirmed(transferId, relayer1));
        
        (,,,uint256 confirmationCount,,) = bridge.getTransfer(transferId);
        assertEq(confirmationCount, 1);
    }

    function test_ConfirmBridge_AutoExecutes() public {
        // Initiate
        vm.prank(user);
        bridge.initiateBridge{value: 1 ether}(suiRecipient, 1 ether);

        bytes32 transferId = keccak256(
            abi.encodePacked(
                suiRecipient,
                uint256(1 ether),
                block.timestamp,
                uint256(1)
            )
        );

        // First confirmation
        vm.prank(relayer1);
        bridge.confirmBridge(transferId);

        (,,,,bool executed,) = bridge.getTransfer(transferId);
        assertFalse(executed);

        // Second confirmation - should auto-execute
        vm.prank(relayer2);
        bridge.confirmBridge(transferId);

        (,,,,executed,) = bridge.getTransfer(transferId);
        assertTrue(executed);
    }

    function test_ConfirmBridge_RevertWhen_NotRelayer() public {
        vm.prank(user);
        bridge.initiateBridge{value: 1 ether}(suiRecipient, 1 ether);

        bytes32 transferId = keccak256(
            abi.encodePacked(
                suiRecipient,
                uint256(1 ether),
                block.timestamp,
                uint256(1)
            )
        );

        vm.prank(user); // Not a relayer
        vm.expectRevert("Not relayer");
        bridge.confirmBridge(transferId);
    }

    function test_ConfirmBridge_RevertWhen_DoubleConfirm() public {
        vm.prank(user);
        bridge.initiateBridge{value: 1 ether}(suiRecipient, 1 ether);

        bytes32 transferId = keccak256(
            abi.encodePacked(
                suiRecipient,
                uint256(1 ether),
                block.timestamp,
                uint256(1)
            )
        );

        vm.prank(relayer1);
        bridge.confirmBridge(transferId);

        vm.prank(relayer1); // Same relayer again
        vm.expectRevert("Already confirmed");
        bridge.confirmBridge(transferId);
    }

    // ============ Refund Tests ============

    function test_RefundBridge_AfterTimeout() public {
        vm.prank(user);
        bridge.initiateBridge{value: 1 ether}(suiRecipient, 1 ether);

        bytes32 transferId = keccak256(
            abi.encodePacked(
                suiRecipient,
                uint256(1 ether),
                block.timestamp,
                uint256(1)
            )
        );

        // Fast forward past timeout
        vm.warp(block.timestamp + 25 hours);

        uint256 balanceBefore = user.balance;

        bridge.refundBridge(transferId, user);

        assertEq(user.balance, balanceBefore + 1 ether);
        
        (,,,,,bool refunded) = bridge.getTransfer(transferId);
        assertTrue(refunded);
    }

    function test_RefundBridge_RevertWhen_NotTimedOut() public {
        vm.prank(user);
        bridge.initiateBridge{value: 1 ether}(suiRecipient, 1 ether);

        bytes32 transferId = keccak256(
            abi.encodePacked(
                suiRecipient,
                uint256(1 ether),
                block.timestamp,
                uint256(1)
            )
        );

        // Try to refund immediately
        vm.expectRevert("Not timed out");
        bridge.refundBridge(transferId, user);
    }

    // ============ Admin Tests ============

    function test_AddRelayer() public {
        address newRelayer = makeAddr("newRelayer");
        bridge.addRelayer(newRelayer);

        assertTrue(bridge.isRelayer(newRelayer));
        assertEq(bridge.getRelayerCount(), 4);
    }

    function test_RemoveRelayer() public {
        bridge.removeRelayer(relayer3);

        assertFalse(bridge.isRelayer(relayer3));
        assertEq(bridge.getRelayerCount(), 2);
    }

    function test_RemoveRelayer_RevertWhen_TooFew() public {
        bridge.removeRelayer(relayer1);
        vm.expectRevert("Too few relayers");
        bridge.removeRelayer(relayer2); // Should fail - would leave only 1
    }

    function test_SetBridgeFee() public {
        bridge.setBridgeFee(0.002 ether);
        assertEq(bridge.bridgeFee(), 0.002 ether);
    }

    function test_SetEscrowContract() public {
        address escrowAddr = makeAddr("escrow");
        bridge.setEscrowContract(escrowAddr);
        assertEq(bridge.escrowContract(), escrowAddr);
    }

    // ============ View Functions ============

    function test_GetRelayers() public view {
        address[] memory relayers = bridge.getRelayers();
        assertEq(relayers.length, 3);
        assertEq(relayers[0], relayer1);
        assertEq(relayers[1], relayer2);
        assertEq(relayers[2], relayer3);
    }

    function test_GetTransfer() public {
        vm.prank(user);
        bridge.initiateBridge{value: 1 ether}(suiRecipient, 1 ether);

        bytes32 transferId = keccak256(
            abi.encodePacked(
                suiRecipient,
                uint256(1 ether),
                block.timestamp,
                uint256(1)
            )
        );

        (
            bytes32 recipient,
            uint256 amount,
            uint256 initiatedAt,
            uint256 confirmationCount,
            bool executed,
            bool refunded
        ) = bridge.getTransfer(transferId);

        assertEq(recipient, suiRecipient);
        assertEq(amount, 1 ether);
        assertEq(initiatedAt, block.timestamp);
        assertEq(confirmationCount, 0);
        assertFalse(executed);
        assertFalse(refunded);
    }
}
