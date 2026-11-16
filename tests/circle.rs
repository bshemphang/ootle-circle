//! Engine tests for Ootle Circle, run in-process against the real Ootle engine.
//!
//! Covers the required paths: a full rotation completes with correct payouts,
//! contributions are enforced per round, no member can contribute twice in one
//! round, the payout goes to the right member, and refunds work (early close
//! refunds the current round; cancel closes a circle that never fills).
//! Also: non-members cannot pay, joining twice is rejected, joining a full
//! circle is rejected, paying before the circle is active is rejected, the
//! round deadline is enforced, a wrong resource is rejected, and bad
//! parameters at creation are rejected.

use tari_template_lib::types::{
    Amount, ComponentAddress, ResourceAddress, crypto::RistrettoPublicKeyBytes,
};
use tari_template_test_tooling::{
    TemplateTest,
    byte_type::ToByteType,
    crypto::{PublicKey as _, RistrettoPublicKey, RistrettoSecretKey},
    engine_types::virtual_substate::{VirtualSubstate, VirtualSubstateId},
    transaction::{Transaction, args},
};

const CONTRIBUTION: u64 = 100;
const EPOCH_LEN: u64 = 10;
const JOIN_WINDOW: u64 = 5;
const MAX_MEMBERS: u32 = 3;
const START: u64 = 10;
const FUND: u64 = 1_000;

struct Party {
    sk: RistrettoSecretKey,
    pk: RistrettoPublicKeyBytes,
    account: ComponentAddress,
}

struct World {
    test: TemplateTest,
    coin: ComponentAddress,
    coin_res: ResourceAddress,
    circle: ComponentAddress,
    creator: Party,
    members: Vec<Party>,
    stranger: Party,
}

fn set_epoch(test: &mut TemplateTest, epoch: u64) {
    test.set_virtual_substate(
        VirtualSubstateId::CurrentEpoch,
        VirtualSubstate::CurrentEpoch(epoch),
    );
}

fn party(test: &mut TemplateTest) -> Party {
    let (account, _proof, sk) = test.create_empty_account();
    let pk = RistrettoPublicKey::from_secret_key(&sk).to_byte_type();
    Party { sk, pk, account }
}

/// Take `amount` of the test coin and deposit it into `account`.
fn fund(
    test: &mut TemplateTest,
    coin: ComponentAddress,
    account: ComponentAddress,
    sk: &RistrettoSecretKey,
    amount: u64,
) {
    let t = test
        .transaction()
        .call_method(coin, "take", args![Amount::from(amount)])
        .put_last_instruction_output_on_workspace("funds")
        .call_method(account, "deposit", args![Workspace("funds")])
        .finish()
        .seal(sk);
    test.execute_expect_success(t, vec![]);
}

fn world() -> World {
    let mut test = TemplateTest::new(
        env!("CARGO_MANIFEST_DIR"),
        ["templates/circle", "templates/test_coin"],
    );
    test.enable_auto_add_proofs_from_signers();
    set_epoch(&mut test, START);

    let coin: ComponentAddress =
        test.call_function("TestCoin", "new", args![Amount::from(1_000_000u64)], vec![]);
    let coin_res: ResourceAddress = test.call_method(coin, "resource", args![], vec![]);

    let creator = party(&mut test);
    let mut members = Vec::new();
    for _ in 0..3 {
        let m = party(&mut test);
        fund(&mut test, coin, m.account, &m.sk, FUND);
        members.push(m);
    }
    let stranger = party(&mut test);

    let create = test
        .transaction()
        .call_function(
            test.get_template_address("Circle"),
            "create",
            args![
                "Test Circle".to_string(),
                Amount::from(CONTRIBUTION),
                EPOCH_LEN,
                MAX_MEMBERS,
                JOIN_WINDOW
            ],
        )
        .finish()
        .seal(&creator.sk);
    let result = test.execute_expect_success(create, vec![]);
    let reserved: Vec<ComponentAddress> = std::iter::once(coin)
        .chain(std::iter::once(creator.account))
        .chain(members.iter().map(|m| m.account))
        .chain(std::iter::once(stranger.account))
        .collect();
    let circle = result
        .finalize
        .result
        .accept()
        .unwrap()
        .up_iter()
        .find_map(|(id, _)| {
            id.as_component_address()
                .filter(|a| !reserved.contains(a))
        })
        .expect("circle component");

    World {
        test,
        coin,
        coin_res,
        circle,
        creator,
        members,
        stranger,
    }
}

/// Join all three members; the circle becomes active.
fn join_all(w: &mut World) {
    for i in 0..3 {
        join(w, i).expect("join");
    }
    assert_eq!(status(w), "active");
    assert_eq!(member_count(w), 3);
}

fn run(w: &mut World, t: Transaction) -> Result<(), String> {
    let r = w.test.execute_and_commit_on_success(t, vec![]);
    match r.finalize.result.any_reject() {
        Some(reason) => Err(reason.to_string()),
        None => Ok(()),
    }
}

fn join(w: &mut World, member: usize) -> Result<(), String> {
    let (sk, account) = (w.members[member].sk.clone(), w.members[member].account);
    let t = w
        .test
        .transaction()
        .call_method(w.circle, "join", args![account])
        .finish()
        .seal(&sk);
    run(w, t)
}

fn contribute(w: &mut World, member: usize) -> Result<(), String> {
    contribute_amount(w, member, CONTRIBUTION)
}

/// Contribute an arbitrary amount (for the wrong-amount test).
fn contribute_amount(w: &mut World, member: usize, amount: u64) -> Result<(), String> {
    let (sk, account) = (w.members[member].sk.clone(), w.members[member].account);
    let t = w
        .test
        .transaction()
        .call_method(
            account,
            "withdraw",
            args![w.coin_res, Amount::from(amount)],
        )
        .put_last_instruction_output_on_workspace("pay")
        .call_method(w.circle, "contribute", args![Workspace("pay")])
        .finish()
        .seal(&sk);
    run(w, t)
}

fn call_no_args(w: &mut World, method: &str, signer: &RistrettoSecretKey) -> Result<(), String> {
    let t = w
        .test
        .transaction()
        .call_method(w.circle, method, args![])
        .finish()
        .seal(signer);
    run(w, t)
}

/// Test-coin balance of member `member`'s account.
fn balance(w: &mut World, member: usize) -> Amount {
    let account = w.members[member].account;
    w.test
        .call_method(account, "balance", args![w.coin_res], vec![])
}

fn status(w: &mut World) -> String {
    w.test.call_method(w.circle, "status", args![], vec![])
}

fn pot(w: &mut World) -> Amount {
    w.test.call_method(w.circle, "pot_balance", args![], vec![])
}

fn round(w: &mut World) -> u32 {
    w.test.call_method(w.circle, "current_round", args![], vec![])
}

fn member_count(w: &mut World) -> u32 {
    w.test.call_method(w.circle, "member_count", args![], vec![])
}

fn expect_err(r: Result<(), String>, needle: &str) {
    match r {
        Ok(()) => panic!("expected failure containing {needle:?}, got success"),
        Err(e) => assert!(e.contains(needle), "expected {needle:?} in {e:?}"),
    }
}

#[test]
fn full_rotation_pays_each_member_in_order() {
    let mut w = world();
    join_all(&mut w);

    // Everyone starts funded with 1,000.
    for i in 0..3 {
        assert_eq!(balance(&mut w, i), Amount::from(FUND));
    }

    // Round 0: all pay 100, pot 300 pays out to member 0.
    for i in 0..3 {
        contribute(&mut w, i).expect("contribute round 0");
    }
    assert_eq!(round(&mut w), 1);
    assert_eq!(pot(&mut w), Amount::zero());
    assert_eq!(balance(&mut w, 0), Amount::from(FUND + 200));
    assert_eq!(balance(&mut w, 1), Amount::from(FUND - 100));
    assert_eq!(balance(&mut w, 2), Amount::from(FUND - 100));

    // Round 1: all pay again, pot pays out to member 1.
    for i in 0..3 {
        contribute(&mut w, i).expect("contribute round 1");
    }
    assert_eq!(round(&mut w), 2);
    assert_eq!(balance(&mut w, 0), Amount::from(FUND + 100));
    assert_eq!(balance(&mut w, 1), Amount::from(FUND + 100));
    assert_eq!(balance(&mut w, 2), Amount::from(FUND - 200));

    // Round 2: all pay, pot pays out to member 2, circle closes.
    for i in 0..3 {
        contribute(&mut w, i).expect("contribute round 2");
    }
    assert_eq!(status(&mut w), "closed");
    assert_eq!(pot(&mut w), Amount::zero());
    // Everyone paid 300 in total and received 300 once: whole again.
    for i in 0..3 {
        assert_eq!(balance(&mut w, i), Amount::from(FUND));
    }
}

#[test]
fn payout_only_happens_when_everyone_has_paid() {
    let mut w = world();
    join_all(&mut w);

    contribute(&mut w, 0).expect("member 0 pays");
    contribute(&mut w, 1).expect("member 1 pays");
    // Two of three paid: no payout yet, pot holds 200.
    assert_eq!(pot(&mut w), Amount::from(200u64));
    assert_eq!(round(&mut w), 0);
    assert_eq!(balance(&mut w, 0), Amount::from(FUND - 100));

    contribute(&mut w, 2).expect("member 2 pays");
    // Now the pot pays out to member 0.
    assert_eq!(pot(&mut w), Amount::zero());
    assert_eq!(round(&mut w), 1);
    assert_eq!(balance(&mut w, 0), Amount::from(FUND + 200));
}

#[test]
fn wrong_contribution_amount_is_rejected() {
    let mut w = world();
    join_all(&mut w);
    expect_err(
        contribute_amount(&mut w, 0, CONTRIBUTION - 1),
        "must equal the circle amount",
    );
    expect_err(
        contribute_amount(&mut w, 0, CONTRIBUTION + 50),
        "must equal the circle amount",
    );
    assert_eq!(pot(&mut w), Amount::zero());
    assert_eq!(balance(&mut w, 0), Amount::from(FUND));
}

#[test]
fn double_contribution_in_one_round_is_rejected() {
    let mut w = world();
    join_all(&mut w);
    contribute(&mut w, 0).expect("first payment");
    expect_err(contribute(&mut w, 0), "already contributed this round");
    assert_eq!(pot(&mut w), Amount::from(CONTRIBUTION));
}

#[test]
fn non_member_cannot_contribute() {
    let mut w = world();
    join_all(&mut w);
    // Fund the stranger first, then the template must still reject a non-member.
    let (sk, account) = (w.stranger.sk.clone(), w.stranger.account);
    fund(&mut w.test, w.coin, account, &sk, FUND);
    let t = w
        .test
        .transaction()
        .call_method(
            account,
            "withdraw",
            args![w.coin_res, Amount::from(CONTRIBUTION)],
        )
        .put_last_instruction_output_on_workspace("pay")
        .call_method(w.circle, "contribute", args![Workspace("pay")])
        .finish()
        .seal(&sk);
    expect_err(run(&mut w, t), "Only a member can contribute");
}

#[test]
fn contribute_before_active_is_rejected() {
    let mut w = world();
    // Only one member joins; the circle is still filling.
    join(&mut w, 0).expect("join");
    assert_eq!(status(&mut w), "filling");
    expect_err(contribute(&mut w, 0), "not active");
}

#[test]
fn join_twice_is_rejected() {
    let mut w = world();
    join(&mut w, 0).expect("first join");
    expect_err(join(&mut w, 0), "already joined");
    assert_eq!(member_count(&mut w), 1);
}

#[test]
fn join_after_full_is_rejected() {
    let mut w = world();
    join_all(&mut w);
    // A fourth party tries to join an active, full circle.
    let fourth = party(&mut w.test);
    let t = w
        .test
        .transaction()
        .call_method(w.circle, "join", args![fourth.account])
        .finish()
        .seal(&fourth.sk);
    expect_err(run(&mut w, t), "no longer accepting members");
}

#[test]
fn refund_on_early_close_returns_this_round_payments() {
    let mut w = world();
    join_all(&mut w);
    contribute(&mut w, 0).expect("member 0 pays round 0");
    contribute(&mut w, 1).expect("member 1 pays round 0");
    assert_eq!(pot(&mut w), Amount::from(200u64));

    let creator_sk = w.creator.sk.clone();
    call_no_args(&mut w, "close_early", &creator_sk).expect("close_early");
    assert_eq!(status(&mut w), "refunded");
    assert_eq!(pot(&mut w), Amount::zero());
    // Both payers got their 100 back; the non-payer is untouched.
    assert_eq!(balance(&mut w, 0), Amount::from(FUND));
    assert_eq!(balance(&mut w, 1), Amount::from(FUND));
    assert_eq!(balance(&mut w, 2), Amount::from(FUND));
}

#[test]
fn only_creator_can_close_early() {
    let mut w = world();
    join_all(&mut w);
    let stranger_sk = w.stranger.sk.clone();
    expect_err(
        call_no_args(&mut w, "close_early", &stranger_sk),
        "Only the circle creator",
    );
    let member_sk = w.members[0].sk.clone();
    expect_err(
        call_no_args(&mut w, "close_early", &member_sk),
        "Only the circle creator",
    );
    assert_eq!(status(&mut w), "active");
}

#[test]
fn cancel_after_fill_deadline() {
    let mut w = world();
    join(&mut w, 0).expect("one member joins");
    assert_eq!(status(&mut w), "filling");
    set_epoch(&mut w.test, START + JOIN_WINDOW);
    let stranger_sk = w.stranger.sk.clone();
    call_no_args(&mut w, "cancel", &stranger_sk).expect("cancel");
    assert_eq!(status(&mut w), "cancelled");
    // Nobody paid anything while filling.
    assert_eq!(pot(&mut w), Amount::zero());
    assert_eq!(balance(&mut w, 0), Amount::from(FUND));
}

#[test]
fn cancel_before_fill_deadline_is_rejected() {
    let mut w = world();
    let stranger_sk = w.stranger.sk.clone();
    expect_err(
        call_no_args(&mut w, "cancel", &stranger_sk),
        "join window is still open",
    );
    assert_eq!(status(&mut w), "filling");
}

#[test]
fn contribute_after_round_deadline_is_rejected() {
    let mut w = world();
    join_all(&mut w);
    // Round 0 started at epoch START; the window is START + EPOCH_LEN.
    set_epoch(&mut w.test, START + EPOCH_LEN + 1);
    expect_err(
        contribute(&mut w, 0),
        "contribution window for this round has closed",
    );
    assert_eq!(pot(&mut w), Amount::zero());
}

#[test]
fn wrong_resource_is_rejected() {
    let mut w = world();
    join_all(&mut w);
    // Member 0 pays with the real coin first, setting the circle resource.
    contribute(&mut w, 0).expect("member 0 pays");
    // A second coin, a different resource.
    let coin2: ComponentAddress =
        w.test
            .call_function("TestCoin", "new", args![Amount::from(1_000_000u64)], vec![]);
    let coin2_res: ResourceAddress = w.test.call_method(coin2, "resource", args![], vec![]);
    // Fund member 1 with the second coin, then try to pay with it.
    let (sk, account) = (w.members[1].sk.clone(), w.members[1].account);
    fund(&mut w.test, coin2, account, &sk, FUND);
    let t = w
        .test
        .transaction()
        .call_method(
            account,
            "withdraw",
            args![coin2_res, Amount::from(CONTRIBUTION)],
        )
        .put_last_instruction_output_on_workspace("pay")
        .call_method(w.circle, "contribute", args![Workspace("pay")])
        .finish()
        .seal(&sk);
    expect_err(run(&mut w, t), "Wrong resource for this circle");
}

/// Shared helper: try to create a circle with the given parameters and
/// return the reject reason, or panic on success.
fn create_reject(
    test: &mut TemplateTest,
    creator: &Party,
    name: String,
    contribution: u64,
    epoch_length: u64,
    max_members: u32,
    join_window: u64,
) -> String {
    let t = test
        .transaction()
        .call_function(
            test.get_template_address("Circle"),
            "create",
            args![
                name,
                Amount::from(contribution),
                epoch_length,
                max_members,
                join_window
            ],
        )
        .finish()
        .seal(&creator.sk);
    let r = test.execute_and_commit_on_success(t, vec![]);
    r.finalize
        .result
        .any_reject()
        .expect("create should have been rejected")
        .to_string()
}

fn fresh_test() -> (TemplateTest, Party) {
    let mut test = TemplateTest::new(
        env!("CARGO_MANIFEST_DIR"),
        ["templates/circle", "templates/test_coin"],
    );
    test.enable_auto_add_proofs_from_signers();
    set_epoch(&mut test, START);
    let creator = party(&mut test);
    (test, creator)
}

#[test]
fn create_validation_rejects_bad_parameters() {
    let (mut test, creator) = fresh_test();
    let reason = create_reject(
        &mut test,
        &creator,
        "Bad Circle".to_string(),
        0,
        EPOCH_LEN,
        MAX_MEMBERS,
        JOIN_WINDOW,
    );
    assert!(
        reason.contains("contribution must be positive"),
        "unexpected reject: {reason}"
    );
    let reason = create_reject(
        &mut test,
        &creator,
        "Bad Circle".to_string(),
        CONTRIBUTION,
        EPOCH_LEN,
        1,
        JOIN_WINDOW,
    );
    assert!(
        reason.contains("at least 2 members"),
        "unexpected reject: {reason}"
    );
    let reason = create_reject(
        &mut test,
        &creator,
        String::new(),
        CONTRIBUTION,
        EPOCH_LEN,
        MAX_MEMBERS,
        JOIN_WINDOW,
    );
    assert!(
        reason.contains("name must not be empty"),
        "unexpected reject: {reason}"
    );
    let reason = create_reject(
        &mut test,
        &creator,
        "Bad Circle".to_string(),
        CONTRIBUTION,
        0,
        MAX_MEMBERS,
        JOIN_WINDOW,
    );
    assert!(
        reason.contains("at least 1 epoch"),
        "unexpected reject: {reason}"
    );
}
