import { useKeepAwake } from "expo-keep-awake";
import * as NavigationBar from "expo-navigation-bar";
import * as SecureStore from "expo-secure-store";
import React, { useEffect, useRef, useState } from "react";
import { kioskModule } from "@/src/utils/kioskModule";
import {
  AppState,
  BackHandler,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const ADMIN_PASSWORD_KEY = "kiosk_admin_password";
const DEFAULT_ADMIN_PASSWORD = "!CPNKadmin0505";

async function getAdminPassword(): Promise<string> {
  try {
    const stored = await SecureStore.getItemAsync(ADMIN_PASSWORD_KEY);
    return stored ?? DEFAULT_ADMIN_PASSWORD;
  } catch {
    return DEFAULT_ADMIN_PASSWORD;
  }
}

async function hideNavBar() {
  if (Platform.OS !== "android") return;
  try {
    await NavigationBar.setVisibilityAsync("hidden");
  } catch {}
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
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    hideNavBar();
    kioskModule.startKiosk().catch(() => {});

    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        hideNavBar();
        kioskModule.startKiosk().catch(() => {});
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

  useEffect(() => {
    if (modalVisible) {
      const t = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(t);
    }
  }, [modalVisible]);

  async function handleConfirm() {
    const adminPwd = await getAdminPassword();
    if (password === adminPwd) {
      setModalVisible(false);
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
      <TouchableOpacity style={styles.exitBtn} onPress={handleExitPress} activeOpacity={0.7}>
        <Text style={styles.exitText}>✕ ปิดแอป</Text>
      </TouchableOpacity>
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCancel}
      >
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.title}>ออกจากแอปพลิเคชัน</Text>
            <Text style={styles.subtitle}>กรุณากรอกรหัสผ่านผู้ดูแลระบบ</Text>
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                setError("");
              }}
              secureTextEntry
              placeholder="รหัสผ่าน"
              placeholderTextColor="#6b7280"
              returnKeyType="done"
              onSubmitEditing={handleConfirm}
            />
            {!!error && <Text style={styles.error}>{error}</Text>}
            <View style={styles.buttons}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={handleCancel}
                activeOpacity={0.8}
              >
                <Text style={styles.cancelText}>ยกเลิก</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmBtn}
                onPress={handleConfirm}
                activeOpacity={0.8}
              >
                <Text style={styles.confirmText}>ยืนยัน</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    alignItems: "center",
  },
  dialog: {
    backgroundColor: "#1f2937",
    borderRadius: 12,
    padding: 24,
    width: "80%",
    maxWidth: 360,
  },
  title: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 6,
  },
  subtitle: {
    color: "#9ca3af",
    fontSize: 14,
    marginBottom: 16,
  },
  input: {
    backgroundColor: "#111827",
    color: "#fff",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#374151",
    marginBottom: 8,
  },
  error: {
    color: "#ef4444",
    fontSize: 13,
    marginBottom: 8,
  },
  buttons: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: "#374151",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  cancelText: {
    color: "#d1d5db",
    fontSize: 15,
  },
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
  confirmBtn: {
    flex: 1,
    backgroundColor: "#16a34a",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  confirmText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
});
