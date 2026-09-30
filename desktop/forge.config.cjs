// Electron Forge: macOS DMG (built on macOS), Windows Squirrel Setup.exe (built on Windows), plus zips.
// The game (../dist) and the room server (../lan) are copied into ./game before packaging, so the
// desktop build ships exactly the same client and server code as the web package.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function copyGame() {
  const out = path.join(__dirname, 'game');
  fs.rmSync(out, { recursive: true, force: true });
  fs.cpSync(path.join(root, 'dist'), path.join(out, 'dist'), { recursive: true });
  fs.mkdirSync(path.join(out, 'lan'), { recursive: true });
  for (const f of ['room.mjs', 'server.mjs', 'world.json']) fs.copyFileSync(path.join(root, 'lan', f), path.join(out, 'lan', f));
  fs.writeFileSync(path.join(out, 'package.json'), JSON.stringify({ type: 'module', private: true }));
}

module.exports = {
  packagerConfig: {
    name: 'Infra Simulator',
    executableName: 'infra-simulator',
    appBundleId: 'com.infrasimulator.game',
    appCategoryType: 'public.app-category.simulation-games',
    icon: path.join(__dirname, 'assets', 'icon'),
    asar: false, // ES modules of the game and room are imported from disk
    ignore: [/^\/out($|\/)/, /^\/tools($|\/)/, /^\/README/],
    // Signing / notarization only when credentials are provided (CI secrets); otherwise unsigned.
    ...(process.env.APPLE_ID ? { osxSign: {}, osxNotarize: { appleId: process.env.APPLE_ID, appleIdPassword: process.env.APPLE_APP_PASSWORD, teamId: process.env.APPLE_TEAM_ID } } : {})
  },
  hooks: { generateAssets: async () => copyGame() },
  makers: [
    { name: '@electron-forge/maker-dmg', platforms: ['darwin'], config: { name: 'Infra Simulator', icon: path.join(__dirname, 'assets', 'icon.icns'), format: 'ULFO' } },
    { name: '@electron-forge/maker-squirrel', platforms: ['win32'], config: { name: 'infra_simulator', setupExe: 'InfraSimulator-Setup.exe', setupIcon: path.join(__dirname, 'assets', 'icon.ico'), ...(process.env.WINDOWS_CERTIFICATE_FILE ? { certificateFile: process.env.WINDOWS_CERTIFICATE_FILE, certificatePassword: process.env.WINDOWS_CERTIFICATE_PASSWORD } : {}) } },
    { name: '@electron-forge/maker-zip', platforms: ['darwin', 'win32'] }
  ]
};
