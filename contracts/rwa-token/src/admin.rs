use soroban_sdk::{panic_with_error, Address, Env};

use crate::{
    storage_types::{
        require_initialized, DataKey, INSTANCE_BUMP_AMOUNT, INSTANCE_LIFETIME_THRESHOLD,
    },
    Error,
};

pub fn read_admin(env: &Env) -> Address {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
    require_initialized(env);
    if let Some(admin) = env.storage().instance().get(&DataKey::Admin) {
        admin
    } else {
        panic_with_error!(env, Error::NotInitialized)
    }
}

pub fn write_admin(env: &Env, admin: &Address) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
    env.storage().instance().set(&DataKey::Admin, admin);
}
