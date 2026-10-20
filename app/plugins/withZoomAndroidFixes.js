// Expo config plugin: Android fixes the Zoom Meeting SDK needs (applied on every `expo prebuild`).
//
// 1. Compose 1.9.4. Zoom's join screens are built against Jetpack Compose 1.9.4, but its POM only pulls
//    foundation/animation 1.8.1. That crashes on Join (NoSuchMethodError ...ToggleableKt.toggleable).
//    Gradle takes the highest requested version, so listing 1.9.4 here upgrades them.
// 2. Cleartext HTTP. The demo backend runs on a PC in the LAN (http://<ip>:8000). Zoom's manifest turns
//    cleartext off and ships its own network security config, which overrides ours unless we replace it.
//    Delete this once the backend is served over https.
const fs = require('fs');
const path = require('path');
const {
  withAppBuildGradle,
  withAndroidManifest,
  withDangerousMod,
  withGradleProperties,
} = require('@expo/config-plugins');

const COMPOSE = '1.9.4';
const MARKER = '// zoom-compose-pin';
const NSC_NAME = 'poc_network_security_config';

function withComposePin(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(MARKER)) {
      cfg.modResults.contents += `
${MARKER}
dependencies {
    implementation("androidx.compose.foundation:foundation:${COMPOSE}")
    implementation("androidx.compose.foundation:foundation-layout:${COMPOSE}")
    implementation("androidx.compose.animation:animation:${COMPOSE}")
    implementation("androidx.compose.animation:animation-core:${COMPOSE}")
    implementation("androidx.compose.material:material-ripple:${COMPOSE}")
}
`;
    }
    return cfg;
  });
}

function withCleartext(config) {
  config = withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    const app = manifest.application[0];
    app.$['android:usesCleartextTraffic'] = 'true';
    app.$['android:networkSecurityConfig'] = `@xml/${NSC_NAME}`;
    const replace = new Set((app.$['tools:replace'] || '').split(',').filter(Boolean));
    replace.add('android:usesCleartextTraffic');
    replace.add('android:networkSecurityConfig');
    app.$['tools:replace'] = [...replace].join(',');
    return cfg;
  });
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/res/xml');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, `${NSC_NAME}.xml`),
        `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
</network-security-config>
`,
      );
      return cfg;
    },
  ]);
}

// 3. Slim build (SLIM_BUILD=1): only 64-bit ARM phones (practically every phone since ~2017) and the native
//    libraries stored compressed inside the APK. Zoom's libraries are ~550 MB uncompressed across the four
//    CPU types; this keeps one and compresses it. Slower to install than the normal build is not an issue,
//    but it cannot run on 32-bit phones or on x86 emulators.
function withSlimBuild(config) {
  if (process.env.SLIM_BUILD !== '1') return config;
  // Zoom's code is 124 MB of .dex files; Android 9+ lets them be stored uncompressed, which is what Gradle
  // does by default. Compress them (about 124 -> 45 MB).
  config = withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes('// slim-dex')) {
      cfg.modResults.contents += `
// slim-dex
android {
    packaging {
        dex {
            useLegacyPackaging = true
        }
    }
}
`;
    }
    return cfg;
  });
  return withGradleProperties(config, (cfg) => {
    const set = (key, value) => {
      cfg.modResults = cfg.modResults.filter((p) => !(p.type === 'property' && p.key === key));
      cfg.modResults.push({ type: 'property', key, value });
    };
    set('reactNativeArchitectures', 'arm64-v8a');
    set('expo.useLegacyPackaging', 'true');
    return cfg;
  });
}

module.exports = (config) => withSlimBuild(withCleartext(withComposePin(config)));
