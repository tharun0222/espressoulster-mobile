package com.espressoulster.coffee;

import android.app.Activity;
import android.os.Bundle;

/** WhatsApp's one-tap fallback; does not create or change any login session. */
public final class WhatsAppOtpActivity extends Activity {
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        NativeWhatsAppOtp.receive(getIntent());
        finish();
    }
}
