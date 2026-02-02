// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAccorDefiBridge} from "./interfaces/IAccorDefiBridge.sol";

/**
 * @title AccorDefiBridge
 * @notice Bridge contract for cross-chain transfers to Sui
 * @dev Uses relayer pattern with multisig validation
 */
contract AccorDefiBridge is IAccorDefiBridge {
    // ============ Constants ============

    uint256 public constant MIN_CONFIRMATIONS = 2;
    uint256 public constant BRIDGE_TIMEOUT = 24 hours;

    // ============ State Variables ============

    address public owner;
    address public escrowContract;
    
    uint256 public totalBridged;
    uint256 public bridgeNonce;
    uint256 public bridgeFee;

    mapping(address => bool) public isRelayer;
    mapping(bytes32 => BridgeTransfer) public transfers;
    mapping(bytes32 => mapping(address => bool)) public confirmations;

    address[] public relayers;

    struct BridgeTransfer {
        bytes32 suiRecipient;
        uint256 amount;
        uint256 initiatedAt;
        uint256 confirmationCount;
        bool executed;
        bool refunded;
    }

    // ============ Events (additional to interface) ============

    event RelayerAdded(address relayer);
    event RelayerRemoved(address relayer);
    event EscrowContractUpdated(address escrowContract);
    event BridgeFeeUpdated(uint256 newFee);

    // ============ Modifiers ============

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyEscrow() {
        require(msg.sender == escrowContract, "Not escrow contract");
        _;
    }

    modifier onlyRelayer() {
        require(isRelayer[msg.sender], "Not relayer");
        _;
    }

    // ============ Constructor ============

    constructor(address[] memory _relayers) {
        require(_relayers.length >= MIN_CONFIRMATIONS, "Not enough relayers");
        
        owner = msg.sender;
        bridgeFee = 0.001 ether; // Default fee

        for (uint256 i = 0; i < _relayers.length; i++) {
            address relayer = _relayers[i];
            require(relayer != address(0), "Invalid relayer");
            require(!isRelayer[relayer], "Duplicate relayer");
            
            isRelayer[relayer] = true;
            relayers.push(relayer);
            
            emit RelayerAdded(relayer);
        }
    }

    // ============ External Functions ============

    /**
     * @notice Initiate a bridge transfer to Sui
     * @param suiRecipient The Sui address to receive funds
     * @param amount The amount to bridge
     */
    function initiateBridge(
        bytes32 suiRecipient,
        uint256 amount
    ) external payable override {
        require(suiRecipient != bytes32(0), "Invalid recipient");
        require(amount > 0, "Invalid amount");
        require(msg.value >= amount, "Insufficient value");

        bytes32 transferId = keccak256(
            abi.encodePacked(
                suiRecipient,
                amount,
                block.timestamp,
                ++bridgeNonce
            )
        );

        transfers[transferId] = BridgeTransfer({
            suiRecipient: suiRecipient,
            amount: amount,
            initiatedAt: block.timestamp,
            confirmationCount: 0,
            executed: false,
            refunded: false
        });

        totalBridged += amount;

        emit BridgeInitiated(transferId, suiRecipient, amount, block.timestamp);

        // Refund excess
        if (msg.value > amount) {
            (bool success, ) = msg.sender.call{value: msg.value - amount}("");
            require(success, "Refund failed");
        }
    }

    /**
     * @notice Confirm a bridge transfer (relayer only)
     * @param transferId The transfer to confirm
     */
    function confirmBridge(bytes32 transferId) external onlyRelayer {
        BridgeTransfer storage transfer = transfers[transferId];
        
        require(transfer.initiatedAt > 0, "Transfer not found");
        require(!transfer.executed, "Already executed");
        require(!transfer.refunded, "Already refunded");
        require(!confirmations[transferId][msg.sender], "Already confirmed");

        confirmations[transferId][msg.sender] = true;
        transfer.confirmationCount++;

        emit BridgeConfirmed(transferId, msg.sender, transfer.confirmationCount);

        // Auto-execute if threshold met
        if (transfer.confirmationCount >= MIN_CONFIRMATIONS) {
            _executeBridge(transferId);
        }
    }

    /**
     * @notice Request refund for timed-out transfer
     * @param transferId The transfer to refund
     * @param originalSender The original sender address for refund
     */
    function refundBridge(bytes32 transferId, address originalSender) external {
        BridgeTransfer storage transfer = transfers[transferId];
        
        require(transfer.initiatedAt > 0, "Transfer not found");
        require(!transfer.executed, "Already executed");
        require(!transfer.refunded, "Already refunded");
        require(
            block.timestamp > transfer.initiatedAt + BRIDGE_TIMEOUT,
            "Not timed out"
        );

        transfer.refunded = true;
        totalBridged -= transfer.amount;

        (bool success, ) = originalSender.call{value: transfer.amount}("");
        require(success, "Refund failed");

        emit BridgeRefunded(transferId, originalSender, transfer.amount);
    }

    /**
     * @notice Get pending transfers count for a recipient
     */
    function getPendingTransfers(bytes32 suiRecipient) external view returns (uint256) {
        // This would require tracking - simplified for now
        return 0;
    }

    /**
     * @notice Get transfer details
     */
    function getTransfer(bytes32 transferId) external view returns (
        bytes32 suiRecipient,
        uint256 amount,
        uint256 initiatedAt,
        uint256 confirmationCount,
        bool executed,
        bool refunded
    ) {
        BridgeTransfer storage transfer = transfers[transferId];
        return (
            transfer.suiRecipient,
            transfer.amount,
            transfer.initiatedAt,
            transfer.confirmationCount,
            transfer.executed,
            transfer.refunded
        );
    }

    // ============ Admin Functions ============

    function setEscrowContract(address _escrowContract) external onlyOwner {
        escrowContract = _escrowContract;
        emit EscrowContractUpdated(_escrowContract);
    }

    function addRelayer(address relayer) external onlyOwner {
        require(!isRelayer[relayer], "Already relayer");
        isRelayer[relayer] = true;
        relayers.push(relayer);
        emit RelayerAdded(relayer);
    }

    function removeRelayer(address relayer) external onlyOwner {
        require(isRelayer[relayer], "Not relayer");
        require(relayers.length > MIN_CONFIRMATIONS, "Too few relayers");
        
        isRelayer[relayer] = false;
        
        // Remove from array
        for (uint256 i = 0; i < relayers.length; i++) {
            if (relayers[i] == relayer) {
                relayers[i] = relayers[relayers.length - 1];
                relayers.pop();
                break;
            }
        }
        
        emit RelayerRemoved(relayer);
    }

    function setBridgeFee(uint256 _fee) external onlyOwner {
        bridgeFee = _fee;
        emit BridgeFeeUpdated(_fee);
    }

    function withdrawFees(address to) external onlyOwner {
        uint256 balance = address(this).balance - _pendingAmount();
        require(balance > 0, "No fees");
        
        (bool success, ) = to.call{value: balance}("");
        require(success, "Withdraw failed");
    }

    // ============ Internal Functions ============

    function _executeBridge(bytes32 transferId) internal {
        BridgeTransfer storage transfer = transfers[transferId];
        transfer.executed = true;

        // In production, this would trigger the Sui-side mint
        // For hackathon, we emit an event that relayers listen to

        emit BridgeExecuted(
            transferId,
            transfer.suiRecipient,
            transfer.amount
        );
    }

    function _pendingAmount() internal view returns (uint256) {
        // Would need to sum up all pending transfers
        // Simplified for hackathon
        return 0;
    }

    // ============ View Functions ============

    function getRelayers() external view returns (address[] memory) {
        return relayers;
    }

    function getRelayerCount() external view returns (uint256) {
        return relayers.length;
    }

    function hasConfirmed(bytes32 transferId, address relayer) external view returns (bool) {
        return confirmations[transferId][relayer];
    }

    // ============ Receive ============

    receive() external payable {}
}
