import {
  Kanit_400Regular,
  Kanit_500Medium,
  Kanit_600SemiBold,
  Kanit_700Bold,
  useFonts,
} from "@expo-google-fonts/kanit";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from "react-native";
import { KioskAdminPasswordModal } from "./src/components/KioskAdminPasswordModal";
import KioskGuard from "./src/components/KioskGuard";
import NotificationScreen from "./src/screens/NotificationScreen";
import ScannerScreen from "./src/screens/ScannerScreen";
import WalkInScreen from "./src/screens/WalkInScreen";
import { AppText as Text } from "./src/theme/typography";
import {
  registerBackgroundTask,
  registerRemotePushToken,
  requestPermissions,
  startForegroundPolling,
  stopForegroundPolling,
} from "./src/utils/notificationService";
import {
  startAppUpdateChecks,
  stopAppUpdateChecks,
} from "./src/utils/updateService";
import { getUnreadCount, subscribe } from "./src/utils/notificationHistory";
import {
  checkForMobileReleaseUpdate,
  openMobileReleaseUpdate,
  type MobileReleaseCheckResult,
} from "./src/utils/mobileReleaseUpdate";
import { verifyKioskAdminPassword } from "./src/utils/kioskAdminPassword";
import {
  BOTTOM_NAV_TABS,
  shouldShowNavScannerButton,
  type AppScreen,
  type MainTab,
} from "./src/utils/mainNav";

function TabBar({
  active,
  onSelect,
  unread,
}: {
  active: MainTab;
  onSelect: (t: MainTab) => void;
  unread: number;
}) {
  return (
    <View style={styles.tabBar}>
      {BOTTOM_NAV_TABS.map((tab) => {
        const isActive = active === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, isActive && styles.tabActive]}
            onPress={() => onSelect(tab.key)}
            activeOpacity={0.7}
          >
            <View>
              <Text style={styles.tabIcon}>{tab.icon}</Text>
              {tab.key === "notification" && unread > 0 && (
                <View style={styles.tabBarBadge}>
                  <Text style={styles.tabBarBadgeText}>{unread > 99 ? "99+" : unread}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function MainApp() {
  const [activeTab, setActiveTab] = useState<AppScreen>("notification");
  const [checkoutTargetId, setCheckoutTargetId] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    const refresh = () => setUnread(getUnreadCount());
    refresh();
    return subscribe(refresh);
  }, []);

  function handleScanRequest() {
    setActiveTab("scanner");
  }

  function handleBackToNotification() {
    setActiveTab("notification");
  }

  function handleGoCheckout(id: string) {
    setCheckoutTargetId(id);
    setActiveTab("notification");
  }

  function handleTabSelect(t: MainTab) {
    setActiveTab(t);
  }

  const activeMainTab: MainTab = activeTab === "walkIn" ? "walkIn" : "notification";

  return (
    <View style={styles.root}>
      <View style={styles.screen}>
        {activeTab === "notification" ? (
          <NotificationScreen
            onScanRequest={handleScanRequest}
            openCheckoutId={checkoutTargetId}
            onCheckoutConsumed={() => setCheckoutTargetId(null)}
          />
        ) : activeTab === "scanner" ? (
          <ScannerScreen
            onBack={handleBackToNotification}
            onCheckout={handleGoCheckout}
            onDone={handleBackToNotification}
          />
        ) : (
          <WalkInScreen />
        )}
      </View>
      <TabBar
        active={activeMainTab}
        onSelect={handleTabSelect}
        unread={unread}
      />
      {shouldShowNavScannerButton(activeTab) && (
        <TouchableOpacity
          testID="nav-scanner-button"
          accessibilityRole="button"
          accessibilityLabel="สแกน QR"
          style={styles.navScannerButton}
          onPress={handleScanRequest}
          activeOpacity={0.85}
        >
          <Text style={styles.navScannerIcon}>📷</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function RequiredUpdateScreen({
  update,
  checking,
  opening,
  error,
  onCheckAgain,
  onOpenUpdate,
}: {
  update: MobileReleaseCheckResult;
  checking: boolean;
  opening: boolean;
  error: string;
  onCheckAgain: () => void;
  onOpenUpdate: () => void;
}) {
  const release = update.release;
  return (
    <View style={styles.updateScreen}>
      <Text style={styles.updateIcon}>⬇️</Text>
      <Text style={styles.updateTitle}>ต้องอัปเดต AP Scanner</Text>
      <Text style={styles.updateSubtitle}>
        มีเวอร์ชันใหม่ v{release?.versionName} ({release?.versionCode}) กรุณากดอัปเดตก่อนใช้งานต่อ
      </Text>
      <View style={styles.updateInfoCard}>
        <Text style={styles.updateInfoText}>เวอร์ชันเครื่องนี้: {update.currentVersionName || "ไม่ทราบ"} ({update.currentVersionCode})</Text>
        {!!release?.notes && <Text style={styles.updateInfoText}>หมายเหตุ: {release.notes}</Text>}
      </View>
      {!!error && <Text style={styles.updateError}>{error}</Text>}
      <TouchableOpacity
        style={[styles.updateButton, opening && styles.updateButtonDisabled]}
        onPress={onOpenUpdate}
        disabled={opening}
        activeOpacity={0.85}
      >
        {opening ? <ActivityIndicator color="#fff" /> : <Text style={styles.updateButtonText}>อัปเดตแอป</Text>}
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.updateSecondaryButton}
        onPress={onCheckAgain}
        disabled={checking}
        activeOpacity={0.85}
      >
        <Text style={styles.updateSecondaryText}>{checking ? "กำลังตรวจ..." : "ตรวจอีกครั้ง"}</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Kanit_400Regular,
    Kanit_500Medium,
    Kanit_600SemiBold,
    Kanit_700Bold,
  });
  const [requiredUpdate, setRequiredUpdate] = useState<MobileReleaseCheckResult | null>(null);
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateOpening, setUpdateOpening] = useState(false);
  const [updateError, setUpdateError] = useState("");
  const [updatePasswordVisible, setUpdatePasswordVisible] = useState(false);
  const [updatePassword, setUpdatePassword] = useState("");
  const [updatePasswordError, setUpdatePasswordError] = useState("");

  async function refreshRequiredUpdate() {
    setUpdateChecking(true);
    setUpdateError("");
    try {
      const update = await checkForMobileReleaseUpdate();
      setRequiredUpdate(update.required ? update : null);
    } catch (error) {
      setUpdateError(error instanceof Error ? error.message : "ตรวจสอบอัปเดตไม่สำเร็จ");
    } finally {
      setUpdateChecking(false);
    }
  }

  async function handleOpenRequiredUpdate() {
    if (!requiredUpdate?.release) return;
    setUpdatePasswordVisible(true);
    setUpdatePassword("");
    setUpdatePasswordError("");
  }

  function cancelRequiredUpdatePassword() {
    setUpdatePasswordVisible(false);
    setUpdatePassword("");
    setUpdatePasswordError("");
  }

  async function confirmOpenRequiredUpdate() {
    if (!requiredUpdate?.release) return;
    if (!(await verifyKioskAdminPassword(updatePassword))) {
      setUpdatePasswordError("รหัสผ่านไม่ถูกต้อง");
      setUpdatePassword("");
      return;
    }
    setUpdateOpening(true);
    setUpdatePasswordVisible(false);
    setUpdateError("");
    try {
      await openMobileReleaseUpdate(requiredUpdate.release);
    } catch (error) {
      setUpdateError(error instanceof Error ? error.message : "เปิดไฟล์อัปเดตไม่สำเร็จ");
    } finally {
      setUpdateOpening(false);
    }
  }

  useEffect(() => {
    requestPermissions()
      .then((granted) => {
        if (granted) registerRemotePushToken();
      })
      .catch(() => {});
    registerBackgroundTask();
    startForegroundPolling();
    startAppUpdateChecks();
    refreshRequiredUpdate();
    const updateTimer = setInterval(refreshRequiredUpdate, 5 * 60 * 1000);

    return () => {
      clearInterval(updateTimer);
      stopForegroundPolling();
      stopAppUpdateChecks();
    };
  }, []);

  if (!fontsLoaded && !fontError) {
    return (
      <View style={styles.bootScreen}>
        <StatusBar style="light" hidden />
      </View>
    );
  }

  return (
    <KioskGuard>
      <StatusBar style="light" hidden />
      {requiredUpdate ? (
        <RequiredUpdateScreen
          update={requiredUpdate}
          checking={updateChecking}
          opening={updateOpening}
          error={updateError}
          onCheckAgain={refreshRequiredUpdate}
          onOpenUpdate={handleOpenRequiredUpdate}
        />
      ) : (
        <MainApp />
      )}
      <KioskAdminPasswordModal
        visible={updatePasswordVisible}
        title="อัปเดต AP Scanner"
        subtitle="กรุณากรอกรหัสผ่านผู้ดูแลระบบก่อนออกไปติดตั้งอัปเดต"
        password={updatePassword}
        error={updatePasswordError}
        confirmLabel="อัปเดต"
        onChangePassword={(value) => {
          setUpdatePassword(value);
          setUpdatePasswordError("");
        }}
        onCancel={cancelRequiredUpdatePassword}
        onConfirm={confirmOpenRequiredUpdate}
      />
    </KioskGuard>
  );
}

const styles = StyleSheet.create({
  bootScreen: { flex: 1, backgroundColor: "#111827" },
  root: { flex: 1, backgroundColor: "#111827" },
  screen: { flex: 1 },
  tabBar: {
    flexDirection: "row",
    position: "relative",
    backgroundColor: "#1f2937",
    borderTopWidth: 1,
    borderTopColor: "#374151",
    paddingBottom: 20,
  },
  tab: { flex: 1, alignItems: "center", paddingVertical: 10 },
  tabActive: { borderTopWidth: 2, borderTopColor: "#16a34a" },
  tabIcon: { fontSize: 20 },
  tabLabel: { color: "#6b7280", fontSize: 11, marginTop: 2 },
  tabLabelActive: { color: "#4ade80" },
  navScannerButton: {
    position: "absolute",
    right: 16,
    bottom: 104,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#ffffff",
    borderWidth: 3,
    borderColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  navScannerIcon: { fontSize: 26, color: "#fff" },
  tabBarBadge: {
    position: "absolute",
    top: -4,
    right: -10,
    backgroundColor: "#dc2626",
    borderRadius: 99,
    minWidth: 16,
    paddingHorizontal: 4,
    paddingVertical: 1,
    alignItems: "center",
  },
  tabBarBadgeText: { color: "#fff", fontSize: 9, fontWeight: "700" },
  updateScreen: {
    flex: 1,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  updateIcon: { fontSize: 44, marginBottom: 12 },
  updateTitle: { color: "#fff", fontSize: 22, fontWeight: "800", textAlign: "center" },
  updateSubtitle: { color: "#d1d5db", fontSize: 15, lineHeight: 22, textAlign: "center", marginTop: 10 },
  updateInfoCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#1f2937",
    borderRadius: 12,
    padding: 14,
    marginTop: 18,
    gap: 6,
  },
  updateInfoText: { color: "#d1d5db", fontSize: 13, lineHeight: 19 },
  updateError: { color: "#fca5a5", fontSize: 13, marginTop: 12, textAlign: "center" },
  updateButton: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#16a34a",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 18,
  },
  updateButtonDisabled: { opacity: 0.7 },
  updateButtonText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  updateSecondaryButton: { paddingVertical: 14, paddingHorizontal: 16, marginTop: 4 },
  updateSecondaryText: { color: "#9ca3af", fontSize: 14, fontWeight: "700" },
});
