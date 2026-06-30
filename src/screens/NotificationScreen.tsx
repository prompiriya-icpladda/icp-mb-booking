import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { getActiveLongTermAppointments, longTermStatus, LongTermStatus, TodayAppointment } from "../services/api";
import { checkAndNotify, notifyNow } from "../utils/notificationService";
import { useAppointmentStream } from "../utils/useAppointmentStream";

const REFRESH_INTERVAL_MS = 10 * 60 * 1000; // 10 นาที

type AppointmentTab = "normal" | "longTerm";

export default function NotificationScreen({ onScanRequest }: { onScanRequest?: () => void }) {
  const [activeTab, setActiveTab] = useState<AppointmentTab>("normal");
  // นัดหมายปกติ = single-use ของวันนี้ (มาเช็คอินตามเวลา)
  const [todayAppointments, setTodayAppointments] = useState<TodayAppointment[]>([]);
  // นัดหมายระยะยาว = QR ที่ยังไม่หมดอายุ ไม่ผูกกับวันนี้
  const [longTermAppointments, setLongTermAppointments] = useState<TodayAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAppointments = useCallback(async () => {
    // นัดหมายวันนี้ — ตัวที่ขับการแจ้งเตือน (เก็บเฉพาะ single-use ไว้โชว์แท็บปกติ)
    try {
      const data = await checkAndNotify();
      setTodayAppointments(data.filter((a) => a.qrMode !== "long-term"));
      setLastUpdated(new Date());
      setError(null);
    } catch {
      setError("ไม่สามารถโหลดข้อมูลได้");
    }
    // ระยะยาว — best effort: ถ้าโหลดไม่ได้ คงลิสต์เดิมไว้ ไม่ให้กระทบแท็บปกติ
    try {
      const longTerm = await getActiveLongTermAppointments();
      setLongTermAppointments(longTerm);
    } catch {
      // เงียบไว้
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchAppointments().finally(() => setLoading(false));

    intervalRef.current = setInterval(fetchAppointments, REFRESH_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchAppointments]);

  // รับแจ้งเตือนทันทีเมื่อมีการเปลี่ยนแปลงจาก server (SSE)
  useAppointmentStream(useCallback(() => {
    notifyNow("🔔 มีการอัปเดตนัดหมาย", "กรุณาตรวจสอบรายการนัดหมาย").catch(() => {});
    fetchAppointments();
  }, [fetchAppointments]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAppointments();
    setRefreshing(false);
  }, [fetchAppointments]);

  const today = new Date().toLocaleDateString("th-TH", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const isLongTerm = activeTab === "longTerm";
  const list = isLongTerm ? longTermAppointments : todayAppointments;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{isLongTerm ? "นัดหมายระยะยาว" : "นัดหมายวันนี้"}</Text>
        <Text style={styles.headerDate}>{isLongTerm ? "QR ที่ยังไม่หมดอายุ" : today}</Text>
        <View style={styles.headerRow}>
          {!loading && (
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{list.length} รายการ</Text>
            </View>
          )}
          {lastUpdated && (
            <Text style={styles.lastUpdated}>
              อัปเดต {lastUpdated.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
            </Text>
          )}
        </View>
      </View>

      {/* ── แท็บสลับ ปกติ / ระยะยาว ── */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, !isLongTerm && styles.tabBtnActive]}
          onPress={() => setActiveTab("normal")}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabBtnText, !isLongTerm && styles.tabBtnTextActive]}>
            นัดหมายปกติ ({todayAppointments.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, isLongTerm && styles.tabBtnActive]}
          onPress={() => setActiveTab("longTerm")}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabBtnText, isLongTerm && styles.tabBtnTextActive]}>
            ระยะยาว ({longTermAppointments.length})
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#16a34a" />
        </View>
      ) : error && !isLongTerm ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={onRefresh}>
            <Text style={styles.retryText}>ลองใหม่</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(item) => item._id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={["#16a34a"]}
              tintColor="#16a34a"
            />
          }
          contentContainerStyle={list.length === 0 ? styles.emptyContainer : styles.listContent}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyText}>
                {isLongTerm ? "ไม่มีนัดหมายระยะยาว" : "ไม่มีนัดหมายวันนี้"}
              </Text>
            </View>
          }
          renderItem={({ item }) => <AppointmentCard item={item} onScanRequest={onScanRequest} />}
        />
      )}
    </View>
  );
}

function AppointmentCard({ item, onScanRequest }: { item: TodayAppointment; onScanRequest?: () => void }) {
  const isLongTerm = item.qrMode === "long-term";
  const checkedIn = !!item.checkedInAt;
  const ltStatus = longTermStatus(item);
  // ระยะยาวสแกนซ้ำได้เสมอ → แตะเพื่อสแกนได้ตลอด; ปกติแตะได้เฉพาะที่ยังไม่เช็คอิน
  const tappable = !!onScanRequest && (isLongTerm || !checkedIn);
  const Wrapper = tappable ? TouchableOpacity : View;
  return (
    <Wrapper
      style={styles.card}
      {...(tappable ? { onPress: onScanRequest, activeOpacity: 0.75 } : {})}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardLeft}>
          <Text style={styles.visitorName}>{item.visitorName}</Text>
          <Text style={styles.organization}>{item.visitorOrganization}</Text>
        </View>
        {isLongTerm ? (
          <View style={[styles.statusBadge, longTermBadgeStyle(ltStatus)]}>
            <Text style={[styles.statusText, longTermTextStyle(ltStatus)]}>{longTermLabel(ltStatus)}</Text>
          </View>
        ) : (
          <View style={[styles.statusBadge, checkedIn ? styles.statusChecked : styles.statusPending]}>
            <Text style={[styles.statusText, checkedIn ? styles.statusCheckedText : styles.statusPendingText]}>
              {checkedIn ? "เช็คอินแล้ว" : "รอเช็คอิน"}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.pillRow}>
        {isLongTerm ? (
          <Pill icon="📅" text={item.expiryDate ? `ถึง ${item.expiryDate}` : "ไม่จำกัด"} />
        ) : (
          <Pill icon="🕐" text={item.appointmentTime} />
        )}
        <Pill icon="📌" text={item.purpose} />
        {item.visitorCount > 1 && <Pill icon="👥" text={`${item.visitorCount} คน`} />}
        {item.hasVehicle && item.licensePlate ? <Pill icon="🚗" text={item.licensePlate} /> : null}
      </View>
      <View style={styles.cardFooter}>
        <Text style={styles.createdBy}>มาพบ: {item.createdByName}</Text>
        {tappable && (
          <View style={styles.scanHint}>
            <Text style={styles.scanHintText}>📷 แตะเพื่อสแกน</Text>
          </View>
        )}
      </View>
    </Wrapper>
  );
}

function Pill({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.pillIcon}>{icon}</Text>
      <Text style={styles.pillText}>{text}</Text>
    </View>
  );
}

function longTermLabel(s: LongTermStatus) {
  return s === "registered" ? "ลงทะเบียน" : s === "arrived" ? "มาแล้ว" : "เช็คเอาท์";
}

function longTermBadgeStyle(s: LongTermStatus) {
  return s === "registered"
    ? styles.statusPending
    : s === "arrived"
      ? styles.statusChecked
      : styles.statusCheckedOut;
}

function longTermTextStyle(s: LongTermStatus) {
  return s === "registered"
    ? styles.statusPendingText
    : s === "arrived"
      ? styles.statusCheckedText
      : styles.statusCheckedOutText;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  header: {
    backgroundColor: "#1f2937",
    paddingTop: 52,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "700" },
  headerDate: { color: "#9ca3af", fontSize: 12, marginTop: 2 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },
  lastUpdated: { color: "#6b7280", fontSize: 11 },
  countBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#16a34a",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 99,
    marginTop: 10,
  },
  countText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  tabRow: {
    flexDirection: "row",
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  tabBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
  },
  tabBtnActive: { backgroundColor: "#16a34a" },
  tabBtnText: { fontSize: 13, fontWeight: "600", color: "#6b7280" },
  tabBtnTextActive: { color: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  emptyContainer: { flex: 1 },
  listContent: { padding: 16, gap: 12 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { color: "#6b7280", fontSize: 15 },
  errorText: { color: "#dc2626", fontSize: 14, marginBottom: 12, textAlign: "center" },
  retryBtn: {
    backgroundColor: "#16a34a",
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: { color: "#fff", fontWeight: "600" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  cardLeft: { flex: 1, marginRight: 8 },
  visitorName: { fontSize: 15, fontWeight: "700", color: "#111827" },
  organization: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 },
  statusChecked: { backgroundColor: "#dcfce7" },
  statusPending: { backgroundColor: "#f3f4f6" },
  statusLongTerm: { backgroundColor: "#dbeafe" },
  statusCheckedOut: { backgroundColor: "#e5e7eb" },
  statusText: { fontSize: 11, fontWeight: "600" },
  statusCheckedText: { color: "#16a34a" },
  statusPendingText: { color: "#6b7280" },
  statusLongTermText: { color: "#2563eb" },
  statusCheckedOutText: { color: "#374151" },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  pillIcon: { fontSize: 11 },
  pillText: { fontSize: 12, color: "#374151" },
  createdBy: { fontSize: 11, color: "#9ca3af" },
  cardFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 },
  scanHint: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f0fdf4",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  scanHintText: { fontSize: 11, color: "#16a34a", fontWeight: "600" },
});
