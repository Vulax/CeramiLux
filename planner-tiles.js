/*! CeramiLux • planner-tiles.js (floor-only, no walls, no OrbitControls) */
(function () {
  'use strict';

  // ---- Lokalne pločice (putanje iz /assets) ----
  const tileData = [
    {
      name: "Onyx Serenity",
      description: "Luxurious onyx texture with elegant white veining and subtle reflections.",
      textures: {
        diffuse: 'assets/Onyx015_1K-JPG_Color.jpg',
        normal:  'assets/Onyx015_1K-JPG_NormalGL.jpg',
        roughness:'assets/Onyx015_1K-JPG_Roughness.jpg'
      }
    },
    {
      name: "Modern Stone",
      description: "Polished stone tiles with a contemporary geometric pattern.",
      textures: {
        diffuse: 'assets/Tiles078_1K-JPG_Color.jpg',
        normal:  'assets/Tiles078_1K-JPG_NormalGL.jpg',
        roughness:'assets/Tiles078_1K-JPG_Roughness.jpg'
      }
    },
    {
      name: "Travertine Elegance",
      description: "Classic travertine finish, timeless and warm in tone.",
      textures: {
        diffuse: 'assets/Travertine009_1K-JPG_Color.jpg',
        normal:  'assets/Travertine009_1K-JPG_NormalGL.jpg',
        roughness:'assets/Travertine009_1K-JPG_Roughness.jpg'
      }
    }
  ];

  // ---- Bootstrap ----
  if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(start, 0);
  else window.addEventListener('load', start);

  const EPS = 1e-6;
  const safe = (v, d=0) => (Number.isFinite(+v) ? +v : d);
  const safeStep = (v) => (Number.isFinite(v) && v > EPS ? v : EPS);
  const $ = (id) => document.getElementById(id);

  async function start() {
    if (!window.THREE) { console.error('THREE nije učitan.'); return; }

    // ---- UI refs ----
    const ui = {
      len: $('roomLen'), wid: $('roomWid'),
      tlen: $('tileLen'), twid: $('tileWid'),
      grout: $('grout'), waste: $('waste'), pattern: $('pattern'),
      priceM2: $('priceM2'), perBox: $('perBox'),
      calc: $('calc'), oArea: $('oArea'), oTiles: $('oTiles'), oBoxes: $('oBoxes'), oCost: $('oCost'),
      viewer: $('viewer')
    };

    // ---- THREE scene ----
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0c0d);

    const camera = new THREE.PerspectiveCamera(55, ui.viewer.clientWidth / ui.viewer.clientHeight, 0.01, 500);
    camera.position.set(3.5, 2.5, 3.5);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(ui.viewer.clientWidth, ui.viewer.clientHeight);
    if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
    ui.viewer.appendChild(renderer.domElement);

    // Svetla (bez zidova – više “showroom” osećaj)
    scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 0.95));
    const dir   = new THREE.DirectionalLight(0xffffff, 1.1); dir.position.set(2, 5, 3); scene.add(dir);
    const point = new THREE.PointLight(0xffffff, 1.0, 20);   point.position.set(0, 3, 0); scene.add(point);
    const rim   = new THREE.DirectionalLight(0xffffff, 0.25);rim.position.set(-4, 3, -2); scene.add(rim);

    // ---- State ----
    let floorMesh = null;
    let tileGrid  = null;
    let angle = 0; // auto-rotacija kamere

    // ---- Teksture (loader + cache + fallback) ----
    const texLoader = new THREE.TextureLoader();
    const texCache  = new Map();
    const currentMaps = { diffuse:null, normal:null, roughness:null };

    function makeChecker(size=256, cells=8){
      const c=document.createElement('canvas'); c.width=c.height=size;
      const g=c.getContext('2d'); const s=size/cells;
      for(let y=0;y<cells;y++) for(let x=0;x<cells;x++){
        g.fillStyle=((x+y)&1)?'#2b2d30':'#3a3c40'; g.fillRect(x*s,y*s,s,s);
      }
      const t=new THREE.CanvasTexture(c);
      if (THREE.SRGBColorSpace) t.colorSpace=THREE.SRGBColorSpace;
      t.wrapS=t.wrapT=THREE.RepeatWrapping;
      return t;
    }

    function prepTex(tex, rx, ry, rot=0, isColor=false){
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(rx, ry);
      tex.center.set(0.5, 0.5);
      tex.rotation = rot;
      tex.anisotropy = Math.min(16, (renderer.capabilities.getMaxAnisotropy?.()||8));
      if (isColor && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = true;
      tex.needsUpdate = true;
      return tex;
    }

    async function loadTex(url, isColor=false){
      if (!url) return null;
      const abs = new URL(url, document.baseURI).href;
      if (texCache.has(abs)) return texCache.get(abs);
      return new Promise((resolve)=>{
        texLoader.load(
          abs,
          t => { if (isColor && THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
                 console.log('[OK] texture', abs); texCache.set(abs, t); resolve(t); },
          undefined,
          err => { console.warn('[FAIL] texture', abs, err);
                   const chk = makeChecker(); texCache.set(abs, chk); resolve(chk); }
        );
      });
    }

    async function setMaps(urls, rx=1, ry=1, rot=0){
      const [d,n,r] = await Promise.all([
        loadTex(urls?.diffuse, true),
        loadTex(urls?.normal,  false),
        loadTex(urls?.roughness,false)
      ]);
      currentMaps.diffuse   = d ? prepTex(d, rx, ry, rot, true)  : null;
      currentMaps.normal    = n ? prepTex(n, rx, ry, rot, false) : null;
      currentMaps.roughness = r ? prepTex(r, rx, ry, rot, false) : null;
    }

    // ---- Grid ----
    function rebuildTileGrid(L, W, stepX, stepZ){
      if (tileGrid) { scene.remove(tileGrid); tileGrid.geometry?.dispose(); tileGrid.material?.dispose(); }
      const sx=safeStep(stepX), sz=safeStep(stepZ);
      const nX=Math.min(5000, Math.max(1, Math.round(W/sx)));
      const nZ=Math.min(5000, Math.max(1, Math.round(L/sz)));
      const verts=[];
      const halfW=W/2, halfL=L/2;
      for(let i=0;i<=nX;i++){ const x=-halfW+i*sx; verts.push(x,0.0015,-halfL, x,0.0015,halfL); }
      for(let j=0;j<=nZ;j++){ const z=-halfL+j*sz; verts.push(-halfW,0.0015,z, halfW,0.0015,z); }
      const g=new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(verts,3));
      const m=new THREE.LineBasicMaterial({ color:0x4a4c50, transparent:true, opacity:0.28 });
      tileGrid=new THREE.LineSegments(g,m); scene.add(tileGrid);
    }

    // ---- Helpers ----
    function metersFrom(cm, groutMm){ return Math.max(0, safe(cm))/100 + Math.max(0, safe(groutMm))/1000; }
    function num(el, def){ return Math.max(0, safe(el?.value, def)); }

    // ---- Update scene ----
    async function update3D(L, W, tl, tw, groutMm, patternVal){
      if (floorMesh) {
        scene.remove(floorMesh);
        floorMesh.geometry?.dispose?.();
        (Array.isArray(floorMesh.material)?floorMesh.material:[floorMesh.material]).forEach(mm=>mm?.dispose?.());
      }

      const geo = new THREE.PlaneGeometry(W, L);
      geo.rotateX(-Math.PI/2);

      const unitX = safeStep(metersFrom(tw, groutMm));
      const unitZ = safeStep(metersFrom(tl, groutMm));
      const repeatX = Math.max(EPS, W/unitX);
      const repeatY = Math.max(EPS, L/unitZ);
      const rotation = (patternVal==='diagonal') ? Math.PI/4 : 0;

      if (currentMaps.diffuse)   prepTex(currentMaps.diffuse,   repeatX, repeatY, rotation, true);
      if (currentMaps.normal)    prepTex(currentMaps.normal,    repeatX, repeatY, rotation, false);
      if (currentMaps.roughness) prepTex(currentMaps.roughness, repeatX, repeatY, rotation, false);

      const mat = new THREE.MeshStandardMaterial({
        color: currentMaps.diffuse ? 0xffffff : 0x2a2b2f,
        map: currentMaps.diffuse || makeChecker(),
        normalMap: currentMaps.normal || null,
        roughnessMap: currentMaps.roughness || null,
        roughness: currentMaps.roughness ? undefined : 0.7,
        metalness: 0.06,
        envMapIntensity: 0.4
      });

      floorMesh = new THREE.Mesh(geo, mat);
      floorMesh.receiveShadow = true;
      scene.add(floorMesh);

      rebuildTileGrid(L, W, unitX, unitZ);
    }

 // ─ Helpers za formatiranje
function fmtRSD(n) { return n.toLocaleString('sr-RS') + ' RSD'; }
function numOr(el, def){ const v = parseFloat(el?.value); return Number.isFinite(v) ? v : def; }

// *** ZAMENA: kompletna kalkulacija + render + 3D update ***
async function updateCalcAndView() {
  // Ulaz
  const Lm     = Math.max(0.5, numOr(ui.len, 5));    // dužina sobe (m)
  const Wm     = Math.max(0.5, numOr(ui.wid, 4));    // širina sobe (m)
  const tLenCm = Math.max(1,   numOr(ui.tlen, 60));  // dužina pločice (cm)
  const tWidCm = Math.max(1,   numOr(ui.twid, 60));  // širina pločice (cm)
  const groutMm= Math.max(0,   numOr(ui.grout, 2));  // fuga (mm) – utiče samo na 3D prikaz
  const wasteP = Math.max(0,   numOr(ui.waste, 8));  // % otpada
  const price  = Math.max(0,   numOr(ui.priceM2, 3500)); // cena po m² (RSD)
  const perBox = Math.max(1,   Math.floor(numOr(ui.perBox, 6))); // kom u paketu

  // Površina
  const area = Lm * Wm; // m²

  // Pločica – račun za komad: koristimo realnu površinu pločice (cm->m),
  // *ne* smanjujemo zbog fuge (u praksi to je zanemarljivo)
  const tileArea = (tLenCm/100) * (tWidCm/100); // m² po pločici

  // Osnovna metoda: broj pločica = (površina / površina pločice) uz otpad
  const baseTiles = Math.ceil(area / tileArea);
  const tilesNeeded = Math.ceil(baseTiles * (1 + wasteP / 100));

  // Pakovanja i cena
  const boxes = Math.ceil(tilesNeeded / perBox);
  const cost  = Math.round(area * price); // obračun po m²

  // Render rezultata
  if (ui.oArea)  ui.oArea.textContent  = area.toFixed(2) + ' m²';
  if (ui.oTiles) ui.oTiles.textContent = tilesNeeded.toLocaleString('sr-RS');
  if (ui.oBoxes) ui.oBoxes.textContent = boxes.toString();
  if (ui.oCost)  ui.oCost.textContent  = fmtRSD(cost);

  // Update 3D (fuge utiču na raspored, ne na račun)
  const patt = (ui.pattern && ui.pattern.value) || 'straight';
  await update3D(Lm, Wm, tLenCm, tWidCm, groutMm, patt);
}

// (preporuka) odmah reaguj i na promenu inputa, ne samo na "Izračunaj"
['roomLen','roomWid','tileLen','tileWid','grout','waste','priceM2','perBox','pattern']
  .forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => { updateCalcAndView(); });
  });

// i dalje zadrži:
ui.calc && ui.calc.addEventListener('click', updateCalcAndView);


    ui.calc && ui.calc.addEventListener('click', updateCalcAndView);
    window.addEventListener('resize', ()=>{
      camera.aspect = ui.viewer.clientWidth / ui.viewer.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(ui.viewer.clientWidth, ui.viewer.clientHeight);
    });

    // ---- Animacija (blagi showroom orbit) ----
    function animate(){
      requestAnimationFrame(animate);
      // poluprečnik prema dimenziji sobe da kamera ostane blizu
      const L = Math.max(0.5, Number(ui.len?.value)||5);
      const W = Math.max(0.5, Number(ui.wid?.value)||4);
      const r = 0.48 * Math.min(L, W);
      angle += 0.003;
      camera.position.x = Math.sin(angle) * r;
      camera.position.z = Math.cos(angle) * r;
      camera.position.y = 2.4;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    }

    // Init: prikaži scenu + default materijal
    await updateCalcAndView();
    const def = tileData.find(t=>t.name==='Modern Stone') || tileData[0];
    if (def?.textures){ await setMaps(def.textures); await updateCalcAndView(); }

    // Public API (ako želiš da menjaš teksture iz drugih skripti/konzole)
    window.CeramiLuxPlanner = {
      async setTileByName(name){ const t = tileData.find(x=>x.name===name); if(!t) return; await setMaps(t.textures); await updateCalcAndView(); },
      async setTileMaps(urls){ await setMaps(urls); await updateCalcAndView(); },
      async setTexture(url){ await setMaps({ diffuse:url }); await updateCalcAndView(); },
      update: updateCalcAndView
    };

    animate();
  }
})();
