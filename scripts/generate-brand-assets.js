const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const MINT_BG = '#F0FDF4';

// Base SVG graphic representing the house + housekeeper (artwork confirmed 1:1 match)
const INNER_GRAPHIC = `
  <rect x="110" y="848" width="820" height="22" rx="11" fill="#15803D" opacity="0.22"/>
  <!-- house -->
  <rect x="520" y="270" width="64" height="150" rx="10" fill="#15803D"/>
  <rect x="170" y="470" width="460" height="380" rx="26" fill="#22C55E"/>
  <polygon points="130,492 400,236 670,492" fill="#15803D" stroke="#15803D" stroke-width="36" stroke-linejoin="round"/>
  <rect x="245" y="640" width="124" height="210" rx="16" fill="#FFFFFF"/>
  <circle cx="345" cy="750" r="10" fill="#22C55E"/>
  <rect x="435" y="560" width="134" height="134" rx="18" fill="#FFFFFF"/>
  <rect x="496" y="560" width="12" height="134" fill="#22C55E"/>
  <rect x="435" y="621" width="134" height="12" fill="#22C55E"/>
  <!-- broom -->
  <line x1="892" y1="470" x2="892" y2="785" stroke="#92400E" stroke-width="16" stroke-linecap="round"/>
  <polygon points="862,780 922,780 940,850 844,850" fill="#FBBF24" stroke="#FBBF24" stroke-width="10" stroke-linejoin="round"/>
  <!-- housekeeper -->
  <path d="M714 578 h92 a34 34 0 0 1 34 30 l26 242 h-212 l26 -242 a34 34 0 0 1 34 -30 z" fill="#0F766E"/>
  <line x1="712" y1="612" x2="686" y2="704" stroke="#0F766E" stroke-width="34" stroke-linecap="round"/>
  <line x1="808" y1="612" x2="884" y2="664" stroke="#0F766E" stroke-width="34" stroke-linecap="round"/>
  <circle cx="684" cy="710" r="20" fill="#FCD9B6"/>
  <circle cx="888" cy="666" r="20" fill="#FCD9B6"/>
  <path d="M724 626 h72 l16 196 a12 12 0 0 1 -12 13 h-80 a12 12 0 0 1 -12 -13 z" fill="#FFFFFF"/>
  <circle cx="760" cy="424" r="32" fill="#3F2A1D"/>
  <circle cx="760" cy="502" r="64" fill="#FCD9B6"/>
  <path d="M696 502 a64 64 0 0 1 128 0 q-22 -44 -64 -44 q-42 0 -64 44 z" fill="#3F2A1D"/>
  <circle cx="738" cy="510" r="7" fill="#3F2A1D"/>
  <circle cx="782" cy="510" r="7" fill="#3F2A1D"/>
  <path d="M740 534 q20 18 40 0" fill="none" stroke="#3F2A1D" stroke-width="7" stroke-linecap="round"/>
`;

// Icon SVG with rounded rectangle (for standalone icons, favicons, etc.)
function getIconSvg(size, rx = 224, fullBleed = false) {
  const bgRect = fullBleed 
    ? `<rect width="1024" height="1024" fill="${MINT_BG}"/>`
    : `<rect width="1024" height="1024" rx="${rx}" fill="${MINT_BG}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  ${bgRect}
  <g transform="translate(512 512) scale(1.1) translate(-525 -545)">
    ${INNER_GRAPHIC}
  </g>
</svg>`;
}

// Lockup ngang SVG for Admin: 520x120 viewBox
// Left: 120x120 rounded icon. Right: "Green House" bold + "Admin Portal" secondary
function getAdminLockupSvg(width = 560, height = 120) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 560 120">
  <!-- Rounded Mint Icon on Left -->
  <g transform="translate(4, 4)">
    <rect width="112" height="112" rx="25" fill="${MINT_BG}"/>
    <g transform="translate(56, 56) scale(0.12) translate(-525 -545)">
      ${INNER_GRAPHIC}
    </g>
  </g>
  <!-- Text Lockup -->
  <text x="136" y="66" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="44" font-weight="900" fill="#0F172A" letter-spacing="-0.5">Green House</text>
  <text x="138" y="98" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="20" font-weight="600" fill="#64748B" letter-spacing="0.2">Admin Portal</text>
</svg>`;
}

// Lockup ngang SVG for Customer: 420x120 viewBox (WITHOUT "Admin Portal")
function getCustomerLockupSvg(width = 440, height = 120) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 440 120">
  <!-- Rounded Mint Icon on Left -->
  <g transform="translate(4, 4)">
    <rect width="112" height="112" rx="25" fill="${MINT_BG}"/>
    <g transform="translate(56, 56) scale(0.12) translate(-525 -545)">
      ${INNER_GRAPHIC}
    </g>
  </g>
  <!-- Text Lockup -->
  <text x="136" y="74" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="44" font-weight="900" fill="#0F172A" letter-spacing="-0.5">Green House</text>
</svg>`;
}

async function run() {
  console.log('Generating brand assets...');

  // 1. Mobile icon.png (1024x1024) - iOS standard icon: opaque solid #F0FDF4 background
  const icon1024Svg = getIconSvg(1024, 0, true);
  await sharp(Buffer.from(icon1024Svg))
    .resize(1024, 1024)
    .png()
    .toFile('apps/mobile/assets/images/icon.png');
  console.log('✓ apps/mobile/assets/images/icon.png (1024x1024, solid mint)');

  // 2. Mobile adaptive-icon.png (1024x1024)
  // Foreground: the rounded square icon placed inside the 432x432 safe zone centered in 1024x1024 canvas
  const roundedIcon412Buffer = await sharp(Buffer.from(getIconSvg(412, 92, false)))
    .resize(412, 412)
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: roundedIcon412Buffer,
        top: Math.round((1024 - 412) / 2),
        left: Math.round((1024 - 412) / 2),
      },
    ])
    .png()
    .toFile('apps/mobile/assets/images/adaptive-icon.png');
  console.log('✓ apps/mobile/assets/images/adaptive-icon.png (1024x1024 with 412x412 center)');

  // 3. Mobile splash.png (1242x2436 solid #F0FDF4 with centered icon)
  const splashIconBuffer = await sharp(Buffer.from(getIconSvg(380, 84, false)))
    .resize(380, 380)
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: 1242,
      height: 2436,
      channels: 4,
      background: { r: 240, g: 253, b: 244, alpha: 1 }, // #F0FDF4
    },
  })
    .composite([
      {
        input: splashIconBuffer,
        top: Math.round((2436 - 380) / 2),
        left: Math.round((1242 - 380) / 2),
      },
    ])
    .png()
    .toFile('apps/mobile/assets/images/splash.png');
  console.log('✓ apps/mobile/assets/images/splash.png (1242x2436 on #F0FDF4)');

  // 4. Mobile favicon.png (48x48)
  await sharp(Buffer.from(getIconSvg(48, 11, false)))
    .resize(48, 48)
    .png()
    .toFile('apps/mobile/assets/images/favicon.png');
  console.log('✓ apps/mobile/assets/images/favicon.png (48x48)');

  // 5. Mobile logo.png (512x512)
  await sharp(Buffer.from(getIconSvg(512, 114, false)))
    .resize(512, 512)
    .png()
    .toFile('apps/mobile/assets/images/logo.png');
  console.log('✓ apps/mobile/assets/images/logo.png (512x512)');

  // 6. Admin app/icon.svg (Vector rounded icon for Next.js App Router metadata icon)
  fs.writeFileSync('apps/admin/app/icon.svg', getIconSvg(1024, 224, false), 'utf8');
  console.log('✓ apps/admin/app/icon.svg (1024x1024 SVG)');

  // 7. Admin favicons (16x16, 32x32, 48x48, 180x180)
  await sharp(Buffer.from(getIconSvg(16, 4, false)))
    .resize(16, 16)
    .png()
    .toFile('apps/admin/public/favicon-16x16.png');
  await sharp(Buffer.from(getIconSvg(32, 7, false)))
    .resize(32, 32)
    .png()
    .toFile('apps/admin/public/favicon-32x32.png');
  await sharp(Buffer.from(getIconSvg(48, 11, false)))
    .resize(48, 48)
    .png()
    .toFile('apps/admin/public/favicon-48x48.png');
  await sharp(Buffer.from(getIconSvg(180, 40, false)))
    .resize(180, 180)
    .png()
    .toFile('apps/admin/public/apple-touch-icon.png');
  console.log('✓ apps/admin/public/favicon-{16,32,48}.png & apple-touch-icon.png (180x180)');

  // 8. Admin public/favicon.ico via Python Pillow
  execSync('python -c "from PIL import Image; im = Image.open(\'apps/admin/public/favicon-48x48.png\'); im.save(\'apps/admin/public/favicon.ico\', format=\'ICO\', sizes=[(16, 16), (32, 32), (48, 48)])"', { stdio: 'inherit' });
  console.log('✓ apps/admin/public/favicon.ico (multi-size: 16, 32, 48)');

  // 9. Admin horizontal lockup: apps/admin/public/logo.svg & apps/admin/public/logo.png
  const adminLockupSvg = getAdminLockupSvg(560, 120);
  fs.writeFileSync('apps/admin/public/logo.svg', adminLockupSvg, 'utf8');
  await sharp(Buffer.from(adminLockupSvg))
    .resize(560, 120)
    .png()
    .toFile('apps/admin/public/logo.png');
  console.log('✓ apps/admin/public/logo.svg & logo.png (Admin lockup ngang)');

  // 10. Customer horizontal lockup: apps/mobile/assets/images/customer-lockup.png (if needed)
  const custLockupSvg = getCustomerLockupSvg(440, 120);
  await sharp(Buffer.from(custLockupSvg))
    .resize(440, 120)
    .png()
    .toFile('apps/mobile/assets/images/customer-lockup.png');
  console.log('✓ apps/mobile/assets/images/customer-lockup.png (Customer lockup ngang)');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

