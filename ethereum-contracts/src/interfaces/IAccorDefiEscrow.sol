// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IAccorDefiEscrow
 * @notice Interface for the AccorDefi Escrow contract
 */
interface IAccorDefiEscrow {
    // ============ Enums ============
    
    enum MilestoneStatus {
        Pending,
        InProgress,
        Submitted,
        Approved,
        Disputed,
        Released,
        Refunded
    }

    enum EscrowStatus {
        Active,
        Completed,
        Disputed,
        Cancelled,
        Refunded
    }

    // ============ Structs ============

    struct Milestone {
        uint256 id;
        string description;
        uint256 amount;
        MilestoneStatus status;
        uint256 deadline;
        string submissionNote;
        uint256 submittedAt;
    }

    struct Escrow {
        uint256 id;
        address client;
        address freelancer;
        string title;
        string description;
        uint256 totalAmount;
        uint256 balance;
        EscrowStatus status;
        uint256 currentMilestone;
        uint256 createdAt;
        uint256 updatedAt;
        bytes32 suiRecipient; // Sui address as bytes32
        bool crossChain;
    }

    struct Dispute {
        address initiatedBy;
        uint256 initiatedAt;
        string reason;
        uint256 milestoneId;
        uint256 votesForClient;
        uint256 votesForFreelancer;
        bool resolved;
        string resolutionNote;
    }

    // ============ Events ============

    event EscrowCreated(
        uint256 indexed escrowId,
        address indexed client,
        address indexed freelancer,
        uint256 totalAmount,
        uint256 milestoneCount,
        bool crossChain
    );

    event FundsDeposited(
        uint256 indexed escrowId,
        address indexed depositor,
        uint256 amount,
        uint256 newBalance
    );

    event MilestoneSubmitted(
        uint256 indexed escrowId,
        uint256 indexed milestoneId,
        address indexed freelancer,
        string submissionNote
    );

    event MilestoneApproved(
        uint256 indexed escrowId,
        uint256 indexed milestoneId,
        address indexed client
    );

    event MilestoneReleased(
        uint256 indexed escrowId,
        uint256 indexed milestoneId,
        address indexed freelancer,
        uint256 amount
    );

    event CrossChainReleaseInitiated(
        uint256 indexed escrowId,
        uint256 indexed milestoneId,
        bytes32 indexed suiRecipient,
        uint256 amount
    );

    event DisputeInitiated(
        uint256 indexed escrowId,
        uint256 indexed milestoneId,
        address indexed initiatedBy,
        string reason
    );

    event DisputeVoted(
        uint256 indexed escrowId,
        address indexed arbiter,
        bool voteForClient
    );

    event DisputeResolved(
        uint256 indexed escrowId,
        uint256 indexed milestoneId,
        address indexed winner,
        string resolutionNote
    );

    event EscrowCompleted(uint256 indexed escrowId, uint256 totalReleased);

    event EscrowRefunded(uint256 indexed escrowId, address indexed client, uint256 amount);

    // ============ Functions ============

    function createEscrow(
        address freelancer,
        string calldata title,
        string calldata description,
        string[] calldata milestoneDescriptions,
        uint256[] calldata milestoneAmounts,
        uint256[] calldata milestoneDeadlines,
        bytes32 suiRecipient,
        bool crossChain
    ) external payable returns (uint256 escrowId);

    function submitMilestone(
        uint256 escrowId,
        uint256 milestoneId,
        string calldata submissionNote
    ) external;

    function approveMilestone(uint256 escrowId, uint256 milestoneId) external;

    function releaseMilestone(uint256 escrowId, uint256 milestoneId) external;

    function initiateDispute(
        uint256 escrowId,
        uint256 milestoneId,
        string calldata reason
    ) external;

    function voteDispute(uint256 escrowId, bool voteForClient) external;

    function refundToClient(uint256 escrowId) external;

    function getEscrow(uint256 escrowId) external view returns (Escrow memory);

    function getMilestone(uint256 escrowId, uint256 milestoneId) external view returns (Milestone memory);

    function getMilestones(uint256 escrowId) external view returns (Milestone[] memory);

    function getDispute(uint256 escrowId) external view returns (Dispute memory);
}
