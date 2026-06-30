import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import KioskGuard from "./src/components/KioskGuard";
import NotificationScreen from "./src/screens/NotificationScreen";
import ScannerScreen from "./src/screens/ScannerScreen";
import WalkInScreen from "./src/screens/WalkInScreen";
import {
  registerBackgroundTask,
  requestPermissions,
  startForegroundPolling,
  stopForegroundPolling,
} from "./src/utils/notificationService";
import {
  startAppUpdateChecks,
  stopAppUpdateChecks,
} from "./src/utils/updateService";

type Tab = "notification" | "scanner" | "walkIn";

function TabBar({
  active,
  onSelect,
}: {
  active: Tab;
  onSelect: (t: Tab) => void;
}) {
  return (
    <View style={styles.tabBar}>
      <TouchableOpacity
        style={[styles.tab, active === "notification" && styles.tabActive]}
        onPress={() => onSelect("notification")}
        activeOpacity={0.7}
      >
        <Text style={styles.tabIcon}>🔔</Text>
        <Text
          style={[
            styles.tabLabel,
            active === "notification" && styles.tabLabelActive,
          ]}
        >
          แจ้งเตือน
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.tab, active === "scanner" && styles.tabActive]}
        onPress={() => onSelect("scanner")}
        activeOpacity={0.7}
      >
        <Text style={styles.tabIcon}>📷</Text>
        <Text
          style={[
            styles.tabLabel,
            active === "scanner" && styles.tabLabelActive,
          ]}
        >
          สแกน QR
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.tab, active === "walkIn" && styles.tabActive]}
        onPress={() => onSelect("walkIn")}
        activeOpacity={0.7}
      >
        <Text style={styles.tabIcon}>📝</Text>
        <Text
          style={[
            styles.tabLabel,
            active === "walkIn" && styles.tabLabelActive,
          ]}
        >
          ลงทะเบียน
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function MainApp() {
  const [activeTab, setActiveTab] = useState<Tab>("notification");
  const [fromNotification, setFromNotification] = useState(false);
  const [checkoutTargetId, setCheckoutTargetId] = useState<string | null>(null);

  function handleScanRequest() {
    setFromNotification(true);
    setActiveTab("scanner");
  }

  function handleBackToNotification() {
    setFromNotification(false);
    setActiveTab("notification");
  }

  function handleGoCheckout(id: string) {
    setCheckoutTargetId(id);
    setFromNotification(false);
    setActiveTab("notification");
  }

  function handleTabSelect(t: Tab) {
    setFromNotification(false);
    setActiveTab(t);
  }

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
            onBack={fromNotification ? handleBackToNotification : undefined}
            onCheckout={handleGoCheckout}
          />
        ) : (
          <WalkInScreen />
        )}
      </View>
      <TabBar active={activeTab} onSelect={handleTabSelect} />
    </View>
  );
}

export default function App() {
  useEffect(() => {
    requestPermissions();
    registerBackgroundTask();
    startForegroundPolling();
    startAppUpdateChecks();

    return () => {
      stopForegroundPolling();
      stopAppUpdateChecks();
    };
  }, []);

  return (
    <KioskGuard>
      <StatusBar style="light" hidden />
      <MainApp />
    </KioskGuard>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#111827" },
  screen: { flex: 1 },
  tabBar: {
    flexDirection: "row",
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
});
