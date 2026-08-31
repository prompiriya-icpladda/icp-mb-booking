import { kioskModule } from "@/src/utils/kioskModule";
import { startKioskWhenNeeded } from "@/src/utils/kioskGuard";
import { verifyKioskAdminPassword } from "@/src/utils/kioskAdminPassword";
import { useKeepAwake } from "expo-keep-awake";
import * as NavigationBar from "expo-navigation-bar";
import React, { useEffect, useState } from "react";
import {
  AppState,
  BackHandler,
  Platform,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { KioskAdminPasswordModal } from "./KioskAdminPasswordModal";
import { AppText as Text } from "../theme/typography";

async function hideNavBar() {
  if (Platform.OS !== "android") return;
  try {
    await NavigationBar.setVisibilityAsync("hidden");
  } catch {}
}

function ensureKiosk() {
  startKioskWhenNeeded(kioskModule).catch(() => {});
}

export default function KioskGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  useKeepAwake();
  const [modalVisible, setModalVisible] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    hideNavBar();
    ensureKiosk();

    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        hideNavBar();
        ensureKiosk();
      }
    });

    const backSub = BackHandler.addEventListener("hardwareBackPress", () => {
      setModalVisible(true);
      setPassword("");
      setError("");
      return true;
    });

    return () => {
      appStateSub.remove();
      backSub.remove();
    };
  }, []);

  async function handleConfirm() {
    if (await verifyKioskAdminPassword(password)) {
      setModalVisible(false);
      try {
        await kioskModule.stopKiosk();
      } catch {}
      BackHandler.exitApp();
    } else {
      setError("รหัสผ่านไม่ถูกต้อง");
      setPassword("");
    }
  }

  function handleCancel() {
    setModalVisible(false);
    setPassword("");
    setError("");
    hideNavBar();
  }

  function handleExitPress() {
    setModalVisible(true);
    setPassword("");
    setError("");
  }

  return (
    <>
      {children}
      <TouchableOpacity
        style={styles.exitBtn}
        onPress={handleExitPress}
        activeOpacity={0.7}
      >
        <Text style={styles.exitText}>✕ ปิดแอป</Text>
      </TouchableOpacity>
      <KioskAdminPasswordModal
        visible={modalVisible}
        title="ออกจากแอปพลิเคชัน"
        subtitle="กรุณากรอกรหัสผ่านผู้ดูแลระบบ"
        password={password}
        error={error}
        onChangePassword={(v) => {
          setPassword(v);
          setError("");
        }}
        onCancel={handleCancel}
        onConfirm={handleConfirm}
      />
    </>
  );
}

const styles = StyleSheet.create({
  exitBtn: {
    position: "absolute",
    top: 12,
    right: 12,
    backgroundColor: "rgba(31,41,55,0.85)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    zIndex: 100,
  },
  exitText: {
    color: "#d1d5db",
    fontSize: 13,
    fontWeight: "600",
  },
});
