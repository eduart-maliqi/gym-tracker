// Generates PWA icons (dumbbell on dark background) into public/
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="100" fill="#09090b"/>
  <g stroke="#10b981" stroke-linecap="round">
    <line x1="150" y1="256" x2="362" y2="256" stroke-width="28"/>
    <rect x="118" y="166" width="52" height="180" rx="18" fill="#10b981" stroke="none"/>
    <rect x="342" y="166" width="52" height="180" rx="18" fill="#10b981" stroke="none"/>
    <rect x="66" y="196" width="40" height="120" rx="14" fill="#34d399" stroke="none"/>
    <rect x="406" y="196" width="40" height="120" rx="14" fill="#34d399" stroke="none"/>
  </g>
</svg>`;

mkdirSync("public", { recursive: true });
const buf = Buffer.from(svg);
await sharp(buf).resize(192, 192).png().toFile("public/icon-192.png");
await sharp(buf).resize(512, 512).png().toFile("public/icon-512.png");
await sharp(buf).resize(180, 180).png().toFile("public/apple-touch-icon.png");
console.log("Icons generated.");
