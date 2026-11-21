// Ootle Circle - shared site interactions.
// Count-up number, scroll reveals, slider fill, copy link.
(function () {
  "use strict";

  function fmt(n) { return n.toLocaleString("en-US"); }

  // Hero number is static: the current pot (250 TARI), labelled in the HTML.
  // No count-up animation; the number is the real balance, not decoration.
  var countEl = document.getElementById("count-total");
  if (countEl) {
    countEl.textContent = fmt(250);
  }

  // Scroll reveals (once only, staggered via inline transition-delay where set)
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add("in");
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.12 });
    document.querySelectorAll(".reveal").forEach(function (el) { io.observe(el); });
  } else {
    document.querySelectorAll(".reveal").forEach(function (el) { el.classList.add("in"); });
  }

  // Slider fill (custom range track)
  function paintRange(input) {
    var min = parseFloat(input.min) || 0;
    var max = parseFloat(input.max) || 100;
    var pct = ((parseFloat(input.value) - min) / (max - min)) * 100;
    input.style.setProperty("--fill", pct + "%");
  }
  document.querySelectorAll('input[type="range"]').forEach(function (input) {
    paintRange(input);
    input.addEventListener("input", function () { paintRange(input); });
  });

  // Copy link (summary card): encodes calculator state in the URL
  var copyBtn = document.getElementById("btn-copy-link");
  if (copyBtn) {
    copyBtn.addEventListener("click", function () {
      var m = document.getElementById("calc-members");
      var c = document.getElementById("calc-contribution");
      var d = document.getElementById("calc-rounds");
      var url = location.origin + location.pathname +
        "?members=" + (m ? m.value : 5) +
        "&contribution=" + (c ? c.value : 50) +
        "&days=" + (d ? d.value : 7);
      var done = function () { copyBtn.textContent = "Link copied"; setTimeout(function () { copyBtn.textContent = "Copy link"; }, 2000); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done, done);
      } else {
        var ta = document.createElement("textarea");
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); } catch (e) {}
        document.body.removeChild(ta);
        done();
      }
    });
  }

  // Learn progress rail: highlight the step in view
  var railItems = document.querySelectorAll(".progress-rail li");
  var steps = document.querySelectorAll(".learn-step");
  if (railItems.length && steps.length && "IntersectionObserver" in window) {
    var rio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          var id = en.target.id;
          railItems.forEach(function (li) {
            li.classList.toggle("active", li.querySelector("a") && li.querySelector("a").getAttribute("href") === "#" + id);
          });
        }
      });
    }, { rootMargin: "-30% 0px -60% 0px" });
    steps.forEach(function (s) { rio.observe(s); });
  }
})();
