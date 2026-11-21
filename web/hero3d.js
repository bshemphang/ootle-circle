// Ootle Circle - 3D hero scene (Three.js).
// A ring of five gold coins orbits a central pot. One coin (the member whose
// turn it is) glows teal. The ring rotates slowly and tilts with the mouse.
(function () {
  "use strict";

  var container = document.getElementById("hero-3d");
  if (!container || typeof THREE === "undefined") return;

  var W = container.clientWidth || 520;
  var H = container.clientHeight || 420;

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 100);
  camera.position.set(0, 2.6, 7.2);
  camera.lookAt(0, 0, 0);

  var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.appendChild(renderer.domElement);

  // Lights
  scene.add(new THREE.AmbientLight(0xffffff, 1.0));
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a877e, 0.7));
  var key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(4, 6, 5);
  scene.add(key);
  var rim = new THREE.DirectionalLight(0x7dd3c8, 0.6);
  rim.position.set(-5, 2, -4);
  scene.add(rim);

  // Ring the coins travel on
  var ringGeo = new THREE.TorusGeometry(2.35, 0.035, 12, 128);
  var ringMat = new THREE.MeshStandardMaterial({ color: 0x0f766e, metalness: 0.4, roughness: 0.5 });
  var ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2;
  scene.add(ring);

  // Central pot: a short golden vessel with a teal glow disc on top
  var potGroup = new THREE.Group();
  var potGeo = new THREE.CylinderGeometry(0.85, 0.65, 0.7, 48);
  var potMat = new THREE.MeshStandardMaterial({ color: 0x0f766e, metalness: 0.55, roughness: 0.35 });
  var pot = new THREE.Mesh(potGeo, potMat);
  potGroup.add(pot);
  var glowGeo = new THREE.CircleGeometry(0.72, 48);
  var glowMat = new THREE.MeshBasicMaterial({ color: 0xf6c453, transparent: true, opacity: 0.9 });
  var glow = new THREE.Mesh(glowGeo, glowMat);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.36;
  potGroup.add(glow);
  var potLight = new THREE.PointLight(0xf6c453, 1.2, 6);
  potLight.position.y = 1.2;
  potGroup.add(potLight);
  scene.add(potGroup);

  // Five coins, one per member. Index 2 (Chloe) is the current turn.
  var coinGroup = new THREE.Group();
  var goldMat = new THREE.MeshStandardMaterial({ color: 0xe8b923, metalness: 0.45, roughness: 0.35 });
  var tealMat = new THREE.MeshStandardMaterial({ color: 0x0f766e, metalness: 0.7, roughness: 0.3, emissive: 0x0b5d57, emissiveIntensity: 0.55 });
  var coinGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.09, 40);
  var R = 2.35;
  var coins = [];
  var names = ["Asha", "Boris", "Chloe", "Dev", "You"];
  for (var i = 0; i < 5; i++) {
    var a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
    var coin = new THREE.Mesh(coinGeo, i === 2 ? tealMat : goldMat);
    coin.position.set(Math.cos(a) * R, 0, Math.sin(a) * R);
    coin.rotation.x = Math.PI / 2;
    coin.userData.baseY = 0;
    coin.userData.phase = i * 1.256;
    coinGroup.add(coin);
    coins.push(coin);
  }
  scene.add(coinGroup);

  // Mouse parallax
  var targetRX = 0, targetRY = 0;
  var mx = 0, my = 0;
  window.addEventListener("mousemove", function (e) {
    mx = (e.clientX / window.innerWidth - 0.5) * 2;
    my = (e.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });

  // Resize
  function onResize() {
    var w = container.clientWidth || 520;
    var h = container.clientHeight || 420;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener("resize", onResize);

  // Animate
  var clock = new THREE.Clock();
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function tick() {
    requestAnimationFrame(tick);
    var t = clock.getElapsedTime();
    if (!reduced) {
      coinGroup.rotation.y = t * 0.22;
      potGroup.rotation.y = -t * 0.12;
      for (var i = 0; i < coins.length; i++) {
        coins[i].position.y = Math.sin(t * 1.4 + coins[i].userData.phase) * 0.08;
      }
    }
    targetRX = my * 0.12;
    targetRY = mx * 0.18;
    scene.rotation.x += (targetRX - scene.rotation.x) * 0.05;
    scene.rotation.y += (targetRY - scene.rotation.y) * 0.05;
    renderer.render(scene, camera);
  }
  tick();
})();
