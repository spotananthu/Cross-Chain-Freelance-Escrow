// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/FusionResolver.sol";
import "./mocks/MockERC20.sol";

contract FusionResolverTest is Test {
    FusionResolver public resolver;
    MockERC20 public tokenA;
    MockERC20 public tokenB;

    address public owner;
    address public feeRecipient;
    address public maker;
    address public taker;

    uint256 public makerPrivateKey = 0xA11CE;
    uint256 public takerPrivateKey = 0xB0B;

    function setUp() public {
        owner = address(this);
        feeRecipient = makeAddr("feeRecipient");
        maker = vm.addr(makerPrivateKey);
        taker = vm.addr(takerPrivateKey);

        // Fund accounts
        vm.deal(maker, 100 ether);
        vm.deal(taker, 100 ether);

        // Deploy contracts
        resolver = new FusionResolver(feeRecipient);
        tokenA = new MockERC20("Token A", "TKA");
        tokenB = new MockERC20("Token B", "TKB");

        // Mint tokens
        tokenA.mint(maker, 1000 ether);
        tokenB.mint(taker, 1000 ether);

        // Approve resolver
        vm.prank(maker);
        tokenA.approve(address(resolver), type(uint256).max);

        vm.prank(taker);
        tokenB.approve(address(resolver), type(uint256).max);
    }

    // ============ Constructor Tests ============

    function test_Constructor() public view {
        assertEq(resolver.owner(), owner);
        assertEq(resolver.feeRecipient(), feeRecipient);
        assertEq(resolver.resolverFee(), 10); // 0.1%
        assertEq(resolver.minOrderAmount(), 0.01 ether);
    }

    // ============ Fill Order Tests ============

    function test_FillOrder_TokenToToken() public {
        FusionResolver.FusionOrder memory order = FusionResolver.FusionOrder({
            maker: maker,
            taker: address(0), // Anyone can fill
            makerAsset: address(tokenA),
            takerAsset: address(tokenB),
            makerAmount: 100 ether,
            takerAmount: 200 ether,
            nonce: 1,
            deadline: block.timestamp + 1 hours
        });

        // Sign order
        bytes32 orderHash = resolver.getOrderHash(order);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(makerPrivateKey, orderHash);
        FusionResolver.OrderSignature memory sig = FusionResolver.OrderSignature(v, r, s);

        uint256 makerBalanceBefore = tokenB.balanceOf(maker);
        uint256 takerBalanceBefore = tokenA.balanceOf(taker);

        vm.prank(taker);
        resolver.fillOrder(order, sig);

        // Check balances (200 - 0.1% fee = 199.8)
        assertEq(tokenB.balanceOf(maker), makerBalanceBefore + 199.8 ether);
        assertEq(tokenA.balanceOf(taker), takerBalanceBefore + 100 ether);
        assertEq(tokenB.balanceOf(feeRecipient), 0.2 ether);
    }

    function test_FillOrder_ETHToToken() public {
        // Give resolver some ETH (in production, maker would deposit)
        vm.deal(address(resolver), 10 ether);

        FusionResolver.FusionOrder memory order = FusionResolver.FusionOrder({
            maker: maker,
            taker: address(0),
            makerAsset: address(0), // ETH
            takerAsset: address(tokenB),
            makerAmount: 1 ether,
            takerAmount: 100 ether,
            nonce: 1,
            deadline: block.timestamp + 1 hours
        });

        bytes32 orderHash = resolver.getOrderHash(order);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(makerPrivateKey, orderHash);
        FusionResolver.OrderSignature memory sig = FusionResolver.OrderSignature(v, r, s);

        uint256 takerETHBefore = taker.balance;

        vm.prank(taker);
        resolver.fillOrder(order, sig);

        assertEq(taker.balance, takerETHBefore + 1 ether);
    }

    function test_FillOrder_TokenToETH() public {
        FusionResolver.FusionOrder memory order = FusionResolver.FusionOrder({
            maker: maker,
            taker: address(0),
            makerAsset: address(tokenA),
            takerAsset: address(0), // ETH
            makerAmount: 100 ether,
            takerAmount: 1 ether,
            nonce: 1,
            deadline: block.timestamp + 1 hours
        });

        bytes32 orderHash = resolver.getOrderHash(order);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(makerPrivateKey, orderHash);
        FusionResolver.OrderSignature memory sig = FusionResolver.OrderSignature(v, r, s);

        uint256 makerETHBefore = maker.balance;

        vm.prank(taker);
        resolver.fillOrder{value: 1 ether}(order, sig);

        // 1 ETH - 0.1% fee = 0.999 ETH
        assertApproxEqRel(maker.balance, makerETHBefore + 0.999 ether, 0.001e18);
    }

    function test_FillOrder_RevertWhen_Expired() public {
        FusionResolver.FusionOrder memory order = FusionResolver.FusionOrder({
            maker: maker,
            taker: address(0),
            makerAsset: address(tokenA),
            takerAsset: address(tokenB),
            makerAmount: 100 ether,
            takerAmount: 200 ether,
            nonce: 1,
            deadline: block.timestamp - 1 // Already expired
        });

        bytes32 orderHash = resolver.getOrderHash(order);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(makerPrivateKey, orderHash);
        FusionResolver.OrderSignature memory sig = FusionResolver.OrderSignature(v, r, s);

        vm.prank(taker);
        vm.expectRevert("Order expired");
        resolver.fillOrder(order, sig);
    }

    function test_FillOrder_RevertWhen_WrongTaker() public {
        FusionResolver.FusionOrder memory order = FusionResolver.FusionOrder({
            maker: maker,
            taker: address(0x999), // Specific taker
            makerAsset: address(tokenA),
            takerAsset: address(tokenB),
            makerAmount: 100 ether,
            takerAmount: 200 ether,
            nonce: 1,
            deadline: block.timestamp + 1 hours
        });

        bytes32 orderHash = resolver.getOrderHash(order);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(makerPrivateKey, orderHash);
        FusionResolver.OrderSignature memory sig = FusionResolver.OrderSignature(v, r, s);

        vm.prank(taker); // Wrong taker
        vm.expectRevert("Invalid taker");
        resolver.fillOrder(order, sig);
    }

    function test_FillOrder_RevertWhen_AmountTooLow() public {
        FusionResolver.FusionOrder memory order = FusionResolver.FusionOrder({
            maker: maker,
            taker: address(0),
            makerAsset: address(tokenA),
            takerAsset: address(tokenB),
            makerAmount: 0.001 ether, // Below minimum
            takerAmount: 0.002 ether,
            nonce: 1,
            deadline: block.timestamp + 1 hours
        });

        bytes32 orderHash = resolver.getOrderHash(order);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(makerPrivateKey, orderHash);
        FusionResolver.OrderSignature memory sig = FusionResolver.OrderSignature(v, r, s);

        vm.prank(taker);
        vm.expectRevert("Amount too low");
        resolver.fillOrder(order, sig);
    }

    // ============ Cancel Order Tests ============

    function test_CancelOrder() public {
        FusionResolver.FusionOrder memory order = FusionResolver.FusionOrder({
            maker: maker,
            taker: address(0),
            makerAsset: address(tokenA),
            takerAsset: address(tokenB),
            makerAmount: 100 ether,
            takerAmount: 200 ether,
            nonce: 1,
            deadline: block.timestamp + 1 hours
        });

        vm.prank(maker);
        resolver.cancelOrder(order);

        assertFalse(resolver.isOrderValid(order));
    }

    function test_CancelOrder_RevertWhen_NotMaker() public {
        FusionResolver.FusionOrder memory order = FusionResolver.FusionOrder({
            maker: maker,
            taker: address(0),
            makerAsset: address(tokenA),
            takerAsset: address(tokenB),
            makerAmount: 100 ether,
            takerAmount: 200 ether,
            nonce: 1,
            deadline: block.timestamp + 1 hours
        });

        vm.prank(taker); // Not the maker
        vm.expectRevert("Not maker");
        resolver.cancelOrder(order);
    }

    // ============ Admin Tests ============

    function test_SetResolverFee() public {
        resolver.setResolverFee(50); // 0.5%
        assertEq(resolver.resolverFee(), 50);
    }

    function test_SetResolverFee_RevertWhen_TooHigh() public {
        vm.expectRevert("Fee too high");
        resolver.setResolverFee(200); // 2% - should fail (max 1%)
    }

    function test_SetMinOrderAmount() public {
        resolver.setMinOrderAmount(0.1 ether);
        assertEq(resolver.minOrderAmount(), 0.1 ether);
    }

    function test_SetFeeRecipient() public {
        address newRecipient = makeAddr("newRecipient");
        resolver.setFeeRecipient(newRecipient);
        assertEq(resolver.feeRecipient(), newRecipient);
    }

    // ============ View Functions ============

    function test_IsOrderValid() public {
        FusionResolver.FusionOrder memory order = FusionResolver.FusionOrder({
            maker: maker,
            taker: address(0),
            makerAsset: address(tokenA),
            takerAsset: address(tokenB),
            makerAmount: 100 ether,
            takerAmount: 200 ether,
            nonce: 1,
            deadline: block.timestamp + 1 hours
        });

        assertTrue(resolver.isOrderValid(order));
    }

    function test_IsOrderValid_Expired() public {
        FusionResolver.FusionOrder memory order = FusionResolver.FusionOrder({
            maker: maker,
            taker: address(0),
            makerAsset: address(tokenA),
            takerAsset: address(tokenB),
            makerAmount: 100 ether,
            takerAmount: 200 ether,
            nonce: 1,
            deadline: block.timestamp - 1
        });

        assertFalse(resolver.isOrderValid(order));
    }

    function test_GetOrderHash() public view {
        FusionResolver.FusionOrder memory order = FusionResolver.FusionOrder({
            maker: maker,
            taker: address(0),
            makerAsset: address(tokenA),
            takerAsset: address(tokenB),
            makerAmount: 100 ether,
            takerAmount: 200 ether,
            nonce: 1,
            deadline: block.timestamp + 1 hours
        });

        bytes32 hash = resolver.getOrderHash(order);
        assertTrue(hash != bytes32(0));
    }
}
