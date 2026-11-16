# Ootle Circle

**A rotating savings circle (ROSCA) on Tari Ootle.** A group of members each contribute a fixed amount of TARI every round; each round one member, in rotation, takes the whole pot. When every member has taken the pot once, the circle closes and everyone is whole.

Built for the [Tari November 2026 MVP contest](https://community.tari.com/t/november-build-contest-thread-mvp/520). MIT licensed. **Unaudited.**

## Live demo

**Demo: _coming soon — deploying to Cloudflare Pages_**

The demo is a walletless simulation of the exact contract rules: create a circle, join, pay rounds, watch the pot move. No wallet, no network, no real TARI.

## How a circle works

1. **Create** — set a name, a fixed contribution, a round length (in consensus epochs), a member count, and a join window.
2. **Join** — each member joins with the account that will receive their payout. When the circle fills, round one starts.
3. **Contribute** — every member pays exactly the contribution, once per round, inside the round window. Wrong amounts, double payments, and late payments are rejected.
4. **Take the pot** — when the last member pays, the whole pot goes to the member whose turn it is. After every member has taken the pot once, the circle closes.

If a round stalls because someone stops paying, the creator can close the circle early, which refunds everyone who paid that round. A circle that never fills can be cancelled once its join window passes; no funds are ever collected while filling, so there is nothing to refund on that path.

What the contract cannot do: it cannot force a member to pay, and it cannot see whether someone meant to pay. That is the same trust model as a real-world savings circle.

## The contract

`templates/circle` is a Rust template for Tari Ootle, compiled to WASM. It accepts any fungible resource (the tests use a test-only public coin in place of TARI; the on-chain path sends TARI). Amounts sit in a component vault and are public.

### Build the WASM

```sh
cd templates/circle
cargo build --release --target wasm32-unknown-unknown
# binary: target/wasm32-unknown-unknown/release/circle.wasm
```

### Run the engine tests

```sh
cargo test
```

The tests run against the real Ootle engine in-process (`tari_template_test_tooling`). **15 tests, 15 passed, 0 failed.** They cover: a full rotation with correct payouts, payout only when everyone has paid, wrong-amount / double / non-member / wrong-resource payments rejected, join twice / join a full circle / pay before active / pay after the round deadline rejected, early-close refunds, cancel after the join window, and bad create parameters.

The release WASM is 156 KiB (`templates/circle/target/wasm32-unknown-unknown/release/circle.wasm`).

## On-chain status

The template is written and tested against the real Ootle engine in-process. It is **not yet published** to Esmeralda testnet or mainnet. To publish: build the WASM above, publish the template from the Tari wallet web UI (Sapient or Tari Universe) on Esmeralda, then paste the template address into `web/index.html`.

## Layout

- `templates/circle/` — the ROSCA template (Rust → WASM)
- `templates/test_coin/` — test-only public coin used in place of TARI in engine tests
- `tests/circle.rs` — engine tests
- `web/` — the static demo app (simulation + on-chain notes)

## Licence

MIT. See [LICENSE](LICENSE).
