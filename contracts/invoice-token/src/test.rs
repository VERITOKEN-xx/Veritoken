#![cfg(test)]

use crate::{InvoiceMeta, InvoiceToken, InvoiceTokenClient};
use compliance_engine::{ComplianceEngine, ComplianceEngineClient};
use kyc_registry::{KycRegistry, KycRegistryClient};
use soroban_sdk::{testutils::Address as _, Address, Env, String};

// ── Test harness ─────────────────────────────────────────────────────────────

#[allow(dead_code)]
struct Harness {
    env: Env,
    token: InvoiceTokenClient<'static>,
    kyc: KycRegistryClient<'static>,
    compliance: ComplianceEngineClient<'static>,
    verifier: Address,
    admin: Address,
}

fn meta(env: &Env) -> InvoiceMeta {
    InvoiceMeta {
        invoice_id: String::from_str(env, "INV-001"),
        issuer: String::from_str(env, "Acme Corp"),
        debtor: String::from_str(env, "Globex"),
        face_value_usd: 1_000_000_000_000, // 100,000 USD at 7 decimals
        discount_rate_bps: 250,
        due_date: 1_900_000_000,
        currency: String::from_str(env, "USD"),
        ipfs_doc_hash: String::from_str(env, "Qm..."),
    }
}

fn setup() -> Harness {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);

    // KYC registry
    let kyc_id = env.register(KycRegistry, ());
    let kyc = KycRegistryClient::new(&env, &kyc_id);
    kyc.initialize(&admin);
    let verifier = Address::generate(&env);
    kyc.add_verifier(&verifier);

    // Compliance engine
    let compliance_id = env.register(ComplianceEngine, ());
    let compliance = ComplianceEngineClient::new(&env, &compliance_id);
    compliance.initialize(&admin);

    // Invoice token — constructor args passed atomically at register time
    let token_id = env.register(
        InvoiceToken,
        (
            admin.clone(),
            kyc_id.clone(),
            compliance_id.clone(),
            meta(&env),
        ),
    );
    let token = InvoiceTokenClient::new(&env, &token_id);

    Harness {
        env,
        token,
        kyc,
        compliance,
        verifier,
        admin,
    }
}

impl Harness {
    fn approve_kyc(&self, addr: &Address) {
        self.kyc.approve(
            &self.verifier,
            addr,
            &1,
            &0,
            &String::from_str(&self.env, "US"),
        );
    }
}

// ── Existing tests ────────────────────────────────────────────────────────────

#[test]
fn test_metadata() {
    let h = setup();
    assert_eq!(h.token.decimals(), 7);
    assert_eq!(
        h.token.name(),
        String::from_str(&h.env, "Veritoken Invoice")
    );
    assert_eq!(
        h.token.get_meta().invoice_id,
        String::from_str(&h.env, "INV-001")
    );
    assert!(!h.token.is_settled());
}

#[test]
fn test_issue_requires_kyc() {
    let h = setup();
    let holder = Address::generate(&h.env);

    assert!(h.token.try_issue(&holder, &1_000).is_err());

    h.approve_kyc(&holder);
    h.token.issue(&holder, &1_000);
    assert_eq!(h.token.balance(&holder), 1_000);
    assert_eq!(h.token.total_supply(), 1_000);
}

#[test]
fn test_settle_then_redeem() {
    let h = setup();
    let holder = Address::generate(&h.env);
    h.approve_kyc(&holder);
    h.token.issue(&holder, &1_000);

    // Cannot redeem before settlement
    assert!(h.token.try_redeem(&holder, &500).is_err());

    h.token.settle();
    assert!(h.token.is_settled());

    h.token.redeem(&holder, &600);
    assert_eq!(h.token.balance(&holder), 400);
    assert_eq!(h.token.total_supply(), 400);
}

#[test]
fn test_cannot_issue_after_settle() {
    let h = setup();
    let holder = Address::generate(&h.env);
    h.approve_kyc(&holder);
    h.token.settle();
    assert!(h.token.try_issue(&holder, &1).is_err());
}

#[test]
fn test_redeem_insufficient_balance() {
    let h = setup();
    let holder = Address::generate(&h.env);
    h.approve_kyc(&holder);
    h.token.issue(&holder, &100);
    h.token.settle();
    assert!(h.token.try_redeem(&holder, &101).is_err());
}

#[test]
fn test_non_deployer_cannot_reinitialize() {
    let h = setup();
    let attacker = Address::generate(&h.env);
    let kyc_id = Address::generate(&h.env);
    let ce_id = Address::generate(&h.env);
    // initialize must always panic — the constructor has already run
    let result = h
        .token
        .try_initialize(&attacker, &kyc_id, &ce_id, &meta(&h.env));
    assert!(result.is_err());
}

// ── SEP-41 burn tests ─────────────────────────────────────────────────────────

/// `burn` decreases balance and total supply; requires KYC and compliance.
#[test]
fn test_burn() {
    let h = setup();
    let holder = Address::generate(&h.env);
    h.approve_kyc(&holder);
    h.token.issue(&holder, &1_000);

    // Burn 400 tokens
    h.token.burn(&holder, &400);

    assert_eq!(h.token.balance(&holder), 600);
    assert_eq!(h.token.total_supply(), 600);
}

/// `burn` fails when the holder has insufficient balance.
#[test]
fn test_burn_insufficient_balance() {
    let h = setup();
    let holder = Address::generate(&h.env);
    h.approve_kyc(&holder);
    h.token.issue(&holder, &100);

    assert!(h.token.try_burn(&holder, &101).is_err());
    // Original balance unchanged
    assert_eq!(h.token.balance(&holder), 100);
}

/// `burn` fails when the holder has no active KYC.
#[test]
fn test_burn_requires_kyc() {
    let h = setup();
    // Issue to a KYC-approved holder, then revoke KYC by not approving a new address
    // Simulate by using an address that was never approved.
    let no_kyc = Address::generate(&h.env);
    // Attempting to burn without ever approving KYC must fail
    assert!(h.token.try_burn(&no_kyc, &1).is_err());
}

/// `burn` is blocked when the compliance engine is paused.
#[test]
fn test_burn_blocked_when_paused() {
    let h = setup();
    let holder = Address::generate(&h.env);
    h.approve_kyc(&holder);
    h.token.issue(&holder, &1_000);

    h.compliance.pause();
    assert!(h.token.try_burn(&holder, &100).is_err());

    // After unpausing, burn succeeds
    h.compliance.unpause();
    h.token.burn(&holder, &100);
    assert_eq!(h.token.balance(&holder), 900);
    assert_eq!(h.token.total_supply(), 900);
}

/// `burn` is blocked when the holder is on the blocklist.
#[test]
fn test_burn_blocked_for_blocklisted_holder() {
    let h = setup();
    let holder = Address::generate(&h.env);
    h.approve_kyc(&holder);
    h.token.issue(&holder, &1_000);

    h.compliance.add_to_blocklist(&holder);
    assert!(h.token.try_burn(&holder, &100).is_err());

    h.compliance.remove_from_blocklist(&holder);
    h.token.burn(&holder, &100);
    assert_eq!(h.token.balance(&holder), 900);
}

// ── SEP-41 burn_from tests ────────────────────────────────────────────────────

/// `burn_from` destroys tokens and consumes the spender's allowance.
#[test]
fn test_burn_from() {
    let h = setup();
    let holder = Address::generate(&h.env);
    let spender = Address::generate(&h.env);
    h.approve_kyc(&holder);
    h.token.issue(&holder, &1_000);

    // Grant spender an allowance
    let expiration = h.env.ledger().sequence() + 1_000;
    h.token.approve(&holder, &spender, &500, &expiration);
    assert_eq!(h.token.allowance(&holder, &spender), 500);

    // Burn 300 on behalf of holder
    h.token.burn_from(&spender, &holder, &300);

    assert_eq!(h.token.balance(&holder), 700);
    assert_eq!(h.token.total_supply(), 700);
    // Allowance reduced by the burned amount
    assert_eq!(h.token.allowance(&holder, &spender), 200);
}

/// `burn_from` fails when the spender's allowance is insufficient.
#[test]
fn test_burn_from_insufficient_allowance() {
    let h = setup();
    let holder = Address::generate(&h.env);
    let spender = Address::generate(&h.env);
    h.approve_kyc(&holder);
    h.token.issue(&holder, &1_000);

    let expiration = h.env.ledger().sequence() + 1_000;
    h.token.approve(&holder, &spender, &100, &expiration);

    // Attempt to burn more than the allowance
    assert!(h.token.try_burn_from(&spender, &holder, &101).is_err());
    // Balance and supply unchanged
    assert_eq!(h.token.balance(&holder), 1_000);
    assert_eq!(h.token.total_supply(), 1_000);
    // Allowance unchanged
    assert_eq!(h.token.allowance(&holder, &spender), 100);
}

/// `burn_from` fails when the holder has no active KYC.
#[test]
fn test_burn_from_requires_kyc() {
    let h = setup();
    let no_kyc = Address::generate(&h.env);
    let spender = Address::generate(&h.env);

    // No KYC on `no_kyc` — burn_from must fail
    assert!(h.token.try_burn_from(&spender, &no_kyc, &1).is_err());
}

/// `burn_from` is blocked when the compliance engine is paused.
#[test]
fn test_burn_from_blocked_when_paused() {
    let h = setup();
    let holder = Address::generate(&h.env);
    let spender = Address::generate(&h.env);
    h.approve_kyc(&holder);
    h.token.issue(&holder, &1_000);

    let expiration = h.env.ledger().sequence() + 1_000;
    h.token.approve(&holder, &spender, &500, &expiration);

    h.compliance.pause();
    assert!(h.token.try_burn_from(&spender, &holder, &100).is_err());

    h.compliance.unpause();
    h.token.burn_from(&spender, &holder, &100);
    assert_eq!(h.token.balance(&holder), 900);
    assert_eq!(h.token.total_supply(), 900);
    assert_eq!(h.token.allowance(&holder, &spender), 400);
}

/// `burn_from` is blocked when the holder is on the blocklist.
#[test]
fn test_burn_from_blocked_for_blocklisted_holder() {
    let h = setup();
    let holder = Address::generate(&h.env);
    let spender = Address::generate(&h.env);
    h.approve_kyc(&holder);
    h.token.issue(&holder, &1_000);

    let expiration = h.env.ledger().sequence() + 1_000;
    h.token.approve(&holder, &spender, &500, &expiration);

    h.compliance.add_to_blocklist(&holder);
    assert!(h.token.try_burn_from(&spender, &holder, &100).is_err());

    h.compliance.remove_from_blocklist(&holder);
    h.token.burn_from(&spender, &holder, &100);
    assert_eq!(h.token.balance(&holder), 900);
    assert_eq!(h.token.total_supply(), 900);
}
