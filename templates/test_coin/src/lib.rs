//! Test-only helper: hands out a public fungible coin so engine tests can
//! fund members without TARI.
use tari_template_lib::prelude::*;

#[template]
mod test_coin {
    use super::*;

    pub struct TestCoin {
        coins: Vault,
    }

    impl TestCoin {
        pub fn new(supply: Amount) -> Component<Self> {
            let coins = ResourceBuilder::public_fungible()
                .with_token_symbol("COIN")
                .initial_supply(supply);
            Component::new(Self {
                coins: Vault::from_bucket(coins),
            })
            .with_access_rules(AccessRules::allow_all())
            .create()
        }

        pub fn resource(&self) -> ResourceAddress {
            self.coins.resource_address()
        }

        pub fn take(&mut self, amount: Amount) -> Bucket {
            self.coins.withdraw(amount)
        }

        /// A zero-amount bucket of a fresh public resource, so tests can
        /// exercise `Circle::create`'s "must be positive" check. A zero
        /// contribution cannot be built from a normal withdrawal.
        pub fn zero_bucket(&self) -> Bucket {
            ResourceBuilder::public_fungible()
                .with_token_symbol("ZERO")
                .initial_supply(Amount::from(0u64))
        }
    }
}
