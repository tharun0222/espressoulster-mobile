#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
sdk=${ANDROID_SDK_ROOT:?Set ANDROID_SDK_ROOT}
serial=${ESPC_ANDROID_QA_SERIAL:?Set ESPC_ANDROID_QA_SERIAL to a disposable Android emulator}
[[ "$serial" =~ ^emulator-[0-9]+$ ]] || { echo 'Use a disposable emulator for this test.' >&2; exit 1; }
: "${JAVA_HOME:?Set JAVA_HOME}"
build="$sdk/build-tools/36.0.0"
platform="$sdk/platforms/android-36/android.jar"
signing=${ESPC_ANDROID_SIGNING_DIR:-"$HOME/.local/share/espressoulster/android-signing"}
artifact=${1:-"$root/outputs/Espressoulster-Coffee-Staging-v1.0.21.apk"}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir "$work/dex"
cat > "$work/AndroidManifest.xml" <<'XML'
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.espressoulster.coffee.qa">
    <uses-sdk android:minSdkVersion="26" android:targetSdkVersion="36" />
    <application android:label="Order alerts instrumentation" />
    <instrumentation android:name=".OrderPushInstrumentation" android:targetPackage="com.espressoulster.coffee.staging" />
</manifest>
XML
"$JAVA_HOME/bin/javac" --release 8 -cp "$platform" -d "$work" "$root/tests/android/OrderPushInstrumentation.java"
"$build/d8" --lib "$platform" --min-api 26 --output "$work/dex" "$work/com/espressoulster/coffee/qa/OrderPushInstrumentation.class"
"$build/aapt2" link -I "$platform" --manifest "$work/AndroidManifest.xml" -o "$work/test.apk"
(cd "$work/dex" && zip -q "$work/test.apk" classes.dex)
"$build/zipalign" -f -P 16 4 "$work/test.apk" "$work/aligned.apk"
"$build/apksigner" sign --ks "$signing/espressoulster-test.p12" --ks-key-alias espressoulster \
    --ks-pass "file:$signing/keystore-password" --out "$work/signed.apk" "$work/aligned.apk"
adb=("$sdk/platform-tools/adb" -s "$serial")
"${adb[@]}" install -r "$artifact"
"${adb[@]}" install -r "$work/signed.apk"
"${adb[@]}" shell pm grant com.espressoulster.coffee.staging android.permission.POST_NOTIFICATIONS
"${adb[@]}" shell am force-stop com.espressoulster.coffee.staging
result=$("${adb[@]}" shell am instrument -w -r com.espressoulster.coffee.qa/.OrderPushInstrumentation)
printf '%s\n' "$result"
[[ "$result" == *"PASS: Android posted customer and Admin alerts"* && "$result" == *"INSTRUMENTATION_CODE: -1"* ]]
