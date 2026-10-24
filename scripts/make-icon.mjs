// Membuat ikon aplikasi & tray dari build/icon.svg.
// Jalankan: npm run icon
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = fs.readFileSync(path.join(root, 'build', 'icon.svg'));

const render = (size) => sharp(svg, { density: 384 }).resize(size, size).png().toBuffer();

const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngs = await Promise.all(sizes.map(render));

fs.writeFileSync(path.join(root, 'build', 'icon.png'), await render(512));
fs.writeFileSync(path.join(root, 'build', 'icon.ico'), await pngToIco(pngs));
fs.writeFileSync(path.join(root, 'src', 'assets', 'icon.png'), pngs[sizes.indexOf(256)]);
fs.writeFileSync(path.join(root, 'src', 'assets', 'tray.png'), pngs[sizes.indexOf(32)]);

console.log('Ikon dibuat: build/icon.ico, build/icon.png, src/assets/icon.png, src/assets/tray.png');
