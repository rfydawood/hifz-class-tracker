const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const CORE = 'C:/Users/Rafaye/AppData/Roaming/npm/node_modules/@bubblewrap/cli/node_modules/@bubblewrap/core';
const { TwaManifest, TwaGenerator, KeyTool, JdkHelper, Config, ConsoleLog } = require(CORE);

const MANIFEST_URL = 'https://rfydawood.github.io/hifz-class-tracker/manifest.json';
const targetDirectory = __dirname;

async function main() {
  const twaManifest = await TwaManifest.fromWebManifest(MANIFEST_URL);

  twaManifest.packageId = 'com.hifztracker.app';
  twaManifest.launcherName = 'Hifz Tracker';
  twaManifest.appVersionCode = 1;
  twaManifest.appVersionName = '1.0';
  twaManifest.signingKey.path = path.join(targetDirectory, 'android.keystore');
  twaManifest.signingKey.alias = 'android';
  twaManifest.generatorApp = 'bubblewrap-cli';

  console.log('Resolved config:');
  console.log('  host:', twaManifest.host);
  console.log('  startUrl:', twaManifest.startUrl);
  console.log('  name:', twaManifest.name);
  console.log('  launcherName:', twaManifest.launcherName);
  console.log('  packageId:', twaManifest.packageId);
  console.log('  display:', twaManifest.display);
  console.log('  orientation:', twaManifest.orientation);
  console.log('  themeColor:', twaManifest.themeColor.hex());
  console.log('  backgroundColor:', twaManifest.backgroundColor.hex());
  console.log('  iconUrl:', twaManifest.iconUrl);
  console.log('  maskableIconUrl:', twaManifest.maskableIconUrl);

  await twaManifest.saveToFile(path.join(targetDirectory, 'twa-manifest.json'));

  const twaGenerator = new TwaGenerator();
  const log = new ConsoleLog('generate');
  await twaGenerator.createTwaProject(targetDirectory, twaManifest, log, () => {});

  const manifestContents = await fs.promises.readFile(path.join(targetDirectory, 'twa-manifest.json'));
  const sum = crypto.createHash('sha1').update(manifestContents).digest('hex');
  await fs.promises.writeFile(path.join(targetDirectory, 'manifest-checksum.txt'), sum);

  // Signing key: generate a strong random password and create the keystore.
  const config = new Config(
    'C:\\Program Files\\Microsoft\\jdk-17.0.20.101-hotspot',
    'C:\\Users\\Rafaye\\android-sdk'
  );
  const jdkHelper = new JdkHelper(process, config);
  const keytool = new KeyTool(jdkHelper);
  const keystorePassword = crypto.randomBytes(12).toString('base64').replace(/[/+=]/g, 'x');
  const keyPassword = keystorePassword;

  if (!fs.existsSync(twaManifest.signingKey.path)) {
    await keytool.createSigningKey({
      fullName: 'Hifz Class Tracker',
      organizationalUnit: 'Education',
      organization: 'Hifz Class Tracker',
      country: 'US',
      password: keystorePassword,
      keypassword: keyPassword,
      alias: twaManifest.signingKey.alias,
      path: twaManifest.signingKey.path,
    });
    fs.writeFileSync(path.join(targetDirectory, 'KEYSTORE_PASSWORD_KEEP_SAFE.txt'),
      `Keystore file: android.keystore\nAlias: android\nKeystore password: ${keystorePassword}\nKey password: ${keyPassword}\n\nKeep this safe and private. You need this exact file and password to publish app UPDATES later (including to Google Play). If lost, you cannot update this app under the same identity ever again.\n`);
  }

  console.log('DONE');
}

main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
