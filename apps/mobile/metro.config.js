const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');
const fs = require('fs');

// Check Goong REST API Key for address search with house numbers
const envPath = path.resolve(__dirname, '.env');
let goongKey = process.env.EXPO_PUBLIC_GOONG_API_KEY;
if (!goongKey && fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  const match = content.match(/^EXPO_PUBLIC_GOONG_API_KEY=(.+)$/m);
  if (match) goongKey = match[1].trim();
}

if (!goongKey || goongKey.length < 10 || goongKey.startsWith('eyJ') || goongKey.startsWith('{')) {
  throw new Error(
    '[METRO BUILD CHECK] EXPO_PUBLIC_GOONG_API_KEY is missing or invalid in apps/mobile/.env! Build aborted.',
  );
} else {
  console.log('✅ [METRO BUILD CHECK] EXPO_PUBLIC_GOONG_API_KEY is present and validated.');
}

let goongMapKey = process.env.EXPO_PUBLIC_GOONG_MAP_KEY;
if (!goongMapKey && fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  const match = content.match(/^EXPO_PUBLIC_GOONG_MAP_KEY=(.+)$/m);
  if (match) goongMapKey = match[1].trim();
}

if (!goongMapKey || goongMapKey.length < 10) {
  console.warn(
    '[METRO BUILD CHECK] EXPO_PUBLIC_GOONG_MAP_KEY is missing in apps/mobile/.env!',
  );
} else {
  console.log('✅ [METRO BUILD CHECK] EXPO_PUBLIC_GOONG_MAP_KEY is present and validated.');
}

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch shared packages within the monorepo
config.watchFolders = [path.resolve(monorepoRoot, 'packages')];

// 2. Let Metro know where to resolve packages and in what order
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

module.exports = withNativeWind(config, { input: './global.css' });
