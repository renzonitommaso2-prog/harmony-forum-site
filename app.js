async function bootModels() {
  const panels = [...document.querySelectorAll(".model-panel")];
  if (!panels.length) return;
  panels.forEach((panel) => panel.classList.add("loading"));

  let THREE;
  let GLTFLoader;
  try {
    THREE = await import("https://unpkg.com/three@0.160.0/build/three.module.js");
    ({ GLTFLoader } = await import("https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js"));
  } catch {
    panels.forEach((panel) => {
      panel.classList.remove("loading");
      panel.classList.add("failed");
    });
    return;
  }

  const loader = new GLTFLoader();

  document.querySelectorAll(".model-viewer").forEach((canvas) => {
    const panel = canvas.closest(".model-panel");
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    const group = new THREE.Group();
    scene.add(group);

    const hemi = new THREE.HemisphereLight(0xd8f7ff, 0x1c1630, 2.1);
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(3, 4, 5);
    scene.add(hemi, key);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    loader.load(
      canvas.dataset.model,
      (gltf) => {
        group.add(gltf.scene);
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        gltf.scene.position.sub(center);
        const maxSize = Math.max(size.x, size.y, size.z) || 1;
        const distance = maxSize * 2.6;
        camera.position.set(0, maxSize * 0.35, distance);
        camera.lookAt(0, 0, 0);
        panel.classList.remove("loading");
        resize();
      },
      undefined,
      () => {
        panel.classList.remove("loading");
        panel.classList.add("failed");
      }
    );

    const tick = () => {
      resize();
      group.rotation.y += 0.008;
      group.rotation.x = Math.sin(performance.now() * 0.0007) * 0.06;
      renderer.render(scene, camera);
      requestAnimationFrame(tick);
    };
    tick();
  });
}

bootModels();
