
window.addEventListener('DOMContentLoaded', () => {
  const container = document.querySelector('.floors-container');
  const infoName = document.getElementById('tile-name');
  const infoDesc = document.getElementById('tile-description');

  const width = container.clientWidth;
  const height = container.clientHeight;

  // 🎬 Scene setup
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  camera.position.set(0, 2, 5);
  camera.lookAt(0, 0.3, 0);

  // 🎥 Renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.shadowMap.enabled = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15; // malo jača ekspozicija za živost
  renderer.setClearColor(0xffffff, 0);
  container.appendChild(renderer.domElement);

  // 💡 Studio lighting setup
  const ambient = new THREE.AmbientLight(0xffffff, 0.45);
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
  dirLight.position.set(4, 8, 5);
  dirLight.castShadow = true;

  const bottomLight = new THREE.PointLight(0xffffff, 0.6, 20);
  bottomLight.position.set(0, -1, 0);

  const sideLight = new THREE.SpotLight(0xffffff, 0.8, 20, Math.PI / 5, 0.3, 1);
  sideLight.position.set(-5, 3, 2);
  sideLight.target.position.set(0, 0, 0);
  scene.add(sideLight.target);

  scene.add(ambient, dirLight, bottomLight, sideLight);

  // 🧱 Tile textures
  const loader = new THREE.TextureLoader();

  // ✅ Helper: load diffuse maps as sRGB for correct colors
  function loadSRGBTexture(path) {
    const tex = loader.load(path);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  const tileData = [
    {
      name: "Onyx Serenity",
      description: "Luxurious onyx texture with elegant white veining and subtle reflections.",
      textures: {
        diffuse: 'assets/Onyx015_1K-JPG_Color.jpg',
        normal: 'assets/Onyx015_1K-JPG_NormalGL.jpg',
        roughness: 'assets/Onyx015_1K-JPG_Roughness.jpg'
      }
    },
    {
      name: "Modern Stone",
      description: "Polished stone tiles with a contemporary geometric pattern.",
      textures: {
        diffuse: 'assets/Tiles078_1K-JPG_Color.jpg',
        normal: 'assets/Tiles078_1K-JPG_NormalGL.jpg',
        roughness: 'assets/Tiles078_1K-JPG_Roughness.jpg'
      }
    },
    {
      name: "Travertine Elegance",
      description: "Classic travertine finish, timeless and warm in tone.",
      textures: {
        diffuse: 'assets/Travertine009_1K-JPG_Color.jpg',
        normal: 'assets/Travertine009_1K-JPG_NormalGL.jpg',
        roughness: 'assets/Travertine009_1K-JPG_Roughness.jpg'
      }
    }
  ];

  const tiles = [];
  const reflections = [];
  const spacing = 2.5;

  // 🪶 Create tiles and reflections
  tileData.forEach((td, i) => {
    const mat = new THREE.MeshStandardMaterial({
      map: loadSRGBTexture(td.textures.diffuse),
      normalMap: loader.load(td.textures.normal),
      roughnessMap: loader.load(td.textures.roughness),
      metalness: 0.25,
      roughness: 0.35
    });

    const geo = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((i - (tileData.length - 1) / 2) * spacing, 0.3, 0);
    scene.add(mesh);

    // 🔮 Reflection (soft fake mirror)
    const mirrorMat = mat.clone();
    mirrorMat.opacity = 0.35;
    mirrorMat.transparent = true;
    const mirror = new THREE.Mesh(geo, mirrorMat);
    mirror.rotation.x = -Math.PI / 2;
    mirror.scale.y = -1;
    mirror.position.set(mesh.position.x, -mesh.position.y + 0.02, mesh.position.z);
    scene.add(mirror);
    mirror.visible = false; // refleksije se inicijalno ne renderuju

    mesh.userData = {
      baseY: 0.3,
      hoverY: 0.45,
      hoverLevel: 0,
      hoverDecay: 0,
      tileInfo: td,
      mirrorRef: mirror
    };

    tiles.push(mesh);
    reflections.push(mirror);
  });

  // 📏 Resize
  window.addEventListener('resize', () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });

  // 🖱️ Hover detection
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  container.addEventListener('mousemove', (e) => {
    const rect = container.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  });

  const clock = new THREE.Clock();

  // 🎞️ Animation
  function animate() {
    requestAnimationFrame(animate);
    const t = clock.getElapsedTime();

    // Kamera se lagano pomera (showroom efekat)
    camera.position.x = Math.sin(t * 0.2) * 5;
    camera.position.z = Math.cos(t * 0.2) * 5;
    camera.lookAt(0, 0.3, 0);

    // Hover logic with grace period
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(tiles);
    tiles.forEach(tile => (tile.userData.hoverDecay *= 0.9));
    if (hits.length > 0) hits[0].object.userData.hoverDecay = 1.0;

    // Odredi aktivnu pločicu
    let activeTile = null;
    let maxHover = 0;
    tiles.forEach(tile => {
      if (tile.userData.hoverDecay > maxHover) {
        maxHover = tile.userData.hoverDecay;
        activeTile = tile;
      }
    });

    // Info panel
    if (activeTile) {
      infoName.innerText = activeTile.userData.tileInfo.name;
      infoDesc.innerText = activeTile.userData.tileInfo.description;
    } else {
      infoName.innerText = "Tile Name";
      infoDesc.innerText = "Hover over a tile to see details.";
    }

    // Animacija pločica
    tiles.forEach(tile => {
      const ud = tile.userData;
      ud.hoverLevel += (ud.hoverDecay - ud.hoverLevel) * 0.08;

      const floatY = ud.baseY + Math.sin(t * 2 + tile.position.x * 1.5) * 0.03;
      const targetY = floatY + (ud.hoverY - ud.baseY) * ud.hoverLevel;
      tile.position.y += (targetY - tile.position.y) * 0.1;

      // Lagano ljuljanje i highlight
      tile.rotation.z += ((ud.hoverLevel * Math.sin(t * 4) * 0.01) - tile.rotation.z) * 0.2;
      tile.material.emissive = new THREE.Color(0xffffff);
      tile.material.emissiveIntensity = 0.25 * ud.hoverLevel;
      tile.material.color.setScalar(1 + ud.hoverLevel * 0.25);

      // Refleksija
      const mirror = ud.mirrorRef;
      mirror.position.y = -tile.position.y + 0.02;
      mirror.material.opacity = 0.35 - ud.hoverLevel * 0.1;
    });

    renderer.render(scene, camera);
  }

  animate();
  // Aktiviraj refleksije nakon 1 sekunde (kad se teksture učitaju)
setTimeout(() => {
  reflections.forEach(m => m.visible = true);
}, 1000);

});
const textureCache = {};
function loadSRGBTexture(path) {
  if (textureCache[path]) return textureCache[path];
  const tex = loader.load(path);
  tex.colorSpace = THREE.SRGBColorSpace;
  textureCache[path] = tex;
  return tex;
}
