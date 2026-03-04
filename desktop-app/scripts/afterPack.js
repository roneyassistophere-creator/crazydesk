/**
 * afterPack hook for electron-builder
 * 
 * Problem: electron-builder with `identity: null` (no code signing) leaves
 * the Electron framework binaries with their original signatures intact, but
 * the asar bundling modifies the app contents, invalidating those signatures.
 * macOS then reports the app as "damaged" because the signature doesn't match.
 *
 * Fix: Strip all existing signatures and re-apply an ad-hoc signature (`-`)
 * which tells macOS "this app is unsigned but structurally valid."
 * arm64 macOS requires at least an ad-hoc signature to run.
 */
const { execSync } = require('child_process');
const path = require('path');

exports.default = async function afterPack(context) {
  // Only run on macOS builds
  if (context.electronPlatformName !== 'darwin') return;

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  );

  console.log(`[afterPack] Fixing code signature for: ${appPath}`);

  try {
    // Step 1: Strip all existing (broken) signatures
    execSync(
      `codesign --remove-signature --deep "${appPath}"`,
      { stdio: 'inherit' }
    );
    console.log('[afterPack] Removed broken signatures');

    // Step 2: Ad-hoc sign (required for arm64 macOS)
    execSync(
      `codesign --force --deep --sign - "${appPath}"`,
      { stdio: 'inherit' }
    );
    console.log('[afterPack] Ad-hoc signed successfully');

    // Step 3: Verify
    execSync(
      `codesign --verify --deep --strict "${appPath}"`,
      { stdio: 'inherit' }
    );
    console.log('[afterPack] Signature verification passed ✓');
  } catch (err) {
    console.error('[afterPack] Code signing fix failed:', err.message);
    // Don't throw — let the build continue, the xattr workaround still works
  }
};
