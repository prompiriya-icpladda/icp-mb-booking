import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import NotificationScreen from "./src/screens/NotificationScreen";
import ScannerScreen from "./src/screens/ScannerScreen";
import { registerBackgroundTask, requestPermissions, startForegroundPolling, stopForegroundPolling } from "./src/utils/notificationService";
import KioskGuard from "./src/components/KioskGuard";

type Tab = "notification" | "scanner";

function TabBar({ active, onSelect }: { active: Tab; onSelect: (t: Tab) => void }) {
  return (
    <View style={styles.tabBar}>
      <TouchableOpacity
        style={[styles.tab, active === "notification" && styles.tabActive]}
        onPress={() => onSelect("notification")}
        activeOpacity={0.7}
      >
        <Text style={styles.tabIcon}>🔔</Text>
        <Text style={[styles.tabLabel, active === "notification" && styles.tabLabelActive]}>
          แจ้งเตือน
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.tab, active === "scanner" && styles.tabActive]}
        onPress={() => onSelect("scanner")}
        activeOpacity={0.7}
      >
        <Text style={styles.tabIcon}>📷</Text>
        <Text style={[styles.tabLabel, active === "scanner" && styles.tabLabelActive]}>
          สแกน QR
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function MainApp() {
  const [activeTab, setActiveTab] = useState<Tab>("notification");
  const [fromNotification, setFromNotification] = useState(false);

  function handleScanRequest() {
    setFromNotification(true);
    setActiveTab("scanner");
  }

  function handleBackToNotification() {
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
        {activeTab === "notification"
          ? <NotificationScreen onScanRequest={handleScanRequest} />
          : <ScannerScreen onBack={fromNotification ? handleBackToNotification : undefined} />}
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

    return () => stopForegroundPolling();
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
