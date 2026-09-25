// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title TandurRegistry - who may hold and who may accept Tandur vouchers.
/// @notice Farmers are identified on-chain only by a pseudonymous id; the NIK-to-pseudoId
///         mapping lives in the operator's PII vault (PDP Law 27/2022, cryptographic erasure).
contract TandurRegistry is AccessControl {
    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");

    struct Farmer {
        bytes32 pseudoId;    // sha256(salt || NIK) computed off-chain
        bytes32 regionCode;  // e.g. "33.10.05" (province.regency.district) as bytes32
        bool active;
        uint64 enrolledAt;
    }

    struct Merchant {
        bytes32 merchantId;  // operator-assigned id, e.g. "KDMP-3310-001"
        bytes32 regionCode;
        uint8 kind;          // 1 = Koperasi Desa Merah Putih, 2 = kios pupuk lengkap, 3 = distributor
        bool active;
        uint64 registeredAt;
    }

    mapping(address => Farmer) private _farmers;
    mapping(address => Merchant) private _merchants;
    mapping(bytes32 => address) public farmerByPseudoId;

    uint256 public farmerCount;
    uint256 public merchantCount;

    event FarmerRegistered(address indexed account, bytes32 indexed pseudoId, bytes32 regionCode);
    event FarmerStatusChanged(address indexed account, bool active, bytes32 reasonHash);
    event MerchantRegistered(address indexed account, bytes32 indexed merchantId, bytes32 regionCode, uint8 kind);
    event MerchantStatusChanged(address indexed account, bool active, bytes32 reasonHash);

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REGISTRAR_ROLE, admin);
    }

    function registerFarmer(address account, bytes32 pseudoId, bytes32 regionCode) external onlyRole(REGISTRAR_ROLE) {
        require(account != address(0), "Registry: zero address");
        require(_farmers[account].enrolledAt == 0, "Registry: farmer exists");
        require(farmerByPseudoId[pseudoId] == address(0), "Registry: pseudoId exists");
        _farmers[account] = Farmer(pseudoId, regionCode, true, uint64(block.timestamp));
        farmerByPseudoId[pseudoId] = account;
        farmerCount++;
        emit FarmerRegistered(account, pseudoId, regionCode);
    }

    function setFarmerStatus(address account, bool active, bytes32 reasonHash) external onlyRole(REGISTRAR_ROLE) {
        require(_farmers[account].enrolledAt != 0, "Registry: unknown farmer");
        _farmers[account].active = active;
        emit FarmerStatusChanged(account, active, reasonHash);
    }

    function registerMerchant(address account, bytes32 merchantId, bytes32 regionCode, uint8 kind) external onlyRole(REGISTRAR_ROLE) {
        require(account != address(0), "Registry: zero address");
        require(_merchants[account].registeredAt == 0, "Registry: merchant exists");
        _merchants[account] = Merchant(merchantId, regionCode, kind, true, uint64(block.timestamp));
        merchantCount++;
        emit MerchantRegistered(account, merchantId, regionCode, kind);
    }

    function setMerchantStatus(address account, bool active, bytes32 reasonHash) external onlyRole(REGISTRAR_ROLE) {
        require(_merchants[account].registeredAt != 0, "Registry: unknown merchant");
        _merchants[account].active = active;
        emit MerchantStatusChanged(account, active, reasonHash);
    }

    function isActiveFarmer(address account) external view returns (bool) {
        return _farmers[account].active;
    }

    function isActiveMerchant(address account) external view returns (bool) {
        return _merchants[account].active;
    }

    function farmerOf(address account) external view returns (Farmer memory) {
        return _farmers[account];
    }

    function merchantOf(address account) external view returns (Merchant memory) {
        return _merchants[account];
    }
}
