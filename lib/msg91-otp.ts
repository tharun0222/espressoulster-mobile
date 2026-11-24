import {createMsg91Ipv4Fetch,msg91Ipv4Fetch} from './msg91-transport.ts';
import {equalHash} from './admin-password.ts';
import {usesWhatsAppOtp,msg91WhatsAppReady,sendMsg91WhatsAppOtp,type Msg91WhatsAppConfig} from './msg91-whatsapp.ts';

export type Msg91Config = Msg91WhatsAppConfig & {
  PIN_AUTH_OTP_ENABLED?: string;
  MSG91_IPV4_ONLY?: string;
  MSG91_RELAY_SOCKET?: string;
  MSG91_AUTH_KEY?: string;
  MSG91_OTP_TEMPLATE_ID?: string;
  CUSTOMER_OTP_ONLY?: string;
};

export function pinAuthOtpEnabled(config: Msg91Config) {
  return config.PIN_AUTH_OTP_ENABLED === 'true';
}

export function msg91Ready(config: Msg91Config) {
  return pinAuthOtpEnabled(config) && (usesWhatsAppOtp(config)?msg91WhatsAppReady(config):Boolean(config.MSG91_AUTH_KEY?.trim() && config.MSG91_OTP_TEMPLATE_ID?.trim()));
}

export function customerOtpOnly(config: Msg91Config) {
  return config.CUSTOMER_OTP_ONLY === 'true' && pinAuthOtpEnabled(config) && (msg91Ready(config)||usesWhatsAppOtp(config));
}

export async function sendMsg91Otp(config: Msg91Config, phone: string, code: string, send: typeof fetch = fetch) {
  let transport = send;
  if (send === fetch) {
    if (usesWhatsAppOtp(config) && config.MSG91_RELAY_SOCKET) transport = createMsg91Ipv4Fetch(undefined,config.MSG91_RELAY_SOCKET);
    else if (config.MSG91_IPV4_ONLY === 'true') transport = msg91Ipv4Fetch;
  }
  if(usesWhatsAppOtp(config))return sendMsg91WhatsAppOtp(config,phone,code,transport);
  const url = new URL('https://control.msg91.com/api/v5/otp');
  url.search = new URLSearchParams({
    mobile: phone.slice(1),
    template_id: config.MSG91_OTP_TEMPLATE_ID!.trim(),
    otp: code,
    otp_length: '6',
    otp_expiry: '10',
  }).toString();
  const response = await transport(url, {
    method: 'POST',
    headers: {authkey: config.MSG91_AUTH_KEY!.trim(), 'Content-Type': 'application/json'},
    body: '{}',
    signal: AbortSignal.timeout(10000),
    redirect: 'error',
  });
  if (!response.ok || (await response.json() as {type?: string}).type !== 'success') {
    throw new Error('MSG91 did not accept the OTP request.');
  }
}

export function createSmsCode() {
  const random = new Uint32Array(1);
  do { crypto.getRandomValues(random); } while (random[0] >= 4294000000);
  return String(random[0] % 1000000).padStart(6, '0');
}

export async function smsCodeHash(secret: string, purpose: string, phone: string, tokenHash: string, code: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(JSON.stringify(['espresso-msg91-v1', purpose, phone, tokenHash, code])));
  return Array.from(new Uint8Array(signed), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function matchesSmsCode(secret: string, purpose: string, phone: string, tokenHash: string, code: string, expected: string) {
  return equalHash(await smsCodeHash(secret, purpose, phone, tokenHash, code), expected);
}
