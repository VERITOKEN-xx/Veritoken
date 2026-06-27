#![cfg(test)]

use crate::{KycRegistry, KycRegistryClient};
use soroban_sdk::{
    testutils::{storage::Instance, Address as _, Ledger},
    Address, Env, String,
};

fn setup() -> (Env, KycRegistryClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register(KycRegistry, ());
    let client = KycRegistryClient::new(&env, &contract_id);
    client.initialize(&admin);
    (env, client, admin)
}

#[test]
fn test_add_verifier_and_approve() {
    let (env, client, _admin) = setup();
    let verifier = Address::generate(&env);
    let subject = Address::generate(&env);

    client.add_verifier(&verifier);
    assert!(!client.is_approved(&subject));

    client.approve(&verifier, &subject, &1, &0, &String::from_str(&env, "US"));
    assert!(client.is_approved(&subject));
    assert_eq!(client.get_tier(&subject), 1);

}

#[test]
fn test_double_initialize_panics() {
    let (_env, client, admin) = setup();
    let res = client.try_initialize(&admin);
    assert!(res.is_err());
}

#[test]
fn test_unauthorized_verifier_cannot_approve() {
    let (env, client, _admin) = setup();
    let rogue = Address::generate(&env);
    let subject = Address::generate(&env);
    // rogue was never added as a verifier — must return an error
    let res = client.try_approve(&rogue, &subject, &0, &0, &String::from_str(&env, "US"));
    assert!(res.is_err());
}

#[test]
fn test_expiry_makes_approval_inactive() {
    let (env, client, _admin) = setup();
    let verifier = Address::generate(&env);
    let subject = Address::generate(&env);
    client.add_verifier(&verifier);

    env.ledger().set_timestamp(1_000);
    client.approve(
        &verifier,
        &subject,
        &0,
        &2_000, // expires at ts 2000
        &String::from_str(&env, "US"),
    );
    assert!(client.is_approved(&subject));

    // Advance past expiry
    env.ledger().set_timestamp(3_000);
    assert!(!client.is_approved(&subject));
}

#[test]
fn test_revoke_and_reject() {
    let (env, client, _admin) = setup();
    let verifier = Address::generate(&env);
    let subject = Address::generate(&env);
    client.add_verifier(&verifier);
    client.approve(&verifier, &subject, &0, &0, &String::from_str(&env, "US"));
    assert!(client.is_approved(&subject));

    client.revoke(&verifier, &subject);
    assert!(!client.is_approved(&subject));

    // Re-approve then reject
    client.approve(&verifier, &subject, &0, &0, &String::from_str(&env, "US"));
    assert!(client.is_approved(&subject));
    client.reject(&verifier, &subject);
    assert!(!client.is_approved(&subject));

    let record = client.get_record(&subject);
    assert!(matches!(record.status, crate::KycStatus::Rejected));
    assert_eq!(record.verifier, verifier);
    assert_eq!(record.tier, 0);
    assert_eq!(record.expiry, 0);
    assert_eq!(record.jurisdiction, String::from_str(&env, "US"));
}

#[test]
fn test_reject_without_existing_record_creates_terminal_record() {
    let (env, client, _admin) = setup();
    let verifier = Address::generate(&env);
    let subject = Address::generate(&env);
    client.add_verifier(&verifier);

    client.reject(&verifier, &subject);

    assert!(!client.is_approved(&subject));
    let record = client.get_record(&subject);
    assert!(matches!(record.status, crate::KycStatus::Rejected));
    assert_eq!(record.verifier, verifier);
    assert_eq!(record.tier, 0);
    assert_eq!(record.expiry, 0);
    assert_eq!(record.jurisdiction, String::from_str(&env, ""));
}

#[test]
fn test_revoke_without_existing_record_creates_terminal_record() {
    let (env, client, _admin) = setup();
    let verifier = Address::generate(&env);
    let subject = Address::generate(&env);
    client.add_verifier(&verifier);

    client.revoke(&verifier, &subject);

    assert!(!client.is_approved(&subject));
    let record = client.get_record(&subject);
    assert!(matches!(record.status, crate::KycStatus::Revoked));
    assert_eq!(record.verifier, verifier);
    assert_eq!(record.tier, 0);
    assert_eq!(record.expiry, 0);
    assert_eq!(record.jurisdiction, String::from_str(&env, ""));
}

#[test]
fn test_remove_verifier() {
    let (env, client, _admin) = setup();
    let verifier = Address::generate(&env);
    client.add_verifier(&verifier);
    client.remove_verifier(&verifier);

    let subject = Address::generate(&env);
    let res = client.try_approve(&verifier, &subject, &0, &0, &String::from_str(&env, "US"));
    assert!(res.is_err());
}

#[test]
fn test_instance_ttl_bump() {
    let (env, client, _admin) = setup();
    let contract_id = client.address.clone();

    // The constants defined in lib.rs:
    // const DAY_IN_LEDGERS: u32 = 17280;
    // const BUMP: u32 = 30 * DAY_IN_LEDGERS; // 518400 ledgers
    let bump = 30 * 17280;

    // Initially, calling add_verifier will bump the TTL to bump (518400 ledgers)
    let verifier = Address::generate(&env);
    client.add_verifier(&verifier);

    let initial_ttl = env.as_contract(&contract_id, || {
        env.storage().instance().get_ttl()
    });
    assert_eq!(initial_ttl, bump);

    // Advance the ledger sequence to decrease TTL below THRESHOLD
    // Let's advance by 30,000 ledgers.
    env.ledger().with_mut(|l| {
        l.sequence_number += 30_000;
    });

    let reduced_ttl = env.as_contract(&contract_id, || {
        env.storage().instance().get_ttl()
    });
    assert_eq!(reduced_ttl, initial_ttl - 30_000);

    // Calling a query function like is_approved should bump it back to BUMP
    let subject = Address::generate(&env);
    client.is_approved(&subject);

    let bumped_ttl = env.as_contract(&contract_id, || {
        env.storage().instance().get_ttl()
    });
    assert_eq!(bumped_ttl, bump);
}

#[test]
fn test_two_step_admin_transfer() {
    let (env, client, _admin) = setup();
    let new_admin = Address::generate(&env);

    client.propose_admin(&new_admin);
    client.accept_admin();

    // Verify new admin is set by calling add_verifier (admin-only)
    let verifier = Address::generate(&env);
    client.add_verifier(&verifier);
}

#[test]
fn test_accept_admin_fails_when_no_pending() {
    let (_env, client, _admin) = setup();
    let res = client.try_accept_admin();
    assert!(res.is_err());
}

#[test]
fn test_approve_batch() {
    let (env, client, _admin) = setup();
    let verifier = Address::generate(&env);
    let subject1 = Address::generate(&env);
    let subject2 = Address::generate(&env);
    let subject3 = Address::generate(&env);
    client.add_verifier(&verifier);

    let mut batch = Vec::new(&env);
    batch.push_back((subject1.clone(), 0, 0, String::from_str(&env, "US")));
    batch.push_back((subject2.clone(), 1, 2_000, String::from_str(&env, "UK")));
    batch.push_back((subject3.clone(), 2, 3_000, String::from_str(&env, "CA")));
    
    client.approve_batch(&verifier, &batch);
    
    assert!(client.is_approved(&subject1));
    assert!(client.is_approved(&subject2));
    assert!(client.is_approved(&subject3));
    assert_eq!(client.get_tier(&subject1), 0);
    assert_eq!(client.get_tier(&subject2), 1);
    assert_eq!(client.get_tier(&subject3), 2);
}

#[test]
fn test_approve_batch_exceeds_limit() {
    let (env, client, _admin) = setup();
    let verifier = Address::generate(&env);
    client.add_verifier(&verifier);

    let mut batch = Vec::new(&env);
    for i in 0..21 {
        let subject = Address::generate(&env);
        batch.push_back((subject, 0, 0, String::from_str(&env, "US")));
    }
    
    let res = client.try_approve_batch(&verifier, &batch);
    assert!(res.is_err());
}

#[test]
fn test_revoke_batch() {
    let (env, client, _admin) = setup();
    let verifier = Address::generate(&env);
    let subject1 = Address::generate(&env);
    let subject2 = Address::generate(&env);
    let subject3 = Address::generate(&env);
    client.add_verifier(&verifier);

    // First approve all subjects
    let mut batch = Vec::new(&env);
    batch.push_back((subject1.clone(), 0, 0, String::from_str(&env, "US")));
    batch.push_back((subject2.clone(), 1, 0, String::from_str(&env, "UK")));
    batch.push_back((subject3.clone(), 2, 0, String::from_str(&env, "CA")));
    client.approve_batch(&verifier, &batch);
    
    assert!(client.is_approved(&subject1));
    assert!(client.is_approved(&subject2));
    assert!(client.is_approved(&subject3));
    
    // Now revoke all
    let mut revoke_batch = Vec::new(&env);
    revoke_batch.push_back(subject1.clone());
    revoke_batch.push_back(subject2.clone());
    revoke_batch.push_back(subject3.clone());
    client.revoke_batch(&verifier, &revoke_batch);
    
    assert!(!client.is_approved(&subject1));
    assert!(!client.is_approved(&subject2));
    assert!(!client.is_approved(&subject3));
}

#[test]
fn test_revoke_batch_exceeds_limit() {
    let (env, client, _admin) = setup();
    let verifier = Address::generate(&env);
    client.add_verifier(&verifier);

    let mut batch = Vec::new(&env);
    for _i in 0..21 {
        let subject = Address::generate(&env);
        batch.push_back(subject);
    }
    
    let res = client.try_revoke_batch(&verifier, &batch);
    assert!(res.is_err());
}

#[test]
fn test_get_subjects_by_verifier() {
    let (env, client, _admin) = setup();
    let verifier = Address::generate(&env);
    let subject1 = Address::generate(&env);
    let subject2 = Address::generate(&env);
    let subject3 = Address::generate(&env);
    client.add_verifier(&verifier);

    // Approve subjects
    let mut batch = Vec::new(&env);
    batch.push_back((subject1.clone(), 0, 0, String::from_str(&env, "US")));
    batch.push_back((subject2.clone(), 1, 0, String::from_str(&env, "UK")));
    batch.push_back((subject3.clone(), 2, 0, String::from_str(&env, "CA")));
    client.approve_batch(&verifier, &batch);
    
    // Query all subjects
    let subjects = client.get_subjects_by_verifier(&verifier, &0, &50);
    assert_eq!(subjects.len(), 3);
    assert!(subjects.contains(&subject1));
    assert!(subjects.contains(&subject2));
    assert!(subjects.contains(&subject3));
}

#[test]
fn test_get_subjects_by_verifier_pagination() {
    let (env, client, _admin) = setup();
    let verifier = Address::generate(&env);
    client.add_verifier(&verifier);

    // Approve 5 subjects
    let mut batch = Vec::new(&env);
    let mut subjects_vec: Vec<Address> = Vec::new();
    for _i in 0..5 {
        let subject = Address::generate(&env);
        subjects_vec.push(subject.clone());
        batch.push_back((subject, 0, 0, String::from_str(&env, "US")));
    }
    client.approve_batch(&verifier, &batch);
    
    // Query first page (limit 2)
    let page1 = client.get_subjects_by_verifier(&verifier, &0, &2);
    assert_eq!(page1.len(), 2);
    
    // Query second page
    let page2 = client.get_subjects_by_verifier(&verifier, &2, &2);
    assert_eq!(page2.len(), 2);
    
    // Query third page (only 1 left)
    let page3 = client.get_subjects_by_verifier(&verifier, &4, &2);
    assert_eq!(page3.len(), 1);
    
    // Query beyond the end
    let page_empty = client.get_subjects_by_verifier(&verifier, &10, &2);
    assert_eq!(page_empty.len(), 0);
}
