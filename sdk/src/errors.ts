/**
 * Typed contract error model shared across SDK and frontend.
 *
 * Every Soroban contract emits numeric #[contracterror] discriminants.
 * This module provides:
 * - Structured ContractError with code, name, and message
 * - Lookup tables for all six Veritoken contracts
 * - Error parsing from raw Soroban error strings
 */

export interface ContractError {
  code: number;
  name: string;
  message: string;
}

export type ContractName =
  | "rwa"
  | "carbon"
  | "invoice"
  | "property"
  | "kyc"
  | "compliance";

// ── RWA Token errors ──────────────────────────────────────────────────────────
// Mirrors the RwaError enum in contracts/rwa-token/src/lib.rs
const RWA_ERRORS: ContractError[] = [
  { code: 1, name: "AlreadyInitialized", message: "Contract is already initialized" },
  { code: 2, name: "KycNotApproved", message: "Address has not passed KYC verification" },
  { code: 3, name: "TransferBlocked", message: "Transfer was rejected by the compliance engine" },
  { code: 4, name: "InsufficientBalance", message: "Insufficient token balance" },
  { code: 5, name: "AllowanceExpired", message: "Allowance has expired" },
  { code: 6, name: "InsufficientAllowance", message: "Insufficient allowance" },
  { code: 7, name: "AccountFrozen", message: "Account is frozen" },
  { code: 8, name: "NegativeAmount", message: "Amount must be greater than zero" },
  { code: 9, name: "BatchTooLarge", message: "Batch recipient list exceeds the maximum of 10 entries" },
  { code: 10, name: "RecoveryNotConfigured", message: "Recovery configuration has not been set" },
  { code: 11, name: "NotRecoveryMember", message: "Caller is not a recovery member" },
  { code: 12, name: "RecoveryAlreadyActive", message: "A recovery proposal is already active" },
  { code: 13, name: "AlreadyApproved", message: "This address has already approved the recovery proposal" },
  { code: 14, name: "NoActiveRecovery", message: "No active recovery proposal exists" },
  { code: 15, name: "InvalidRecoveryConfig", message: "Recovery threshold must be between 1 and the number of members" },
  { code: 16, name: "ExceedsMaxSupply", message: "Mint would exceed the maximum token supply" },
  { code: 17, name: "InvalidNonce", message: "Admin operation nonce is invalid or out of order" },
  { code: 18, name: "ComplianceEngineUnavailable", message: "Compliance engine is unavailable" },
  { code: 19, name: "KycRegistryUnavailable", message: "KYC registry is unavailable" },
  { code: 20, name: "UnauthorizedRole", message: "Caller does not have the required role" },
  { code: 21, name: "BatchAmountOverflow", message: "Batch amount exceeds the supported numeric range" },
  { code: 22, name: "HolderLimitExceeded", message: "Transfer would exceed the maximum holder limit" },
  { code: 23, name: "MigrationVersionConflict", message: "The requested migration version is already active" },
  { code: 24, name: "MigrationVersionNotSequential", message: "Migration target version must increment by exactly one" },
  { code: 25, name: "RecoveryExpired", message: "Recovery proposal has expired" },
  { code: 26, name: "InsufficientApprovals", message: "Recovery proposal does not have enough approvals" },
  { code: 27, name: "ProposerCannotApprove", message: "Recovery proposer cannot approve their own proposal" },
  { code: 28, name: "RecoveryCooldown", message: "Recovery operation is still in cooldown" },
  { code: 29, name: "NotInitialized", message: "Contract has not been initialized" },
  { code: 30, name: "InvalidAssetType", message: "Unsupported or invalid asset type" },
  { code: 31, name: "EmptyBatch", message: "Batch recipient list cannot be empty" },
  { code: 32, name: "NoPendingAdmin", message: "No pending admin transfer is in progress" },
  { code: 33, name: "AlreadyAdmin", message: "Proposed admin is already the current admin" },
];

// ── Carbon Credit Token errors ────────────────────────────────────────────────
const CARBON_ERRORS: ContractError[] = [
  { code: 1, name: "NotInitialized", message: "Contract has not been initialized" },
  { code: 2, name: "AlreadyInitialized", message: "Contract is already initialized" },
  { code: 3, name: "Unauthorized", message: "Caller is not authorized to perform this action" },
  { code: 4, name: "InsufficientBalance", message: "Insufficient token balance for retirement" },
  { code: 5, name: "KycNotApproved", message: "Address has not passed KYC verification" },
  { code: 6, name: "CompliancePaused", message: "Compliance engine is currently paused" },
  { code: 7, name: "Blocklisted", message: "Address is on the compliance blocklist" },
  { code: 8, name: "TransferNotAllowed", message: "Transfer is not permitted under current compliance rules" },
  { code: 9, name: "MaxHoldersReached", message: "Maximum number of token holders has been reached" },
  { code: 10, name: "InvalidAmount", message: "Amount must be greater than zero" },
  { code: 11, name: "InvalidMetadata", message: "One or more metadata fields are invalid" },
  { code: 12, name: "NoPendingAdmin", message: "No pending admin transfer is in progress" },
];

// ── Invoice Token errors ──────────────────────────────────────────────────────
const INVOICE_ERRORS: ContractError[] = [
  { code: 1, name: "NotInitialized", message: "Contract has not been initialized" },
  { code: 2, name: "AlreadyInitialized", message: "Contract is already initialized" },
  { code: 3, name: "Unauthorized", message: "Caller is not authorized to perform this action" },
  { code: 4, name: "KycNotApproved", message: "Address has not passed KYC verification" },
  { code: 5, name: "CompliancePaused", message: "Compliance engine is currently paused" },
  { code: 6, name: "Blocklisted", message: "Address is on the compliance blocklist" },
  { code: 7, name: "TransferNotAllowed", message: "Transfer is not permitted under current compliance rules" },
  { code: 8, name: "MaxHoldersReached", message: "Maximum number of token holders has been reached" },
  { code: 9, name: "InsufficientBalance", message: "Insufficient token balance" },
  { code: 10, name: "InvalidAmount", message: "Amount must be greater than zero" },
  { code: 11, name: "InvoiceNotFound", message: "Invoice record not found" },
  { code: 12, name: "InvoiceAlreadySettled", message: "Invoice has already been settled" },
  { code: 13, name: "NoPendingAdmin", message: "No pending admin transfer is in progress" },
  { code: 20, name: "InvalidMetadata", message: "One or more invoice metadata fields are invalid" },
];

// ── Property Token errors ─────────────────────────────────────────────────────
const PROPERTY_ERRORS: ContractError[] = [
  { code: 1, name: "NotInitialized", message: "Contract has not been initialized" },
  { code: 2, name: "AlreadyInitialized", message: "Contract is already initialized" },
  { code: 3, name: "Unauthorized", message: "Caller is not authorized to perform this action" },
  { code: 4, name: "KycNotApproved", message: "Address has not passed KYC verification" },
  { code: 5, name: "KycTierInsufficient", message: "KYC tier is too low for this operation" },
  { code: 6, name: "CompliancePaused", message: "Compliance engine is currently paused" },
  { code: 7, name: "Blocklisted", message: "Address is on the compliance blocklist" },
  { code: 8, name: "TransferNotAllowed", message: "Transfer is not permitted under current compliance rules" },
  { code: 9, name: "MaxHoldersReached", message: "Maximum number of token holders has been reached" },
  { code: 10, name: "InvalidMetadata", message: "One or more property metadata fields are invalid" },
  { code: 11, name: "NoPendingAdmin", message: "No pending admin transfer is in progress" },
  { code: 12, name: "InvalidAmount", message: "Amount must be greater than zero" },
];

// ── KYC Registry errors ───────────────────────────────────────────────────────
// Mirrors the KycError enum in contracts/kyc-registry/src/lib.rs
const KYC_ERRORS: ContractError[] = [
  { code: 1,  name: "AlreadyInitialized",          message: "KYC registry is already initialized" },
  { code: 2,  name: "NotVerifier",                 message: "Caller is not a registered verifier" },
  { code: 3,  name: "NotApproved",                 message: "Subject does not have an approved KYC record" },
  { code: 4,  name: "NoRecord",                    message: "No KYC record found for the given address" },
  { code: 5,  name: "InvalidJurisdiction",         message: "Jurisdiction code must be a 2-letter ISO country code" },
  { code: 6,  name: "NotAdmin",                    message: "Caller is not a registry admin" },
  { code: 7,  name: "EmptyAdminList",              message: "Cannot remove the last admin from the registry" },
  { code: 8,  name: "NotAuthorized",               message: "Caller is neither the subject nor an admin" },
  { code: 9,  name: "AlreadyAtSchemaVersion",      message: "Contract is already at the requested schema version" },
  { code: 10, name: "MigrationVersionNotSequential", message: "Migration target version must be exactly one greater than the current version" },
];

// ── Compliance Engine errors ──────────────────────────────────────────────────
// Mirrors the ComplianceError enum in contracts/compliance-engine/src/lib.rs
const COMPLIANCE_ERRORS: ContractError[] = [
  { code: 1,  name: "AlreadyInitialized",              message: "Compliance engine is already initialized" },
  { code: 2,  name: "MinHoldingPeriodExceeds365Days",  message: "Minimum holding period cannot exceed 365 days" },
  { code: 3,  name: "NegativeMaxTransferAmount",       message: "Maximum transfer amount cannot be negative" },
  { code: 4,  name: "MaxHoldersBelowCurrentCount",     message: "New max-holders limit is below the current holder count" },
  { code: 5,  name: "NoRulesPending",                  message: "No pending rules proposal to activate" },
  { code: 6,  name: "TooEarlyToActivate",              message: "The timelock period for the pending rules has not yet elapsed" },
  { code: 7,  name: "InvalidRiskScore",                message: "Risk score is out of the valid range (0–100)" },
  { code: 8,  name: "InvalidRiskConfig",               message: "Risk configuration values are invalid" },
  { code: 9,  name: "AlreadyAtSchemaVersion",          message: "Contract is already at the requested schema version" },
  { code: 10, name: "MigrationVersionNotSequential",   message: "Migration target version must be exactly one greater than the current version" },
];

// ── API ───────────────────────────────────────────────────────────────────────

const ERROR_MAPS: Record<ContractName, Map<number, ContractError>> = {
  rwa: new Map(RWA_ERRORS.map((e) => [e.code, e])),
  carbon: new Map(CARBON_ERRORS.map((e) => [e.code, e])),
  invoice: new Map(INVOICE_ERRORS.map((e) => [e.code, e])),
  property: new Map(PROPERTY_ERRORS.map((e) => [e.code, e])),
  kyc: new Map(KYC_ERRORS.map((e) => [e.code, e])),
  compliance: new Map(COMPLIANCE_ERRORS.map((e) => [e.code, e])),
};

/**
 * Look up a human-readable error by code.
 * Returns null if the code is unrecognised for the given contract.
 */
export function lookupError(
  contract: ContractName,
  code: number,
): ContractError | null {
  return ERROR_MAPS[contract]?.get(code) ?? null;
}

/**
 * Parse a raw Soroban error string (e.g. "Error(Contract, #7)") and return
 * the corresponding ContractError. Returns null if the string isn't a Soroban
 * contract error; returns a well-defined "UnknownContractError" fallback if
 * it is one but the code isn't in the lookup table.
 */
export function parseContractError(
  contract: ContractName,
  rawError: string,
): ContractError | null {
  const match = rawError.match(/Error\(Contract,\s*#(\d+)\)/);
  if (!match) return null;
  const code = parseInt(match[1], 10);
  const known = lookupError(contract, code);
  if (known) return known;
  // No table entry for this contract/code combination: return a well-defined
  // fallback instead of null so callers that access `.name` don't throw.
  return {
    code,
    name: "UnknownContractError",
    message: `Unknown error ${code} from contract ${contract}`,
  };
}

/**
 * Convert any thrown error from a contract call into a display string.
 * Tries to parse Soroban contract error codes first; falls back to the raw message.
 */
export function formatContractError(
  contract: ContractName,
  err: unknown,
): string {
  const raw = err instanceof Error ? err.message : String(err);
  const parsed = parseContractError(contract, raw);
  if (parsed) return `${parsed.message} (${parsed.name} #${parsed.code})`;
  return raw;
}
