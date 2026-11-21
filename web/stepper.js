// Ootle Circle - rotation stepper.
// Walks the preset 5-member, 50 TARI circle round by round, showing who
// pays, who takes the pot, and each member's running balance.
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }
  function fmt(n) { return n.toLocaleString("en-US"); }

  var NAMES = ["Asha", "Boris", "Chloe", "Dev", "You"];
  var CONTRIB = 50;
  var START = 1000;

  var listEl = $("step-list");
  var stateEl = $("step-state");
  var noteEl = $("step-note");
  var nextBtn = $("step-next");
  var resetBtn = $("step-reset");
  if (!listEl || !stateEl || !nextBtn) return;

  var balances = null;
  var round = 0;

  function render() {
    listEl.innerHTML = "";
    NAMES.forEach(function (name, i) {
      var li = document.createElement("li");
      var took = round > i;
      var current = round === i + 1 || (round === 0 && i === 0);
      if (took) li.className = "done";
      else if (round > 0 && i === round - 1) li.className = "current";
      var turn = document.createElement("span");
      turn.className = "turn";
      turn.textContent = (i + 1);
      var who = document.createElement("span");
      who.className = "who";
      who.textContent = name;
      var state = document.createElement("span");
      state.className = "state";
      state.textContent = took ? "Paid out" : (round > 0 && i === round - 1 ? "Takes this round" : (round === 0 ? "Waiting" : "Waiting"));
      var bal = document.createElement("span");
      bal.className = "balance";
      bal.textContent = fmt(balances[i]) + " TARI";
      li.appendChild(turn);
      li.appendChild(who);
      li.appendChild(state);
      li.appendChild(bal);
      listEl.appendChild(li);
    });
    if (round === 0) {
      stateEl.textContent = "Round 0 of 5 - no one has paid yet";
      noteEl.textContent = "Press Next round to run round 1. All five members pay 50 TARI, the pot reaches 250, and Asha takes it.";
    } else if (round < 5) {
      var taker = NAMES[round - 1];
      stateEl.textContent = "Round " + round + " of 5 complete - " + taker + " took 250 TARI";
      noteEl.textContent = "So far each member has paid " + fmt(round * CONTRIB) + " TARI. " + taker + " is whole already; the rest are still saving toward their turn.";
    } else {
      stateEl.textContent = "Round 5 of 5 complete - circle closed";
      noteEl.textContent = "Everyone paid 250 TARI in total and took the pot once. Everyone is whole, no interest, no fee.";
    }
    nextBtn.disabled = round >= 5;
    nextBtn.textContent = round >= 5 ? "Circle closed" : "Next round";
  }

  function reset() {
    balances = NAMES.map(function () { return START; });
    round = 0;
    render();
  }

  nextBtn.addEventListener("click", function () {
    if (round >= 5) return;
    round += 1;
    for (var i = 0; i < NAMES.length; i++) balances[i] -= CONTRIB;
    balances[round - 1] += NAMES.length * CONTRIB;
    render();
  });

  resetBtn.addEventListener("click", reset);
  reset();
})();
