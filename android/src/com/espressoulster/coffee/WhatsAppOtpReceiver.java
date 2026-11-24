package com.espressoulster.coffee;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public final class WhatsAppOtpReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        NativeWhatsAppOtp.receive(intent);
    }
}
