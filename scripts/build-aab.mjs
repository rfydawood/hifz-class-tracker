#!/usr/bin/env node
// Builds the Google Play App Bundle (.aab), signed with the Play UPLOAD key.
//
//   node scripts/build-aab.mjs              (or: npm run build:aab)
//   node scripts/build-aab.mjs --skip-sync  (don't run `npx cap sync android` first)
//
// This sits beside the normal APK flow (assembleRelease + zipalign + apksigner
// with android.keystore, for Firebase App Distribution), which is unchanged.
// Run `npm run build` first, exactly as for an APK, so www/ is current.
//
// The upload key is NOT the app signing key: Google re-signs the bundle with the
// app signing key (android.keystore, uploaded once via Play App Signing / PEPK).
// Nothing secret lives in this repo. The key and its password are found as:
//   HIFZ_UPLOAD_KEYSTORE       path to the keystore, else android-app/upload.keystore in
//                              this checkout, else in the main checkout (for git worktrees)
//   HIFZ_UPLOAD_KEY_ALIAS      default: "Alias:" line of the password file, else "upload"
//   HIFZ_UPLOAD_STORE_PASSWORD default: "Keystore password:" line of
//                              UPLOAD_KEY_PASSWORD_KEEP_SAFE.txt next to the keystore
// The password reaches jarsigner through an environment variable, never the command line.

import { existsSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CAP = path.join(ROOT, 'capacitor-app');
const ANDROID = path.join(CAP, 'android');
const isWin = process.platform === 'win32';
const skipSync = process.argv.includes('--skip-sync');

function fail(msg) {
  console.error(`\nbuild-aab.mjs: ${msg}\n`);
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  console.log(`> ${cmd} ${args.join(' ')}`);
  const r = spawnSync(isWin && cmd.includes(' ') ? `"${cmd}"` : cmd, args, { stdio: 'inherit', shell: isWin, ...opts });
  if (r.status !== 0) fail(`${cmd} failed (exit ${r.status})`);
}

// --- tools: JDK 21 and the Android SDK (defaults are this project's machine) ---
const env = { ...process.env };
const DEFAULT_JDK = 'C:\\Program Files\\Microsoft\\jdk-21.0.12.101-hotspot';
const DEFAULT_SDK = 'C:\\Users\\Rafaye\\android-sdk';
if (!env.JAVA_HOME && existsSync(DEFAULT_JDK)) env.JAVA_HOME = DEFAULT_JDK;
if (!env.ANDROID_HOME && !env.ANDROID_SDK_ROOT && existsSync(DEFAULT_SDK)) env.ANDROID_HOME = DEFAULT_SDK;
const jarsigner = env.JAVA_HOME
  ? path.join(env.JAVA_HOME, 'bin', isWin ? 'jarsigner.exe' : 'jarsigner')
  : 'jarsigner';

// --- version (for the output file name) ---
const gradle = readFileSync(path.join(ANDROID, 'app', 'build.gradle'), 'utf8');
const versionName = (gradle.match(/versionName\s+"([^"]+)"/) || [])[1];
const versionCode = (gradle.match(/versionCode\s+(\d+)/) || [])[1];
if (!versionName || !versionCode) fail('no versionName/versionCode in capacitor-app/android/app/build.gradle');

// --- upload key ---
function mainCheckoutRoot() {
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: ROOT, encoding: 'utf8' }).trim();
    return path.dirname(common);
  } catch { return null; }
}
let keystore = env.HIFZ_UPLOAD_KEYSTORE;
if (!keystore) {
  const candidates = [path.join(ROOT, 'android-app', 'upload.keystore')];
  const main = mainCheckoutRoot();
  if (main) candidates.push(path.join(main, 'android-app', 'upload.keystore'));
  keystore = candidates.find(existsSync);
}
if (!keystore || !existsSync(keystore)) {
  fail('upload key not found. Put it at android-app/upload.keystore (gitignored) or set HIFZ_UPLOAD_KEYSTORE.');
}
const pwFile = path.join(path.dirname(keystore), 'UPLOAD_KEY_PASSWORD_KEEP_SAFE.txt');
const pwText = existsSync(pwFile) ? readFileSync(pwFile, 'utf8') : '';
const field = (label) => ((pwText.match(new RegExp(`^${label}:[ \\t]*(.+?)\\s*$`, 'm')) || [])[1]);
const alias = env.HIFZ_UPLOAD_KEY_ALIAS || field('Alias') || 'upload';
const storePass = env.HIFZ_UPLOAD_STORE_PASSWORD || field('Keystore password');
if (!storePass) fail(`no upload key password: set HIFZ_UPLOAD_STORE_PASSWORD or add a "Keystore password:" line to ${pwFile}`);

// --- build ---
if (!skipSync) run('npx', ['cap', 'sync', 'android'], { cwd: CAP, env });
run(path.join(ANDROID, isWin ? 'gradlew.bat' : 'gradlew'), ['bundleRelease'], { cwd: ANDROID, env });

const outDir = path.join(ANDROID, 'app', 'build', 'outputs', 'bundle', 'release');
const unsigned = path.join(outDir, 'app-release.aab');
if (!existsSync(unsigned)) fail(`expected ${unsigned} after bundleRelease`);
const signed = path.join(outDir, `breaklog-${versionName}-${versionCode}.aab`);
rmSync(signed, { force: true });
copyFileSync(unsigned, signed);

// --- sign with the upload key (password via env var, not argv) ---
const signEnv = { ...env, HIFZ_AAB_STOREPASS: storePass };
const sign = spawnSync(jarsigner, [
  '-keystore', keystore,
  '-storepass:env', 'HIFZ_AAB_STOREPASS',
  '-sigalg', 'SHA256withRSA', '-digestalg', 'SHA-256',
  signed, alias,
], { env: signEnv, encoding: 'utf8' });
if (sign.status !== 0) fail(`jarsigner failed:\n${sign.stdout}${sign.stderr}`);

const verify = spawnSync(jarsigner, ['-verify', signed], { env, encoding: 'utf8' });
if (verify.status !== 0 || !/jar verified/i.test(verify.stdout)) {
  fail(`signature check failed:\n${verify.stdout}${verify.stderr}`);
}

console.log(`\nSigned with the upload key ("${alias}") and verified:\n  ${signed}`);
console.log(`v${versionName} (${versionCode}) - upload this to Play Console. It is NOT installable directly; use the APK flow for Firebase.`);
