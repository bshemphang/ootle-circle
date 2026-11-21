// Ootle Circle - circle calculator.
// Members x contribution = pot each round. Everyone pays contribution x
// members in total and receives the pot once. Duration = members x days.
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }
  function fmt(n) { return n.toLocaleString("en-US"); }

  var membersEl = $("calc-members");
  var contribEl = $("calc-contribution");
  var roundsEl = $("calc-rounds");
  if (!membersEl || !contribEl || !roundsEl) return;

  function update() {
    var members = parseInt(membersEl.value, 10);
    var contrib = parseInt(contribEl.value, 10);
    var days = parseInt(roundsEl.value, 10);
    $("calc-members-out").textContent = members;
    $("calc-contribution-out").textContent = contrib;
    $("calc-rounds-out").textContent = days;
    $("calc-pot").textContent = fmt(members * contrib) + " TARI";
    $("calc-paid").textContent = fmt(members * contrib) + " TARI";
    $("calc-received").textContent = fmt(members * contrib) + " TARI";
    $("calc-duration").textContent = fmt(members * days) + " days";
  }

  membersEl.addEventListener("input", update);
  contribEl.addEventListener("input", update);
  roundsEl.addEventListener("input", update);
  update();
})();
