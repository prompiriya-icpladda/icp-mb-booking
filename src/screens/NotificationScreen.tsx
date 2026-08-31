import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { AppText as Text } from "../theme/typography";
import { checkoutAppointment, getActiveLongTermAppointments, isLongTermCheckoutable, isLongTermOnSite, longTermCardAction, longTermStatus, LongTermStatus, normalStatus, NormalStatus, sortAppointmentsByLatest, TodayAppointment } from "../services/api";
import { checkAndNotify, notifyNow } from "../utils/notificationService";
import { useAppointmentStream } from "../utils/useAppointmentStream";
import LongTermDetailScreen from "./LongTermDetailScreen";
import { clearHistory, getHistory, getUnreadCount, markAllRead, subscribe } from "../utils/notificationHistory";
import { formatRelativeTime, NotificationHistoryEntry } from "../utils/notificationHistory.logic";

const REFRESH_INTERVAL_MS = 10 * 60 * 1000; // 10 นาที

type AppointmentTab = "normal" | "longTerm" | "history";

export default function NotificationScreen({
  onScanRequest,
  openCheckoutId,
  onCheckoutConsumed,
}: {
  onScanRequest?: () => void;
  openCheckoutId?: string | null;
  onCheckoutConsumed?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<AppointmentTab>("normal");
  // นัดหมายปกติ = single-use ของวันนี้ (มาเช็คอินตามเวลา)
  const [todayAppointments, setTodayAppointments] = useState<TodayAppointment[]>([]);
  // นัดหมายระยะยาว = รายการที่ยังไม่หมดอายุ ไม่ผูกกับวันนี้
  const [longTermAppointments, setLongTermAppointments] = useState<TodayAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [checkingOut, setCheckingOut] = useState(false);
  const [detailItem, setDetailItem] = useState<TodayAppointment | null>(null);
  const [history, setHistory] = useState<NotificationHistoryEntry[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const listRef = useRef<FlatList<TodayAppointment>>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pendingCheckoutId, setPendingCheckoutId] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAppointments = useCallback(async () => {
    // นัดหมายวันนี้ — ตัวที่ขับการแจ้งเตือน (เก็บเฉพาะ single-use ไว้โชว์แท็บปกติ)
    try {
      const data = await checkAndNotify();
      // ล่าสุดขึ้นก่อน — เรียงในแอปเอง ไม่พึ่งลำดับจาก server
      setTodayAppointments(
        sortAppointmentsByLatest(data.filter((a) => a.qrMode !== "long-term")),
      );
      setLastUpdated(new Date());
      setError(null);
    } catch {
      setError("ไม่สามารถโหลดข้อมูลได้");
    }
    // ระยะยาว — best effort: ถ้าโหลดไม่ได้ คงลิสต์เดิมไว้ ไม่ให้กระทบแท็บปกติ
    // โชว์เฉพาะ "มาแล้ว" (คนที่อยู่ในพื้นที่) — ซ่อน "ลงทะเบียน" และ "เช็คเอาท์"
    try {
      const longTerm = await getActiveLongTermAppointments();
      setLongTermAppointments(longTerm.filter(isLongTermOnSite));
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

  useEffect(() => {
    const refresh = () => {
      getHistory().then(setHistory);
      setUnreadCount(getUnreadCount());
    };
    refresh();
    const unsub = subscribe(refresh);
    return unsub;
  }, []);

  // รับแจ้งเตือนทันทีเมื่อมีการเปลี่ยนแปลงจาก server (SSE)
  useAppointmentStream(useCallback(() => {
    notifyNow("🔔 มีการอัปเดตนัดหมาย", "กรุณาตรวจสอบรายการนัดหมาย").catch(() => {});
    fetchAppointments();
  }, [fetchAppointments]));

  useEffect(() => {
    exitSelectMode();
    if (activeTab === "history") {
      markAllRead();
    }
  }, [activeTab]);

  // รับ id จากการสแกนซ้ำ → สลับไปแท็บระยะยาว ตั้ง pending แล้วเคลียร์ฝั่ง App (กัน re-trigger ตอน remount)
  useEffect(() => {
    if (!openCheckoutId) return;
    setActiveTab("longTerm");
    setPendingCheckoutId(openCheckoutId);
    onCheckoutConsumed?.();
  }, [openCheckoutId, onCheckoutConsumed]);

  // เมื่อมี pending และข้อมูลระยะยาวพร้อม → เปิด detail/checkout ของคนนั้น (re-run เองเมื่อ list มาทีหลัง)
  useEffect(() => {
    if (!pendingCheckoutId) return;
    const item = longTermAppointments.find((a) => a._id === pendingCheckoutId);
    if (item) {
      setDetailItem(item);
      setPendingCheckoutId(null);
    }
  }, [pendingCheckoutId, longTermAppointments]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAppointments();
    setRefreshing(false);
  }, [fetchAppointments]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  async function checkoutSelected() {
    if (selectedIds.size === 0) return;
    setCheckingOut(true);
    try {
      const results = await Promise.allSettled(
        [...selectedIds].map((id) => checkoutAppointment(id)),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      await fetchAppointments();
      if (failed > 0) {
        Alert.alert(
          "เช็คเอาท์ไม่สำเร็จ",
          `มี ${failed} รายการที่เช็คเอาท์ไม่สำเร็จ กรุณาลองใหม่`,
        );
      }
    } finally {
      setCheckingOut(false);
      exitSelectMode();
    }
  }

  function handleHistoryPress(item: NotificationHistoryEntry) {
    const targetTab: AppointmentTab = item.tab ?? "normal";
    const pool = targetTab === "longTerm" ? longTermAppointments : todayAppointments;
    const found = item.appointmentId
      ? pool.find((a) => a._id === item.appointmentId)
      : undefined;

    setActiveTab(targetTab);

    if (item.appointmentId && !found) {
      Alert.alert("ไม่พบนัดหมาย", "นัดหมายนี้ไม่อยู่ในรายการแล้ว");
      return;
    }
    if (!found) return; // entry แบบ update ไม่มี id → แค่สลับไปแท็บปกติ

    setHighlightId(found._id);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightId(null), 2500);

    // best-effort scroll ไปการ์ดเป้าหมายหลังแท็บ render
    setTimeout(() => {
      try {
        const index = pool.findIndex((a) => a._id === found._id);
        if (index >= 0) listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.3 });
      } catch {
        // เลื่อนไม่ได้ก็ไม่เป็นไร
      }
    }, 200);
  }

  const today = new Date().toLocaleDateString("th-TH", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const isLongTerm = activeTab === "longTerm";
  const isHistory = activeTab === "history";
  const list = isLongTerm ? longTermAppointments : todayAppointments;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{isHistory ? "ประวัติการแจ้งเตือน" : isLongTerm ? "นัดหมายระยะยาว" : "นัดหมายวันนี้"}</Text>
        <Text style={styles.headerDate}>{isHistory ? "ย้อนหลัง 7 วัน" : isLongTerm ? "รายการที่ยังไม่หมดอายุ" : today}</Text>
        <View style={styles.headerRow}>
          {(isHistory || !loading) && (
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{isHistory ? history.length : list.length} รายการ</Text>
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
          style={[styles.tabBtn, activeTab === "normal" && styles.tabBtnActive]}
          onPress={() => setActiveTab("normal")}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabBtnText, activeTab === "normal" && styles.tabBtnTextActive]}>
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
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === "history" && styles.tabBtnActive]}
          onPress={() => setActiveTab("history")}
          activeOpacity={0.8}
        >
          <View style={styles.tabLabelWrap}>
            <Text style={[styles.tabBtnText, activeTab === "history" && styles.tabBtnTextActive]}>
              ประวัติ
            </Text>
            {unreadCount > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </View>

      {isLongTerm && (
        <View style={styles.selectBar}>
          <TouchableOpacity
            style={styles.selectToggle}
            onPress={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
            activeOpacity={0.8}
          >
            <Text style={styles.selectToggleText}>
              {selectMode ? "ยกเลิก" : "เลือกเช็คเอาท์"}
            </Text>
          </TouchableOpacity>
          {selectMode && (
            <Text style={styles.selectHint}>เลือกแม่ค้า/ไรเดอร์เดิม หรือรายการ QR ระยะยาวที่ "รอสแกนเสร็จสิ้น"</Text>
          )}
        </View>
      )}

      {isHistory ? (
        <HistoryList
          history={history}
          onClear={() => {
            Alert.alert("ล้างประวัติทั้งหมด", "ต้องการลบประวัติการแจ้งเตือนทั้งหมดหรือไม่?", [
              { text: "ยกเลิก", style: "cancel" },
              { text: "ล้าง", style: "destructive", onPress: () => clearHistory() },
            ]);
          }}
          onPressRow={handleHistoryPress}
        />
      ) : loading ? (
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
          ref={listRef}
          onScrollToIndexFailed={() => {}}
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
          contentContainerStyle={[list.length === 0 ? styles.emptyContainer : styles.listContent, isLongTerm && selectMode && styles.listContentSelect]}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyText}>
                {isLongTerm ? "ไม่มีนัดหมายระยะยาว" : "ไม่มีนัดหมายวันนี้"}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <AppointmentCard
              item={item}
              onScanRequest={onScanRequest}
              onOpenDetail={setDetailItem}
              selectMode={isLongTerm && selectMode}
              selected={selectedIds.has(item._id)}
              selectable={isLongTermCheckoutable(item)}
              onToggleSelect={toggleSelect}
              highlighted={item._id === highlightId}
            />
          )}
        />
      )}

      {isLongTerm && selectMode && (
        <View style={styles.actionBar}>
          <TouchableOpacity
            style={[
              styles.checkoutBtn,
              (selectedIds.size === 0 || checkingOut) && styles.checkoutDisabled,
            ]}
            onPress={checkoutSelected}
            disabled={selectedIds.size === 0 || checkingOut}
            activeOpacity={0.85}
          >
            {checkingOut ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.checkoutBtnText}>
                เช็คเอาท์ที่เลือก ({selectedIds.size})
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      <Modal
        visible={!!detailItem}
        animationType="slide"
        onRequestClose={() => setDetailItem(null)}
      >
        {detailItem && (
          <LongTermDetailScreen
            appointment={detailItem}
            onBack={() => setDetailItem(null)}
            onCheckedOut={() => {
              setDetailItem(null);
              fetchAppointments();
            }}
          />
        )}
      </Modal>
    </View>
  );
}

function AppointmentCard({
  item,
  onScanRequest,
  onOpenDetail,
  selectMode = false,
  selected = false,
  selectable = false,
  onToggleSelect,
  highlighted = false,
}: {
  item: TodayAppointment;
  onScanRequest?: () => void;
  onOpenDetail?: (item: TodayAppointment) => void;
  selectMode?: boolean;
  selected?: boolean;
  selectable?: boolean;
  onToggleSelect?: (id: string) => void;
  highlighted?: boolean;
}) {
  const isLongTerm = item.qrMode === "long-term";
  const checkedIn = !!item.checkedInAt;
  const ltStatus = longTermStatus(item);
  const nmStatus = normalStatus(item);

  // long-term: longTermCardAction ตัดสิน select/detail/scan; การ์ดปกติ: สแกนเหมือนเดิม
  const wantsDetail = isLongTerm && longTermCardAction(item, selectMode) === "detail";

  // โหมดเลือก: แตะเพื่อเลือก; rider/แม่ค้าที่มาแล้วหรือรอสแกนเสร็จสิ้น: เปิดรายละเอียด; อื่นๆ: สแกน
  const tappable = selectMode
    ? selectable
    : wantsDetail
      ? !!onOpenDetail
      : !!onScanRequest && (isLongTerm || !checkedIn);
  const Wrapper = tappable ? TouchableOpacity : View;
  const handlePress = selectMode
    ? () => onToggleSelect?.(item._id)
    : wantsDetail
      ? () => onOpenDetail?.(item)
      : onScanRequest;

  return (
    <Wrapper
      style={[
        styles.card,
        selectMode && !selectable && styles.cardDisabled,
        selected && styles.cardSelected,
        highlighted && styles.cardHighlight,
      ]}
      {...(tappable ? { onPress: handlePress, activeOpacity: 0.75 } : {})}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardLeft}>
          <Text style={styles.visitorName}>{item.visitorName}</Text>
          <Text style={styles.organization}>{item.visitorOrganization}</Text>
        </View>
        {selectMode && isLongTerm ? (
          <View
            style={[
              styles.checkbox,
              selected && styles.checkboxOn,
              !selectable && styles.checkboxDisabled,
            ]}
          >
            <Text style={styles.checkboxMark}>{selected ? "✓" : ""}</Text>
          </View>
        ) : isLongTerm ? (
          <View style={[styles.statusBadge, longTermBadgeStyle(ltStatus)]}>
            <Text style={[styles.statusText, longTermTextStyle(ltStatus)]}>{longTermLabel(ltStatus)}</Text>
          </View>
        ) : (
          <View style={[styles.statusBadge, normalBadgeStyle(nmStatus)]}>
            <Text style={[styles.statusText, normalTextStyle(nmStatus)]}>{normalLabel(nmStatus)}</Text>
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
        {!selectMode && tappable && (
          <View style={styles.scanHint}>
            <Text style={styles.scanHintText}>
              {wantsDetail ? "› ดูรายละเอียด" : "📷 แตะเพื่อสแกน"}
            </Text>
          </View>
        )}
      </View>
    </Wrapper>
  );
}

function HistoryList({
  history,
  onClear,
  onPressRow,
}: {
  history: NotificationHistoryEntry[];
  onClear: () => void;
  onPressRow: (item: NotificationHistoryEntry) => void;
}) {
  const now = Date.now();
  return (
    <View style={styles.historyWrap}>
      {history.length > 0 && (
        <View style={styles.historyBar}>
          <TouchableOpacity style={styles.clearBtn} onPress={onClear} activeOpacity={0.8}>
            <Text style={styles.clearBtnText}>ล้างประวัติทั้งหมด</Text>
          </TouchableOpacity>
        </View>
      )}
      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        contentContainerStyle={history.length === 0 ? styles.emptyContainer : styles.listContent}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyIcon}>🔕</Text>
            <Text style={styles.emptyText}>ยังไม่มีประวัติการแจ้งเตือน</Text>
          </View>
        }
        renderItem={({ item }) => <HistoryRow item={item} now={now} onPress={onPressRow} />}
      />
    </View>
  );
}

function HistoryRow({ item, now, onPress }: { item: NotificationHistoryEntry; now: number; onPress: (item: NotificationHistoryEntry) => void }) {
  const icon = item.kind === "new-appointment" ? "🆕" : "🔄";
  return (
    <TouchableOpacity
      style={[styles.historyCard, !item.read && styles.historyCardUnread]}
      onPress={() => onPress(item)}
      activeOpacity={0.7}
    >
      <Text style={styles.historyIcon}>{icon}</Text>
      <View style={styles.historyBody}>
        <Text style={styles.historyTitle}>{item.title}</Text>
        <Text style={styles.historyText}>{item.body}</Text>
        <Text style={styles.historyTime}>{formatRelativeTime(item.timestamp, now)}</Text>
      </View>
      {!item.read && <View style={styles.unreadDot} />}
    </TouchableOpacity>
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
  return s === "registered"
    ? "ลงทะเบียน"
    : s === "arrived"
      ? "มาแล้ว"
      : s === "completion-requested"
        ? "รอสแกนเสร็จสิ้น"
        : "เช็คเอาท์";
}

function longTermBadgeStyle(s: LongTermStatus) {
  return s === "registered"
    ? styles.statusPending
    : s === "arrived"
      ? styles.statusChecked
      : s === "completion-requested"
        ? styles.statusCompletionRequested
      : styles.statusCheckedOut;
}

function normalLabel(s: NormalStatus) {
  return s === "pending"
    ? "รอเช็คอิน"
    : s === "checked-in"
      ? "เช็คอินแล้ว"
      : s === "completion-requested"
        ? "รอสแกนเสร็จสิ้น"
        : "เสร็จสิ้น";
}

function normalBadgeStyle(s: NormalStatus) {
  return s === "pending"
    ? styles.statusPending
    : s === "checked-in"
      ? styles.statusChecked
      : s === "completion-requested"
        ? styles.statusCompletionRequested
        : styles.statusCheckedOut;
}

function normalTextStyle(s: NormalStatus) {
  return s === "pending"
    ? styles.statusPendingText
    : s === "checked-in"
      ? styles.statusCheckedText
      : s === "completion-requested"
        ? styles.statusCompletionRequestedText
        : styles.statusCheckedOutText;
}

function longTermTextStyle(s: LongTermStatus) {
  return s === "registered"
    ? styles.statusPendingText
    : s === "arrived"
      ? styles.statusCheckedText
      : s === "completion-requested"
        ? styles.statusCompletionRequestedText
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
  listContentSelect: { paddingBottom: 96 },
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
  statusCompletionRequested: { backgroundColor: "#ede9fe" },
  statusCheckedOut: { backgroundColor: "#e5e7eb" },
  statusText: { fontSize: 11, fontWeight: "600" },
  statusCheckedText: { color: "#16a34a" },
  statusPendingText: { color: "#6b7280" },
  statusCompletionRequestedText: { color: "#7c3aed" },
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
  selectBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  selectToggle: {
    backgroundColor: "#1f2937",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  selectToggleText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  selectHint: { color: "#6b7280", fontSize: 12, flex: 1 },
  cardDisabled: { opacity: 0.45 },
  cardSelected: { borderWidth: 2, borderColor: "#16a34a" },
  cardHighlight: { borderWidth: 2, borderColor: "#f59e0b", backgroundColor: "#fffbeb" },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#9ca3af",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  checkboxOn: { backgroundColor: "#16a34a", borderColor: "#16a34a" },
  checkboxDisabled: { borderColor: "#e5e7eb", backgroundColor: "#f3f4f6" },
  checkboxMark: { color: "#fff", fontSize: 16, fontWeight: "700" },
  actionBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  checkoutBtn: {
    backgroundColor: "#16a34a",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  checkoutDisabled: { opacity: 0.5 },
  checkoutBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  tabLabelWrap: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  tabBadge: { backgroundColor: "#dc2626", borderRadius: 99, minWidth: 18, paddingHorizontal: 5, paddingVertical: 1, alignItems: "center" },
  tabBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  historyWrap: { flex: 1 },
  historyBar: { paddingHorizontal: 16, paddingTop: 12, alignItems: "flex-end" },
  clearBtn: { backgroundColor: "#fee2e2", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  clearBtnText: { color: "#dc2626", fontSize: 12, fontWeight: "700" },
  historyCard: { flexDirection: "row", alignItems: "flex-start", backgroundColor: "#fff", borderRadius: 12, padding: 14, gap: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  historyCardUnread: { backgroundColor: "#f0fdf4" },
  historyIcon: { fontSize: 18 },
  historyBody: { flex: 1 },
  historyTitle: { fontSize: 14, fontWeight: "700", color: "#111827" },
  historyText: { fontSize: 13, color: "#374151", marginTop: 2 },
  historyTime: { fontSize: 11, color: "#9ca3af", marginTop: 6 },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#16a34a", marginTop: 4 },
});
