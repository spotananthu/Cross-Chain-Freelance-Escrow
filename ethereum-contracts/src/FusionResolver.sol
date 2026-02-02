// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";

/**
 * @title FusionResolver
 * @notice 1inch Fusion+ resolver for gasless cross-chain swaps
 * @dev Enables gasless settlement for AccorDefi escrow releases
 */
contract FusionResolver {
    // ============ Constants ============

    bytes32 public constant DOMAIN_SEPARATOR_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );

    bytes32 public constant ORDER_TYPEHASH = keccak256(
        "FusionOrder(address maker,address taker,address makerAsset,address takerAsset,uint256 makerAmount,uint256 takerAmount,uint256 nonce,uint256 deadline)"
    );

    // ============ State Variables ============

    address public owner;
    address public feeRecipient;
    
    bytes32 public immutable DOMAIN_SEPARATOR;
    
    uint256 public resolverFee; // In basis points
    uint256 public minOrderAmount;
    uint256 public orderNonce;

    mapping(bytes32 => bool) public filledOrders;
    mapping(bytes32 => bool) public cancelledOrders;
    mapping(address => bool) public supportedTokens;
    mapping(address => uint256) public userNonces;

    // ============ Structs ============

    struct FusionOrder {
        address maker;
        address taker;          // 0x0 for anyone
        address makerAsset;
        address takerAsset;
        uint256 makerAmount;
        uint256 takerAmount;
        uint256 nonce;
        uint256 deadline;
    }

    struct OrderSignature {
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    // ============ Events ============

    event OrderFilled(
        bytes32 indexed orderHash,
        address indexed maker,
        address indexed taker,
        address makerAsset,
        address takerAsset,
        uint256 makerAmount,
        uint256 takerAmount
    );

    event OrderCancelled(bytes32 indexed orderHash, address indexed maker);

    event TokenAdded(address token);
    event TokenRemoved(address token);
    event FeeUpdated(uint256 newFee);
    event MinAmountUpdated(uint256 newAmount);

    // ============ Modifiers ============

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    // ============ Constructor ============

    constructor(address _feeRecipient) {
        owner = msg.sender;
        feeRecipient = _feeRecipient;
        resolverFee = 10; // 0.1%
        minOrderAmount = 0.01 ether;

        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                DOMAIN_SEPARATOR_TYPEHASH,
                keccak256(bytes("AccorDefi Fusion Resolver")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    // ============ External Functions ============

    /**
     * @notice Fill a Fusion+ order
     * @param order The order to fill
     * @param signature The maker's signature
     */
    function fillOrder(
        FusionOrder calldata order,
        OrderSignature calldata signature
    ) external payable {
        require(order.deadline >= block.timestamp, "Order expired");
        require(order.taker == address(0) || order.taker == msg.sender, "Invalid taker");
        require(order.makerAmount >= minOrderAmount, "Amount too low");

        bytes32 orderHash = _hashOrder(order);
        require(!filledOrders[orderHash], "Order already filled");
        require(!cancelledOrders[orderHash], "Order cancelled");

        // Verify signature
        address signer = _recoverSigner(orderHash, signature);
        require(signer == order.maker, "Invalid signature");

        filledOrders[orderHash] = true;

        // Calculate fee
        uint256 fee = (order.takerAmount * resolverFee) / 10000;
        uint256 takerAmountAfterFee = order.takerAmount - fee;

        // Execute swap
        if (order.makerAsset == address(0)) {
            // Maker asset is ETH
            require(address(this).balance >= order.makerAmount, "Insufficient ETH");
            (bool success, ) = msg.sender.call{value: order.makerAmount}("");
            require(success, "ETH transfer failed");
        } else {
            // Maker asset is ERC20
            bool success = IERC20(order.makerAsset).transferFrom(
                order.maker,
                msg.sender,
                order.makerAmount
            );
            require(success, "Maker transfer failed");
        }

        if (order.takerAsset == address(0)) {
            // Taker asset is ETH
            require(msg.value >= order.takerAmount, "Insufficient ETH");
            
            (bool toMaker, ) = order.maker.call{value: takerAmountAfterFee}("");
            require(toMaker, "Payment to maker failed");

            if (fee > 0) {
                (bool toFee, ) = feeRecipient.call{value: fee}("");
                require(toFee, "Fee transfer failed");
            }
        } else {
            // Taker asset is ERC20
            bool toMaker = IERC20(order.takerAsset).transferFrom(
                msg.sender,
                order.maker,
                takerAmountAfterFee
            );
            require(toMaker, "Payment to maker failed");

            if (fee > 0) {
                bool toFee = IERC20(order.takerAsset).transferFrom(
                    msg.sender,
                    feeRecipient,
                    fee
                );
                require(toFee, "Fee transfer failed");
            }
        }

        emit OrderFilled(
            orderHash,
            order.maker,
            msg.sender,
            order.makerAsset,
            order.takerAsset,
            order.makerAmount,
            order.takerAmount
        );
    }

    /**
     * @notice Fill order with gasless execution (meta-transaction)
     * @param order The order to fill
     * @param makerSig Maker's signature
     * @param takerSig Taker's signature for gasless execution
     */
    function fillOrderGasless(
        FusionOrder calldata order,
        OrderSignature calldata makerSig,
        OrderSignature calldata takerSig
    ) external {
        require(order.deadline >= block.timestamp, "Order expired");
        require(order.makerAmount >= minOrderAmount, "Amount too low");

        bytes32 orderHash = _hashOrder(order);
        require(!filledOrders[orderHash], "Order already filled");
        require(!cancelledOrders[orderHash], "Order cancelled");

        // Verify maker signature
        address maker = _recoverSigner(orderHash, makerSig);
        require(maker == order.maker, "Invalid maker signature");

        // Verify taker signature (they authorized the fill)
        bytes32 fillHash = keccak256(abi.encodePacked(orderHash, order.taker));
        address taker = _recoverSigner(fillHash, takerSig);
        require(taker == order.taker && order.taker != address(0), "Invalid taker signature");

        filledOrders[orderHash] = true;

        // Calculate fee
        uint256 fee = (order.takerAmount * resolverFee) / 10000;
        uint256 takerAmountAfterFee = order.takerAmount - fee;

        // Execute token transfers
        // Note: Both parties must have approved this contract
        
        if (order.makerAsset != address(0)) {
            bool success = IERC20(order.makerAsset).transferFrom(
                order.maker,
                order.taker,
                order.makerAmount
            );
            require(success, "Maker transfer failed");
        }

        if (order.takerAsset != address(0)) {
            bool toMaker = IERC20(order.takerAsset).transferFrom(
                order.taker,
                order.maker,
                takerAmountAfterFee
            );
            require(toMaker, "Payment to maker failed");

            if (fee > 0) {
                bool toFee = IERC20(order.takerAsset).transferFrom(
                    order.taker,
                    feeRecipient,
                    fee
                );
                require(toFee, "Fee transfer failed");
            }
        }

        emit OrderFilled(
            orderHash,
            order.maker,
            order.taker,
            order.makerAsset,
            order.takerAsset,
            order.makerAmount,
            order.takerAmount
        );
    }

    /**
     * @notice Cancel an order
     * @param order The order to cancel
     */
    function cancelOrder(FusionOrder calldata order) external {
        require(msg.sender == order.maker, "Not maker");
        
        bytes32 orderHash = _hashOrder(order);
        require(!filledOrders[orderHash], "Already filled");
        
        cancelledOrders[orderHash] = true;
        
        emit OrderCancelled(orderHash, msg.sender);
    }

    /**
     * @notice Get order hash
     */
    function getOrderHash(FusionOrder calldata order) external view returns (bytes32) {
        return _hashOrder(order);
    }

    /**
     * @notice Check if order is valid
     */
    function isOrderValid(FusionOrder calldata order) external view returns (bool) {
        if (order.deadline < block.timestamp) return false;
        if (order.makerAmount < minOrderAmount) return false;
        
        bytes32 orderHash = _hashOrder(order);
        if (filledOrders[orderHash]) return false;
        if (cancelledOrders[orderHash]) return false;
        
        return true;
    }

    // ============ Admin Functions ============

    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        feeRecipient = _feeRecipient;
    }

    function setResolverFee(uint256 _fee) external onlyOwner {
        require(_fee <= 100, "Fee too high"); // Max 1%
        resolverFee = _fee;
        emit FeeUpdated(_fee);
    }

    function setMinOrderAmount(uint256 _amount) external onlyOwner {
        minOrderAmount = _amount;
        emit MinAmountUpdated(_amount);
    }

    function addSupportedToken(address token) external onlyOwner {
        supportedTokens[token] = true;
        emit TokenAdded(token);
    }

    function removeSupportedToken(address token) external onlyOwner {
        supportedTokens[token] = false;
        emit TokenRemoved(token);
    }

    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            (bool success, ) = owner.call{value: amount}("");
            require(success, "ETH withdraw failed");
        } else {
            IERC20(token).transfer(owner, amount);
        }
    }

    // ============ Internal Functions ============

    function _hashOrder(FusionOrder calldata order) internal view returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(
                    abi.encode(
                        ORDER_TYPEHASH,
                        order.maker,
                        order.taker,
                        order.makerAsset,
                        order.takerAsset,
                        order.makerAmount,
                        order.takerAmount,
                        order.nonce,
                        order.deadline
                    )
                )
            )
        );
    }

    function _recoverSigner(
        bytes32 hash,
        OrderSignature calldata sig
    ) internal pure returns (address) {
        return ecrecover(hash, sig.v, sig.r, sig.s);
    }

    // ============ Receive ============

    receive() external payable {}
}
