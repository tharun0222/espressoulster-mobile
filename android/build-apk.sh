#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
sdk=${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/Library/Android/sdk}}
build_tools="$sdk/build-tools/36.0.0"
platform="$sdk/platforms/android-36/android.jar"
java_bin=${JAVA_HOME:+$JAVA_HOME/bin/}
signing_dir=${ESPC_ANDROID_SIGNING_DIR:-"$HOME/.local/share/espressoulster/android-signing"}
signing_alias=${ESPC_ANDROID_KEY_ALIAS:-espressoulster}
build_mode=${ESPC_ANDROID_BUILD_MODE:-release}
staging_ca=${ESPC_ANDROID_STAGING_CA:-}
build_dir="$root/.tools/android-build"

case "$build_mode" in
  release)
    origin_input=${ESPC_ANDROID_STORE_ORIGIN:?Set ESPC_ANDROID_STORE_ORIGIN to the approved HTTPS backend.}
    keystore=${ESPC_ANDROID_KEYSTORE:?Set ESPC_ANDROID_KEYSTORE to the release keystore.}
    password_file=${ESPC_ANDROID_KEYSTORE_PASSWORD_FILE:?Set ESPC_ANDROID_KEYSTORE_PASSWORD_FILE to the release signing password file.}
    output=${1:-"$root/outputs/Espressoulster-Coffee-Android.apk"}
    ;;
  review)
    origin_input=${ESPC_ANDROID_STORE_ORIGIN:?Set ESPC_ANDROID_STORE_ORIGIN to the HTTPS review backend.}
    keystore=${ESPC_ANDROID_KEYSTORE:-"$signing_dir/espressoulster-test.p12"}
    password_file=${ESPC_ANDROID_KEYSTORE_PASSWORD_FILE:-"$signing_dir/keystore-password"}
    output=${1:-"$root/outputs/Espressoulster-Coffee-Android-review.apk"}
    ;;
  staging)
    origin_input=${ESPC_ANDROID_STORE_ORIGIN:-http://127.0.0.1:5176}
    keystore=${ESPC_ANDROID_KEYSTORE:-"$signing_dir/espressoulster-test.p12"}
    password_file=${ESPC_ANDROID_KEYSTORE_PASSWORD_FILE:-"$signing_dir/keystore-password"}
    output=${1:-"$root/outputs/Espressoulster-Coffee-Staging-v1.0.17.apk"}
    build_dir="$root/.tools/android-staging-build"
    ;;
  staging-https)
    origin_input=${ESPC_ANDROID_STORE_ORIGIN:?Set ESPC_ANDROID_STORE_ORIGIN to the approved public HTTPS staging backend.}
    keystore=${ESPC_ANDROID_KEYSTORE:-"$signing_dir/espressoulster-test.p12"}
    password_file=${ESPC_ANDROID_KEYSTORE_PASSWORD_FILE:-"$signing_dir/keystore-password"}
    output=${1:-"$root/outputs/Espressoulster-Coffee-Staging-v1.0.21.apk"}
    build_dir="$root/.tools/android-staging-build"
    ;;
  *)
    echo "Set ESPC_ANDROID_BUILD_MODE to release, review, staging, or staging-https." >&2
    exit 1
    ;;
esac

case "$output" in
  *.apk) gradle_task=assembleRelease ;;
  *.aab)
    if [[ "$build_mode" != release ]]; then
      echo "Only release mode builds a Play App Bundle." >&2
      exit 1
    fi
    gradle_task=bundleRelease
    ;;
  *) echo "Set an output filename ending in .apk or .aab." >&2; exit 1 ;;
esac

if [[ -n "$staging_ca" && "$build_mode" != staging-https ]]; then
  echo "ESPC_ANDROID_STAGING_CA is only supported for HTTPS staging APKs." >&2
  exit 1
fi

store_origin=$(node - "$origin_input" "$build_mode" <<'NODE'
const [input, mode] = process.argv.slice(2);
try {
  if (mode === 'staging') {
    if (input !== 'http://127.0.0.1:5176') throw new Error('staging origin');
    process.stdout.write(input);
    process.exit(0);
  }
  const url = new URL(input);
  const loopback = url.hostname === "localhost" || url.hostname.endsWith(".localhost")
    || url.hostname.startsWith("127.") || url.hostname === "[::1]";
  const temporary = url.hostname === "trycloudflare.com" || url.hostname.endsWith(".trycloudflare.com");
  const ngrok = /(?:^|\.)ngrok-free\.(?:dev|app)$/.test(url.hostname);
  if (!/^https:\/\/[^\s]+$/.test(input) || /[?#@\\]/.test(input) || url.protocol !== "https:"
      || url.username || url.password || url.pathname !== "/" || url.search || url.hash
      || (mode === "release" && (loopback || temporary))
      || (mode === "staging-https" && (loopback || temporary || ngrok))) throw new Error();
  process.stdout.write(url.origin);
} catch {
  process.stderr.write(mode === 'staging'
    ? "Staging requires http://127.0.0.1:5176 through the Android USB tunnel.\n"
    : "Set ESPC_ANDROID_STORE_ORIGIN to an HTTPS origin with no credentials, path, query, or fragment. Release builds require a permanent backend.\n");
  process.exitCode = 1;
}
NODE
)

if [[ ! -f "$keystore" || ! -f "$password_file" ]]; then
  echo "Provide an existing signing keystore and password file." >&2
  exit 1
fi

if [[ ! -x "$build_tools/aapt2" || ! -f "$platform" ]]; then
  echo "Install Android SDK platform 36 and build-tools 36.0.0, then set ANDROID_SDK_ROOT." >&2
  exit 1
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/res" "$work/classes" "$work/dex" "$(dirname "$output")"
mkdir -p "$work/generated"
cashfree_live=false
if [[ "$build_mode" == release ]]; then cashfree_live=true; fi
printf 'package com.espressoulster.coffee;\nfinal class StoreConfig {\n    static final String ORIGIN = "%s";\n    static final boolean CASHFREE_LIVE = %s;\n}\n' \
  "$store_origin" "$cashfree_live" > "$work/generated/StoreConfig.java"
cp -R "$root/android/res/." "$work/res/"
if [[ -n "${ESPC_ANDROID_FIREBASE_CONFIG:-}" ]]; then
  firebase_package=com.espressoulster.coffee
  if [[ "$build_mode" == staging || "$build_mode" == staging-https ]]; then
    firebase_package=com.espressoulster.coffee.staging
  fi
  node "$root/android/firebase-resources.mjs" "$ESPC_ANDROID_FIREBASE_CONFIG" "$firebase_package" "$work/res/values/firebase.xml"
fi
if [[ -n "$staging_ca" ]]; then
  if [[ ! -r "$staging_ca" ]] || ! openssl x509 -in "$staging_ca" -noout -checkend 0 >/dev/null; then
    echo "Set ESPC_ANDROID_STAGING_CA to a valid staging CA certificate in PEM format." >&2
    exit 1
  fi
  staging_host=$(node -e 'process.stdout.write(new URL(process.argv[1]).hostname)' "$store_origin")
  mkdir -p "$work/res/raw"
  openssl x509 -in "$staging_ca" -outform DER -out "$work/res/raw/staging_ca.der"
  cat > "$work/res/xml/staging_network_security.xml" <<EOF
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="false" />
    <domain-config cleartextTrafficPermitted="false">
        <domain includeSubdomains="false">$staging_host</domain>
        <trust-anchors>
            <certificates src="@raw/staging_ca" />
        </trust-anchors>
    </domain-config>
</network-security-config>
EOF
fi
if [[ "$build_mode" == staging || "$build_mode" == staging-https ]]; then
  sed -e 's/android:targetPackage="com.espressoulster.coffee"/android:targetPackage="com.espressoulster.coffee.staging"/' \
    "$root/android/res/xml/shortcuts.xml" > "$work/res/xml/shortcuts.xml"
fi
mkdir -p "$work/res/drawable-nodpi"
cp "$root/public/icon-512.png" "$work/res/drawable-nodpi/app_icon.png"
mkdir -p "$work/res/raw"
cp "$root/public/audio/order-alert-espresso-house.wav" "$work/res/raw/espresso_house_order.wav"
mkdir -p "$work/assets"
cp "$root/android/assets/"*.js "$work/assets/"
cp "$root/app/admin/admin-mobile.css" "$work/assets/admin-mobile.css"

gradle_bin=${ESPC_GRADLE_BIN:-"$root/.tools/gradle/gradle-8.11.1/bin/gradle"}
if [[ ! -x "$gradle_bin" ]]; then
  echo "Install Gradle 8.11.1 and set ESPC_GRADLE_BIN to its bin/gradle executable." >&2
  exit 1
fi
ANDROID_HOME="$sdk" ESPC_ANDROID_BUILD_MODE="$build_mode" ESPC_ANDROID_GENERATED="$work/generated" ESPC_ANDROID_RES="$work/res" \
  ESPC_ANDROID_ASSETS="$work/assets" "$gradle_bin" -p "$root/android" --no-daemon --console=plain "$gradle_task"

if [[ "$gradle_task" == bundleRelease ]]; then
  "${java_bin}jarsigner" -keystore "$keystore" -storepass:file "$password_file" -signedjar "$work/signed.aab" \
    "$build_dir/outputs/bundle/release/EspressoulsterAndroid-release.aab" "$signing_alias"
  "${java_bin}jarsigner" -verify "$work/signed.aab"
  mv "$work/signed.aab" "$output"
else
  cp "$build_dir/outputs/apk/release/EspressoulsterAndroid-release-unsigned.apk" "$work/unsigned.apk"
  "$build_tools/zipalign" -f -P 16 4 "$work/unsigned.apk" "$work/aligned.apk"
  "$build_tools/apksigner" sign --ks "$keystore" --ks-key-alias "$signing_alias" \
    --ks-pass "file:$password_file" --out "$work/signed.apk" "$work/aligned.apk"
  "$build_tools/zipalign" -c -P 16 4 "$work/signed.apk"
  "$build_tools/apksigner" verify --verbose "$work/signed.apk"
  mv "$work/signed.apk" "$output"
fi
echo "Android artifact: $output"
echo "Build mode: $build_mode"
echo "Backend origin: $store_origin"
shasum -a 256 "$output"
