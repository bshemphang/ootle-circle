//! # Ootle Circle
//!
//! A rotating savings circle (ROSCA) on Tari Ootle.
//!
//! A group of members each contribute a fixed amount of TARI every round, and
//! each round one member, in rotation, takes the whole pot. When every member
//! has taken the pot once, the circle closes and everyone is whole: each
//! member paid `contribution * member_count` in total and received exactly
//! that amount once.
//!
//! Lifecycle:
//! * `create` - the creator opens a circle with a name, a fixed contribution,
//!   a round length (in consensus epochs), a member count, and a join window.
//!   Status is `"filling"`.
//! * `join` - members join with the account that will receive their payout.
//!   When the circle fills, it becomes `"active"` and round 0 starts.
//! * `contribute` - each member pays exactly the contribution once per round,
//!   inside the round window. When the last member pays, the pot is paid out
//!   automatically to the member whose turn it is, and the next round starts.
//! * `close_early` - creator only, while active: refunds this round's payers
//!   and closes the circle as `"refunded"`.
//! * `cancel` - anyone, while filling, once the join window has passed:
//!   closes the circle as `"cancelled"`. No funds are ever collected while a
//!   circle is filling, so there is nothing to refund on this path.
//!
//! Honest limits, stated plainly: the contract cannot see whether a member
//! "meant" to pay, and it cannot force a member to pay. If a round stalls
//! because someone stops paying, the only remedy is the creator closing the
//! circle early and refunding the current round. That is the same trust model
//! as a real-world savings circle, and it must be said on the page.
//!
//! The template accepts any fungible resource (the tests use a test-only
//! public coin in place of TARI; the web app's on-chain path sends TARI).
//! Amounts sit in a component vault and are public.
//!
//! Built for the Tari November 2026 MVP contest. MIT licensed. Unaudited.

use tari_template_lib::prelude::*;

#[template]
mod circle {
    use super::*;

    pub struct Circle {
        creator: RistrettoPublicKeyBytes,
        name: String,
        contribution: Amount,
        epoch_length: u64,
        max_members: u32,
        fill_deadline: u64,
        members: Vec<Member>,
        /// None until the first contribution; then the vault holding the pot.
        pot: Option<Vault>,
        /// The resource of the first contribution; set on the first payment.
        resource: Option<ResourceAddress>,
        current_round: u32,
        round_started_epoch: u64,
        /// `"filling"`, `"active"`, `"closed"`, `"refunded"`, or `"cancelled"`.
        status: String,
        created_epoch: u64,
    }

    /// A single public snapshot of a circle. Used by `get`.
    pub struct CircleView {
        pub creator: RistrettoPublicKeyBytes,
        pub name: String,
        pub contribution: Amount,
        pub epoch_length: u64,
        pub max_members: u32,
        pub fill_deadline: u64,
        pub member_count: u32,
        pub members: Vec<MemberView>,
        pub pot_balance: Amount,
        pub resource: Option<ResourceAddress>,
        pub current_round: u32,
        pub round_started_epoch: u64,
        pub round_deadline: u64,
        pub next_payout_key: Option<RistrettoPublicKeyBytes>,
        pub next_payout_account: Option<ComponentAddress>,
        pub status: String,
        pub created_epoch: u64,
    }

    /// A member of a circle. `paid_round == u32::MAX` means "never paid".
    #[derive(Clone)]
    pub struct Member {
        pub key: RistrettoPublicKeyBytes,
        pub account: ComponentAddress,
        pub joined_epoch: u64,
        pub paid_round: u32,
    }

    /// A public snapshot of one member, for the `get` view.
    pub struct MemberView {
        pub key: RistrettoPublicKeyBytes,
        pub account: ComponentAddress,
        pub joined_epoch: u64,
        pub paid_this_round: bool,
    }

    impl Circle {
        /// Open a circle. The transaction signer is the creator.
        ///
        /// * `name` - 1 to 64 characters, shown on the page.
        /// * `contribution` - the fixed amount every member pays every round.
        /// * `epoch_length` - how long each round lasts, in consensus epochs.
        /// * `max_members` - the circle starts when this many members join (2–64).
        /// * `join_window_epochs` - how long the circle stays open for joining.
        pub fn create(
            name: String,
            contribution: Amount,
            epoch_length: u64,
            max_members: u32,
            join_window_epochs: u64,
        ) -> Component<Self> {
            let now = Consensus::current_epoch();
            assert!(!name.is_empty(), "Circle name must not be empty");
            assert!(
                name.len() <= 64,
                "Circle name must be at most 64 characters"
            );
            assert!(
                contribution.is_positive(),
                "The contribution must be positive"
            );
            assert!(max_members >= 2, "A circle needs at least 2 members");
            assert!(max_members <= 64, "A circle holds at most 64 members");
            assert!(epoch_length >= 1, "A round must last at least 1 epoch");
            assert!(
                join_window_epochs >= 1,
                "The join window must be at least 1 epoch"
            );
            let fill_deadline = now
                .checked_add(join_window_epochs)
                .expect("Join window overflows");
            let creator = CallerContext::transaction_signer_public_key();

            emit_event(
                "created",
                metadata![
                    "creator" => creator.to_string(),
                    "name" => name.clone(),
                    "contribution" => contribution.to_string(),
                    "max_members" => max_members.to_string(),
                ],
            );

            Component::new(Self {
                creator,
                name,
                contribution,
                epoch_length,
                max_members,
                fill_deadline,
                members: Vec::new(),
                pot: None,
                resource: None,
                current_round: 0,
                round_started_epoch: 0,
                status: String::from("filling"),
                created_epoch: now,
            })
            .with_access_rules(AccessRules::allow_all())
            .create()
        }

        /// Join the circle with the account that will receive your payout.
        /// When the circle fills, it becomes active and round 0 starts.
        pub fn join(&mut self, account: ComponentAddress) {
            assert_eq!(
                self.status, "filling",
                "This circle is no longer accepting members"
            );
            assert!(
                Consensus::current_epoch() < self.fill_deadline,
                "The join window has closed"
            );
            let signer = CallerContext::transaction_signer_public_key();
            assert!(
                !self.members.iter().any(|m| m.key == signer),
                "You have already joined this circle"
            );
            assert!(
                (self.members.len() as u32) < self.max_members,
                "This circle is full"
            );
            Self::assert_payout_account(account, "The member account");

            self.members.push(Member {
                key: signer,
                account,
                joined_epoch: Consensus::current_epoch(),
                paid_round: u32::MAX,
            });
            emit_event(
                "joined",
                metadata![
                    "member" => signer.to_string(),
                    "count" => self.members.len().to_string(),
                ],
            );

            if (self.members.len() as u32) == self.max_members {
                self.status = String::from("active");
                self.round_started_epoch = Consensus::current_epoch();
                emit_event("started", metadata!["members" => self.max_members.to_string()]);
            }
        }

        /// Pay this round's contribution. Exactly the circle amount, once per
        /// round, inside the round window. When the last member pays, the pot
        /// is paid out automatically to the member whose turn it is.
        pub fn contribute(&mut self, payment: Bucket) {
            assert_eq!(self.status, "active", "This circle is not active");
            let now = Consensus::current_epoch();
            assert!(
                now <= self.round_deadline(),
                "The contribution window for this round has closed"
            );
            let signer = CallerContext::transaction_signer_public_key();
            let idx = self
                .members
                .iter()
                .position(|m| m.key == signer)
                .expect("Only a member can contribute");
            assert!(
                self.members[idx].paid_round != self.current_round,
                "You have already contributed this round"
            );
            assert_eq!(
                payment.amount(),
                self.contribution,
                "The contribution must equal the circle amount"
            );
            match self.resource {
                Some(res) => assert_eq!(
                    payment.resource_address(),
                    res,
                    "Wrong resource for this circle"
                ),
                None => {
                    self.resource = Some(payment.resource_address());
                }
            }

            match self.pot.as_mut() {
                Some(vault) => vault.deposit(payment),
                None => self.pot = Some(Vault::from_bucket(payment)),
            }
            self.members[idx].paid_round = self.current_round;
            emit_event(
                "contributed",
                metadata![
                    "member" => signer.to_string(),
                    "round" => self.current_round.to_string(),
                ],
            );

            if self.all_paid() {
                self.payout();
            }
        }

        /// Creator only, while active: refund everyone who paid this round
        /// and close the circle as `"refunded"`. Members who already took a
        /// payout keep it; they paid their share in earlier rounds.
        pub fn close_early(&mut self) {
            let signer = CallerContext::transaction_signer_public_key();
            assert_eq!(
                signer, self.creator,
                "Only the circle creator can close it early"
            );
            assert_eq!(
                self.status, "active",
                "Only an active circle can be closed early"
            );
            let payers: Vec<ComponentAddress> = self
                .members
                .iter()
                .filter(|m| m.paid_round == self.current_round)
                .map(|m| m.account)
                .collect();
            for account in payers {
                let bucket = self
                    .pot
                    .as_mut()
                    .expect("A payer exists, so the pot exists")
                    .withdraw(self.contribution);
                ComponentManager::get(account).invoke("deposit", args![bucket]);
            }
            self.status = String::from("refunded");
            emit_event("refunded", metadata!["round" => self.current_round.to_string()]);
        }

        /// Anyone, while filling, once the join window has passed: close the
        /// circle as `"cancelled"`. No funds are ever collected while a circle
        /// is filling, so there is nothing to refund on this path.
        pub fn cancel(&mut self) {
            assert_eq!(
                self.status, "filling",
                "Only a circle still filling can be cancelled"
            );
            assert!(
                Consensus::current_epoch() >= self.fill_deadline,
                "The join window is still open"
            );
            self.status = String::from("cancelled");
            emit_event("cancelled", metadata![]);
        }

        // ── views ──────────────────────────────────────────────────────────

        pub fn get(&self) -> CircleView {
            let next = self.next_payout_member();
            CircleView {
                creator: self.creator,
                name: self.name.clone(),
                contribution: self.contribution,
                epoch_length: self.epoch_length,
                max_members: self.max_members,
                fill_deadline: self.fill_deadline,
                member_count: self.members.len() as u32,
                members: self
                    .members
                    .iter()
                    .map(|m| MemberView {
                        key: m.key,
                        account: m.account,
                        joined_epoch: m.joined_epoch,
                        paid_this_round: m.paid_round == self.current_round,
                    })
                    .collect(),
                pot_balance: self.pot_balance(),
                resource: self.resource,
                current_round: self.current_round,
                round_started_epoch: self.round_started_epoch,
                round_deadline: self.round_deadline(),
                next_payout_key: next.as_ref().map(|m| m.key),
                next_payout_account: next.as_ref().map(|m| m.account),
                status: self.status.clone(),
                created_epoch: self.created_epoch,
            }
        }

        pub fn creator(&self) -> RistrettoPublicKeyBytes {
            self.creator
        }

        pub fn name(&self) -> String {
            self.name.clone()
        }

        pub fn contribution(&self) -> Amount {
            self.contribution
        }

        pub fn epoch_length(&self) -> u64 {
            self.epoch_length
        }

        pub fn max_members(&self) -> u32 {
            self.max_members
        }

        pub fn fill_deadline(&self) -> u64 {
            self.fill_deadline
        }

        pub fn member_count(&self) -> u32 {
            self.members.len() as u32
        }

        pub fn member_at(&self, index: u32) -> MemberView {
            let m = &self.members[index as usize];
            MemberView {
                key: m.key,
                account: m.account,
                joined_epoch: m.joined_epoch,
                paid_this_round: m.paid_round == self.current_round,
            }
        }

        pub fn pot_balance(&self) -> Amount {
            self.pot
                .as_ref()
                .map(|v| v.balance())
                .unwrap_or_else(Amount::zero)
        }

        pub fn resource(&self) -> Option<ResourceAddress> {
            self.resource
        }

        pub fn current_round(&self) -> u32 {
            self.current_round
        }

        pub fn round_started_epoch(&self) -> u64 {
            self.round_started_epoch
        }

        pub fn round_deadline(&self) -> u64 {
            self.round_started_epoch
                .checked_add(self.epoch_length)
                .expect("Round deadline overflows")
        }

        pub fn status(&self) -> String {
            self.status.clone()
        }

        pub fn created_epoch(&self) -> u64 {
            self.created_epoch
        }

        // ── internals ──────────────────────────────────────────────────────

        fn all_paid(&self) -> bool {
            !self.members.is_empty()
                && self
                    .members
                    .iter()
                    .all(|m| m.paid_round == self.current_round)
        }

        /// Pay the whole pot to the member whose turn it is, then advance the
        /// round. When the last member has been paid, the circle closes.
        fn payout(&mut self) {
            let winner = self.members[self.current_round as usize].clone();
            let amount = self.pot_balance();
            assert!(amount.is_positive(), "The pot is empty");
            let bucket = self
                .pot
                .as_mut()
                .expect("All paid, so the pot exists")
                .withdraw(amount);
            ComponentManager::get(winner.account).invoke("deposit", args![bucket]);
            emit_event(
                "paid_out",
                metadata![
                    "member" => winner.key.to_string(),
                    "round" => self.current_round.to_string(),
                    "amount" => amount.to_string(),
                ],
            );
            self.current_round += 1;
            if self.current_round >= self.members.len() as u32 {
                self.status = String::from("closed");
            } else {
                self.round_started_epoch = Consensus::current_epoch();
            }
        }

        fn next_payout_member(&self) -> Option<Member> {
            if self.status != "active" {
                return None;
            }
            self.members.get(self.current_round as usize).cloned()
        }

        fn assert_payout_account(address: ComponentAddress, role: &str) {
            // `get_state_value` panics if the component does not exist, which
            // rejects the call and returns any bucket to the caller.
            let state = ComponentManager::get(address).get_state_value();
            assert!(
                Account::from_value(&state).is_ok(),
                "{role} must be an existing account that can receive a deposit"
            );
        }
    }
}
