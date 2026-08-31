export type MainTab = "notification" | "walkIn";
export type AppScreen = MainTab | "scanner";

export type BottomNavTab = {
  key: MainTab;
  icon: string;
  label: string;
};

export const BOTTOM_NAV_TABS: ReadonlyArray<BottomNavTab> = [
  { key: "notification", icon: "🔔", label: "แจ้งเตือน" },
  { key: "walkIn", icon: "📝", label: "ลงทะเบียน" },
];

export const SCANNER_ACTION_PLACEMENT = "floating";

export function shouldShowNavScannerButton(active: AppScreen): boolean {
  return active === "notification";
}
