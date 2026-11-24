package com.espressoulster.coffee;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.Signature;
import java.security.cert.Certificate;
import java.security.spec.ECGenParameterSpec;
import java.util.UUID;

final class AndroidAdminVerification {
    private AndroidAdminVerification() {}

    private static final class VerificationFailure extends IOException {
        final String code;
        VerificationFailure(String code, String message, Throwable cause) {
            super(message, cause);
            this.code = code;
        }
    }

    static String failureCode(Throwable failure) {
        return failure instanceof VerificationFailure ? ((VerificationFailure) failure).code : "network";
    }

    private static VerificationFailure failed(String code, Throwable cause) {
        String message = "device".equals(code) ? "This phone could not verify the app. Update Android and try again."
            : "session".equals(code) ? "Couldn’t save your sign-in. Restart the app and try again."
            : "Couldn’t reach sign-in. Check your internet connection and try again.";
        return new VerificationFailure(code, message, cause);
    }

    static final class Result {
        final boolean verified;
        final String cookie;

        Result(boolean verified, String cookie) {
            this.verified = verified;
            this.cookie = cookie;
        }
    }

    static Result verify(String origin, String cookies) throws Exception {
        String endpoint = origin + "api/auth/android-admin/";
        HttpURLConnection status = connect(endpoint + "status");
        boolean required;
        try {
            if (cookies != null) status.setRequestProperty("Cookie", cookies);
            JSONObject response = read(status);
            if (response.getBoolean("verified")) return new Result(true, null);
            required = response.getBoolean("required");
        } catch (Exception failure) {
            throw failed("network", failure);
        } finally {
            status.disconnect();
        }

        try {
            return new Result(true, attest(endpoint));
        } catch (Exception failure) {
            // During enrollment, the server still allows the normal staff login.
            if (required) throw failure;
            return new Result(false, null);
        }
    }

    private static String attest(String endpoint) throws Exception {
        HttpURLConnection request = connect(endpoint + "challenge");
        String challenge;
        try {
            challenge = read(request).getString("challenge");
        } catch (Exception failure) {
            throw failed("network", failure);
        } finally {
            request.disconnect();
        }
        if (!challenge.matches("[a-f0-9]{64}")) throw failed("network", null);

        byte[] nonce = new byte[32];
        for (int i = 0; i < nonce.length; i++) {
            nonce[i] = (byte) Integer.parseInt(challenge.substring(i * 2, i * 2 + 2), 16);
        }

        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        String alias = "espresso-admin-" + UUID.randomUUID();
        JSONObject proof = new JSONObject();
        try {
            KeyPairGenerator generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore");
            generator.initialize(new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN)
                .setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1"))
                .setDigests(KeyProperties.DIGEST_SHA256)
                .setAttestationChallenge(nonce)
                .build());
            KeyPair pair = generator.generateKeyPair();
            JSONArray chain = new JSONArray();
            for (Certificate certificate : store.getCertificateChain(alias)) {
                chain.put(Base64.encodeToString(certificate.getEncoded(), Base64.NO_WRAP));
            }
            Signature signer = Signature.getInstance("SHA256withECDSA");
            signer.initSign(pair.getPrivate());
            signer.update(("Espressoulster Android admin v1:" + challenge).getBytes(StandardCharsets.UTF_8));
            proof.put("challenge", challenge);
            proof.put("certificates", chain);
            proof.put("signature", Base64.encodeToString(signer.sign(), Base64.NO_WRAP));
        } catch (Exception failure) {
            throw failed("device", failure);
        } finally {
            if (store.containsAlias(alias)) store.deleteEntry(alias);
        }

        HttpURLConnection verification = connect(endpoint + "verify");
        try {
            verification.setRequestMethod("POST");
            verification.setRequestProperty("Content-Type", "application/json");
            verification.setDoOutput(true);
            byte[] payload = proof.toString().getBytes(StandardCharsets.UTF_8);
            verification.setFixedLengthStreamingMode(payload.length);
            try (OutputStream output = verification.getOutputStream()) {
                output.write(payload);
            }
            read(verification);
            String cookie = verification.getHeaderField("Set-Cookie");
            if (cookie == null || !cookie.startsWith("espresso_android_admin=")) {
                throw failed("session", null);
            }
            return cookie;
        } catch (VerificationFailure failure) {
            throw failure;
        } catch (Exception failure) {
            throw failed("network", failure);
        } finally {
            verification.disconnect();
        }
    }

    private static HttpURLConnection connect(String url) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(8000);
        connection.setReadTimeout(12000);
        connection.setRequestProperty("User-Agent", "EspressoulsterAndroid/1.0");
        return connection;
    }

    private static JSONObject read(HttpURLConnection connection) throws Exception {
        int status = connection.getResponseCode();
        if (status != 200) {
            if (status == 403) throw failed("device", null);
            throw new IOException("Café Admin verification is unavailable. Try again shortly.");
        }
        try (InputStream input = connection.getInputStream();
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[1024];
            int count;
            while ((count = input.read(buffer)) != -1) {
                if (output.size() + count > 8192) throw new IOException("Invalid Android verification response.");
                output.write(buffer, 0, count);
            }
            return new JSONObject(new String(output.toByteArray(), StandardCharsets.UTF_8));
        }
    }
}
