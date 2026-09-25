// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC1155Supply} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {TandurRegistry} from "./TandurRegistry.sol";

/// @title TandurVoucher - purpose-bound agricultural input vouchers (ERC-1155).
/// @notice One token id per (category, season). 1 unit = 1 rupiah of subsidy entitlement.
///         Vouchers are NOT money and NOT transferable between holders: the only allowed moves are
///           issue   : operator -> farmer          (government allocation)
///           spend   : farmer   -> merchant        (authorised by the farmer's EIP-712 signature, relayed by operator)
///           redeem  : merchant -> burn            (operator settles fiat to merchant, keyed to the Redeemed event)
///           clawback/sweep : farmer -> burn       (compliance, always with a reason hash)
///         Pattern follows MAS Purpose Bound Money (ERC-7291) with ERC-3643-style freeze/clawback controls.
contract TandurVoucher is ERC1155, ERC1155Supply, AccessControl, Pausable, EIP712 {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");
    bytes32 public constant SETTLEMENT_ROLE = keccak256("SETTLEMENT_ROLE");
    bytes32 public constant COMPLIANCE_ROLE = keccak256("COMPLIANCE_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    bytes32 private constant SPEND_TYPEHASH = keccak256(
        "Spend(address farmer,address merchant,uint256 typeId,uint256 amount,bytes32 invoiceHash,uint256 nonce,uint256 deadline)"
    );

    struct VoucherType {
        bytes32 categoryCode;  // "PUPUK", "BENIH", "ALSINTAN", "PESTISIDA"
        bytes32 season;        // "MT1-2026/27"
        uint64 validFrom;
        uint64 validUntil;
        uint256 perFarmerCap;  // max issued per farmer for this type (0 = unlimited)
        bool exists;
    }

    struct SpendAuth {
        address farmer;
        address merchant;
        uint256 typeId;
        uint256 amount;
        bytes32 invoiceHash;
        uint256 nonce;
        uint256 deadline;
    }

    TandurRegistry public immutable registry;

    uint256 public typeCount;
    mapping(uint256 => VoucherType) public voucherTypes;
    mapping(uint256 => mapping(address => uint256)) public issuedTo;   // typeId => farmer => total issued
    mapping(uint256 => mapping(address => uint256)) public spentBy;    // typeId => farmer => total spent
    mapping(address => uint256) public nonces;
    mapping(address => bool) public frozen;
    mapping(bytes32 => bool) public invoiceUsed;                     // any part of this invoice settled
    mapping(bytes32 => bool) public invoicePartUsed;                 // keccak(invoiceHash, typeId): each category once

    event VoucherTypeCreated(uint256 indexed typeId, bytes32 indexed categoryCode, bytes32 season, uint64 validFrom, uint64 validUntil, uint256 perFarmerCap);
    event Issued(address indexed farmer, uint256 indexed typeId, uint256 amount, bytes32 indexed allocationRef);
    event Spent(address indexed farmer, address indexed merchant, uint256 indexed typeId, uint256 amount, bytes32 invoiceHash, address relayer);
    event Redeemed(address indexed merchant, uint256 indexed typeId, uint256 amount, bytes32 indexed batchRef);
    event Frozen(address indexed account, bool frozen, bytes32 reasonHash);
    event Clawback(address indexed farmer, uint256 indexed typeId, uint256 amount, bytes32 reasonHash);
    event Expired(address indexed farmer, uint256 indexed typeId, uint256 amount);

    constructor(address admin, TandurRegistry registry_, string memory uri_)
        ERC1155(uri_)
        EIP712("TandurVoucher", "1")
    {
        registry = registry_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
        _grantRole(RELAYER_ROLE, admin);
        _grantRole(SETTLEMENT_ROLE, admin);
        _grantRole(COMPLIANCE_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    // ---------------------------------------------------------------- types

    function createVoucherType(bytes32 categoryCode, bytes32 season, uint64 validFrom, uint64 validUntil, uint256 perFarmerCap)
        external onlyRole(DEFAULT_ADMIN_ROLE) returns (uint256 typeId)
    {
        require(validUntil > validFrom, "Voucher: bad window");
        typeId = ++typeCount;
        voucherTypes[typeId] = VoucherType(categoryCode, season, validFrom, validUntil, perFarmerCap, true);
        emit VoucherTypeCreated(typeId, categoryCode, season, validFrom, validUntil, perFarmerCap);
    }

    // ---------------------------------------------------------------- issue

    function issue(address farmer, uint256 typeId, uint256 amount, bytes32 allocationRef) public onlyRole(MINTER_ROLE) whenNotPaused {
        VoucherType memory t = voucherTypes[typeId];
        require(t.exists, "Voucher: unknown type");
        require(registry.isActiveFarmer(farmer), "Voucher: not an active farmer");
        require(!frozen[farmer], "Voucher: farmer frozen");
        require(amount > 0, "Voucher: zero amount");
        if (t.perFarmerCap > 0) {
            require(issuedTo[typeId][farmer] + amount <= t.perFarmerCap, "Voucher: exceeds per-farmer cap");
        }
        issuedTo[typeId][farmer] += amount;
        _mint(farmer, typeId, amount, "");
        emit Issued(farmer, typeId, amount, allocationRef);
    }

    function issueBatch(address[] calldata farmers, uint256 typeId, uint256[] calldata amounts, bytes32 allocationRef) external onlyRole(MINTER_ROLE) {
        require(farmers.length == amounts.length, "Voucher: length mismatch");
        for (uint256 i = 0; i < farmers.length; i++) {
            issue(farmers[i], typeId, amounts[i], allocationRef);
        }
    }

    // ---------------------------------------------------------------- spend

    function spendDigest(SpendAuth calldata a) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(
            SPEND_TYPEHASH, a.farmer, a.merchant, a.typeId, a.amount, a.invoiceHash, a.nonce, a.deadline
        )));
    }

    /// @notice Farmer signs the SpendAuth (device-bound key unlocked by PIN); operator relays it.
    ///         The signature is the on-chain proof that this farmer authorised this exact invoice.
    function spend(SpendAuth calldata a, bytes calldata signature) external onlyRole(RELAYER_ROLE) whenNotPaused {
        _spend(a, signature);
    }

    /// @notice One invoice may draw on several voucher types (e.g. fertilizer + seed). Each part is a separately
    ///         signed authorisation so the trail stays per-category. Reverts atomically if any part fails.
    function spendMulti(SpendAuth[] calldata auths, bytes[] calldata signatures) external onlyRole(RELAYER_ROLE) whenNotPaused {
        require(auths.length == signatures.length && auths.length > 0, "Voucher: length mismatch");
        for (uint256 i = 0; i < auths.length; i++) {
            _spend(auths[i], signatures[i]);
        }
    }

    function _spend(SpendAuth calldata a, bytes calldata signature) internal {
        require(block.timestamp <= a.deadline, "Voucher: authorisation expired");
        require(a.nonce == nonces[a.farmer], "Voucher: bad nonce");
        bytes32 partKey = keccak256(abi.encode(a.invoiceHash, a.typeId));
        require(!invoicePartUsed[partKey], "Voucher: invoice already paid");
        require(registry.isActiveFarmer(a.farmer), "Voucher: not an active farmer");
        require(registry.isActiveMerchant(a.merchant), "Voucher: merchant not whitelisted");
        require(!frozen[a.farmer] && !frozen[a.merchant], "Voucher: account frozen");
        VoucherType memory t = voucherTypes[a.typeId];
        require(t.exists, "Voucher: unknown type");
        require(block.timestamp >= t.validFrom && block.timestamp <= t.validUntil, "Voucher: outside validity window");
        require(balanceOf(a.farmer, a.typeId) >= a.amount, "Voucher: insufficient balance");

        address signer = ECDSA.recover(spendDigest(a), signature);
        require(signer == a.farmer, "Voucher: invalid farmer signature");

        nonces[a.farmer] = a.nonce + 1;
        invoicePartUsed[partKey] = true;
        invoiceUsed[a.invoiceHash] = true;
        spentBy[a.typeId][a.farmer] += a.amount;
        _controlledTransfer(a.farmer, a.merchant, a.typeId, a.amount);
        emit Spent(a.farmer, a.merchant, a.typeId, a.amount, a.invoiceHash, _msgSender());
    }

    // ---------------------------------------------------------------- redeem

    /// @notice Burns a merchant's received vouchers; the operator pays fiat against this event (T+1).
    function redeem(address merchant, uint256 typeId, uint256 amount, bytes32 batchRef) external onlyRole(SETTLEMENT_ROLE) whenNotPaused {
        require(registry.merchantOf(merchant).registeredAt != 0, "Voucher: unknown merchant");
        require(balanceOf(merchant, typeId) >= amount, "Voucher: insufficient merchant balance");
        _burn(merchant, typeId, amount);
        emit Redeemed(merchant, typeId, amount, batchRef);
    }

    // ---------------------------------------------------------------- compliance

    function setFrozen(address account, bool isFrozen, bytes32 reasonHash) external onlyRole(COMPLIANCE_ROLE) {
        frozen[account] = isFrozen;
        emit Frozen(account, isFrozen, reasonHash);
    }

    function clawback(address farmer, uint256 typeId, uint256 amount, bytes32 reasonHash) external onlyRole(COMPLIANCE_ROLE) {
        require(reasonHash != bytes32(0), "Voucher: reason required");
        _burn(farmer, typeId, amount);
        emit Clawback(farmer, typeId, amount, reasonHash);
    }

    /// @notice After validUntil, unused entitlement returns to the budget.
    function sweepExpired(address farmer, uint256 typeId) external onlyRole(COMPLIANCE_ROLE) {
        VoucherType memory t = voucherTypes[typeId];
        require(t.exists && block.timestamp > t.validUntil, "Voucher: not expired");
        uint256 bal = balanceOf(farmer, typeId);
        if (bal > 0) {
            _burn(farmer, typeId, bal);
            emit Expired(farmer, typeId, bal);
        }
    }

    function pause() external onlyRole(PAUSER_ROLE) { _pause(); }
    function unpause() external onlyRole(PAUSER_ROLE) { _unpause(); }

    // ---------------------------------------------------------------- non-transferability

    function safeTransferFrom(address, address, uint256, uint256, bytes memory) public pure override {
        revert("Voucher: non-transferable (use spend)");
    }

    function safeBatchTransferFrom(address, address, uint256[] memory, uint256[] memory, bytes memory) public pure override {
        revert("Voucher: non-transferable (use spend)");
    }

    function setApprovalForAll(address, bool) public pure override {
        revert("Voucher: approvals disabled");
    }

    function _controlledTransfer(address from, address to, uint256 id, uint256 amount) internal {
        _update(from, to, _asSingleton(id), _asSingleton(amount));
    }

    function _asSingleton(uint256 v) private pure returns (uint256[] memory arr) {
        arr = new uint256[](1);
        arr[0] = v;
    }

    // ---------------------------------------------------------------- overrides

    function _update(address from, address to, uint256[] memory ids, uint256[] memory values)
        internal override(ERC1155, ERC1155Supply)
    {
        super._update(from, to, ids, values);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC1155, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
