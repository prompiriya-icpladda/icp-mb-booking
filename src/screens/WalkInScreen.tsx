import { CameraView, useCameraPermissions } from "expo-camera";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  createWalkInVisit,
  HrEmployee,
  ocrLicensePlate,
  searchHrEmployees,
} from "../services/api";

export default function WalkInScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [visitorName, setVisitorName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [idCardNumber, setIdCardNumber] = useState("");
  const [hostQuery, setHostQuery] = useState("");
  const [hostResults, setHostResults] = useState<HrEmployee[]>([]);
  const [selectedHost, setSelectedHost] = useState<HrEmployee | null>(null);
  const [hostLoading, setHostLoading] = useState(false);
  const [hostError, setHostError] = useState<string | null>(null);
  const [hasVehicle, setHasVehicle] = useState(false);
  const [licensePlate, setLicensePlate] = useState("");
  const [licensePhotoUri, setLicensePhotoUri] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{
    type: "ok" | "error";
    text: string;
  } | null>(null);
  const idInputRef = useRef<TextInput>(null);
  const cameraRef = useRef<CameraView>(null);

  useEffect(() => {
    const query = hostQuery.trim();
    if (query.length < 2 || selectedHost) {
      setHostResults([]);
      setHostError(null);
      return;
    }

    let cancelled = false;
    setHostLoading(true);
    const timer = setTimeout(() => {
      searchHrEmployees(query)
        .then((items) => {
          setHostError(null);
          if (!cancelled) setHostResults(items);
        })
        .catch((error) => {
          if (!cancelled) setHostResults([]);
          if (!cancelled) {
            setHostError(
              error instanceof Error
                ? error.message
                : "ไม่สามารถดึงข้อมูลจาก HR API ได้",
            );
          }
        })
        .finally(() => {
          if (!cancelled) setHostLoading(false);
        });
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [hostQuery, selectedHost]);

  function resetForm() {
    setVisitorName("");
    setCompanyName("");
    setIdCardNumber("");
    setHostQuery("");
    setSelectedHost(null);
    setHostResults([]);
    setHasVehicle(false);
    setLicensePlate("");
    setLicensePhotoUri(null);
  }

  function pickHost(employee: HrEmployee) {
    setSelectedHost(employee);
    setHostQuery(formatEmployeeName(employee));
    setHostResults([]);
    setHostError(null);
  }

  function clearHost() {
    setSelectedHost(null);
    setHostQuery("");
    setHostResults([]);
    setHostError(null);
  }

  function validate() {
    if (!visitorName.trim()) return "กรุณากรอกชื่อผู้ที่มา";
    if (!selectedHost) return "กรุณาเลือกผู้ที่มาหาจาก HR";
    if (!idCardNumber.trim()) return "กรุณากรอกรหัสบัตรประชาชน";
    if (!companyName.trim()) return "กรุณากรอกชื่อบริษัท";
    if (hasVehicle && !licensePlate.trim()) return "กรุณากรอกทะเบียนรถ";
    return null;
  }

  async function submit() {
    const validationError = validate();
    if (validationError) {
      setMessage({ type: "error", text: validationError });
      return;
    }
    if (!selectedHost) return;

    setSubmitting(true);
    setMessage(null);
    try {
      await createWalkInVisit({
        visitorName: visitorName.trim(),
        hostEmployeeCode: selectedHost.employeeCode,
        hostName: selectedHost.name,
        hostNickname: selectedHost.nickname,
        idCardNumber: idCardNumber.trim(),
        companyName: companyName.trim(),
        hasVehicle,
        licensePlate: hasVehicle ? licensePlate.trim() : undefined,
        source: "mobile-walk-in",
      });
      resetForm();
      setMessage({ type: "ok", text: "บันทึกข้อมูลเรียบร้อย" });
    } catch (e) {
      setMessage({
        type: "error",
        text: e instanceof Error ? e.message : "ไม่สามารถบันทึกข้อมูลได้",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function openPlateCamera() {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) return;
    }
    setCameraOpen(true);
    setCameraReady(false);
  }

  async function takePlatePhoto() {
    if (!cameraReady) return;
    const photo = await cameraRef.current?.takePictureAsync({ quality: 0.75 });
    if (!photo?.uri) return;

    setLicensePhotoUri(photo.uri);
    setCameraOpen(false);
    setOcrLoading(true);
    setMessage(null);
    try {
      const result = await ocrLicensePlate(photo.uri);
      if (result.licensePlate) {
        setLicensePlate(result.licensePlate);
      } else {
        setMessage({ type: "error", text: "OCR ไม่พบทะเบียน กรุณากรอกเอง" });
      }
    } catch {
      setMessage({
        type: "error",
        text: "OCR ใช้งานไม่ได้ กรุณากรอกทะเบียนเอง",
      });
    } finally {
      setOcrLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>ลงทะเบียนบุคคลภายนอก</Text>
        <Text style={styles.headerSub}>ผู้มาติดต่อที่ไม่มีการนัดล่วงหน้า</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Field label="ชื่อผู้ที่มา">
          <TextInput
            style={styles.input}
            value={visitorName}
            onChangeText={setVisitorName}
            placeholder="ชื่อ-นามสกุล"
            placeholderTextColor="#9ca3af"
          />
        </Field>

        <Field label="ผู้ที่มาหา">
          <View style={styles.searchRow}>
            <TextInput
              style={[styles.input, styles.searchInput]}
              value={hostQuery}
              onChangeText={(v) => {
                setSelectedHost(null);
                setHostQuery(v);
              }}
              placeholder="ค้นหาชื่อหรือรหัสพนักงาน"
              placeholderTextColor="#9ca3af"
            />
            {selectedHost && (
              <TouchableOpacity style={styles.clearBtn} onPress={clearHost}>
                <Text style={styles.clearText}>ล้าง</Text>
              </TouchableOpacity>
            )}
          </View>
          {hostLoading && (
            <ActivityIndicator color="#16a34a" style={styles.inlineLoading} />
          )}
          {!!hostError && !hostLoading && (
            <Text style={styles.hostError}>{hostError}</Text>
          )}
          {hostResults.map((item) => (
            <TouchableOpacity
              key={item.employeeCode}
              style={styles.employeeItem}
              onPress={() => pickHost(item)}
              activeOpacity={0.75}
            >
              <Text style={styles.employeeName}>
                {formatEmployeeName(item)}
              </Text>
              <Text style={styles.employeeMeta}>
                {[item.employeeCode, item.department, item.position]
                  .filter(Boolean)
                  .join(" | ")}
              </Text>
            </TouchableOpacity>
          ))}
        </Field>

        <Field label="รหัสบัตรประชาชน">
          <View style={styles.searchRow}>
            <TextInput
              ref={idInputRef}
              style={[styles.input, styles.searchInput]}
              value={idCardNumber}
              onChangeText={(v) => setIdCardNumber(v.replace(/[^0-9]/g, ""))}
              placeholder="เสียบเครื่องอ่านหรือกรอกเอง"
              placeholderTextColor="#9ca3af"
              keyboardType="number-pad"
              maxLength={13}
            />
            <TouchableOpacity
              style={styles.clearBtn}
              onPress={() => idInputRef.current?.focus()}
            >
              <Text style={styles.clearText}>อ่านบัตร</Text>
            </TouchableOpacity>
          </View>
        </Field>

        <Field label="ชื่อบริษัท">
          <TextInput
            style={styles.input}
            value={companyName}
            onChangeText={setCompanyName}
            placeholder="ชื่อบริษัท"
            placeholderTextColor="#9ca3af"
          />
        </Field>

        <Field label="มีรถไหม">
          <View style={styles.segmentRow}>
            <SegmentButton
              active={hasVehicle}
              label="มีรถ"
              onPress={() => setHasVehicle(true)}
            />
            <SegmentButton
              active={!hasVehicle}
              label="ไม่มีรถ"
              onPress={() => setHasVehicle(false)}
            />
          </View>
        </Field>

        {hasVehicle && (
          <Field label="ทะเบียนรถ">
            <View style={styles.searchRow}>
              <TextInput
                style={[styles.input, styles.searchInput]}
                value={licensePlate}
                onChangeText={setLicensePlate}
                placeholder="ถ่ายรูป OCR หรือกรอกเอง"
                placeholderTextColor="#9ca3af"
                autoCapitalize="characters"
              />
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={openPlateCamera}
              >
                <Text style={styles.clearText}>ถ่ายรูป</Text>
              </TouchableOpacity>
            </View>
            {ocrLoading && (
              <ActivityIndicator color="#16a34a" style={styles.inlineLoading} />
            )}
            {licensePhotoUri && (
              <Image
                source={{ uri: licensePhotoUri }}
                style={styles.platePreview}
              />
            )}
          </Field>
        )}

        {message && (
          <Text
            style={message.type === "ok" ? styles.okText : styles.errorText}
          >
            {message.text}
          </Text>
        )}

        <TouchableOpacity
          style={[styles.submitBtn, submitting && styles.submitDisabled]}
          onPress={submit}
          disabled={submitting}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>บันทึกข้อมูล</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={cameraOpen}
        animationType="slide"
        onRequestClose={() => setCameraOpen(false)}
      >
        <View style={styles.cameraModal}>
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFillObject}
            facing="back"
            onCameraReady={() => setCameraReady(true)}
          />
          <View style={styles.plateFrame} />
          <View style={styles.cameraActions}>
            <TouchableOpacity
              style={styles.cameraCancel}
              onPress={() => setCameraOpen(false)}
            >
              <Text style={styles.cameraCancelText}>ยกเลิก</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.cameraCapture,
                !cameraReady && styles.submitDisabled,
              ]}
              onPress={takePlatePhoto}
              disabled={!cameraReady}
            >
              <Text style={styles.cameraCaptureText}>ถ่าย</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function SegmentButton({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.segment, active && styles.segmentActive]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function formatEmployeeName(employee: HrEmployee) {
  return employee.nickname
    ? `${employee.name} (${employee.nickname})`
    : employee.name;
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
  headerSub: { color: "#9ca3af", fontSize: 12, marginTop: 2 },
  content: { padding: 16, paddingBottom: 30, gap: 14 },
  field: { gap: 7 },
  label: { fontSize: 13, color: "#374151", fontWeight: "700" },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    color: "#111827",
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  searchRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  searchInput: { flex: 1 },
  clearBtn: {
    backgroundColor: "#1f2937",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  clearText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  inlineLoading: { alignSelf: "flex-start", marginTop: 4 },
  hostError: { color: "#b91c1c", fontSize: 12, fontWeight: "600" },
  employeeItem: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    padding: 10,
  },
  employeeName: { color: "#111827", fontSize: 14, fontWeight: "700" },
  employeeMeta: { color: "#6b7280", fontSize: 12, marginTop: 3 },
  segmentRow: { flexDirection: "row", gap: 8 },
  segment: {
    flex: 1,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  segmentActive: { backgroundColor: "#dcfce7", borderColor: "#16a34a" },
  segmentText: { color: "#6b7280", fontSize: 14, fontWeight: "700" },
  segmentTextActive: { color: "#166534" },
  platePreview: {
    width: "100%",
    height: 120,
    borderRadius: 8,
    backgroundColor: "#e5e7eb",
  },
  okText: {
    color: "#15803d",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  errorText: {
    color: "#dc2626",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  submitBtn: {
    backgroundColor: "#16a34a",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  cameraModal: { flex: 1, backgroundColor: "#111827" },
  plateFrame: {
    position: "absolute",
    left: 28,
    right: 28,
    top: "40%",
    height: 118,
    borderColor: "#4ade80",
    borderWidth: 3,
    borderRadius: 10,
  },
  cameraActions: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 30,
    flexDirection: "row",
    gap: 12,
  },
  cameraCancel: {
    flex: 1,
    backgroundColor: "rgba(31,41,55,0.9)",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  cameraCancelText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  cameraCapture: {
    flex: 1,
    backgroundColor: "#16a34a",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  cameraCaptureText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
