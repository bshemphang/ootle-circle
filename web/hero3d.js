// Ootle Circle - 3D hero scene (Three.js), Qwen4-Max plan.
// One hero coin, environment-lit, rotating on scroll, with the pot below it.
// Mouse tilt, DPR capped at 1.5, rendering pauses when offscreen and on
// prefers-reduced-motion.
(function () {
  "use strict";

  var container = document.getElementById("hero-3d");
  if (!container || typeof THREE === "undefined") return;

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var W = container.clientWidth || 520;
  var H = container.clientHeight || 440;

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 100);
  camera.position.set(0, 1.4, 7.4);
  camera.lookAt(0, 0, 0);

  var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  container.appendChild(renderer.domElement);

  // Lights
  scene.add(new THREE.AmbientLight(0xffffff, 1.0));
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a877e, 0.7));
  var key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(4, 6, 5);
  scene.add(key);
  var rim = new THREE.DirectionalLight(0x2dd4bf, 0.6);
  rim.position.set(-5, 2, -4);
  scene.add(rim);

  // The pot: a lathed teal vessel with a belly, a flared lip, and a gold rim,
  // low in the frame. The lathe profile gives it a crafted shape, not a cone.
  var potGroup = new THREE.Group();
  var potProfile = [
    new THREE.Vector2(0.00, -0.38),
    new THREE.Vector2(0.55, -0.38),
    new THREE.Vector2(0.78, -0.34),
    new THREE.Vector2(0.92, -0.22),
    new THREE.Vector2(1.00, -0.05),
    new THREE.Vector2(1.04, 0.12),
    new THREE.Vector2(1.00, 0.26),
    new THREE.Vector2(1.10, 0.33),
    new THREE.Vector2(1.13, 0.37),
    new THREE.Vector2(1.04, 0.38),
    new THREE.Vector2(0.98, 0.34)
  ];
  var potGeo = new THREE.LatheGeometry(potProfile, 64);
  var potMat = new THREE.MeshStandardMaterial({ color: 0x0f766e, metalness: 0.55, roughness: 0.35 });
  var pot = new THREE.Mesh(potGeo, potMat);
  potGroup.add(pot);
  // Gold rim around the lip
  var potRimGeo = new THREE.TorusGeometry(1.08, 0.035, 12, 64);
  var potRimMat = new THREE.MeshStandardMaterial({ color: 0xd4a94e, metalness: 0.6, roughness: 0.3 });
  var potRim = new THREE.Mesh(potRimGeo, potRimMat);
  potRim.rotation.x = Math.PI / 2;
  potRim.position.y = 0.37;
  potGroup.add(potRim);
  // Dark teal band around the belly
  var potBandGeo = new THREE.TorusGeometry(1.005, 0.018, 8, 64);
  var potBandMat = new THREE.MeshStandardMaterial({ color: 0x0a4f49, metalness: 0.5, roughness: 0.4 });
  var potBand = new THREE.Mesh(potBandGeo, potBandMat);
  potBand.rotation.x = Math.PI / 2;
  potBand.position.y = -0.05;
  potGroup.add(potBand);
  var glowGeo = new THREE.CircleGeometry(0.9, 48);
  var glowMat = new THREE.MeshBasicMaterial({ color: 0xd4a94e, transparent: true, opacity: 0.9 });
  var glow = new THREE.Mesh(glowGeo, glowMat);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.36;
  potGroup.add(glow);
  var potLight = new THREE.PointLight(0xd4a94e, 1.2, 7);
  potLight.position.y = 1.4;
  potGroup.add(potLight);
  potGroup.position.y = -1.5;
  scene.add(potGroup);

  // The hero coin: one large gold coin above the pot, edge-on to the camera.
  // The face is embossed, not flat: an outer rim ring, an inner ring, a raised
  // center medallion with a T mint mark on each face, and a reeded edge.
  var coinGroup = new THREE.Group();
  var coinGeo = new THREE.CylinderGeometry(1.15, 1.15, 0.14, 64);
  var coinMat = new THREE.MeshStandardMaterial({ color: 0xd4a94e, metalness: 0.55, roughness: 0.3 });
  var coin = new THREE.Mesh(coinGeo, coinMat);
  coinGroup.add(coin);
  // Raised rim ring on the coin face
  var rimGeo = new THREE.TorusGeometry(0.88, 0.045, 12, 64);
  var rimMat = new THREE.MeshStandardMaterial({ color: 0xb8933a, metalness: 0.6, roughness: 0.35 });
  var rimTop = new THREE.Mesh(rimGeo, rimMat);
  rimTop.rotation.x = Math.PI / 2;
  rimTop.position.y = 0.075;
  coinGroup.add(rimTop);
  var rimBottom = rimTop.clone();
  rimBottom.position.y = -0.075;
  coinGroup.add(rimBottom);
  // Embossed face detail, built once per face (sign +1 top, -1 bottom)
  var embossMat = new THREE.MeshStandardMaterial({ color: 0xc49a3f, metalness: 0.6, roughness: 0.32 });
  var markMat = new THREE.MeshStandardMaterial({ color: 0xe8c96a, metalness: 0.65, roughness: 0.25 });
  function buildFace(sign) {
    // Inner embossed ring
    var innerGeo = new THREE.TorusGeometry(0.55, 0.025, 10, 64);
    var inner = new THREE.Mesh(innerGeo, embossMat);
    inner.rotation.x = Math.PI / 2;
    inner.position.y = sign * 0.075;
    coinGroup.add(inner);
    // Raised center medallion
    var medGeo = new THREE.CylinderGeometry(0.30, 0.30, 0.03, 32);
    var med = new THREE.Mesh(medGeo, embossMat);
    med.position.y = sign * 0.085;
    coinGroup.add(med);
    // T mint mark, raised on the medallion
    var stemGeo = new THREE.BoxGeometry(0.09, 0.02, 0.24);
    var stem = new THREE.Mesh(stemGeo, markMat);
    stem.position.y = sign * 0.11;
    coinGroup.add(stem);
    var barGeo = new THREE.BoxGeometry(0.22, 0.02, 0.08);
    var bar = new THREE.Mesh(barGeo, markMat);
    bar.position.y = sign * 0.11;
    bar.position.z = 0.085;
    coinGroup.add(bar);
  }
  buildFace(1);
  buildFace(-1);
  // Reeded edge: 48 small ridges around the rim
  var reedGeo = new THREE.BoxGeometry(0.05, 0.16, 0.05);
  var reedMat = new THREE.MeshStandardMaterial({ color: 0xb8933a, metalness: 0.6, roughness: 0.35 });
  for (var i = 0; i < 48; i++) {
    var a = (i / 48) * Math.PI * 2;
    var reed = new THREE.Mesh(reedGeo, reedMat);
    reed.position.set(1.15 * Math.cos(a), 0, 1.15 * Math.sin(a));
    reed.rotation.y = -a;
    coinGroup.add(reed);
  }
  coinGroup.position.y = 0.9;
  coinGroup.rotation.x = 0.5;
  scene.add(coinGroup);

  // Soft contact shadow disc under the pot
  var shadowGeo = new THREE.CircleGeometry(1.7, 48);
  var shadowMat = new THREE.MeshBasicMaterial({ color: 0x1b1a17, transparent: true, opacity: 0.12 });
  var shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -1.92;
  scene.add(shadow);

  // Mouse tilt
  var mx = 0, my = 0;
  window.addEventListener("mousemove", function (e) {
    mx = (e.clientX / window.innerWidth - 0.5) * 2;
    my = (e.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });

  // Scroll-linked rotation: the coin spins as the page scrolls
  var scrollRot = 0;
  function onScroll() {
    var max = Math.max(1, document.body.scrollHeight - window.innerHeight);
    scrollRot = (window.scrollY / max) * Math.PI * 4;
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  function onResize() {
    var w = container.clientWidth || 520;
    var h = container.clientHeight || 440;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener("resize", onResize);

  // Pause rendering when offscreen
  var visible = true;
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
    }).observe(container);
  }

  var clock = new THREE.Clock();
  function tick() {
    requestAnimationFrame(tick);
    if (!visible) return;
    var t = clock.getElapsedTime();
    if (!reduced) {
      coinGroup.rotation.y = scrollRot + Math.sin(t * 0.5) * 0.15;
      coinGroup.rotation.x = 0.5 + Math.sin(t * 0.4) * 0.06;
      coinGroup.position.y = 0.9 + Math.sin(t * 0.9) * 0.08;
      potGroup.rotation.y = -t * 0.1;
    }
    scene.rotation.x += ((my * 0.1) - scene.rotation.x) * 0.05;
    scene.rotation.y += ((mx * 0.16) - scene.rotation.y) * 0.05;
    renderer.render(scene, camera);
  }
  tick();
})();
