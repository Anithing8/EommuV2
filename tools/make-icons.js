// Draws the Eommu icon (a pressed button holding a lit check) and renders PNGs with sharp.
const sharp = require('/opt/npm-tools/node_modules/sharp');
const fs = require('fs');
const svg = ({ rx, scale }) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e6e9ea"/><stop offset="1" stop-color="#bcc2c4"/></linearGradient>
  <linearGradient id="well" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a9b0b3"/><stop offset="1" stop-color="#e4e7e8"/></linearGradient>
  <radialGradient id="face" cx=".62" cy=".68" r=".85"><stop offset="0" stop-color="#cfd5d7"/><stop offset="1" stop-color="#bcc3c6"/></radialGradient>
  <filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="9"/></filter>
  <filter id="glow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="14"/></filter>
</defs>
<rect width="512" height="512" rx="${rx}" fill="url(#bg)"/>
<g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
  <circle cx="256" cy="262" r="170" fill="#16202b" opacity=".28" filter="url(#soft)"/>
  <circle cx="260" cy="262" r="166" fill="#ffffff" opacity=".8"/>
  <circle cx="256" cy="256" r="166" fill="url(#well)"/>
  <circle cx="256" cy="256" r="166" fill="none" stroke="#16202b" stroke-opacity=".18" stroke-width="3"/>
  <circle cx="256" cy="256" r="134" fill="url(#face)"/>
  <circle cx="256" cy="256" r="134" fill="none" stroke="#16202b" stroke-opacity=".16" stroke-width="2"/>
  <path d="M192 262 l47 47 l86 -102" fill="none" stroke="#f0a31c" stroke-width="44" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)" opacity=".85"/>
  <path d="M192 262 l47 47 l86 -102" fill="none" stroke="#ffb52e" stroke-width="34" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M192 262 l47 47 l86 -102" fill="none" stroke="#ffe3a1" stroke-opacity=".7" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" transform="translate(-3 -4)"/>
</g></svg>`;
(async () => {
  fs.mkdirSync('icons', { recursive: true });
  const round = svg({ rx: 112, scale: 1 }), full = svg({ rx: 0, scale: 0.74 });
  fs.writeFileSync('icons/icon.svg', round);
  const png = (s, size, out) => sharp(Buffer.from(s)).resize(size, size).png().toFile(out);
  await png(round, 192, 'icons/icon-192.png');
  await png(round, 512, 'icons/icon-512.png');
  await png(full, 512, 'icons/icon-maskable-512.png');
  await png(full, 180, 'icons/apple-touch-icon.png');
  console.log('icons written');
})();
