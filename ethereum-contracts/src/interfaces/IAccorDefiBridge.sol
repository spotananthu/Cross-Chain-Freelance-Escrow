// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IAccorDefiBridge
 * @notice Interface for the AccorDefi Bridge contract
 */
interface IAccorDefiBridge {
    // ============ Events ============

    event BridgeInitiated(
        bytes32 indexed transferId,
        bytes32 indexed suiRecipient,
        uint256 amount,
        uint256 timestamp
    );

    event BridgeConfirmed(
        bytes32 indexed transferId,
        address indexed relayer,
        uint256 confirmationCount
    );

    event BridgeExecuted(
        bytes32 indexed transferId,
        bytes32 suiRecipient,
        uint256 amount
    );

    event BridgeRefunded(
        bytes32 indexed transferId,
        address recipient,
        uint256 amount
    );

    // ============ Functions ============

    function initiateBridge(
        bytes32 suiRecipient,
        uint256 amount
    ) external payable;

    function confirmBridge(bytes32 transferId) external;
    function refundBridge(bytes32 transferId, address originalSender) external;
    function addRelayer(address relayer) external;
    function removeRelayer(address relayer) external;

    function isRelayer(address account) external view returns (bool);
    function getRelayers() external view returns (address[] memory);
    function getRelayerCount() external view returns (uint256);
    function hasConfirmed(bytes32 transferId, address relayer) external view returns (bool);
}
