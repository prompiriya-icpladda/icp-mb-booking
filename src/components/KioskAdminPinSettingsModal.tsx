import React, { useEffect, useRef } from "react";
import { Modal, StyleSheet, TouchableOpacity, View, type TextInputProps } from "react-native";
import {
  AppText as Text,
  AppTextInput as TextInput,
  type AppTextInputRef,
} from "../theme/typography";

type Props = {
  visible: boolean;
  pinConfigured: boolean;
  recoveryMode?: boolean;
  currentCredential: string;
  pin: string;
  confirmPin: string;
  error: string;
  onChangeCurrentCredential: (value: string) => void;
  onChangePin: (value: string) => void;
  onChangeConfirmPin: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function KioskAdminPinSettingsModal({
  visible,
  pinConfigured,
  recoveryMode = false,
  currentCredential,
  pin,
  confirmPin,
  error,
  onChangeCurrentCredential,
  onChangePin,
  onChangeConfirmPin,
  onCancel,
  onConfirm,
}: Props) {
  const currentRef = useRef<AppTextInputRef>(null);
  const currentKeyboardType: TextInputProps["keyboardType"] = pinConfigured && !recoveryMode ? "number-pad" : "default";
  const title = recoveryMode ? "ลืมรหัสผ่าน" : "ตั้งค่า PIN ปิดแอป";
  const subtitle = recoveryMode
    ? "กรอกรหัสเดิมของระบบ แล้วตั้ง PIN ใหม่ 6 ตัว"
    : "ใช้ PIN ตัวเลข 6 ตัวสำหรับปิดแอปและออกไปติดตั้งอัปเดต";
  const currentLabel = recoveryMode
    ? "รหัสเดิมของระบบ"
    : pinConfigured
      ? "PIN เดิม"
      : "รหัสผ่านผู้ดูแลระบบเดิม";
  const currentPlaceholder = recoveryMode
    ? "รหัสเดิมของระบบ"
    : pinConfigured
      ? "PIN เดิม 6 ตัว"
      : "รหัสผ่านเดิม";

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => currentRef.current?.focus(), 150);
    return () => clearTimeout(timer);
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          <Text style={styles.label}>{currentLabel}</Text>
          <TextInput
            ref={currentRef}
            style={styles.input}
            value={currentCredential}
            onChangeText={onChangeCurrentCredential}
            secureTextEntry
            placeholder={currentPlaceholder}
            placeholderTextColor="#6b7280"
            keyboardType={currentKeyboardType}
            maxLength={pinConfigured && !recoveryMode ? 6 : undefined}
            returnKeyType="next"
          />

          <Text style={styles.label}>PIN ใหม่</Text>
          <TextInput
            style={styles.input}
            value={pin}
            onChangeText={onChangePin}
            secureTextEntry
            placeholder="ตัวเลข 6 ตัว"
            placeholderTextColor="#6b7280"
            keyboardType="number-pad"
            maxLength={6}
            returnKeyType="next"
          />

          <Text style={styles.label}>ยืนยัน PIN ใหม่</Text>
          <TextInput
            style={styles.input}
            value={confirmPin}
            onChangeText={onChangeConfirmPin}
            secureTextEntry
            placeholder="กรอกซ้ำอีกครั้ง"
            placeholderTextColor="#6b7280"
            keyboardType="number-pad"
            maxLength={6}
            returnKeyType="done"
            onSubmitEditing={onConfirm}
          />

          {!!error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.buttons}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.8}>
              <Text style={styles.cancelText}>ยกเลิก</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmBtn} onPress={onConfirm} activeOpacity={0.8}>
              <Text style={styles.confirmText}>บันทึก PIN</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
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
    width: "86%",
    maxWidth: 380,
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
  label: {
    color: "#e5e7eb",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
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
    marginBottom: 12,
  },
  error: {
    color: "#ef4444",
    fontSize: 13,
    marginBottom: 8,
  },
  buttons: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: "#374151",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  cancelText: {
    color: "#e5e7eb",
    fontWeight: "600",
  },
  confirmBtn: {
    flex: 1,
    backgroundColor: "#16a34a",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  confirmText: {
    color: "#fff",
    fontWeight: "700",
  },
});
