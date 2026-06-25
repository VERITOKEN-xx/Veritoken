use soroban_sdk::{panic_with_error, Address, Env};

use crate::{
    storage_types::{
        require_initialized, DataKey, INSTANCE_BUMP_AMOUNT, INSTANCE_LIFETIME_THRESHOLD,
    },
    Error,
};

pub fn read_kyc_registry(env: &Env) -> Address {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
    require_initialized(env);
    if let Some(registry) = env.storage().instance().get(&DataKey::KycRegistry) {
        registry
    } else {
        panic_with_error!(env, Error::NotInitialized)
    }
}

pub fn write_kyc_registry(env: &Env, registry: &Address) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
    env.storage()
        .instance()
        .set(&DataKey::KycRegistry, registry);
}

/// Cross-contract call to the KYC registry to verify a holder is approved.
pub fn require_kyc(env: &Env, addr: &Address) {
    let registry = read_kyc_registry(env);
    let client = KycRegistryClient::new(env, &registry);
    if !client.is_approved(addr) {
        panic!("KYC not approved");
    }
}

mod kyc_registry_interface {
    use soroban_sdk::{contractclient, Address};

    #[contractclient(name = "KycRegistryClient")]
    #[allow(dead_code)]
    pub trait KycRegistryInterface {
        fn is_approved(env: soroban_sdk::Env, addr: Address) -> bool;
    }
}
use kyc_registry_interface::KycRegistryClient;
