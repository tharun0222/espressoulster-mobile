import {phoneNumber} from "./phone-verification.ts";

function normalizedPhone(value: unknown) {
  try {
    return phoneNumber(value);
  } catch {
    return null;
  }
}

export function canSeeStaffPanel(loginPhone: unknown, approvedNumbers?: string) {
  const phone = normalizedPhone(loginPhone);
  return phone !== null && (approvedNumbers ?? "").split(",").some(number => normalizedPhone(number) === phone);
}

export function isApprovedStaff(phone: unknown, config: { STAFF_PANEL_PHONES?: string; STAFF_ONLY_PHONES?: string }) {
  return canSeeStaffPanel(phone, config.STAFF_PANEL_PHONES) || canSeeStaffPanel(phone, config.STAFF_ONLY_PHONES);
}

export function staffRole(phone: unknown, config: { STAFF_PANEL_PHONES?: string; STAFF_ONLY_PHONES?: string; STAFF_ORDER_OPERATOR_PHONES?: string; STAFF_ORDER_OPERATOR_PHONE?: string }) {
  if (!isApprovedStaff(phone, config)) return null;
  if (config.STAFF_ORDER_OPERATOR_PHONES !== undefined) {
    return canSeeStaffPanel(phone, config.STAFF_ORDER_OPERATOR_PHONES) ? "operator" : "editor";
  }
  const operator = config.STAFF_ORDER_OPERATOR_PHONE?.trim();
  return !operator || normalizedPhone(phone) === normalizedPhone(operator) ? "operator" : "editor";
}
