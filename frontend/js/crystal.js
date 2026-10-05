// Interactive 3D crystal (the Veora logo) rendered with Three.js.
// Falls back to the flat logo when WebGL or the CDN isn't available.
const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.min.js";

export async function mountCrystal(container) {
  let THREE;
  try {
    THREE = await import(THREE_URL);
    const probe = document.createElement("canvas");
    if (!(probe.getContext("webgl2") || probe.getContext("webgl"))) throw new Error("no webgl");
  } catch {
    return fallback(container);
  }

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 0, 9.6);

  // Studio environment for reflections: a dark room with a few bright and tinted panels.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new THREE.Scene();
  room.add(new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20), new THREE.MeshBasicMaterial({ color: 0x08080d, side: THREE.BackSide })));
  const panel = (color, w, hgt, pos, rot = [0, 0, 0]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hgt), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.rotation.set(...rot);
    room.add(m);
  };
  panel(0xffffff, 6, 2.2, [0, 6, 2], [Math.PI / 2, 0, 0]);
  panel(0xffffff, 2.5, 7, [-7, 0, 1], [0, Math.PI / 2, 0]);
  panel(0x8b7dff, 3, 7, [7, 0, -1], [0, -Math.PI / 2, 0]);
  panel(0xc57bff, 7, 2, [0, -6, -2], [-Math.PI / 2, 0, 0]);
  panel(0x7fd4ff, 3, 3, [3, 2, -7]);
  scene.environment = pmrem.fromScene(room, 0.03).texture;

  // Elongated hexagonal crystal like the logo: a 6-sided prism with pointed caps.
  const profile = [
    new THREE.Vector2(0, -1.9),
    new THREE.Vector2(0.86, -0.78),
    new THREE.Vector2(0.86, 0.78),
    new THREE.Vector2(0, 1.9),
  ];
  const geometry = new THREE.LatheGeometry(profile, 6).toNonIndexed();
  geometry.computeVertexNormals();
  // Alternate silver and obsidian faces around the crystal, as in the logo.
  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const silver = new THREE.Color(0xe9ecf3);
  const dark = new THREE.Color(0x24242e);
  for (let i = 0; i < pos.count; i += 3) {
    const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    const segment = Math.floor(((Math.atan2(cz, cx) + Math.PI) / (Math.PI * 2)) * 6) % 6;
    const c = segment % 2 ? silver : dark;
    for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], (i + k) * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    metalness: 0.75,
    roughness: 0.14,
    flatShading: true,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    iridescence: 0.55,
    iridescenceIOR: 1.7,
    iridescenceThicknessRange: [180, 720],
    envMapIntensity: 1.5,
  });
  const crystal = new THREE.Group();
  const body = new THREE.Mesh(geometry, material);
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry, 1),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28 }));
  crystal.add(body, edges);
  crystal.rotation.z = 0.12;
  scene.add(crystal);

  // Small shards orbiting the crystal.
  const shardMat = material.clone();
  shardMat.vertexColors = false;
  shardMat.color = new THREE.Color(0xdfe2ec);
  const shards = Array.from({ length: 7 }, (_, i) => {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.09 + (i % 3) * 0.04, 0), shardMat);
    m.userData = {
      radius: 2.1 + (i % 4) * 0.28,
      speed: 0.18 + (i % 5) * 0.05,
      phase: (i / 7) * Math.PI * 2,
      tilt: -0.5 + (i % 3) * 0.45,
      height: -1.3 + (i % 6) * 0.5,
    };
    scene.add(m);
    return m;
  });

  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(3, 4, 5);
  const violet = new THREE.PointLight(0x8b7dff, 18, 12);
  const pink = new THREE.PointLight(0xc57bff, 12, 12);
  scene.add(key, violet, pink, new THREE.AmbientLight(0xffffff, 0.15));

  // ---- interaction & loop ----
  const pointer = { x: 0, y: 0 };
  const tilt = { x: 0, y: 0 };
  let dragging = false;
  let lastX = 0;
  let spin = 0;
  let velocity = 0;

  const onMove = (e) => {
    pointer.x = (e.clientX / innerWidth) * 2 - 1;
    pointer.y = (e.clientY / innerHeight) * 2 - 1;
    if (dragging) {
      velocity = (e.clientX - lastX) * 0.004;
      spin += velocity;
      lastX = e.clientX;
    }
  };
  const onDown = (e) => { dragging = true; lastX = e.clientX; container.classList.add("grabbing"); };
  const onUp = () => { dragging = false; container.classList.remove("grabbing"); };
  addEventListener("pointermove", onMove, { passive: true });
  container.addEventListener("pointerdown", onDown);
  addEventListener("pointerup", onUp);

  const resize = () => {
    const { width, height } = container.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  let visible = true;
  const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
  io.observe(container);

  const clock = new THREE.Clock();
  let raf = 0;
  let drawn = false;
  const frame = () => {
    raf = requestAnimationFrame(frame);
    // Always draw the first frame, then pause while offscreen or in a background tab.
    if (drawn && (!visible || document.hidden)) return;
    drawn = true;
    const t = clock.getElapsedTime();
    const motion = reduceMotion ? 0.2 : 1;

    if (!dragging) {
      velocity *= 0.95;
      spin += velocity + 0.0045 * motion;
    }
    tilt.x += (pointer.y * 0.25 - tilt.x) * 0.05;
    tilt.y += (pointer.x * 0.35 - tilt.y) * 0.05;
    crystal.rotation.set(tilt.x, spin + tilt.y, 0.12 + Math.sin(t * 0.6) * 0.03 * motion);
    crystal.position.y = Math.sin(t * 0.9) * 0.1 * motion;

    for (const s of shards) {
      const d = s.userData;
      const a = d.phase + t * d.speed * motion;
      s.position.set(Math.cos(a) * d.radius, d.height + Math.sin(a * 1.3) * 0.25 + Math.sin(a) * d.tilt, Math.sin(a) * d.radius * 0.6);
      s.rotation.x = s.rotation.y = a * 2;
    }
    violet.position.set(Math.cos(t * 0.5) * 3, 1.5, Math.sin(t * 0.5) * 3);
    pink.position.set(Math.cos(t * 0.5 + Math.PI) * 3, -1.5, Math.sin(t * 0.5 + Math.PI) * 3);

    renderer.render(scene, camera);
  };
  frame();
  container.classList.add("ready");

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    io.disconnect();
    removeEventListener("pointermove", onMove);
    removeEventListener("pointerup", onUp);
    container.removeEventListener("pointerdown", onDown);
    pmrem.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}

function fallback(container) {
  const img = document.createElement("img");
  img.src = "logo.png";
  img.alt = "";
  img.className = "crystal-fallback";
  container.append(img);
  container.classList.add("ready");
  return () => img.remove();
}
