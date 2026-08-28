import * as Application from "expo-application";
import { Linking } from "react-native";
import { API_URL } from "../services/api";
import { kioskModule } from "./kioskModule";

export interface MobileReleaseInfo {
  id: string;
  versionName: string;
  versionCode: number;
  apkUrl: string;
  notes?: string;
  forceUpdate?: boolean;
  releasedAt?: string;
}

export interface MobileReleaseLatestResponse {
  updateAvailable?: boolean;
  latest?: MobileReleaseInfo | null;
}

export interface MobileReleaseCheckResult {
  currentVersionCode: number;
  currentVersionName: string;
  available: boolean;
  required: boolean;
  release: MobileReleaseInfo | null;
}

export function parseNativeVersionCode(value?: string | null): number {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function isMobileReleaseNewer(
  release: Pick<MobileReleaseInfo, "versionCode"> | null | undefined,
  currentVersionCode: number,
): boolean {
  return !!release && release.versionCode > currentVersionCode;
}

export function resolveMobileReleaseCheck(
  response: MobileReleaseLatestResponse,
  currentVersionCode: number,
  currentVersionName = "",
): MobileReleaseCheckResult {
  const release = response.updateAvailable && response.latest ? response.latest : null;
  const available = isMobileReleaseNewer(release, currentVersionCode);
  return {
    currentVersionCode,
    currentVersionName,
    available,
    required: available && release?.forceUpdate === true,
    release: available ? release : null,
  };
}

export async function checkForMobileReleaseUpdate(): Promise<MobileReleaseCheckResult> {
  const currentVersionCode = parseNativeVersionCode(Application.nativeBuildVersion);
  const currentVersionName = Application.nativeApplicationVersion || "";
  const res = await fetch(`${API_URL}/mobile-releases/latest`, { cache: "no-store" as RequestCache });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "โหลดข้อมูลอัปเดตไม่สำเร็จ");
  return resolveMobileReleaseCheck(data, currentVersionCode, currentVersionName);
}

export async function openMobileReleaseUpdate(release: MobileReleaseInfo): Promise<void> {
  await kioskModule.stopKiosk().catch(() => false);
  await Linking.openURL(release.apkUrl);
}
