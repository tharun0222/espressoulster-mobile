const storageKey = 'espresso-remembered-pin-phone';
const mobilePattern = /^[6-9][0-9]{9}$/;

export function readRememberedPinPhone() {
  try {
    const phone = window.localStorage.getItem(storageKey) ?? '';
    return mobilePattern.test(phone) ? phone : '';
  } catch {
    return '';
  }
}

export function rememberPinPhone(value: unknown) {
  if (typeof value !== 'string') return;
  const phone = value.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  if (!mobilePattern.test(phone)) return;
  try {
    window.localStorage.setItem(storageKey, phone);
  } catch {
    // Sign-in still works when browser storage is unavailable.
  }
}
