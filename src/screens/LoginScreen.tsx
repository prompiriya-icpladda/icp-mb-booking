import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuth } from "../context/AuthContext";

export default function LoginScreen() {
  const { login } = useAuth();
  const [employeeCode, setEmployeeCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!employeeCode.trim() || !password.trim()) {
      setError("กรุณากรอกรหัสพนักงานและรหัสผ่าน");
      return;
    }
    setLoading(true);
    setError(null);
    const err = await login(employeeCode.trim(), password);
    setLoading(false);
    if (err) setError(err);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.logo}>🔍</Text>
        <Text style={styles.title}>Scanner App</Text>
        <Text style={styles.subtitle}>ระบบสแกน QR นัดหมายบุคคลภายนอก</Text>

        <TextInput
          style={styles.input}
          placeholder="รหัสพนักงาน"
          placeholderTextColor="#9ca3af"
          value={employeeCode}
          onChangeText={setEmployeeCode}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextInput
          style={styles.input}
          placeholder="รหัสผ่าน"
          placeholderTextColor="#9ca3af"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>เข้าสู่ระบบ</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f0fdf4",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 28,
    width: "100%",
    maxWidth: 360,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
    alignItems: "center",
  },
  logo: { fontSize: 48, marginBottom: 8 },
  title: { fontSize: 22, fontWeight: "700", color: "#111827", marginBottom: 4 },
  subtitle: { fontSize: 13, color: "#6b7280", marginBottom: 24, textAlign: "center" },
  input: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#111827",
    marginBottom: 12,
    backgroundColor: "#f9fafb",
  },
  error: {
    color: "#dc2626",
    fontSize: 13,
    marginBottom: 12,
    textAlign: "center",
  },
  button: {
    width: "100%",
    backgroundColor: "#16a34a",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
