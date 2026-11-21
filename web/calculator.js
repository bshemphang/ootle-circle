// Ootle Circle - circle calculator + payout timeline + summary card.
// Members x contribution = pot each round. Everyone pays contribution x
// members in total and receives the pot once. Duration = members x days.
// The timeline shows one row per round; the "You" row is highlighted.
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }
  function fmt(n) { return n.toLocaleString("en-US"); }

  var NAMES = ["Asha", "Boris", "Chloe", "Dev", "You", "Elena", "Farid", "Grace", "Hana", "Ivan", "Jia", "Kofi"];

  var membersEl = $("calc-members");
  var contribEl = $("calc-contribution");
  var roundsEl = $("calc-rounds");
  var timelineEl = $("payout-timeline");
  if (!membersEl || !contribEl || !roundsEl) return;

  // Read ?members=&contribution=&days= from the URL (shared links)
  function readParams() {
    try {
      var q = new URLSearchParams(location.search);
      var m = parseInt(q.get("members"), 10);
      var c = parseInt(q.get("contribution"), 10);
      var d = parseInt(q.get("days"), 10);
      if (m >= 2 && m <= 12) membersEl.value = m;
      if (c >= 10 && c <= 500) contribEl.value = c;
      if (d >= 1 && d <= 30) roundsEl.value = d;
    } catch (e) {}
  }

  function renderTimeline(members, contrib, days) {
    if (!timelineEl) return;
    timelineEl.innerHTML = "";
    var startBal = 1000;
    for (var i = 0; i < members; i++) {
      var row = document.createElement("div");
      row.className = "timeline-row" + (NAMES[i] === "You" ? " you" : "");
      var round = document.createElement("span");
      round.className = "round";
      round.textContent = "Round " + (i + 1);
      var taker = document.createElement("span");
      taker.className = "taker";
      taker.textContent = NAMES[i] || ("Member " + (i + 1));
      var sub = document.createElement("small");
      sub.textContent = "Pays " + fmt(contrib) + " TARI in rounds 1-" + members;
      taker.appendChild(sub);
      var amt = document.createElement("span");
      amt.className = "amt";
      amt.textContent = fmt(members * contrib) + " TARI";
      var bal = document.createElement("span");
      bal.className = "bal";
      var paidSoFar = (i + 1) * contrib;
      var received = members * contrib;
      bal.textContent = "Balance after: " + fmt(startBal - paidSoFar + (i >= 0 ? received : 0)) + " TARI";
      row.appendChild(round);
      row.appendChild(taker);
      row.appendChild(amt);
      row.appendChild(bal);
      timelineEl.appendChild(row);
    }
  }

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
    var sumM = $("sum-members");
    if (sumM) {
      sumM.textContent = members;
      $("sum-contribution").textContent = fmt(contrib) + " TARI";
      $("sum-rounds").textContent = members;
      var youIdx = NAMES.indexOf("You");
      var youRound = youIdx >= 0 && youIdx < members ? youIdx + 1 : members;
      $("sum-payout").textContent = fmt(members * contrib) + " TARI, round " + youRound;
    }
    renderTimeline(members, contrib, days);
  }

  membersEl.addEventListener("input", update);
  contribEl.addEventListener("input", update);
  roundsEl.addEventListener("input", update);
  readParams();
  update();
})();
