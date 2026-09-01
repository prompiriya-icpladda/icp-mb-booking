import React, { useEffect, useRef } from "react";
import { Modal, StyleSheet, TouchableOpacity, View, type TextInputProps } from "react-native";
import {
  AppText as Text,
  AppTextInput as TextInput,
  type AppTextInputRef,
} from "../theme/typography";

export function KioskAdminPasswordModal({
  visible,
  title,
  subtitle,
  password,
  error,
  confirmLabel = "ยืนยัน",
  placeholder = "รหัสผ่าน",
  keyboardType = "default",
  maxLength,
  helperText,
  onChangePassword,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  subtitle: string;
  password: string;
  error: string;
  confirmLabel?: string;
  placeholder?: string;
  keyboardType?: TextInputProps["keyboardType"];
  maxLength?: number;
  helperText?: string;
  onChangePassword: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const inputRef = useRef<AppTextInputRef>(null);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 150);
    return () => clearTimeout(timer);
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          {!!helperText && <Text style={styles.helper}>{helperText}</Text>}
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={password}
            onChangeText={onChangePassword}
            secureTextEntry
            placeholder={placeholder}
            placeholderTextColor="#6b7280"
            keyboardType={keyboardType}
            maxLength={maxLength}
            returnKeyType="done"
            onSubmitEditing={onConfirm}
          />
          {!!error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.buttons}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.8}>
              <Text style={styles.cancelText}>ยกเลิก</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmBtn} onPress={onConfirm} activeOpacity={0.8}>
              <Text style={styles.confirmText}>{confirmLabel}</Text>
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
  helper: {
    color: "#fbbf24",
    fontSize: 13,
    marginBottom: 12,
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
    backgroundColor: "#dc2626",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  confirmText: {
    color: "#fff",
    fontWeight: "700",
  },
});
