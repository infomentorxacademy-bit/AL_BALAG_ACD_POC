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

module.exports = (config) => withCleartext(withComposePin(config));
