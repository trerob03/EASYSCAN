import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Purchases from "react-native-purchases";
import RevenueCatUI, { PAYWALL_RESULT } from "react-native-purchases-ui";

// Bezahlschranke über RevenueCat: FREE_SCANS Scans gratis, danach Abo "pro".
// Ohne RevenueCat-Schlüssel (z. B. beim Testen) ist alles frei.

export const FREE_SCANS = 5;
const ENTITLEMENT = "pro";
const COUNT_KEY = "scanCount.v1";

const API_KEY = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
});

let configured = false;

export function setupPurchases() {
  if (!API_KEY || configured) return;
  Purchases.configure({ apiKey: API_KEY });
  configured = true;
}

export async function getScanCount() {
  return Number((await AsyncStorage.getItem(COUNT_KEY)) ?? 0);
}

export async function countScan() {
  const n = (await getScanCount()) + 1;
  await AsyncStorage.setItem(COUNT_KEY, String(n));
  return n;
}

export async function isPro() {
  if (!configured) return false;
  const info = await Purchases.getCustomerInfo();
  return info.entitlements.active[ENTITLEMENT] !== undefined;
}

// true = Scan darf starten. Zeigt die Paywall, wenn die Gratis-Scans aufgebraucht sind.
export async function canScan() {
  if (!configured) return true;
  if ((await getScanCount()) < FREE_SCANS) return true;
  const result = await RevenueCatUI.presentPaywallIfNeeded({ requiredEntitlementIdentifier: ENTITLEMENT });
  return result === PAYWALL_RESULT.NOT_PRESENTED
    || result === PAYWALL_RESULT.PURCHASED
    || result === PAYWALL_RESULT.RESTORED;
}

export async function restore() {
  if (!configured) return false;
  const info = await Purchases.restorePurchases();
  return info.entitlements.active[ENTITLEMENT] !== undefined;
}

export const purchasesEnabled = () => configured;
