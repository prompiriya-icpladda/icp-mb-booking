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
import { TodayAppointment } from "../services/api";
import { checkAndNotify, notifyNow } from "../utils/notificationService";
import { useAppointmentStream } from "../utils/useAppointmentStream";

const REFRESH_INTERVAL_MS = 10 * 60 * 1000; // 10 นาที

export default function NotificationScreen({ onScanRequest }: { onScanRequest?: () => void }) {
  const [appointments, setAppointments] = useState<TodayAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAppointments = useCallback(async () => {
    try {
      const data = await checkAndNotify();
      setAppointments(data);
      setLastUpdated(new Date());
      setError(null);
    } catch {
      setError("ไม่สามารถโหลดข้อมูลได้");
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>นัดหมายวันนี้</Text>
        <Text style={styles.headerDate}>{today}</Text>
        <View style={styles.headerRow}>
          {!loading && (
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{appointments.length} รายการ</Text>
            </View>
          )}
          {lastUpdated && (
            <Text style={styles.lastUpdated}>
              อัปเดต {lastUpdated.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
            </Text>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#16a34a" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={onRefresh}>
            <Text style={styles.retryText}>ลองใหม่</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={appointments}
          keyExtractor={(item) => item._id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={["#16a34a"]}
              tintColor="#16a34a"
            />
          }
          contentContainerStyle={
            appointments.length === 0 ? styles.emptyContainer : styles.listContent
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyText}>ไม่มีนัดหมายวันนี้</Text>
            </View>
          }
          renderItem={({ item }) => <AppointmentCard item={item} onScanRequest={onScanRequest} />}
        />
      )}
    </View>
  );
}

function AppointmentCard({ item, onScanRequest }: { item: TodayAppointment; onScanRequest?: () => void }) {
  const checkedIn = !!item.checkedInAt;
  const Wrapper = (!checkedIn && onScanRequest) ? TouchableOpacity : View;
  return (
    <Wrapper
      style={styles.card}
      {...(!checkedIn && onScanRequest ? { onPress: onScanRequest, activeOpacity: 0.75 } : {})}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardLeft}>
          <Text style={styles.visitorName}>{item.visitorName}</Text>
          <Text style={styles.organization}>{item.visitorOrganization}</Text>
        </View>
        <View style={[styles.statusBadge, checkedIn ? styles.statusChecked : styles.statusPending]}>
          <Text style={[styles.statusText, checkedIn ? styles.statusCheckedText : styles.statusPendingText]}>
            {checkedIn ? "เช็คอินแล้ว" : "รอเช็คอิน"}
          </Text>
        </View>
      </View>
      <View style={styles.pillRow}>
        <Pill icon="🕐" text={item.appointmentTime} />
        <Pill icon="📌" text={item.purpose} />
        {item.visitorCount > 1 && <Pill icon="👥" text={`${item.visitorCount} คน`} />}
        {item.hasVehicle && item.licensePlate ? <Pill icon="🚗" text={item.licensePlate} /> : null}
      </View>
      <View style={styles.cardFooter}>
        <Text style={styles.createdBy}>มาพบ: {item.createdByName}</Text>
        {!checkedIn && onScanRequest && (
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
  statusText: { fontSize: 11, fontWeight: "600" },
  statusCheckedText: { color: "#16a34a" },
  statusPendingText: { color: "#6b7280" },
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
