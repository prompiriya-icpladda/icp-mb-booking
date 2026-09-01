import { kioskModule } from "@/src/utils/kioskModule";
import { startKioskWhenNeeded } from "@/src/utils/kioskGuard";
import {
  hasKioskAdminPin,
  sanitizeKioskPinInput,
  setKioskAdminPin,
  verifyKioskAdminPassword,
  type KioskAdminPinChangeError,
} from "@/src/utils/kioskAdminPassword";
import { useKeepAwake } from "expo-keep-awake";
import * as NavigationBar from "expo-navigation-bar";
import React, { useEffect, useState } from "react";
import {
  AppState,
  BackHandler,
  Modal,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { KioskAdminPinSettingsModal } from "./KioskAdminPinSettingsModal";
import { KioskAdminPasswordModal } from "./KioskAdminPasswordModal";
import { AppText as Text } from "../theme/typography";

function pinChangeErrorMessage(error: KioskAdminPinChangeError): string {
  switch (error) {
    case "current-invalid":
      return "รหัสเดิมไม่ถูกต้อง";
    case "pin-format":
      return "PIN ต้องเป็นตัวเลข 6 ตัว";
    case "pin-mismatch":
      return "PIN ใหม่ไม่ตรงกัน";
    case "save-failed":
      return "บันทึก PIN ไม่สำเร็จ";
  }
}

async function hideNavBar() {
  if (Platform.OS !== "android") return;
  try {
    await NavigationBar.setVisibilityAsync("hidden");
  } catch {}
}

function ensureKiosk() {
  startKioskWhenNeeded(kioskModule).catch(() => {});
}

function KioskSettingsMenuModal({
  visible,
  onClose,
  onChangePin,
  onForgotPin,
}: {
  visible: boolean;
  onClose: () => void;
  onChangePin: () => void;
  onForgotPin: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.menuOverlay}>
        <View style={styles.menuDialog}>
          <Text style={styles.menuTitle}>ตั้งค่า</Text>
          <TouchableOpacity style={styles.menuItem} onPress={onChangePin} activeOpacity={0.8}>
            <Text style={styles.menuItemText}>ตั้ง PIN</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={onForgotPin} activeOpacity={0.8}>
            <Text style={styles.menuItemText}>ลืมรหัสผ่าน</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuCancel} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.menuCancelText}>ยกเลิก</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
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
  const [pinConfigured, setPinConfigured] = useState(false);
  const [settingsMenuVisible, setSettingsMenuVisible] = useState(false);
  const [pinSettingsVisible, setPinSettingsVisible] = useState(false);
  const [pinSettingsRecoveryMode, setPinSettingsRecoveryMode] = useState(false);
  const [currentCredential, setCurrentCredential] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinSettingsError, setPinSettingsError] = useState("");

  function refreshPinConfigured() {
    hasKioskAdminPin()
      .then(setPinConfigured)
      .catch(() => setPinConfigured(false));
  }

  useEffect(() => {
    refreshPinConfigured();
    hideNavBar();
    ensureKiosk();

    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        refreshPinConfigured();
        hideNavBar();
        ensureKiosk();
      }
    });

    const backSub = BackHandler.addEventListener("hardwareBackPress", () => {
      refreshPinConfigured();
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
      setError(pinConfigured ? "PIN ไม่ถูกต้อง" : "รหัสผ่านไม่ถูกต้อง");
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
    refreshPinConfigured();
    setModalVisible(true);
    setPassword("");
    setError("");
  }

  function handleSettingsPress() {
    refreshPinConfigured();
    setSettingsMenuVisible(true);
  }

  function handleSettingsMenuClose() {
    setSettingsMenuVisible(false);
    hideNavBar();
  }

  async function openPinSettings(recoveryMode: boolean) {
    try {
      setPinConfigured(await hasKioskAdminPin());
    } catch {
      setPinConfigured(false);
    }
    setSettingsMenuVisible(false);
    setPinSettingsRecoveryMode(recoveryMode);
    setPinSettingsVisible(true);
    setCurrentCredential("");
    setNewPin("");
    setConfirmPin("");
    setPinSettingsError("");
  }

  function handlePinSettingsCancel() {
    setPinSettingsVisible(false);
    setPinSettingsRecoveryMode(false);
    setCurrentCredential("");
    setNewPin("");
    setConfirmPin("");
    setPinSettingsError("");
    hideNavBar();
  }

  async function handlePinSettingsConfirm() {
    const result = await setKioskAdminPin({
      currentCredential,
      pin: newPin,
      confirmPin,
      allowDefaultRecovery: pinSettingsRecoveryMode,
    });

    if (!result.ok) {
      setPinSettingsError(pinChangeErrorMessage(result.error));
      return;
    }

    setPinConfigured(true);
    setPinSettingsVisible(false);
    setPinSettingsRecoveryMode(false);
    setCurrentCredential("");
    setNewPin("");
    setConfirmPin("");
    setPinSettingsError("");
  }

  return (
    <>
      {children}
      <TouchableOpacity
        style={[styles.topButton, styles.settingsBtn]}
        onPress={handleSettingsPress}
        activeOpacity={0.7}
        accessibilityLabel="ตั้งค่า"
      >
        <Text style={styles.gearText}>⚙</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.topButton, styles.exitBtn]}
        onPress={handleExitPress}
        activeOpacity={0.7}
      >
        <Text style={styles.topButtonText}>✕ ปิดแอป</Text>
      </TouchableOpacity>
      <KioskSettingsMenuModal
        visible={settingsMenuVisible}
        onClose={handleSettingsMenuClose}
        onChangePin={() => openPinSettings(false)}
        onForgotPin={() => openPinSettings(true)}
      />
      <KioskAdminPasswordModal
        visible={modalVisible}
        title="ออกจากแอปพลิเคชัน"
        subtitle={pinConfigured ? "กรุณากรอก PIN 6 ตัว" : "กรุณากรอกรหัสผ่านผู้ดูแลระบบ"}
        helperText={!pinConfigured ? "ยังไม่ได้ตั้ง PIN ให้ใช้รหัสเดิมก่อน แล้วกด ตั้ง PIN เพื่อเปลี่ยน" : undefined}
        password={password}
        error={error}
        placeholder={pinConfigured ? "PIN 6 ตัว" : "รหัสผ่าน"}
        keyboardType={pinConfigured ? "number-pad" : "default"}
        maxLength={pinConfigured ? 6 : undefined}
        onChangePassword={(v) => {
          setPassword(pinConfigured ? sanitizeKioskPinInput(v) : v);
          setError("");
        }}
        onCancel={handleCancel}
        onConfirm={handleConfirm}
      />
      <KioskAdminPinSettingsModal
        visible={pinSettingsVisible}
        pinConfigured={pinConfigured}
        recoveryMode={pinSettingsRecoveryMode}
        currentCredential={currentCredential}
        pin={newPin}
        confirmPin={confirmPin}
        error={pinSettingsError}
        onChangeCurrentCredential={(value) => {
          setCurrentCredential(pinConfigured && !pinSettingsRecoveryMode ? sanitizeKioskPinInput(value) : value);
          setPinSettingsError("");
        }}
        onChangePin={(value) => {
          setNewPin(sanitizeKioskPinInput(value));
          setPinSettingsError("");
        }}
        onChangeConfirmPin={(value) => {
          setConfirmPin(sanitizeKioskPinInput(value));
          setPinSettingsError("");
        }}
        onCancel={handlePinSettingsCancel}
        onConfirm={handlePinSettingsConfirm}
      />
    </>
  );
}

const styles = StyleSheet.create({
  topButton: {
    position: "absolute",
    top: 12,
    backgroundColor: "rgba(31,41,55,0.85)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    zIndex: 100,
  },
  settingsBtn: {
    left: 12,
    width: 42,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  exitBtn: {
    right: 12,
    backgroundColor: "rgba(31,41,55,0.85)",
  },
  gearText: {
    color: "#e5e7eb",
    fontSize: 20,
    fontWeight: "700",
  },
  topButtonText: {
    color: "#d1d5db",
    fontSize: 13,
    fontWeight: "600",
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-start",
    alignItems: "flex-start",
    paddingTop: 56,
    paddingLeft: 12,
  },
  menuDialog: {
    width: 220,
    backgroundColor: "#1f2937",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#374151",
  },
  menuTitle: {
    color: "#9ca3af",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  menuItem: {
    backgroundColor: "#111827",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  menuItemText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  menuCancel: {
    alignItems: "center",
    paddingVertical: 10,
  },
  menuCancelText: {
    color: "#9ca3af",
    fontSize: 14,
    fontWeight: "600",
  },
});
