// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/AccorDefiEscrow.sol";
import "../src/AccorDefiBridge.sol";
import "../src/FusionResolver.sol";

/**
 * @title DeployAccorDefi
 * @notice Deployment script for AccorDefi contracts
 */
contract DeployAccorDefi is Script {
    // Deployment addresses
    address public escrow;
    address public bridge;
    address public resolver;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address treasury = vm.envOr("TREASURY_ADDRESS", deployer);

        console.log("Deploying AccorDefi contracts...");
        console.log("Deployer:", deployer);
        console.log("Treasury:", treasury);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy Bridge first (with initial relayers)
        address[] memory relayers = new address[](3);
        relayers[0] = deployer; // For testing, deployer is relayer
        relayers[1] = vm.envOr("RELAYER_1", deployer);
        relayers[2] = vm.envOr("RELAYER_2", deployer);

        AccorDefiBridge bridgeContract = new AccorDefiBridge(relayers);
        bridge = address(bridgeContract);
        console.log("AccorDefiBridge deployed at:", bridge);

        // 2. Deploy Escrow
        AccorDefiEscrow escrowContract = new AccorDefiEscrow(treasury, bridge);
        escrow = address(escrowContract);
        console.log("AccorDefiEscrow deployed at:", escrow);

        // 3. Deploy Fusion Resolver
        FusionResolver resolverContract = new FusionResolver(treasury);
        resolver = address(resolverContract);
        console.log("FusionResolver deployed at:", resolver);

        // 4. Configure contracts
        bridgeContract.setEscrowContract(escrow);
        console.log("Bridge configured with escrow contract");

        // 5. Register deployer as arbiter for testing
        escrowContract.registerArbiter(deployer);
        console.log("Deployer registered as arbiter");

        vm.stopBroadcast();

        console.log("\n=== Deployment Complete ===");
        console.log("AccorDefiBridge:", bridge);
        console.log("AccorDefiEscrow:", escrow);
        console.log("FusionResolver:", resolver);
    }
}

/**
 * @title DeployLocal
 * @notice Simplified deployment for local testing
 */
contract DeployLocal is Script {
    function run() external {
        vm.startBroadcast();

        address deployer = msg.sender;

        // Deploy with deployer as all roles
        address[] memory relayers = new address[](3);
        relayers[0] = deployer;
        relayers[1] = address(0x1);
        relayers[2] = address(0x2);

        AccorDefiBridge bridge = new AccorDefiBridge(relayers);
        AccorDefiEscrow escrow = new AccorDefiEscrow(deployer, address(bridge));
        FusionResolver resolver = new FusionResolver(deployer);

        bridge.setEscrowContract(address(escrow));
        escrow.registerArbiter(deployer);

        console.log("Bridge:", address(bridge));
        console.log("Escrow:", address(escrow));
        console.log("Resolver:", address(resolver));

        vm.stopBroadcast();
    }
}
