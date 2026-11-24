export function hasNativeOrderAlerts() {
  return typeof window !== "undefined" &&
    (window as Window & { espressoOrderAlerts?: boolean }).espressoOrderAlerts === true;
}

export function nativeOrderAlertsEnabled() {
  return hasNativeOrderAlerts() && window.prompt("espresso:order-alerts:status", "") === "enabled";
}

export function openNativeOrderAlertSettings() {
  return hasNativeOrderAlerts() && window.prompt("espresso:order-alerts:settings", "") === "ready";
}

export function refreshNativeOrderAlerts() {
  if (hasNativeOrderAlerts()) window.prompt("espresso:order-alerts:refresh", "");
}
