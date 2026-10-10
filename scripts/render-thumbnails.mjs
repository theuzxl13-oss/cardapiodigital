#!/usr/bin/env node
/**
 * Renderiza as imagens dos produtos a partir dos modelos 3D (public/models/*.glb)
 * usando Three.js num Chromium headless. Gera public/images/products/<key>.webp.
 * Uso: node scripts/render-thumbnails.mjs  (requer playwright-core e Chromium)
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const root = path.resolve(".");
const types = { ".js": "text/javascript", ".glb": "model/gltf-binary", ".html": "text/html" };
const page = `<!doctype html><html><body style="margin:0;background:#000">
<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
const W = 960, H = 720;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H); renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.82;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const pmrem = new THREE.PMREMGenerator(renderer);
window.render = async (key) => {
  const scene = new THREE.Scene();
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const bg = document.createElement("canvas"); bg.width = 2; bg.height = 256;
  const ctx = bg.getContext("2d"); const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#3a2a20"); g.addColorStop(1, "#15100c"); ctx.fillStyle = g; ctx.fillRect(0, 0, 2, 256);
  scene.background = new THREE.CanvasTexture(bg); scene.background.colorSpace = THREE.SRGBColorSpace;
  const gltf = await new GLTFLoader().loadAsync("/public/models/" + key + ".glb");
  const obj = gltf.scene;
  obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(obj);
  const box = new THREE.Box3().setFromObject(obj); const size = box.getSize(new THREE.Vector3()); const c = box.getCenter(new THREE.Vector3());
  const table = new THREE.Mesh(new THREE.CircleGeometry(2, 64), new THREE.MeshStandardMaterial({ color: "#5b3a24", roughness: 0.75 }));
  table.rotation.x = -Math.PI / 2; table.receiveShadow = true; scene.add(table);
  const sun = new THREE.DirectionalLight("#fff3e0", 2.2); sun.position.set(0.4, 1.2, 0.6); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); const s = 0.4; Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 0.1, far: 4 });
  scene.add(sun);
  const r = Math.max(size.x, size.z, size.y * 1.3);
  const cam = new THREE.PerspectiveCamera(32, W / H, 0.01, 10);
  cam.position.set(c.x + r * 0.15, c.y + r * 1.05, c.z + r * 1.75); cam.lookAt(c.x, c.y - size.y * 0.1, c.z);
  renderer.render(scene, cam);
  return renderer.domElement.toDataURL("image/webp", 0.86);
};
window.ready = true;
</script></body></html>`;

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  if (url === "/") { res.writeHead(200, { "content-type": "text/html" }); return res.end(page); }
  const file = path.join(root, url);
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const p = await browser.newPage({ viewport: { width: 960, height: 720 } });
p.on("console", (m) => m.type() === "error" && console.error(m.text()));
await p.goto(`http://localhost:${port}/`);
await p.waitForFunction(() => window.ready === true);
const outDir = path.join(root, "public/images/products");
fs.mkdirSync(outDir, { recursive: true });
const only = process.argv.slice(2);
for (const f of fs.readdirSync(path.join(root, "public/models")).filter((f) => f.endsWith(".glb"))) {
  const key = f.replace(".glb", "");
  if (only.length && !only.includes(key)) continue;
  const data = await p.evaluate((k) => window.render(k), key);
  fs.writeFileSync(path.join(outDir, `${key}.webp`), Buffer.from(data.split(",")[1], "base64"));
  console.log("✓", key);
}
await browser.close();
server.close();
