// Ootle Circle — walletless simulator.
// Mirrors the on-chain contract rules exactly: fixed contribution, one payment
// per member per round, automatic payout when everyone has paid, round
// windows, early-close refunds, and cancel after the join window.
// No wallet, no network, no real TARI.
(function () {
  "use strict";

  var NAMES = ["You", "Asha", "Boris", "Chloe", "Dev", "Elena", "Farid", "Grace"];
  var START_BALANCE = 1000;

  var S = null;

  var $ = function (id) { return document.getElementById(id); };

  function fmt(n) { return n.toLocaleString("en-US"); }

  function newCircle(opts) {
    S = {
      name: opts.name,
      contribution: opts.contribution,
      maxMembers: opts.maxMembers,
      epochLength: opts.epochLength,
      joinWindow: opts.joinWindow,
      epoch: 0,
      createdEpoch: 0,
      fillDeadline: opts.joinWindow,
      members: [{
        name: "You", creator: true, balance: START_BALANCE,
        paidRound: null, joinedEpoch: 0
      }],
      pot: 0,
      currentRound: 0,
      roundStartedEpoch: null,
      status: "filling",
      events: []
    };
    log("Circle \"" + S.name + "\" created by You. Contribution " + fmt(S.contribution) + " TARI, " + S.maxMembers + " members, rounds of " + S.epochLength + " epochs. Join window closes at epoch " + S.fillDeadline + ".");
    showLive();
    render();
  }

  function roundDeadline() {
    return S.roundStartedEpoch + S.epochLength;
  }

  function allPaid() {
    return S.members.length > 0 && S.members.every(function (m) { return m.paidRound === S.currentRound; });
  }

  function fillCircle() {
    if (!S || S.status !== "filling") return;
    while (S.members.length < S.maxMembers) {
      var idx = S.members.length;
      S.members.push({
        name: NAMES[idx] || ("Member " + (idx + 1)),
        creator: false, balance: START_BALANCE,
        paidRound: null, joinedEpoch: S.epoch
      });
      log(S.members[idx].name + " joined the circle (" + S.members.length + " of " + S.maxMembers + ").");
    }
    S.status = "active";
    S.roundStartedEpoch = S.epoch;
    log("Circle is full. Round 1 starts at epoch " + S.epoch + "; contributions close at epoch " + roundDeadline() + ".");
    setMessage("Circle is active. Round 1 of " + S.maxMembers + " — every member pays " + fmt(S.contribution) + " TARI.");
    render();
  }

  function pay(i) {
    if (!S || S.status !== "active") return setMessage("This circle is not active.", true);
    if (S.epoch > roundDeadline()) return setMessage("The contribution window for this round has closed at epoch " + roundDeadline() + ". Ask the creator to close the circle early for a refund.", true);
    var m = S.members[i];
    if (!m) return;
    if (m.paidRound === S.currentRound) return setMessage(m.name + " has already contributed this round.", true);
    if (m.balance < S.contribution) return setMessage(m.name + " does not have enough balance.", true);
    m.balance -= S.contribution;
    m.paidRound = S.currentRound;
    S.pot += S.contribution;
    log(m.name + " contributed " + fmt(S.contribution) + " TARI to round " + (S.currentRound + 1) + ". Pot is now " + fmt(S.pot) + " TARI.");
    if (allPaid()) payout();
    render();
  }

  function payout() {
    var winner = S.members[S.currentRound];
    var amount = S.pot;
    winner.balance += amount;
    S.pot = 0;
    log("Round " + (S.currentRound + 1) + " complete. " + winner.name + " takes the pot: " + fmt(amount) + " TARI.");
    setMessage("Round " + (S.currentRound + 1) + " complete — " + winner.name + " takes " + fmt(amount) + " TARI.");
    S.currentRound += 1;
    if (S.currentRound >= S.members.length) {
      S.status = "closed";
      log("Every member has taken the pot once. The circle is closed — everyone paid " + fmt(S.contribution * S.members.length) + " TARI in total and received " + fmt(S.contribution * S.members.length) + " TARI once.");
      setMessage("Circle closed. Everyone paid " + fmt(S.contribution * S.members.length) + " TARI and took the pot once — everyone is whole.");
    } else {
      S.roundStartedEpoch = S.epoch;
      log("Round " + (S.currentRound + 1) + " starts. Next payout: " + S.members[S.currentRound].name + ". Contributions close at epoch " + roundDeadline() + ".");
    }
  }

  function closeEarly() {
    if (!S || S.status !== "active") return setMessage("Only an active circle can be closed early.", true);
    var refunded = 0;
    S.members.forEach(function (m) {
      if (m.paidRound === S.currentRound) {
        m.balance += S.contribution;
        S.pot -= S.contribution;
        refunded += 1;
      }
    });
    S.status = "refunded";
    log("You closed the circle early. " + refunded + " member(s) who paid this round were refunded " + fmt(S.contribution) + " TARI each.");
    setMessage("Circle closed early. " + refunded + " member(s) refunded " + fmt(S.contribution) + " TARI each.");
    render();
  }

  function cancel() {
    if (!S || S.status !== "filling") return setMessage("Only a circle still filling can be cancelled.", true);
    if (S.epoch < S.fillDeadline) return setMessage("The join window is still open until epoch " + S.fillDeadline + ".", true);
    S.status = "cancelled";
    log("Join window passed with only " + S.members.length + " of " + S.maxMembers + " members. The circle was cancelled. No funds were collected while filling, so there is nothing to refund.");
    setMessage("Circle cancelled. No funds were collected while filling.");
    render();
  }

  function advanceEpoch(n) {
    if (!S) return;
    S.epoch += n;
    log("Epoch advanced to " + S.epoch + ".");
    if (S.status === "filling" && S.epoch >= S.fillDeadline) {
      setMessage("Join window has passed. The circle can now be cancelled.", false);
    } else if (S.status === "active" && S.epoch > roundDeadline()) {
      setMessage("Round " + (S.currentRound + 1) + " window has closed. Contributions are locked until the creator closes the circle early.", true);
    }
    render();
  }

  function reset() {
    S = null;
    $("sim-live").hidden = true;
    $("sim-empty").hidden = false;
    $("sim-message").textContent = "";
  }

  function log(msg) {
    S.events.unshift({ epoch: S.epoch, msg: msg });
  }

  function setMessage(msg, isError) {
    var el = $("sim-message");
    el.textContent = msg;
    el.classList.toggle("error", !!isError);
  }

  function statusLabel() {
    switch (S.status) {
      case "filling": return "Filling · " + S.members.length + " of " + S.maxMembers + " joined";
      case "active": return "Active · Round " + (S.currentRound + 1) + " of " + S.members.length;
      case "closed": return "Closed · rotation complete";
      case "refunded": return "Closed early · refunded";
      case "cancelled": return "Cancelled · never filled";
      default: return S.status;
    }
  }

  function statusClass() {
    return "status status-" + S.status;
  }

  function render() {
    if (!S) return;
    $("sim-name").textContent = S.name;
    var st = $("sim-status");
    st.textContent = statusLabel();
    st.className = statusClass();
    $("sim-contribution").textContent = fmt(S.contribution) + " TARI";
    $("sim-pot").textContent = fmt(S.pot) + " TARI";
    $("sim-round").textContent = S.status === "filling"
      ? "Not started"
      : (S.currentRound + 1) + " of " + S.members.length;
    $("sim-deadline").textContent = S.status === "active"
      ? "Epoch " + roundDeadline()
      : (S.status === "filling" ? "Epoch " + S.fillDeadline + " (join window)" : "—");
    $("sim-epoch").textContent = "Epoch " + S.epoch;
    var next = (S.status === "active" && S.members[S.currentRound])
      ? S.members[S.currentRound].name + " · " + fmt(S.contribution * S.members.length) + " TARI"
      : "—";
    $("sim-next").textContent = next;

    var list = $("sim-members");
    list.innerHTML = "";
    S.members.forEach(function (m, i) {
      var li = document.createElement("li");
      var paid = m.paidRound === S.currentRound;
      var took = S.currentRound > i || S.status === "closed";
      if (S.status === "active" && i === S.currentRound) li.className = "current";
      else if (took && S.status !== "filling") li.className = "done";
      var turn = document.createElement("span");
      turn.className = "turn";
      turn.textContent = (i + 1);
      var who = document.createElement("span");
      who.className = "who";
      who.textContent = m.name + (m.creator ? " (creator)" : "");
      var state = document.createElement("span");
      state.className = "state";
      state.textContent = S.status === "filling"
        ? "Joined"
        : (took ? "Paid out" : (paid ? "Paid this round" : (i === S.currentRound ? "Takes this round" : "Waiting")));
      var bal = document.createElement("span");
      bal.className = "balance";
      bal.textContent = fmt(m.balance) + " TARI";
      li.appendChild(turn);
      li.appendChild(who);
      li.appendChild(state);
      li.appendChild(bal);
      if (S.status === "active" && !paid) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "pay-btn";
        btn.textContent = "Pay " + fmt(S.contribution) + " TARI";
        btn.disabled = S.epoch > roundDeadline();
        btn.addEventListener("click", function () { pay(i); });
        li.appendChild(btn);
      }
      list.appendChild(li);
    });

    // Filling-state helper row: a fill button when still filling.
    if (S.status === "filling") {
      var fillLi = document.createElement("li");
      var fillBtn = document.createElement("button");
      fillBtn.type = "button";
      fillBtn.className = "pay-btn";
      fillBtn.textContent = "Fill the circle now (" + (S.maxMembers - S.members.length) + " more to join)";
      fillBtn.addEventListener("click", fillCircle);
      fillLi.appendChild(fillBtn);
      list.appendChild(fillLi);
    }

    var ev = $("sim-events");
    ev.innerHTML = "";
    S.events.forEach(function (e) {
      var li = document.createElement("li");
      var t = document.createElement("span");
      t.className = "evt-time";
      t.textContent = "Epoch " + e.epoch;
      li.appendChild(t);
      li.appendChild(document.createTextNode(e.msg));
      ev.appendChild(li);
    });

    $("btn-close-early").disabled = S.status !== "active";
    $("btn-cancel").disabled = !(S.status === "filling" && S.epoch >= S.fillDeadline);
  }

  function showLive() {
    $("sim-empty").hidden = true;
    $("sim-live").hidden = false;
  }

  function readForm() {
    return {
      name: $("f-name").value.trim() || "Untitled Circle",
      contribution: Math.max(1, parseInt($("f-contribution").value, 10) || 50),
      maxMembers: Math.min(8, Math.max(2, parseInt($("f-members").value, 10) || 5)),
      epochLength: Math.max(1, parseInt($("f-round").value, 10) || 10),
      joinWindow: Math.max(1, parseInt($("f-window").value, 10) || 5)
    };
  }

  $("create-form").addEventListener("submit", function (e) {
    e.preventDefault();
    newCircle(readForm());
    setMessage("Circle created. Fill it to start round 1, or advance the epoch past the join window to cancel it.");
  });

  $("btn-preset").addEventListener("click", function () {
    newCircle({
      name: "Shillong Friends Circle",
      contribution: 50,
      maxMembers: 5,
      epochLength: 10,
      joinWindow: 5
    });
    fillCircle();
  });

  $("btn-epoch-1").addEventListener("click", function () { advanceEpoch(1); });
  $("btn-epoch-5").addEventListener("click", function () { advanceEpoch(5); });
  $("btn-epoch-10").addEventListener("click", function () { advanceEpoch(10); });
  $("btn-close-early").addEventListener("click", closeEarly);
  $("btn-cancel").addEventListener("click", cancel);
  $("btn-reset").addEventListener("click", reset);
})();
