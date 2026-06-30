import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { checkoutAppointment, TodayAppointment, VisitorType } from "../services/api";

function visitorTypeLabel(t?: VisitorType): string {
  if (t === "rider") return "Rider";
  if (t === "merchant") return "แม่ค้า";
  return t ?? "-";
}

function formatCheckedInAt(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function LongTermDetailScreen({
  appointment,
  onBack,
  onCheckedOut,
}: {
  appointment: TodayAppointment;
  onBack: () => void;
  onCheckedOut: () => void;
}) {
  const [checkingOut, setCheckingOut] = useState(false);

  async function handleCheckout() {
    if (checkingOut) return;
    setCheckingOut(true);
    try {
      const res = await checkoutAppointment(appointment._id);
      if (res.success) {
        onCheckedOut();
      } else {
        Alert.alert("ไม่สำเร็จ", res.error || "บันทึกการเช็คเอาท์ไม่สำเร็จ");
      }
    } catch (e) {
      Alert.alert(
        "ไม่สำเร็จ",
        e instanceof Error ? e.message : "บันทึกการเช็คเอาท์ไม่สำเร็จ",
      );
    } finally {
      setCheckingOut(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} activeOpacity={0.7} style={styles.backBtn}>
          <Text style={styles.backText}>‹ กลับ</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>รายละเอียดผู้มาเยือน</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.statusBadge}>
          <Text style={styles.statusText}>มาแล้ว</Text>
        </View>

        <Text style={styles.name}>{appointment.visitorName}</Text>
        {appointment.visitorOrganization ? (
          <Text style={styles.org}>{appointment.visitorOrganization}</Text>
        ) : null}

        <View style={styles.infoCard}>
          <InfoRow label="ประเภท" value={visitorTypeLabel(appointment.visitorType)} />
          <InfoRow label="ถึงวันที่" value={appointment.expiryDate || "ไม่จำกัด"} />
          <InfoRow label="จุดประสงค์" value={appointment.purpose} />
          {appointment.visitorCount > 1 ? (
            <InfoRow label="จำนวน" value={`${appointment.visitorCount} คน`} />
          ) : null}
          {appointment.hasVehicle && appointment.licensePlate ? (
            <InfoRow label="ทะเบียนรถ" value={appointment.licensePlate} />
          ) : null}
          <InfoRow label="ลงทะเบียนโดย" value={appointment.createdByName} />
          <InfoRow label="เข้าเมื่อ" value={formatCheckedInAt(appointment.checkedInAt)} />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.checkoutBtn, checkingOut && styles.btnDisabled]}
          onPress={handleCheckout}
          disabled={checkingOut}
          activeOpacity={0.85}
        >
          {checkingOut ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.checkoutText}>เช็คเอาท์</Text>
          )}
        </TouchableOpacity>
      </View>
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
  container: { flex: 1, backgroundColor: "#f9fafb" },
  header: {
    backgroundColor: "#1f2937",
    paddingTop: 52,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  backBtn: { paddingVertical: 4, marginBottom: 4, alignSelf: "flex-start" },
  backText: { color: "#9ca3af", fontSize: 15, fontWeight: "600" },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "700" },
  body: { padding: 16 },
  statusBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#dcfce7",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 99,
    marginBottom: 12,
  },
  statusText: { color: "#16a34a", fontSize: 13, fontWeight: "700" },
  name: { fontSize: 22, fontWeight: "700", color: "#111827" },
  org: { fontSize: 14, color: "#6b7280", marginTop: 2 },
  infoCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  infoRow: {
    flexDirection: "row",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  infoLabel: { flex: 2, color: "#6b7280", fontSize: 14 },
  infoValue: { flex: 3, color: "#111827", fontSize: 14, fontWeight: "500" },
  footer: {
    padding: 16,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  checkoutBtn: {
    backgroundColor: "#16a34a",
    borderRadius: 8,
    paddingVertical: 15,
    alignItems: "center",
  },
  btnDisabled: { opacity: 0.5 },
  checkoutText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
