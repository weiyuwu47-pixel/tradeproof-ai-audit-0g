// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract TradeProofRegistry {
    struct ReportProofInput {
        string reportPeriod;
        bytes32 rawSnapshotHash;
        bytes32 fullReportHash;
        bytes32 publicReportHash;
        bytes32 promptHash;
        bytes32 redactionPolicyHash;
        bytes32 metadataHash;
        string rawSnapshotStorageRoot;
        string fullReportStorageRoot;
        string publicReportStorageRoot;
        string metadataStorageRoot;
        string modelId;
        string computeMode;
        string note;
    }

    struct ReportProof {
        string reportPeriod;
        bytes32 rawSnapshotHash;
        bytes32 fullReportHash;
        bytes32 publicReportHash;
        bytes32 promptHash;
        bytes32 redactionPolicyHash;
        bytes32 metadataHash;
        string rawSnapshotStorageRoot;
        string fullReportStorageRoot;
        string publicReportStorageRoot;
        string metadataStorageRoot;
        string modelId;
        string computeMode;
        string note;
        address creator;
        uint256 createdAt;
    }

    ReportProof[] public proofs;

    event ReportProofCreated(
        uint256 indexed proofId,
        string reportPeriod,
        bytes32 rawSnapshotHash,
        bytes32 fullReportHash,
        bytes32 publicReportHash,
        bytes32 metadataHash,
        string metadataStorageRoot,
        string modelId,
        address indexed creator,
        uint256 createdAt
    );

    function createReportProof(
        ReportProofInput memory input
    ) public returns (uint256) {
        ReportProof memory proof = ReportProof({
            reportPeriod: input.reportPeriod,
            rawSnapshotHash: input.rawSnapshotHash,
            fullReportHash: input.fullReportHash,
            publicReportHash: input.publicReportHash,
            promptHash: input.promptHash,
            redactionPolicyHash: input.redactionPolicyHash,
            metadataHash: input.metadataHash,
            rawSnapshotStorageRoot: input.rawSnapshotStorageRoot,
            fullReportStorageRoot: input.fullReportStorageRoot,
            publicReportStorageRoot: input.publicReportStorageRoot,
            metadataStorageRoot: input.metadataStorageRoot,
            modelId: input.modelId,
            computeMode: input.computeMode,
            note: input.note,
            creator: msg.sender,
            createdAt: block.timestamp
        });

        proofs.push(proof);

        uint256 proofId = proofs.length - 1;

        emit ReportProofCreated(
            proofId,
            input.reportPeriod,
            input.rawSnapshotHash,
            input.fullReportHash,
            input.publicReportHash,
            input.metadataHash,
            input.metadataStorageRoot,
            input.modelId,
            msg.sender,
            block.timestamp
        );

        return proofId;
    }

    function getProof(uint256 _proofId) public view returns (ReportProof memory) {
        require(_proofId < proofs.length, "Proof does not exist");
        return proofs[_proofId];
    }

    function getProofCount() public view returns (uint256) {
        return proofs.length;
    }
}
