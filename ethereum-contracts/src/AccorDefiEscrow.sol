// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAccorDefiEscrow} from "./interfaces/IAccorDefiEscrow.sol";
import {IAccorDefiBridge} from "./interfaces/IAccorDefiBridge.sol";

/**
 * @title AccorDefiEscrow
 * @notice Cross-chain escrow contract for freelance payments
 * @dev Supports both native chain payments and cross-chain to Sui
 */
contract AccorDefiEscrow is IAccorDefiEscrow {
    // ============ Constants ============
    
    uint256 public constant PLATFORM_FEE_BPS = 100; // 1%
    uint256 public constant MIN_ARBITERS = 3;
    uint256 public constant DISPUTE_TIMEOUT = 7 days;

    // ============ State Variables ============

    address public owner;
    address public treasury;
    IAccorDefiBridge public bridge;
    
    uint256 public totalEscrows;
    uint256 public totalVolume;
    uint256 public feeBps;

    mapping(uint256 => Escrow) public escrows;
    mapping(uint256 => Milestone[]) public escrowMilestones;
    mapping(uint256 => Dispute) public disputes;
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    mapping(address => bool) public isArbiter;

    // ============ Modifiers ============

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyClient(uint256 escrowId) {
        require(msg.sender == escrows[escrowId].client, "Not client");
        _;
    }

    modifier onlyFreelancer(uint256 escrowId) {
        require(msg.sender == escrows[escrowId].freelancer, "Not freelancer");
        _;
    }

    modifier onlyParty(uint256 escrowId) {
        require(
            msg.sender == escrows[escrowId].client || 
            msg.sender == escrows[escrowId].freelancer,
            "Not party"
        );
        _;
    }

    modifier onlyArbiter() {
        require(isArbiter[msg.sender], "Not arbiter");
        _;
    }

    modifier escrowActive(uint256 escrowId) {
        require(escrows[escrowId].status == EscrowStatus.Active, "Escrow not active");
        _;
    }

    // ============ Constructor ============

    constructor(address _treasury, address _bridge) {
        owner = msg.sender;
        treasury = _treasury;
        bridge = IAccorDefiBridge(_bridge);
        feeBps = PLATFORM_FEE_BPS;
    }

    // ============ External Functions ============

    /**
     * @notice Create a new escrow with milestones
     * @param freelancer Address of the freelancer (or zero for cross-chain)
     * @param title Project title
     * @param description Project description
     * @param milestoneDescriptions Array of milestone descriptions
     * @param milestoneAmounts Array of milestone amounts
     * @param milestoneDeadlines Array of milestone deadlines
     * @param suiRecipient Sui address for cross-chain payments
     * @param crossChain Whether this is a cross-chain escrow
     */
    function createEscrow(
        address freelancer,
        string calldata title,
        string calldata description,
        string[] calldata milestoneDescriptions,
        uint256[] calldata milestoneAmounts,
        uint256[] calldata milestoneDeadlines,
        bytes32 suiRecipient,
        bool crossChain
    ) external payable returns (uint256 escrowId) {
        require(milestoneDescriptions.length > 0, "No milestones");
        require(
            milestoneDescriptions.length == milestoneAmounts.length &&
            milestoneAmounts.length == milestoneDeadlines.length,
            "Array length mismatch"
        );

        // Calculate total
        uint256 total = 0;
        for (uint256 i = 0; i < milestoneAmounts.length; i++) {
            total += milestoneAmounts[i];
        }
        require(msg.value >= total, "Insufficient payment");

        escrowId = ++totalEscrows;

        // Create escrow
        escrows[escrowId] = Escrow({
            id: escrowId,
            client: msg.sender,
            freelancer: freelancer,
            title: title,
            description: description,
            totalAmount: total,
            balance: msg.value,
            status: EscrowStatus.Active,
            currentMilestone: 0,
            createdAt: block.timestamp,
            updatedAt: block.timestamp,
            suiRecipient: suiRecipient,
            crossChain: crossChain
        });

        // Create milestones
        for (uint256 i = 0; i < milestoneDescriptions.length; i++) {
            escrowMilestones[escrowId].push(Milestone({
                id: i,
                description: milestoneDescriptions[i],
                amount: milestoneAmounts[i],
                status: MilestoneStatus.Pending,
                deadline: milestoneDeadlines[i],
                submissionNote: "",
                submittedAt: 0
            }));
        }

        totalVolume += total;

        emit EscrowCreated(
            escrowId,
            msg.sender,
            freelancer,
            total,
            milestoneDescriptions.length,
            crossChain
        );

        // Refund excess
        if (msg.value > total) {
            (bool success, ) = msg.sender.call{value: msg.value - total}("");
            require(success, "Refund failed");
        }

        return escrowId;
    }

    /**
     * @notice Freelancer submits work for a milestone
     */
    function submitMilestone(
        uint256 escrowId,
        uint256 milestoneId,
        string calldata submissionNote
    ) external onlyFreelancer(escrowId) escrowActive(escrowId) {
        require(milestoneId < escrowMilestones[escrowId].length, "Invalid milestone");
        
        Milestone storage milestone = escrowMilestones[escrowId][milestoneId];
        require(
            milestone.status == MilestoneStatus.Pending || 
            milestone.status == MilestoneStatus.InProgress,
            "Milestone not pending"
        );

        milestone.status = MilestoneStatus.Submitted;
        milestone.submissionNote = submissionNote;
        milestone.submittedAt = block.timestamp;
        escrows[escrowId].updatedAt = block.timestamp;

        emit MilestoneSubmitted(escrowId, milestoneId, msg.sender, submissionNote);
    }

    /**
     * @notice Client approves a submitted milestone
     */
    function approveMilestone(
        uint256 escrowId,
        uint256 milestoneId
    ) external onlyClient(escrowId) escrowActive(escrowId) {
        require(milestoneId < escrowMilestones[escrowId].length, "Invalid milestone");
        
        Milestone storage milestone = escrowMilestones[escrowId][milestoneId];
        require(milestone.status == MilestoneStatus.Submitted, "Milestone not submitted");

        milestone.status = MilestoneStatus.Approved;
        escrows[escrowId].updatedAt = block.timestamp;

        emit MilestoneApproved(escrowId, milestoneId, msg.sender);
    }

    /**
     * @notice Release funds for an approved milestone
     */
    function releaseMilestone(
        uint256 escrowId,
        uint256 milestoneId
    ) external onlyClient(escrowId) escrowActive(escrowId) {
        require(milestoneId < escrowMilestones[escrowId].length, "Invalid milestone");
        
        Milestone storage milestone = escrowMilestones[escrowId][milestoneId];
        require(milestone.status == MilestoneStatus.Approved, "Milestone not approved");

        Escrow storage escrow = escrows[escrowId];
        require(escrow.balance >= milestone.amount, "Insufficient balance");

        uint256 amount = milestone.amount;
        uint256 fee = (amount * feeBps) / 10000;
        uint256 freelancerAmount = amount - fee;

        milestone.status = MilestoneStatus.Released;
        escrow.balance -= amount;
        escrow.updatedAt = block.timestamp;

        if (escrow.crossChain) {
            // Cross-chain release to Sui
            bridge.initiateBridge{value: freelancerAmount}(escrow.suiRecipient, freelancerAmount);
            
            emit CrossChainReleaseInitiated(
                escrowId,
                milestoneId,
                escrow.suiRecipient,
                freelancerAmount
            );
        } else {
            // Direct transfer to freelancer
            (bool success, ) = escrow.freelancer.call{value: freelancerAmount}("");
            require(success, "Transfer failed");
        }

        // Transfer fee to treasury
        if (fee > 0) {
            (bool feeSuccess, ) = treasury.call{value: fee}("");
            require(feeSuccess, "Fee transfer failed");
        }

        emit MilestoneReleased(escrowId, milestoneId, escrow.freelancer, freelancerAmount);

        // Check if all milestones complete
        _checkEscrowCompletion(escrowId);
    }

    /**
     * @notice Initiate a dispute for a milestone
     */
    function initiateDispute(
        uint256 escrowId,
        uint256 milestoneId,
        string calldata reason
    ) external onlyParty(escrowId) escrowActive(escrowId) {
        require(milestoneId < escrowMilestones[escrowId].length, "Invalid milestone");
        require(disputes[escrowId].initiatedAt == 0, "Dispute exists");

        Milestone storage milestone = escrowMilestones[escrowId][milestoneId];
        milestone.status = MilestoneStatus.Disputed;

        disputes[escrowId] = Dispute({
            initiatedBy: msg.sender,
            initiatedAt: block.timestamp,
            reason: reason,
            milestoneId: milestoneId,
            votesForClient: 0,
            votesForFreelancer: 0,
            resolved: false,
            resolutionNote: ""
        });

        escrows[escrowId].status = EscrowStatus.Disputed;
        escrows[escrowId].updatedAt = block.timestamp;

        emit DisputeInitiated(escrowId, milestoneId, msg.sender, reason);
    }

    /**
     * @notice Arbiter votes on a dispute
     */
    function voteDispute(
        uint256 escrowId,
        bool voteForClient
    ) external onlyArbiter {
        require(escrows[escrowId].status == EscrowStatus.Disputed, "No active dispute");
        require(!disputes[escrowId].resolved, "Dispute resolved");
        require(!hasVoted[escrowId][msg.sender], "Already voted");

        hasVoted[escrowId][msg.sender] = true;

        if (voteForClient) {
            disputes[escrowId].votesForClient++;
        } else {
            disputes[escrowId].votesForFreelancer++;
        }

        emit DisputeVoted(escrowId, msg.sender, voteForClient);

        // Check if enough votes to resolve
        uint256 totalVotes = disputes[escrowId].votesForClient + disputes[escrowId].votesForFreelancer;
        if (totalVotes >= MIN_ARBITERS) {
            _resolveDispute(escrowId);
        }
    }

    /**
     * @notice Refund remaining balance to client
     */
    function refundToClient(uint256 escrowId) external onlyClient(escrowId) {
        Escrow storage escrow = escrows[escrowId];
        require(
            escrow.status == EscrowStatus.Cancelled || 
            escrow.status == EscrowStatus.Refunded,
            "Cannot refund"
        );

        uint256 amount = escrow.balance;
        require(amount > 0, "No balance");

        escrow.balance = 0;
        escrow.updatedAt = block.timestamp;

        (bool success, ) = escrow.client.call{value: amount}("");
        require(success, "Refund failed");

        emit EscrowRefunded(escrowId, escrow.client, amount);
    }

    // ============ Admin Functions ============

    function registerArbiter(address arbiter) external onlyOwner {
        isArbiter[arbiter] = true;
    }

    function removeArbiter(address arbiter) external onlyOwner {
        isArbiter[arbiter] = false;
    }

    function updateFee(uint256 newFeeBps) external onlyOwner {
        require(newFeeBps <= 500, "Fee too high"); // Max 5%
        feeBps = newFeeBps;
    }

    function updateTreasury(address newTreasury) external onlyOwner {
        treasury = newTreasury;
    }

    function updateBridge(address newBridge) external onlyOwner {
        bridge = IAccorDefiBridge(newBridge);
    }

    // ============ View Functions ============

    function getEscrow(uint256 escrowId) external view returns (Escrow memory) {
        return escrows[escrowId];
    }

    function getMilestone(uint256 escrowId, uint256 milestoneId) external view returns (Milestone memory) {
        return escrowMilestones[escrowId][milestoneId];
    }

    function getMilestones(uint256 escrowId) external view returns (Milestone[] memory) {
        return escrowMilestones[escrowId];
    }

    function getDispute(uint256 escrowId) external view returns (Dispute memory) {
        return disputes[escrowId];
    }

    function getPlatformStats() external view returns (uint256, uint256, uint256) {
        return (totalEscrows, totalVolume, feeBps);
    }

    // ============ Internal Functions ============

    function _resolveDispute(uint256 escrowId) internal {
        Dispute storage dispute = disputes[escrowId];
        Escrow storage escrow = escrows[escrowId];
        Milestone storage milestone = escrowMilestones[escrowId][dispute.milestoneId];

        address winner;
        string memory resolution;

        if (dispute.votesForClient > dispute.votesForFreelancer) {
            // Client wins - refund
            milestone.status = MilestoneStatus.Refunded;
            winner = escrow.client;
            resolution = "Resolved in favor of client";
        } else {
            // Freelancer wins - release
            milestone.status = MilestoneStatus.Released;
            winner = escrow.freelancer;
            resolution = "Resolved in favor of freelancer";

            uint256 amount = milestone.amount;
            uint256 fee = (amount * feeBps) / 10000;
            uint256 freelancerAmount = amount - fee;

            escrow.balance -= amount;

            if (escrow.crossChain) {
                bridge.initiateBridge{value: freelancerAmount}(escrow.suiRecipient, freelancerAmount);
            } else {
                (bool success, ) = escrow.freelancer.call{value: freelancerAmount}("");
                require(success, "Transfer failed");
            }

            if (fee > 0) {
                (bool feeSuccess, ) = treasury.call{value: fee}("");
                require(feeSuccess, "Fee transfer failed");
            }
        }

        dispute.resolved = true;
        dispute.resolutionNote = resolution;
        escrow.status = EscrowStatus.Active;
        escrow.updatedAt = block.timestamp;

        emit DisputeResolved(escrowId, dispute.milestoneId, winner, resolution);

        _checkEscrowCompletion(escrowId);
    }

    function _checkEscrowCompletion(uint256 escrowId) internal {
        Milestone[] storage milestones = escrowMilestones[escrowId];
        
        for (uint256 i = 0; i < milestones.length; i++) {
            if (milestones[i].status != MilestoneStatus.Released && 
                milestones[i].status != MilestoneStatus.Refunded) {
                return;
            }
        }

        escrows[escrowId].status = EscrowStatus.Completed;
        emit EscrowCompleted(escrowId, escrows[escrowId].totalAmount);
    }

    // ============ Receive ============

    receive() external payable {}
}
