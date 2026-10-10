#!/usr/bin/env node
/**
 * Gera modelos 3D ILUSTRATIVOS (GLB + USDZ) dos 30 pratos do cardápio de demonstração.
 *
 * - Construídos proceduralmente com primitivas do Three.js (licença MIT, sem dependência
 *   de arquivos de terceiros), em ESCALA REAL (metros), para uso em AR (WebXR, Scene
 *   Viewer, AR Quick Look).
 * - São representações estilizadas, NÃO reproduções fiéis dos pratos reais. Para operação
 *   real, substitua por modelos de fotogrametria pelo painel administrativo.
 *
 * Uso: npm run models:generate
 */
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { USDZExporter } from "three/examples/jsm/exporters/USDZExporter.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// --- Polyfill mínimo de FileReader para o GLTFExporter no Node -----------------
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buf) => { this.result = buf; this.onloadend?.({ target: this }); this.onload?.({ target: this }); });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = `data:${blob.type || "application/octet-stream"};base64,${Buffer.from(buf).toString("base64")}`;
      this.onloadend?.({ target: this }); this.onload?.({ target: this });
    });
  }
};

const OUT = path.resolve("public/models");
fs.mkdirSync(OUT, { recursive: true });

// --- Gerador pseudoaleatório determinístico --------------------------------------
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const rr = (a, b) => a + (b - a) * rand();

// --- Materiais -------------------------------------------------------------------
const matCache = new Map();
function mat(color, { rough = 0.7, metal = 0, opacity = 1, name } = {}) {
  const k = `${color}|${rough}|${metal}|${opacity}`;
  if (matCache.has(k)) return matCache.get(k);
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color), roughness: rough, metalness: metal,
    transparent: opacity < 1, opacity, name: name ?? `m_${color.replace("#", "")}`,
  });
  matCache.set(k, m);
  return m;
}
const M = {
  plate: () => mat("#f7f5f0", { rough: 0.25 }),
  plateRim: () => mat("#e9e4da", { rough: 0.3 }),
  wood: () => mat("#9a6a3c", { rough: 0.8 }),
  woodDark: () => mat("#6e4524", { rough: 0.85 }),
  glass: () => mat("#dfeef5", { rough: 0.05, opacity: 0.35 }),
  ice: () => mat("#eef8ff", { rough: 0.1, opacity: 0.55 }),
  bun: () => mat("#c9822f", { rough: 0.6 }),
  bunInside: () => mat("#e8c48a", { rough: 0.8 }),
  patty: () => mat("#4a2a18", { rough: 0.9 }),
  cheese: () => mat("#f2b632", { rough: 0.45 }),
  lettuce: () => mat("#5fa83a", { rough: 0.6 }),
  tomato: () => mat("#d63a2a", { rough: 0.45 }),
  onion: () => mat("#b9628e", { rough: 0.5 }),
  sesame: () => mat("#f3e6c6", { rough: 0.6 }),
  fries: () => mat("#f0c04a", { rough: 0.7 }),
  fried: () => mat("#c98a2e", { rough: 0.8 }),
  bacon: () => mat("#9e3b2c", { rough: 0.7 }),
  sauceRed: () => mat("#b3261e", { rough: 0.35 }),
  mozzarella: () => mat("#fbf6e8", { rough: 0.5 }),
  basil: () => mat("#2f7d32", { rough: 0.5 }),
  crust: () => mat("#d9a25b", { rough: 0.8 }),
  rice: () => mat("#f6f2e8", { rough: 0.9 }),
  meat: () => mat("#8c3b2a", { rough: 0.8 }),
  meatInside: () => mat("#c4554a", { rough: 0.7 }),
  fat: () => mat("#f1e3c8", { rough: 0.6 }),
  salmon: () => mat("#f08a5d", { rough: 0.5 }),
  grill: () => mat("#3b2416", { rough: 0.9 }),
  pasta: () => mat("#f2d27a", { rough: 0.6 }),
  bolognese: () => mat("#8a2f1c", { rough: 0.6 }),
  parmesan: () => mat("#f5eccf", { rough: 0.8 }),
  bread: () => mat("#d8a865", { rough: 0.85 }),
  cream: () => mat("#efe2c3", { rough: 0.6 }),
  mushroom: () => mat("#8b6a4f", { rough: 0.7 }),
  green: () => mat("#3d8b37", { rough: 0.6 }),
  carrot: () => mat("#ee7d22", { rough: 0.6 }),
  sweetPotato: () => mat("#f0a35e", { rough: 0.8 }),
  beans: () => mat("#5a3220", { rough: 0.5 }),
  lemon: () => mat("#e9e15c", { rough: 0.5 }),
  lime: () => mat("#6fbf3b", { rough: 0.5 }),
  white: () => mat("#fbfbf8", { rough: 0.3 }),
  can: () => mat("#c62828", { rough: 0.3, metal: 0.6 }),
  silver: () => mat("#c9ccd1", { rough: 0.25, metal: 0.9 }),
  cola: () => mat("#3a1a0c", { rough: 0.1, opacity: 0.85 }),
  orangeJuice: () => mat("#f7a21b", { rough: 0.2, opacity: 0.9 }),
  water: () => mat("#a8d8f0", { rough: 0.05, opacity: 0.4 }),
  beerBottle: () => mat("#5a2e0a", { rough: 0.15, opacity: 0.9 }),
  label: () => mat("#f2e7c9", { rough: 0.7 }),
  caipirinha: () => mat("#f3f1d6", { rough: 0.1, opacity: 0.55 }),
  tea: () => mat("#b5651d", { rough: 0.1, opacity: 0.8 }),
  peach: () => mat("#f6b26b", { rough: 0.5 }),
  coffee: () => mat("#3b2314", { rough: 0.2 }),
  crema: () => mat("#b07a45", { rough: 0.4 }),
  chocolate: () => mat("#3d2014", { rough: 0.55 }),
  vanilla: () => mat("#fbf0d0", { rough: 0.7 }),
  strawberry: () => mat("#f3a6b5", { rough: 0.7 }),
  flan: () => mat("#f3c85a", { rough: 0.35 }),
  caramel: () => mat("#a8561a", { rough: 0.2 }),
  berries: () => mat("#8e1b3a", { rough: 0.3 }),
  biscuit: () => mat("#b98a52", { rough: 0.9 }),
  cheesecake: () => mat("#fbf3df", { rough: 0.7 }),
  paper: () => mat("#c0392b", { rough: 0.8 }),
  paperWhite: () => mat("#f4f1ea", { rough: 0.9 }),
  bbq: () => mat("#5c1f12", { rough: 0.3 }),
  mayo: () => mat("#f7f0d4", { rough: 0.4 }),
  sausage: () => mat("#9c3a2c", { rough: 0.6 }),
  onionWhite: () => mat("#f2ead8", { rough: 0.5, opacity: 0.9 }),
};

// --- Helpers de geometria (unidades em metros) ------------------------------------
function mesh(geo, material, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.scale.set(sx, sy, sz);
  return m;
}
function lathe(points, material, opts, segments = 48) {
  return mesh(new THREE.LatheGeometry(points.map(([r, h]) => new THREE.Vector2(r, h)), segments), material, opts);
}
/** Prato raso: diâmetro em metros */
function plate(g, d = 0.27, color = M.plate()) {
  const r = d / 2;
  g.add(lathe([[0, 0], [r * 0.62, 0], [r * 0.66, 0.006], [r * 0.7, 0.008], [r * 0.96, 0.018], [r, 0.02], [r * 0.985, 0.022],
    [r * 0.94, 0.02], [r * 0.69, 0.011], [r * 0.6, 0.009], [0, 0.009]], color));
  return 0.009; // altura da superfície
}
function bowl(g, d = 0.18, h = 0.07, color = M.plate()) {
  const r = d / 2;
  g.add(lathe([[0, 0], [r * 0.45, 0], [r * 0.5, 0.008], [r * 0.85, h * 0.45], [r, h], [r * 0.95, h], [r * 0.8, h * 0.45], [r * 0.42, 0.012], [0, 0.012]], color));
  return { r, h };
}
function board(g, w = 0.34, d = 0.24, h = 0.02) {
  g.add(mesh(new RoundedBoxGeometry(w, h, d, 3, 0.006), M.wood(), { y: h / 2 }));
  return h;
}
function blob(material, r, opts = {}, detail = 2, noise = 0.15) {
  const geo = mergeVertices(new THREE.IcosahedronGeometry(r, detail));
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    v.multiplyScalar(1 + rr(-noise, noise));
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return mesh(geo, material, opts);
}
function disc(material, r, h, opts = {}, seg = 40) {
  return mesh(new THREE.CylinderGeometry(r, r, h, seg), material, opts);
}
function wavyDisc(material, r, h, amp, opts = {}) {
  const geo = new THREE.CylinderGeometry(r, r, h, 64, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 + amp * Math.sin(a * 9) + amp * 0.5 * Math.sin(a * 23);
    pos.setX(i, x * k); pos.setZ(i, z * k);
    pos.setY(i, pos.getY(i) + Math.sin(a * 7) * h * 0.8);
  }
  geo.computeVertexNormals();
  return mesh(geo, material, opts);
}
function dome(material, r, hScale, opts = {}) {
  const geo = new THREE.SphereGeometry(r, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2);
  return mesh(geo, material, { ...opts, sy: hScale });
}
function stick(material, w, l, opts = {}) {
  return mesh(new RoundedBoxGeometry(w, w, l, 2, w * 0.25), material, opts);
}
function leaf(material, len, wid, opts = {}) {
  return mesh(new THREE.SphereGeometry(1, 16, 8), material, { ...opts, sx: wid, sy: wid * 0.12, sz: len });
}
function scatter(g, n, radius, fn) {
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * radius;
    g.add(fn(Math.cos(a) * d, Math.sin(a) * d, i));
  }
}
function glassCup(g, r, h, liquidMat, liquidLevel = 0.8, bottom = 0.008) {
  g.add(lathe([[0, 0], [r * 0.85, 0], [r, h], [r * 0.95, h], [r * 0.8, bottom], [0, bottom]], M.glass()));
  const lh = (h - bottom) * liquidLevel;
  const rTop = r * 0.8 + (r * 0.95 - r * 0.8) * liquidLevel;
  g.add(mesh(new THREE.CylinderGeometry(rTop * 0.97, r * 0.8 * 0.97, lh, 40), liquidMat, { y: bottom + lh / 2 }));
  return bottom + lh;
}
function iceCubes(g, n, r, y) {
  for (let i = 0; i < n; i++) g.add(mesh(new RoundedBoxGeometry(0.022, 0.022, 0.022, 2, 0.004), M.ice(),
    { x: rr(-r, r), y: y + rr(-0.01, 0.005), z: rr(-r, r), rx: rand(), ry: rand(), rz: rand() }));
}

// --- Definição dos pratos ----------------------------------------------------------
const dishes = {
  burger(g, double = false) {
    const b = board(g);
    let y = b;
    g.add(dome(M.bun(), 0.058, 0.35, { y, rx: Math.PI, x: -0.04 })); // base invertida
    g.children.at(-1).position.y = y + 0.02;
    y += 0.02;
    const layers = double ? 2 : 1;
    for (let i = 0; i < layers; i++) {
      g.add(blob(M.patty(), 0.06, { x: -0.04, y: y + 0.011, sy: 0.2 }, 2, 0.06)); y += 0.022;
      g.add(mesh(new THREE.BoxGeometry(0.1, 0.003, 0.1), M.cheese(), { x: -0.04, y: y + 0.0015, ry: Math.PI / 4 })); y += 0.004;
      if (double) { for (let k = 0; k < 2; k++) g.add(mesh(new RoundedBoxGeometry(0.11, 0.004, 0.022, 2, 0.0015), M.bacon(), { x: -0.04, y: y + 0.002, z: -0.015 + k * 0.03, ry: rr(-0.3, 0.3) })); y += 0.005; }
    }
    if (!double) {
      g.add(disc(M.tomato(), 0.05, 0.007, { x: -0.04, y: y + 0.004 })); y += 0.008;
      g.add(disc(M.onion(), 0.045, 0.003, { x: -0.04, y: y + 0.0015 })); y += 0.003;
    }
    g.add(wavyDisc(M.lettuce(), 0.062, 0.004, 0.06, { x: -0.04, y: y + 0.003 })); y += 0.006;
    g.add(mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.008, 40), M.bunInside(), { x: -0.04, y: y + 0.004 })); y += 0.008;
    g.add(dome(M.bun(), 0.06, 0.62, { x: -0.04, y }));
    for (let i = 0; i < 28; i++) {
      const a = rand() * Math.PI * 2, d = rr(0.005, 0.045);
      const yy = y + 0.6 * Math.sqrt(Math.max(0, 0.06 ** 2 - d ** 2)) + 0.0005;
      g.add(mesh(new THREE.SphereGeometry(0.0025, 6, 4), M.sesame(), { x: -0.04 + Math.cos(a) * d, y: yy, z: Math.sin(a) * d, sx: 1, sy: 0.5, sz: 1.8, ry: rand() * 3 }));
    }
    for (let i = 0; i < 14; i++) g.add(stick(M.fries(), 0.01, rr(0.06, 0.085), { x: rr(0.07, 0.13), y: b + 0.006 + (i % 3) * 0.008, z: rr(-0.07, 0.07), ry: rand() * Math.PI }));
  },
  "burger-duplo"(g) { dishes.burger(g, true); },
  "pizza-margherita"(g) {
    const b = board(g, 0.32, 0.32, 0.018);
    g.add(disc(M.woodDark(), 0.155, 0.004, { y: b + 0.002 }, 64));
    const y = b + 0.004;
    g.add(disc(M.crust(), 0.125, 0.008, { y: y + 0.004 }, 64));
    g.add(mesh(new THREE.TorusGeometry(0.122, 0.011, 12, 64), M.crust(), { y: y + 0.01, rx: Math.PI / 2 }));
    g.add(disc(M.sauceRed(), 0.112, 0.003, { y: y + 0.0095 }, 64));
    scatter(g, 11, 0.085, (x, z) => blob(M.mozzarella(), 0.017, { x, z, y: y + 0.011, sy: 0.3 }, 2, 0.2));
    scatter(g, 7, 0.08, (x, z) => leaf(M.basil(), 0.013, 0.008, { x, z, y: y + 0.016, ry: rand() * 3 }));
  },
  parmegiana(g) {
    const y = plate(g, 0.3);
    g.add(mesh(new RoundedBoxGeometry(0.16, 0.018, 0.11, 3, 0.007), M.fried(), { x: -0.02, y: y + 0.009, ry: 0.2 }));
    g.add(mesh(new RoundedBoxGeometry(0.15, 0.004, 0.1, 3, 0.002), M.sauceRed(), { x: -0.02, y: y + 0.02, ry: 0.2 }));
    scatter(g, 9, 0.05, (x, z) => blob(M.mozzarella(), 0.02, { x: x - 0.02, z, y: y + 0.023, sy: 0.18 }, 2, 0.2));
    g.add(blob(M.rice(), 0.045, { x: 0.075, y: y + 0.005, z: 0.06, sy: 0.55 }, 3, 0.05));
    for (let i = 0; i < 10; i++) g.add(stick(M.fries(), 0.009, 0.06, { x: rr(0.05, 0.1), y: y + 0.005 + (i % 2) * 0.008, z: rr(-0.09, -0.03), ry: rand() * Math.PI }));
  },
  "risoto-cogumelos"(g) {
    const { h } = bowl(g, 0.26, 0.035);
    g.add(blob(M.cream(), 0.075, { y: 0.012, sy: 0.4 }, 3, 0.08));
    scatter(g, 12, 0.05, (x, z) => mesh(new THREE.CylinderGeometry(0.012, 0.008, 0.004, 12), M.mushroom(), { x, z, y: 0.037 + rr(0, 0.006), rx: rr(-0.5, 0.5), rz: rr(-0.5, 0.5) }));
    scatter(g, 10, 0.05, (x, z) => mesh(new THREE.BoxGeometry(0.008, 0.002, 0.008), M.parmesan(), { x, z, y: 0.042, ry: rand() * 3 }));
    scatter(g, 12, 0.055, (x, z) => mesh(new THREE.SphereGeometry(0.002, 6, 4), M.green(), { x, z, y: 0.042 }));
    void h;
  },
  picanha(g) {
    const b = board(g, 0.36, 0.26);
    for (let i = 0; i < 6; i++) {
      const x = -0.1 + i * 0.026;
      const s = new THREE.Group();
      s.add(mesh(new RoundedBoxGeometry(0.02, 0.05, 0.1, 2, 0.004), M.meatInside(), { y: 0.025 }));
      s.add(mesh(new RoundedBoxGeometry(0.021, 0.008, 0.101, 2, 0.003), M.fat(), { y: 0.052 }));
      s.add(mesh(new RoundedBoxGeometry(0.0205, 0.05, 0.004, 1, 0.001), M.meat(), { y: 0.025, z: 0.049 }));
      s.position.set(x, b, -0.03); s.rotation.z = -0.25; g.add(s);
    }
    g.add(blob(M.crust(), 0.04, { x: 0.1, y: b + 0.008, z: -0.04, sy: 0.35 }, 3, 0.1));
    const v = new THREE.Group();
    v.add(lathe([[0, 0], [0.03, 0], [0.038, 0.03], [0.035, 0.03], [0.027, 0.004], [0, 0.004]], M.plate()));
    scatter(v, 18, 0.025, (x, z, i) => mesh(new THREE.BoxGeometry(0.006, 0.006, 0.006), [M.tomato(), M.onionWhite(), M.green()][i % 3], { x, z, y: 0.022, ry: rand() }));
    v.position.set(0.1, b, 0.07); g.add(v);
  },
  salmao(g) {
    const y = plate(g, 0.28);
    g.add(mesh(new RoundedBoxGeometry(0.13, 0.03, 0.07, 3, 0.01), M.salmon(), { x: -0.02, y: y + 0.015, ry: -0.3 }));
    for (let i = 0; i < 4; i++) g.add(mesh(new THREE.BoxGeometry(0.004, 0.002, 0.075), M.grill(), { x: -0.06 + i * 0.026, y: y + 0.031, ry: -0.3 + 0.8 }));
    g.add(blob(M.sweetPotato(), 0.04, { x: 0.07, y: y + 0.005, z: 0.05, sy: 0.5 }, 3, 0.06));
    for (let i = 0; i < 4; i++) {
      const bx = rr(-0.02, 0.06), bz = rr(-0.1, -0.06);
      g.add(mesh(new THREE.CylinderGeometry(0.005, 0.006, 0.02, 8), M.green(), { x: bx, y: y + 0.01, z: bz }));
      g.add(blob(M.green(), 0.014, { x: bx, y: y + 0.024, z: bz, sy: 0.8 }, 1, 0.25));
    }
    for (let i = 0; i < 6; i++) g.add(disc(M.carrot(), 0.009, 0.004, { x: rr(0.03, 0.09), y: y + 0.004, z: rr(-0.05, 0.0) }, 16));
  },
  spaghetti(g) {
    const y = plate(g, 0.28);
    for (let i = 0; i < 60; i++) {
      const r = rr(0.02, 0.07), a0 = rand() * Math.PI * 2;
      const curve = new THREE.CatmullRomCurve3(Array.from({ length: 8 }, (_, k) => {
        const a = a0 + k * 0.6;
        return new THREE.Vector3(Math.cos(a) * r * (1 - k * 0.03), y + 0.006 + rand() * 0.03 * (1 - r / 0.08), Math.sin(a) * r);
      }));
      g.add(mesh(new THREE.TubeGeometry(curve, 24, 0.0018, 5), M.pasta()));
    }
    g.add(blob(M.bolognese(), 0.035, { y: y + 0.035, sy: 0.45 }, 3, 0.15));
    scatter(g, 20, 0.03, (x, z) => mesh(new THREE.BoxGeometry(0.004, 0.002, 0.004), M.parmesan(), { x, z, y: y + 0.05 }));
    g.add(leaf(M.basil(), 0.015, 0.009, { x: 0.01, y: y + 0.052, ry: 0.6 }));
  },
  bruschetta(g) {
    const b = board(g, 0.32, 0.16);
    for (let i = 0; i < 4; i++) {
      const x = -0.105 + i * 0.07;
      g.add(mesh(new RoundedBoxGeometry(0.06, 0.016, 0.1, 3, 0.006), M.bread(), { x, y: b + 0.008, ry: 0.1 * (i % 2 ? 1 : -1) }));
      for (let k = 0; k < 12; k++) g.add(mesh(new THREE.BoxGeometry(0.009, 0.007, 0.009), M.tomato(), { x: x + rr(-0.02, 0.02), y: b + 0.02, z: rr(-0.04, 0.04), ry: rand() }));
      g.add(leaf(M.basil(), 0.014, 0.008, { x, y: b + 0.026, ry: rand() * 3 }));
    }
  },
  carpaccio(g) {
    const y = plate(g, 0.28);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      g.add(disc(M.meatInside(), 0.045, 0.002, { x: Math.cos(a) * 0.06, z: Math.sin(a) * 0.06, y: y + 0.001 + i * 0.0003 }));
    }
    scatter(g, 14, 0.03, (x, z) => leaf(M.green(), 0.016, 0.006, { x, z, y: y + 0.012, ry: rand() * 3, rx: rr(-0.4, 0.4) }));
    scatter(g, 10, 0.07, (x, z) => mesh(new THREE.BoxGeometry(0.014, 0.0015, 0.007), M.parmesan(), { x, z, y: y + 0.006, ry: rand() * 3 }));
    scatter(g, 14, 0.08, (x, z) => mesh(new THREE.SphereGeometry(0.0025, 6, 4), M.green(), { x, z, y: y + 0.004 }));
  },
  "bolinho-bacalhau"(g) {
    const y = plate(g, 0.24);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.add(blob(M.fried(), 0.018, { x: Math.cos(a) * 0.05, z: Math.sin(a) * 0.05, y: y + 0.016, sz: 1.5, ry: -a }, 2, 0.12));
    }
    g.add(mesh(new THREE.SphereGeometry(0.022, 16, 10, 0, Math.PI), M.lemon(), { y: y + 0.004, rx: -Math.PI / 2, sz: 0.5 }));
  },
  "salada-caesar"(g) {
    bowl(g, 0.22, 0.07);
    for (let i = 0; i < 22; i++) {
      const a = rand() * Math.PI * 2, d = rr(0, 0.065);
      g.add(leaf(M.lettuce(), 0.04, 0.02, { x: Math.cos(a) * d, z: Math.sin(a) * d, y: 0.045 + rand() * 0.03, rx: rr(-0.8, 0.8), ry: rand() * 3 }));
    }
    scatter(g, 10, 0.05, (x, z) => mesh(new RoundedBoxGeometry(0.013, 0.013, 0.013, 1, 0.003), M.bread(), { x, z, y: 0.08, ry: rand() }));
    scatter(g, 10, 0.05, (x, z) => mesh(new THREE.BoxGeometry(0.016, 0.0015, 0.008), M.parmesan(), { x, z, y: 0.085, ry: rand() * 3 }));
  },
  "caldo-feijao"(g) {
    const { r, h } = bowl(g, 0.15, 0.065);
    g.add(disc(M.beans(), r * 0.85, 0.004, { y: h * 0.75 }, 48));
    scatter(g, 12, r * 0.6, (x, z) => mesh(new THREE.BoxGeometry(0.007, 0.004, 0.007), M.bacon(), { x, z, y: h * 0.75 + 0.003, ry: rand() }));
    scatter(g, 18, r * 0.6, (x, z) => mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.003, 8), M.green(), { x, z, y: h * 0.75 + 0.003 }));
  },
  "batata-frita"(g) {
    g.add(lathe([[0, 0], [0.055, 0], [0.07, 0.09], [0.068, 0.09], [0.052, 0.004], [0, 0.004]], M.paper()));
    g.add(mesh(new THREE.CylinderGeometry(0.0705, 0.066, 0.02, 40, 1, true), M.paperWhite(), { y: 0.075 }));
    for (let i = 0; i < 40; i++) g.add(stick(M.fries(), 0.01, rr(0.08, 0.11), { x: rr(-0.035, 0.035), y: rr(0.07, 0.11), z: rr(-0.035, 0.035), rx: Math.PI / 2 + rr(-0.35, 0.35), rz: rr(-0.35, 0.35) }));
  },
  mandioca(g) {
    const y = plate(g, 0.26);
    for (let i = 0; i < 12; i++) g.add(stick(M.fries(), 0.022, rr(0.07, 0.1), { x: rr(-0.06, 0.03), y: y + 0.012 + (i % 3) * 0.015, z: rr(-0.05, 0.05), ry: rand() * Math.PI }));
    const c = new THREE.Group();
    c.add(lathe([[0, 0], [0.025, 0], [0.03, 0.025], [0.028, 0.025], [0.022, 0.004], [0, 0.004]], M.white()));
    c.add(disc(M.mayo(), 0.026, 0.004, { y: 0.02 }));
    c.position.set(0.075, y, 0.04); g.add(c);
  },
  calabresa(g) {
    const y = plate(g, 0.26);
    scatter(g, 22, 0.08, (x, z, i) => disc(M.sausage(), 0.017, 0.007, { x, z, y: y + 0.004 + (i % 3) * 0.006, rx: rr(-0.3, 0.3), rz: rr(-0.3, 0.3) }, 20));
    scatter(g, 12, 0.07, (x, z) => mesh(new THREE.TorusGeometry(0.014, 0.0025, 6, 20), M.onionWhite(), { x, z, y: y + 0.022, rx: Math.PI / 2 + rr(-0.4, 0.4) }));
  },
  "isca-frango"(g) {
    const y = plate(g, 0.26);
    for (let i = 0; i < 12; i++) g.add(blob(M.fried(), 0.02, { x: rr(-0.07, 0.03), y: y + 0.01 + (i % 3) * 0.012, z: rr(-0.06, 0.06), sx: 1.8, sy: 0.55, ry: rand() * 3 }, 1, 0.18));
    const c = new THREE.Group();
    c.add(lathe([[0, 0], [0.025, 0], [0.03, 0.025], [0.028, 0.025], [0.022, 0.004], [0, 0.004]], M.white()));
    c.add(disc(M.bbq(), 0.026, 0.004, { y: 0.02 }));
    c.position.set(0.075, y, 0.04); g.add(c);
  },
  "aneis-cebola"(g) {
    const y = plate(g, 0.26);
    for (let i = 0; i < 9; i++) {
      const a = rand() * Math.PI * 2, d = rr(0, 0.05);
      g.add(mesh(new THREE.TorusGeometry(rr(0.022, 0.03), 0.008, 10, 28), M.fried(), { x: Math.cos(a) * d, z: Math.sin(a) * d, y: y + 0.01 + i * 0.006, rx: Math.PI / 2 + rr(-0.3, 0.3), ry: rr(-0.3, 0.3) }));
    }
  },
  refrigerante(g) {
    const can = new THREE.Group();
    can.add(lathe([[0, 0], [0.026, 0], [0.033, 0.01], [0.033, 0.11], [0.027, 0.122], [0.027, 0.124], [0, 0.124]], M.can()));
    can.add(disc(M.silver(), 0.027, 0.003, { y: 0.1235 }));
    can.add(mesh(new THREE.CylinderGeometry(0.0332, 0.0332, 0.03, 40, 1, true), M.white(), { y: 0.06 }));
    can.position.x = -0.045; g.add(can);
    const lvl = glassCup(new THREE.Group(), 0, 0, M.cola());
    void lvl;
    const glass = new THREE.Group();
    const top = glassCup(glass, 0.038, 0.13, M.cola(), 0.75);
    iceCubes(glass, 4, 0.012, top - 0.01);
    glass.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.004, 24), M.lime(), { x: 0.02, y: 0.128, rx: 1.2 }));
    glass.position.x = 0.04; g.add(glass);
  },
  suco(g) {
    const top = glassCup(g, 0.04, 0.15, M.orangeJuice(), 0.85);
    iceCubes(g, 3, 0.012, top - 0.01);
    g.add(mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.2, 10), M.white(), { x: 0.012, y: 0.11, rz: 0.2 }));
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.005, 32, 1, false, 0, Math.PI), M.carrot(), { x: -0.035, y: 0.145, rz: Math.PI / 2, ry: 0.4 }));
  },
  agua(g) {
    const pts = [[0, 0], [0.032, 0], [0.034, 0.01], [0.033, 0.13], [0.03, 0.15], [0.014, 0.18], [0.013, 0.2], [0, 0.2]];
    g.add(lathe(pts, M.water()));
    g.add(disc(M.white(), 0.0145, 0.018, { y: 0.209 }, 24));
    g.add(mesh(new THREE.CylinderGeometry(0.0335, 0.0335, 0.06, 40, 1, true), M.label(), { y: 0.08 }));
  },
  cerveja(g) {
    const pts = [[0, 0], [0.03, 0], [0.031, 0.008], [0.031, 0.12], [0.028, 0.14], [0.013, 0.19], [0.012, 0.22], [0.013, 0.225], [0, 0.225]];
    g.add(lathe(pts, M.beerBottle()));
    g.add(disc(M.silver(), 0.0135, 0.008, { y: 0.226 }, 24));
    g.add(mesh(new THREE.CylinderGeometry(0.0315, 0.0315, 0.06, 40, 1, true), M.label(), { y: 0.07 }));
    g.add(mesh(new THREE.CylinderGeometry(0.0285, 0.026, 0.015, 40, 1, true), M.label(), { y: 0.135 }));
  },
  caipirinha(g) {
    const top = glassCup(g, 0.042, 0.09, M.caipirinha(), 0.85, 0.012);
    iceCubes(g, 6, 0.018, top - 0.012);
    for (let i = 0; i < 4; i++) g.add(mesh(new THREE.SphereGeometry(0.014, 12, 8, 0, Math.PI), M.lime(), { x: rr(-0.015, 0.015), y: 0.025 + i * 0.012, z: rr(-0.015, 0.015), rx: rand() * 3, sz: 0.6 }));
    g.add(mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.14, 10), M.white(), { x: 0.015, y: 0.08, rz: 0.25 }));
  },
  "cha-gelado"(g) {
    const top = glassCup(g, 0.04, 0.15, M.tea(), 0.82);
    iceCubes(g, 4, 0.012, top - 0.01);
    for (let i = 0; i < 4; i++) g.add(leaf(M.green(), 0.012, 0.007, { x: rr(-0.01, 0.01), y: top + 0.004, z: rr(-0.01, 0.01), ry: rand() * 3 }));
    g.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.006, 24, 1, false, 0, Math.PI), M.peach(), { x: -0.033, y: 0.145, rz: Math.PI / 2 }));
  },
  cafe(g) {
    g.add(lathe([[0, 0], [0.04, 0], [0.065, 0.008], [0.068, 0.012], [0.062, 0.011], [0.03, 0.006], [0, 0.006]], M.white()));
    const cup = [[0, 0.006], [0.02, 0.006], [0.022, 0.01], [0.032, 0.05], [0.03, 0.05], [0.02, 0.012], [0, 0.012]];
    g.add(lathe(cup, M.white()));
    g.add(disc(M.crema(), 0.029, 0.002, { y: 0.045 }));
    g.add(mesh(new THREE.TorusGeometry(0.012, 0.0035, 8, 20, Math.PI * 1.2), M.white(), { x: 0.036, y: 0.03, rz: -Math.PI * 0.6 }));
  },
  "petit-gateau"(g) {
    const y = plate(g, 0.24);
    g.add(blob(M.chocolate(), 0.04, { x: 0.035, y: y + 0.002, z: 0.02, sy: 0.08, sx: 1.3 }, 2, 0.1));
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.033, 0.04, 40), M.chocolate(), { x: -0.02, y: y + 0.02 }));
    g.add(dome(M.chocolate(), 0.03, 0.3, { x: -0.02, y: y + 0.04 }));
    g.add(blob(M.vanilla(), 0.026, { x: 0.05, y: y + 0.022, z: -0.03 }, 2, 0.08));
    scatter(g, 6, 0.02, (x, z) => mesh(new THREE.SphereGeometry(0.003, 6, 4), M.berries(), { x: x - 0.02, z, y: y + 0.05 }));
  },
  pudim(g) {
    const y = plate(g, 0.22);
    g.add(lathe([[0, 0], [0.06, 0], [0.058, 0.004], [0.045, 0.05], [0, 0.05]], M.flan(), { y }));
    g.add(lathe([[0, 0], [0.046, 0], [0.047, 0.004], [0, 0.006]], M.caramel(), { y: y + 0.049 }));
    g.add(disc(M.caramel(), 0.072, 0.002, { y: y + 0.001 }, 48));
    g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.012, 24, 1, true), M.white(), { y: y + 0.054, sy: 0.01 }));
  },
  brownie(g) {
    const y = plate(g, 0.22);
    g.add(mesh(new RoundedBoxGeometry(0.075, 0.035, 0.075, 3, 0.004), M.chocolate(), { y: y + 0.0175, ry: 0.4 }));
    scatter(g, 8, 0.025, (x, z) => blob(M.biscuit(), 0.005, { x, z, y: y + 0.036 }, 1, 0.3));
    g.add(blob(M.vanilla(), 0.026, { x: 0.05, y: y + 0.03, z: 0.04 }, 2, 0.08));
    g.add(mesh(new THREE.TorusGeometry(0.03, 0.002, 6, 40), M.chocolate(), { y: y + 0.037, rx: Math.PI / 2, sx: 1.1 }));
  },
  cheesecake(g) {
    const y = plate(g, 0.22);
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(0.11, -0.035); shape.absarc(0, 0, 0.116, -0.31, 0.31, false); shape.lineTo(0, 0);
    const crust = new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: false, curveSegments: 16 });
    const cream = new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, bevelSegments: 2, curveSegments: 16 });
    const top = new THREE.ExtrudeGeometry(shape, { depth: 0.006, bevelEnabled: false, curveSegments: 16 });
    g.add(mesh(crust, M.biscuit(), { x: -0.05, y: y, rx: -Math.PI / 2 }));
    g.add(mesh(cream, M.cheesecake(), { x: -0.05, y: y + 0.012, rx: -Math.PI / 2 }));
    g.add(mesh(top, M.berries(), { x: -0.05, y: y + 0.054, rx: -Math.PI / 2 }));
    for (let i = 0; i < 5; i++) g.add(mesh(new THREE.SphereGeometry(0.007, 10, 8), M.berries(), { x: -0.03 + i * 0.015, y: y + 0.066, z: rr(-0.01, 0.01) }));
  },
  sorvete(g) {
    g.add(lathe([[0, 0], [0.03, 0], [0.03, 0.005], [0.006, 0.01], [0.006, 0.05], [0.055, 0.075], [0.06, 0.1], [0.057, 0.1], [0.05, 0.08], [0, 0.07]], M.glass()));
    g.add(blob(M.vanilla(), 0.032, { x: -0.015, y: 0.1 }, 2, 0.07));
    g.add(blob(M.strawberry(), 0.03, { x: 0.02, y: 0.11, z: 0.01 }, 2, 0.07));
    for (let i = 0; i < 3; i++) g.add(mesh(new THREE.TorusGeometry(0.025 - i * 0.006, 0.0025, 6, 30), M.chocolate(), { y: 0.125 + i * 0.008, rx: Math.PI / 2 + 0.2 }));
    scatter(g, 14, 0.025, (x, z) => mesh(new THREE.BoxGeometry(0.004, 0.003, 0.004), M.biscuit(), { x, z, y: 0.14, ry: rand() }));
  },
};

// --- Exportação ---------------------------------------------------------------------
const gltf = new GLTFExporter();
const usdz = new USDZExporter();

async function exportDish(key, build) {
  seed = [...key].reduce((a, c) => a + c.charCodeAt(0), 7);
  const group = new THREE.Group();
  group.name = key;
  build(group);
  const scene = new THREE.Scene();
  scene.add(group);
  scene.updateMatrixWorld(true);

  const glb = await gltf.parseAsync(scene, { binary: true });
  fs.writeFileSync(path.join(OUT, `${key}.glb`), Buffer.from(glb));

  try {
    const u = await usdz.parseAsync(scene, { quickLookCompatible: true });
    fs.writeFileSync(path.join(OUT, `${key}.usdz`), Buffer.from(u));
  } catch (e) {
    console.warn(`  (USDZ não gerado para ${key}: ${e.message}. O model-viewer gera em tempo real no iOS.)`);
  }
  const size = fs.statSync(path.join(OUT, `${key}.glb`)).size;
  console.log(`✓ ${key.padEnd(18)} ${(size / 1024).toFixed(0)} KB`);
}

const only = process.argv.slice(2);
for (const [key, build] of Object.entries(dishes)) {
  if (only.length && !only.includes(key)) continue;
  await exportDish(key, build);
}
console.log(`\nModelos gerados em ${OUT}`);
