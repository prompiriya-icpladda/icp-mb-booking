import { CameraView, useCameraPermissions } from "expo-camera";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { checkinAppointment, CheckinResult } from "../services/api";

type ScanState = "scanning" | "loading" | "result";

interface ResultDisplay {
  icon: string;
  title: string;
  color: string;
  data: CheckinResult | null;
  errorMsg?: string;
}

export default function ScannerScreen() {
  const { token, user, logout } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanState, setScanState] = useState<ScanState>("scanning");
  const [result, setResult] = useState<ResultDisplay | null>(null);
  const processingRef = useRef(false);

  function extractAppointmentId(data: string): string | null {
    if (data.startsWith("apt:")) return data.slice(4);
    const match = data.match(/\/visitor-appointments\/([^/]+)\/checkin/);
    return match ? match[1] : null;
  }

  async function handleBarcodeScan({ data }: { data: string }) {
    if (processingRef.current || scanState !== "scanning") return;

    const id = extractAppointmentId(data);
    if (!id) return;

    processingRef.current = true;
    setScanState("loading");
    try {
      const res = await checkinAppointment(id, token!);
      if (res.success) {
        setResult({
          icon: res.alreadyCheckedIn ? "⚠️" : "✅",
          title: res.alreadyCheckedIn ? "เช็คอินซ้ำ" : "เช็คอินสำเร็จ",
          color: res.alreadyCheckedIn ? "#d97706" : "#16a34a",
          data: res,
        });
      } else {
        setResult({
          icon: "❌",
          title: "ไม่พบนัดหมาย",
          color: "#dc2626",
          data: null,
          errorMsg: res.error,
        });
      }
    } catch {
      setResult({
        icon: "❌",
        title: "เกิดข้อผิดพลาด",
        color: "#dc2626",
        data: null,
        errorMsg: "ไม่สามารถเชื่อมต่อ server ได้",
      });
    }
    setScanState("result");
  }

  function resetScan() {
    processingRef.current = false;
    setResult(null);
    setScanState("scanning");
  }

  if (!permission) return <View style={styles.center}><ActivityIndicator /></View>;

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permText}>จำเป็นต้องใช้กล้องเพื่อสแกน QR</Text>
        <TouchableOpacity style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>อนุญาตใช้กล้อง</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>สแกน QR นัดหมาย</Text>
        <View style={styles.headerRight}>
          <Text style={styles.userName}>{user?.name}</Text>
          <TouchableOpacity onPress={logout}>
            <Text style={styles.logout}>ออก</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Camera */}
      <View style={styles.cameraContainer}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={scanState === "scanning" ? handleBarcodeScan : undefined}
        />
        {/* Viewfinder overlay */}
        <View style={styles.overlay}>
          <View style={styles.viewfinder} />
        </View>
        {scanState === "loading" && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.loadingText}>กำลังตรวจสอบ...</Text>
          </View>
        )}
      </View>

      <Text style={styles.hint}>วาง QR Code ไว้ในกรอบ</Text>

      {/* Result Modal */}
      <Modal visible={scanState === "result"} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.resultIcon}>{result?.icon}</Text>
            <Text style={[styles.resultTitle, { color: result?.color }]}>
              {result?.title}
            </Text>
            {result?.data && (
              <View style={styles.infoBox}>
                <InfoRow label="ผู้มาเยือน" value={result.data.visitorName} />
                <InfoRow label="มาพบ" value={result.data.createdByName} />
                <InfoRow label="วันที่" value={`${result.data.appointmentDate} ${result.data.appointmentTime}`} />
                <InfoRow label="จุดประสงค์" value={result.data.purpose} />
                {result.data.hasVehicle && result.data.licensePlate && (
                  <InfoRow label="ทะเบียน" value={result.data.licensePlate} />
                )}
              </View>
            )}
            {result?.errorMsg && (
              <Text style={styles.errorMsg}>{result.errorMsg}</Text>
            )}
            <TouchableOpacity style={styles.btn} onPress={resetScan}>
              <Text style={styles.btnText}>สแกนต่อ</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || "-"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111827" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    backgroundColor: "#1f2937",
  },
  headerTitle: { color: "#fff", fontSize: 17, fontWeight: "700" },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 12 },
  userName: { color: "#9ca3af", fontSize: 13 },
  logout: { color: "#f87171", fontSize: 13, fontWeight: "600" },
  cameraContainer: { flex: 1, position: "relative" },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  viewfinder: {
    width: 240,
    height: 240,
    borderWidth: 3,
    borderColor: "#4ade80",
    borderRadius: 12,
    backgroundColor: "transparent",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: { color: "#fff", fontSize: 15 },
  hint: {
    color: "#9ca3af",
    textAlign: "center",
    fontSize: 13,
    paddingVertical: 12,
    backgroundColor: "#1f2937",
  },
  permText: { fontSize: 15, color: "#374151", marginBottom: 16, textAlign: "center" },
  btn: {
    backgroundColor: "#16a34a",
    paddingHorizontal: 32,
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 12,
    width: "100%",
  },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 28,
    alignItems: "center",
  },
  resultIcon: { fontSize: 52, marginBottom: 8 },
  resultTitle: { fontSize: 20, fontWeight: "700", marginBottom: 16 },
  infoBox: { width: "100%", marginBottom: 8 },
  infoRow: { flexDirection: "row", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  infoLabel: { flex: 2, color: "#6b7280", fontSize: 13 },
  infoValue: { flex: 3, color: "#111827", fontSize: 13, fontWeight: "500" },
  errorMsg: { color: "#dc2626", fontSize: 13, marginBottom: 8, textAlign: "center" },
});
