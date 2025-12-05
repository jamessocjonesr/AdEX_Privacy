pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract AdEX_PrivacyFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    address public owner;
    mapping(address => bool) public isProvider;
    bool public paused;
    uint256 public cooldownSeconds;
    mapping(address => uint256) public lastSubmissionTime;
    mapping(address => uint256) public lastDecryptionRequestTime;

    struct Batch {
        uint256 id;
        bool isOpen;
    }
    uint256 public currentBatchId;
    mapping(uint256 => Batch) public batches;

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }
    mapping(uint256 => DecryptionContext) public decryptionContexts;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event PauseToggled(bool indexed paused);
    event CooldownSecondsUpdated(uint256 indexed oldCooldown, uint256 indexed newCooldown);
    event BatchOpened(uint256 indexed batchId);
    event BatchClosed(uint256 indexed batchId);
    event UserDataSubmitted(address indexed user, uint256 indexed batchId, bytes32 encryptedData);
    event AdvertiserQuerySubmitted(address indexed advertiser, uint256 indexed batchId, bytes32 encryptedQuery);
    event DecryptionRequested(uint256 indexed requestId, uint256 indexed batchId);
    event DecryptionCompleted(uint256 indexed requestId, uint256 indexed batchId, uint256 matchCount);

    error NotOwner();
    error NotProvider();
    error Paused();
    error CooldownActive();
    error BatchNotOpen();
    error BatchAlreadyClosed();
    error ReplayAttempt();
    error StateMismatch();
    error InvalidBatchId();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!isProvider[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    modifier checkSubmissionCooldown() {
        if (block.timestamp < lastSubmissionTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    modifier checkDecryptionCooldown() {
        if (block.timestamp < lastDecryptionRequestTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    constructor() {
        owner = msg.sender;
        isProvider[owner] = true;
        currentBatchId = 1; // Start with batch ID 1
        batches[currentBatchId].id = currentBatchId;
        batches[currentBatchId].isOpen = true;
        emit BatchOpened(currentBatchId);
        cooldownSeconds = 60; // Default cooldown
    }

    function transferOwnership(address newOwner) external onlyOwner {
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    function addProvider(address provider) external onlyOwner {
        if (!isProvider[provider]) {
            isProvider[provider] = true;
            emit ProviderAdded(provider);
        }
    }

    function removeProvider(address provider) external onlyOwner {
        if (isProvider[provider]) {
            isProvider[provider] = false;
            emit ProviderRemoved(provider);
        }
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit PauseToggled(_paused);
    }

    function setCooldownSeconds(uint256 newCooldownSeconds) external onlyOwner {
        require(newCooldownSeconds > 0, "Cooldown must be positive");
        uint256 oldCooldown = cooldownSeconds;
        cooldownSeconds = newCooldownSeconds;
        emit CooldownSecondsUpdated(oldCooldown, newCooldownSeconds);
    }

    function openNewBatch() external onlyOwner whenNotPaused {
        if (batches[currentBatchId].isOpen) {
            batches[currentBatchId].isOpen = false;
            emit BatchClosed(currentBatchId);
        }
        currentBatchId++;
        batches[currentBatchId].id = currentBatchId;
        batches[currentBatchId].isOpen = true;
        emit BatchOpened(currentBatchId);
    }

    function closeCurrentBatch() external onlyOwner whenNotPaused {
        if (!batches[currentBatchId].isOpen) revert BatchAlreadyClosed();
        batches[currentBatchId].isOpen = false;
        emit BatchClosed(currentBatchId);
    }

    function submitUserData(bytes32 encryptedData) external whenNotPaused checkSubmissionCooldown {
        if (!batches[currentBatchId].isOpen) revert BatchNotOpen();
        lastSubmissionTime[msg.sender] = block.timestamp;
        // In a real scenario, encryptedData would be processed and stored.
        // For this example, we just emit an event.
        emit UserDataSubmitted(msg.sender, currentBatchId, encryptedData);
    }

    function submitAdvertiserQuery(bytes32 encryptedQuery) external onlyProvider whenNotPaused checkSubmissionCooldown {
        if (!batches[currentBatchId].isOpen) revert BatchNotOpen();
        lastSubmissionTime[msg.sender] = block.timestamp;
        // In a real scenario, encryptedQuery would be processed and stored.
        // For this example, we just emit an event.
        emit AdvertiserQuerySubmitted(msg.sender, currentBatchId, encryptedQuery);
    }

    function _hashCiphertexts(bytes32[] memory cts) internal pure returns (bytes32) {
        return keccak256(abi.encode(cts, address(this)));
    }

    function _initIfNeeded() internal {
        // This function would initialize FHE parameters if not already done.
        // For this example, it's a placeholder as FHEVM handles initialization.
        // FHE.init(); // Example call if needed
    }

    function _requireInitialized() internal pure {
        // This function would check if FHE parameters are initialized.
        // For this example, it's a placeholder.
        // require(FHE.isInitialized(), "FHE not initialized");
    }

    function requestMatchCount(uint256 batchId) external onlyProvider whenNotPaused checkDecryptionCooldown {
        if (batchId == 0 || batchId > currentBatchId || !batches[batchId].isOpen) revert InvalidBatchId();
        lastDecryptionRequestTime[msg.sender] = block.timestamp;

        _initIfNeeded();
        _requireInitialized();

        // Placeholder for actual FHE computation.
        // This example uses dummy ciphertexts.
        euint32 encryptedMatchCount = euint32.wrap(0x0000000000000000000000000000000000000000000000000000000000000001);

        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(encryptedMatchCount);

        bytes32 stateHash = _hashCiphertexts(cts);
        uint256 requestId = FHE.requestDecryption(cts, this.myCallback.selector);

        decryptionContexts[requestId] = DecryptionContext({ batchId: batchId, stateHash: stateHash, processed: false });
        emit DecryptionRequested(requestId, batchId);
    }

    function myCallback(uint256 requestId, bytes memory cleartexts, bytes memory proof) public {
        if (decryptionContexts[requestId].processed) revert ReplayAttempt();

        // Rebuild ciphertexts array in the exact same order as in requestMatchCount
        // This is a simplified example. In a real scenario, you'd fetch the actual ciphertexts
        // that were used for the computation leading to this decryption request.
        // For this example, we assume the ciphertext was for a single euint32.
        euint32 dummyEncryptedValue = euint32.wrap(0x0000000000000000000000000000000000000000000000000000000000000001); // Placeholder
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(dummyEncryptedValue);

        bytes32 currentHash = _hashCiphertexts(cts);
        if (currentHash != decryptionContexts[requestId].stateHash) {
            revert StateMismatch();
        }

        FHE.checkSignatures(requestId, cleartexts, proof);

        // Decode cleartexts
        // The order of decoding must match the order of ciphertexts in `cts`
        uint256 matchCount = abi.decode(cleartexts, (uint256));

        decryptionContexts[requestId].processed = true;
        emit DecryptionCompleted(requestId, decryptionContexts[requestId].batchId, matchCount);
    }
}