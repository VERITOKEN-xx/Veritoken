/**
 * Validates amount input for token transactions.
 * Checks for positive numbers, safe integer ranges, and decimal precision.
 */

import { StrKey } from "@stellar/stellar-sdk";

interface AmountValidationResult {
  isValid: boolean;
  error: string | null;
}

// Small reference-stability cache: same (value, decimals) input returns the
// same result object, so components that pass this result down to memoized
// children don't force a re-render just because the parent re-rendered.
// This is a plain function (not a React hook), so it must stay callable
// outside a render context — see validation.test.ts.
const CACHE_LIMIT = 20;
const resultCache = new Map<string, AmountValidationResult>();

function cacheResult(key: string, result: AmountValidationResult): AmountValidationResult {
  if (resultCache.has(key)) {
    resultCache.delete(key);
  } else if (resultCache.size >= CACHE_LIMIT) {
    const oldestKey = resultCache.keys().next().value;
    if (oldestKey !== undefined) resultCache.delete(oldestKey);
  }
  resultCache.set(key, result);
  return result;
}

/**
 * Validate an amount string for token transactions.
 * @param value - The amount string to validate
 * @param decimals - Number of decimal places the token supports (default: 7 for Stellar)
 * @returns { isValid: boolean, error: string | null }
 */
export function useAmountValidation(
  value: string,
  decimals: number = 7,
): AmountValidationResult {
  const cacheKey = `${decimals}:${value}`;
  const cached = resultCache.get(cacheKey);
  if (cached) return cached;
  return cacheResult(cacheKey, computeAmountValidation(value, decimals));
}

function computeAmountValidation(
  value: string,
  decimals: number,
): AmountValidationResult {
  // Empty values are invalid (error suppressed to avoid red text before typing)
  if (!value || value.trim() === "") {
    return { isValid: false, error: null };
  }

  // Reject strings with more than one decimal point before parseFloat silently
  // drops the second one (e.g. "1.2.3" → parseFloat gives 1.2, masking bad input).
  if ((value.match(/\./g) ?? []).length > 1) {
    return { isValid: false, error: "Amount must be a valid number" };
  }

  // Try to parse as number
  const num = parseFloat(value);
  if (isNaN(num)) {
    return { isValid: false, error: "Amount must be a valid number" };
  }

  // Check if it's a positive number
  if (num <= 0) {
    return { isValid: false, error: "Amount must be greater than zero" };
  }

  // Check if it's finite
  if (!isFinite(num)) {
    return { isValid: false, error: "Amount must be a finite number" };
  }

  // Check decimal places
  const decimalParts = value.split(".");
  if (decimalParts[1] && decimalParts[1].length > decimals) {
    return {
      isValid: false,
      error: `Amount can have at most ${decimals} decimal places`,
    };
  }

  // Convert to smallest unit (stroops for Stellar = multiply by 10^7)
  const multiplier = Math.pow(10, decimals);
  const stroopsAmount = num * multiplier;

  // Check if it exceeds JavaScript's safe integer range
  if (stroopsAmount > Number.MAX_SAFE_INTEGER) {
    return {
      isValid: false,
      error: `Amount exceeds maximum allowed value (${(Number.MAX_SAFE_INTEGER / multiplier).toLocaleString()})`,
    };
  }

  // Check if it's an integer when converted (to prevent fractional stroops)
  if (!Number.isInteger(stroopsAmount)) {
    return {
      isValid: false,
      error: `Amount precision too high (exceeds ${decimals} decimal places)`,
    };
  }

  return { isValid: true, error: null };
}

interface AddressValidationResult {
  isValid: boolean;
  error: string | null;
}

/**
 * Validate a wallet address before it is used in a contract call.
 * Accepts only well-formed Stellar account public keys (G…, checksum verified).
 * Surrounding whitespace, secret keys, contract IDs, and other malformed values
 * are rejected so they never reach the action that consumes the address.
 * @param walletAddress - The address string to validate
 * @returns { isValid: boolean, error: string | null }
 */
export function validateAddress(walletAddress: string): AddressValidationResult {
  // Empty values are invalid (error suppressed to avoid red text before typing)
  if (typeof walletAddress !== "string" || walletAddress.trim() === "") {
    return { isValid: false, error: null };
  }

  if (!StrKey.isValidEd25519PublicKey(walletAddress)) {
    return { isValid: false, error: "Invalid Stellar wallet address" };
  }

  return { isValid: true, error: null };
}
