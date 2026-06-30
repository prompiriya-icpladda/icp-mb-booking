import DateTimePicker from "@react-native-community/datetimepicker";
import { CameraView, useCameraPermissions } from "expo-camera";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
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
  maskIdNumber,
  ocrLicensePlate,
  searchHrEmployees,
  visitorQrUrl,
  VISITOR_TYPE_OPTIONS,
  visitorTypeNeedsCompany,
  visitorTypeNeedsHost,
  visitorTypeNeedsIdCard,
  VisitorQrMode,
  VisitorType,
} from "../services/api";

const MIN_VEHICLE_COUNT = 1;

export default function WalkInScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [visitorName, setVisitorName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [idCardNumber, setIdCardNumber] = useState("");
  const [idFocused, setIdFocused] = useState(false);
  const [purpose, setPurpose] = useState("");
  const [visitorType, setVisitorType] = useState<VisitorType>("visitor");
  const [visitorCount, setVisitorCount] = useState(1);
  const [qrMode, setQrMode] = useState<VisitorQrMode>("single-use");
  const [expiryDate, setExpiryDate] = useState<Date | null>(null);
  const [showExpiryPicker, setShowExpiryPicker] = useState(false);
  const [hostQuery, setHostQuery] = useState("");
  const [hostResults, setHostResults] = useState<HrEmployee[]>([]);
  const [selectedHost, setSelectedHost] = useState<HrEmployee | null>(null);
  const [hostLoading, setHostLoading] = useState(false);
  const [hostError, setHostError] = useState<string | null>(null);
  const [hasVehicle, setHasVehicle] = useState(false);
  const [vehicleCount, setVehicleCount] = useState(1);
  const [licensePlates, setLicensePlates] = useState([""]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [activePlateIndex, setActivePlateIndex] = useState<number | null>(null);
  const [ocrLoadingIndex, setOcrLoadingIndex] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{
    type: "ok" | "error";
    text: string;
  } | null>(null);
  const [qrModal, setQrModal] = useState<{
    id: string;
    visitorName: string;
    visitorOrganization: string;
    expiryDate: string;
  } | null>(null);
  const [qrImageError, setQrImageError] = useState(false);
  const idInputRef = useRef<TextInput>(null);
  const cameraRef = useRef<CameraView>(null);

  // rider / แม่ค้า มาขายของ ไม่ต้องเลือกผู้ที่ต้องการพบ
  const hostRequired = visitorTypeNeedsHost(visitorType);
  const idVisible = visitorTypeNeedsIdCard(visitorType);
  const companyVisible = visitorTypeNeedsCompany(visitorType);

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
    setPurpose("");
    setVisitorType("visitor");
    setVisitorCount(1);
    setQrMode("single-use");
    setExpiryDate(null);
    setShowExpiryPicker(false);
    setHostQuery("");
    setSelectedHost(null);
    setHostResults([]);
    setHasVehicle(false);
    setVehicleCount(1);
    setLicensePlates([""]);
  }

  function updateVisitorCount(nextCount: number) {
    setVisitorCount(Math.max(1, Math.floor(nextCount || 0)));
  }

  function handleVisitorTypeChange(next: VisitorType) {
    setVisitorType(next);
    if (!visitorTypeNeedsIdCard(next)) setIdCardNumber("");
    if (!visitorTypeNeedsCompany(next)) setCompanyName("");
  }

  function handleIdChange(text: string) {
    // display ยาวเท่า raw (1 หลัก = 1 ตัวอักษร) จึง diff ความยาวเพื่อถอดกลับเป็นเลขจริง
    const prevDisplay = maskIdNumber(idCardNumber, true);
    if (text.length > prevDisplay.length) {
      const added = text.slice(prevDisplay.length).replace(/[^0-9]/g, "");
      setIdCardNumber((idCardNumber + added).slice(0, 13));
    } else if (text.length < prevDisplay.length) {
      setIdCardNumber(idCardNumber.slice(0, text.length));
    }
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

  function updateVehicleCount(nextCount: number) {
    const normalized = Math.max(MIN_VEHICLE_COUNT, Math.floor(nextCount || 0));
    setVehicleCount(normalized);
    setLicensePlates((prev) => {
      const next = [...prev];
      while (next.length < normalized) next.push("");
      return next.slice(0, normalized);
    });
  }

  function setPlateAt(index: number, value: string) {
    setLicensePlates((prev) => {
      const next = [...prev];
      next[index] = value.toUpperCase();
      return next;
    });
  }

  function activeLicensePlates() {
    return licensePlates
      .slice(0, vehicleCount)
      .map((plate) => plate.trim().toUpperCase())
      .filter(Boolean);
  }

  function validate(host: HrEmployee | null) {
    if (!visitorName.trim()) return "กรุณากรอกชื่อผู้มาติดต่อ";
    if (hostRequired && !host) return "กรุณาเลือกผู้ที่ต้องการพบจาก HR";
    if (idVisible && !idCardNumber.trim()) return "กรุณากรอกรหัสบัตรประชาชน";
    if (companyVisible && !companyName.trim()) return "กรุณากรอกชื่อบริษัท";
    if (qrMode === "long-term" && !expiryDate) return "กรุณาเลือกวันหมดอายุ";
    if (hasVehicle) {
      if (vehicleCount < 1) return "กรุณาระบุจำนวนรถ";
      const plates = activeLicensePlates();
      if (plates.length !== vehicleCount) {
        return "กรุณากรอกทะเบียนรถให้ครบตามจำนวนรถ";
      }
    }
    return null;
  }

  async function submit() {
    Keyboard.dismiss();

    let host = selectedHost;
    if (hostRequired && !host && hostQuery.trim().length >= 2) {
      host = await resolveHostSelection(hostQuery);
      if (host) {
        setSelectedHost(host);
        setHostQuery(formatEmployeeName(host));
        setHostResults([]);
        setHostError(null);
      }
    }
    if (!hostRequired) host = null;

    const validationError = validate(host);
    if (validationError) {
      setMessage({ type: "error", text: validationError });
      Alert.alert("ข้อมูลไม่ครบ", validationError);
      return;
    }
    if (hostRequired && !host) return;

    const plates = hasVehicle ? activeLicensePlates() : [];

    setSubmitting(true);
    setMessage(null);
    try {
      const hostUserId = host
        ? host.userId ?? host.employeeId ?? host.employeeCode
        : "";
      const result = await createWalkInVisit({
        visitorName: visitorName.trim(),
        hostEmployeeCode: host?.employeeCode ?? "",
        hostName: host?.name ?? "",
        hostNickname: host?.nickname,
        visittingUserId: hostUserId,
        visittingUserName: host?.name ?? "",
        visittingUserNickname: host?.nickname,
        visitingUserId: hostUserId,
        visitingUserName: host?.name ?? "",
        visitingUserNickname: host?.nickname,
        idCardNumber: idVisible ? idCardNumber.trim() : "",
        companyName: companyVisible ? companyName.trim() : "",
        purpose: purpose.trim(),
        visitorType,
        visitorCount,
        qrMode,
        expiryDate:
          qrMode === "long-term" && expiryDate
            ? formatDateLocal(expiryDate)
            : undefined,
        hasVehicle,
        vehicleCount: hasVehicle ? vehicleCount : 0,
        licensePlate: plates[0],
        licensePlates: plates,
        source: "mobile-walk-in",
      });
      if (qrMode === "long-term" && result.id) {
        setQrImageError(false);
        setQrModal({
          id: result.id,
          visitorName: visitorName.trim(),
          visitorOrganization: companyVisible ? companyName.trim() : "",
          expiryDate: expiryDate ? formatDateLocal(expiryDate) : "",
        });
        resetForm();
      } else {
        resetForm();
        setMessage({ type: "ok", text: "บันทึกข้อมูลเรียบร้อย" });
      }
    } catch (e) {
      const errorMessage =
        e instanceof Error ? e.message : "ไม่สามารถบันทึกข้อมูลได้";
      setMessage({
        type: "error",
        text: errorMessage,
      });
      Alert.alert("บันทึกไม่สำเร็จ", errorMessage);
    } finally {
      setSubmitting(false);
    }
  }

  async function openPlateCamera(index: number) {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) return;
    }
    setActivePlateIndex(index);
    setCameraOpen(true);
    setCameraReady(false);
  }

  async function takePlatePhoto() {
    if (!cameraReady || activePlateIndex == null) return;
    const photo = await cameraRef.current?.takePictureAsync({ quality: 0.75 });
    if (!photo?.uri) return;

    setCameraOpen(false);
    setCameraReady(false);
    setOcrLoadingIndex(activePlateIndex);
    setMessage(null);

    try {
      const result = await ocrLicensePlate(photo.uri);
      if (result.licensePlate) {
        setPlateAt(activePlateIndex, result.licensePlate);
      } else {
        setMessage({ type: "error", text: "OCR ไม่พบทะเบียน กรุณากรอกเอง" });
      }
    } catch {
      setMessage({
        type: "error",
        text: "OCR ใช้งานไม่ได้ กรุณากรอกทะเบียนเอง",
      });
    } finally {
      setOcrLoadingIndex(null);
      setActivePlateIndex(null);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>ลงทะเบียนบุคคลภายนอก</Text>
        <Text style={styles.headerSub}>
          ผู้มาติดต่อที่ไม่มีการนัดล่วงหน้า
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="always"
      >
        <Field label="ชื่อผู้มาติดต่อ">
          <TextInput
            style={styles.input}
            value={visitorName}
            onChangeText={setVisitorName}
            placeholder="ชื่อ-นามสกุลผู้มาติดต่อ"
            placeholderTextColor="#9ca3af"
          />
        </Field>

        {hostRequired && (
          <Field label="ผู้ที่ต้องการพบ">
            <View style={styles.searchRow}>
              <TextInput
                style={[styles.input, styles.searchInput]}
                value={hostQuery}
                onChangeText={(v) => {
                  setSelectedHost(null);
                  setHostQuery(v);
                }}
                placeholder="ค้นหาชื่อหรือรหัสพนักงานของผู้ที่ต้องการพบ"
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
        )}

        {idVisible && (
          <Field label="รหัสบัตรประชาชน">
            <TextInput
              ref={idInputRef}
              style={styles.input}
              value={maskIdNumber(idCardNumber, idFocused)}
              onChangeText={handleIdChange}
              onFocus={() => setIdFocused(true)}
              onBlur={() => setIdFocused(false)}
              placeholder="กรอกรหัสบัตรประชาชน"
              placeholderTextColor="#9ca3af"
              keyboardType="number-pad"
              maxLength={13}
            />
          </Field>
        )}

        {companyVisible && (
          <Field label="ชื่อบริษัท">
            <TextInput
              style={styles.input}
              value={companyName}
              onChangeText={setCompanyName}
              placeholder="ชื่อบริษัท"
              placeholderTextColor="#9ca3af"
            />
          </Field>
        )}

        <Field label="จุดประสงค์การมาติดต่อ">
          <TextInput
            style={[styles.input, styles.textArea]}
            value={purpose}
            onChangeText={setPurpose}
            placeholder="ระบุจุดประสงค์ (ถ้ามี)"
            placeholderTextColor="#9ca3af"
            multiline
            numberOfLines={2}
          />
        </Field>

        <Field label="ประเภทผู้มาติดต่อ">
          <View style={styles.typeRow}>
            {VISITOR_TYPE_OPTIONS.map((option) => {
              const active = visitorType === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.typeChip, active && styles.typeChipActive]}
                  onPress={() => handleVisitorTypeChange(option.value)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.typeChipText,
                      active && styles.typeChipTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Field>

        <Field label="จำนวนผู้มาติดต่อ">
          <View style={styles.vehicleCountRow}>
            <TouchableOpacity
              style={styles.counterBtn}
              onPress={() => updateVisitorCount(visitorCount - 1)}
            >
              <Text style={styles.counterText}>-</Text>
            </TouchableOpacity>
            <TextInput
              style={[styles.input, styles.vehicleCountInput]}
              value={String(visitorCount)}
              onChangeText={(v) =>
                updateVisitorCount(Number(v.replace(/[^0-9]/g, "")) || 1)
              }
              keyboardType="number-pad"
              maxLength={3}
            />
            <TouchableOpacity
              style={styles.counterBtn}
              onPress={() => updateVisitorCount(visitorCount + 1)}
            >
              <Text style={styles.counterText}>+</Text>
            </TouchableOpacity>
          </View>
        </Field>

        <Field label="รูปแบบ QR Code">
          <View style={styles.segmentRow}>
            <SegmentButton
              active={qrMode === "single-use"}
              label="ครั้งเดียว"
              onPress={() => setQrMode("single-use")}
            />
            <SegmentButton
              active={qrMode === "long-term"}
              label="ระยะยาว"
              onPress={() => {
                setQrMode("long-term");
                setExpiryDate((prev) => prev ?? defaultExpiryDate());
              }}
            />
          </View>
          <Text style={styles.helperText}>
            QR ระยะยาวสามารถสแกนซ้ำได้ เหมาะกับ rider / แม่ค้า / ผู้รับเหมาที่มาประจำ
          </Text>
        </Field>

        {qrMode === "long-term" && (
          <Field label="วันหมดอายุ">
            <TouchableOpacity
              style={[styles.input, styles.dateInput]}
              onPress={() => setShowExpiryPicker(true)}
              activeOpacity={0.7}
            >
              <Text style={expiryDate ? styles.dateText : styles.datePlaceholder}>
                {expiryDate ? formatDateLocal(expiryDate) : "เลือกวันหมดอายุ"}
              </Text>
            </TouchableOpacity>
            {showExpiryPicker && (
              <DateTimePicker
                value={expiryDate ?? defaultExpiryDate()}
                mode="date"
                display={Platform.OS === "ios" ? "inline" : "default"}
                minimumDate={new Date()}
                onChange={(event, selected) => {
                  if (Platform.OS !== "ios") setShowExpiryPicker(false);
                  if (event.type === "set" && selected) {
                    setExpiryDate(selected);
                  } else if (event.type === "dismissed") {
                    setShowExpiryPicker(false);
                  }
                }}
              />
            )}
            {Platform.OS === "ios" && showExpiryPicker && (
              <TouchableOpacity
                style={styles.dateDoneBtn}
                onPress={() => setShowExpiryPicker(false)}
              >
                <Text style={styles.dateDoneText}>เสร็จ</Text>
              </TouchableOpacity>
            )}
          </Field>
        )}

        <Field label="มีรถไหม">
          <View style={styles.segmentRow}>
            <SegmentButton
              active={hasVehicle}
              label="มีรถ"
              onPress={() => {
                setHasVehicle(true);
                updateVehicleCount(vehicleCount || 1);
              }}
            />
            <SegmentButton
              active={!hasVehicle}
              label="ไม่มีรถ"
              onPress={() => {
                setHasVehicle(false);
                updateVehicleCount(1);
              }}
            />
          </View>
        </Field>

        {hasVehicle && (
          <>
            <Field label="จำนวนรถ">
              <View style={styles.vehicleCountRow}>
                <TouchableOpacity
                  style={styles.counterBtn}
                  onPress={() => updateVehicleCount(vehicleCount - 1)}
                >
                  <Text style={styles.counterText}>-</Text>
                </TouchableOpacity>
                <TextInput
                  style={[styles.input, styles.vehicleCountInput]}
                  value={String(vehicleCount)}
                  onChangeText={(v) =>
                    updateVehicleCount(Number(v.replace(/[^0-9]/g, "")) || 1)
                  }
                  keyboardType="number-pad"
                  maxLength={2}
                />
                <TouchableOpacity
                  style={styles.counterBtn}
                  onPress={() => updateVehicleCount(vehicleCount + 1)}
                >
                  <Text style={styles.counterText}>+</Text>
                </TouchableOpacity>
              </View>
            </Field>

            {Array.from({ length: vehicleCount }, (_, index) => (
              <Field
                key={`plate-${index}`}
                label={`ทะเบียนรถ${vehicleCount > 1 ? ` คันที่ ${index + 1}` : ""}`}
              >
                <View style={styles.searchRow}>
                  <TextInput
                    style={[styles.input, styles.searchInput]}
                    value={licensePlates[index] ?? ""}
                    onChangeText={(v) => setPlateAt(index, v)}
                    placeholder="กรอกทะเบียนรถ"
                    placeholderTextColor="#9ca3af"
                    autoCapitalize="characters"
                  />
                  <TouchableOpacity
                    style={styles.clearBtn}
                    onPress={() => openPlateCamera(index)}
                    disabled={ocrLoadingIndex === index}
                  >
                    {ocrLoadingIndex === index ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.clearText}>ถ่ายรูป</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </Field>
            ))}
          </>
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
        onRequestClose={() => {
          setCameraOpen(false);
          setActivePlateIndex(null);
        }}
      >
        <View style={styles.cameraModal}>
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFillObject}
            facing="back"
            onCameraReady={() => setCameraReady(true)}
          />
          <View style={styles.cameraHeader}>
            <Text style={styles.cameraHeaderText}>ถ่ายรูปทะเบียนรถ</Text>
          </View>
          <View style={styles.cameraFrame} />
          <View style={styles.cameraActions}>
            <TouchableOpacity
              style={styles.cameraCancel}
              onPress={() => {
                setCameraOpen(false);
                setActivePlateIndex(null);
              }}
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

      <Modal
        visible={!!qrModal}
        animationType="fade"
        transparent
        onRequestClose={() => setQrModal(null)}
      >
        <View style={styles.qrModalBackdrop}>
          <View style={styles.qrModalCard}>
            <Text style={styles.qrModalTitle}>QR Code ระยะยาว</Text>
            {qrModal && !qrImageError && (
              <Image
                source={{ uri: visitorQrUrl(qrModal.id) }}
                style={styles.qrImage}
                resizeMode="contain"
                onError={() => setQrImageError(true)}
              />
            )}
            {qrImageError && (
              <View style={styles.qrImage}>
                <Text style={styles.qrErrorText}>โหลด QR ไม่สำเร็จ</Text>
              </View>
            )}
            <Text style={styles.qrName}>{qrModal?.visitorName}</Text>
            {!!qrModal?.visitorOrganization && (
              <Text style={styles.qrMeta}>{qrModal.visitorOrganization}</Text>
            )}
            {!!qrModal?.expiryDate && (
              <Text style={styles.qrMeta}>วันหมดอายุ {qrModal.expiryDate}</Text>
            )}
            <Text style={styles.qrNote}>
              ให้ผู้มาติดต่อแสดง QR นี้ที่จุดรักษาความปลอดภัยในครั้งถัดไป
            </Text>
            <TouchableOpacity style={styles.qrDoneBtn} onPress={() => setQrModal(null)}>
              <Text style={styles.qrDoneText}>เสร็จสิ้น</Text>
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

function formatDateLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function defaultExpiryDate() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d;
}

function formatEmployeeName(employee: HrEmployee) {
  return employee.nickname
    ? `${employee.name} (${employee.nickname})`
    : employee.name;
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function matchesEmployeeQuery(employee: HrEmployee, query: string) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return false;

  return [
    employee.employeeCode,
    employee.name,
    employee.nickname ?? "",
    formatEmployeeName(employee),
  ].some((value) => normalizeText(value) === normalizedQuery);
}

async function resolveHostSelection(query: string) {
  try {
    const results = await searchHrEmployees(query);
    if (results.length === 1) return results[0];

    const matches = results.filter((employee) =>
      matchesEmployeeQuery(employee, query),
    );

    return matches.length === 1 ? matches[0] : null;
  } catch {
    return null;
  }
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
  textArea: { minHeight: 64, textAlignVertical: "top", paddingTop: 11 },
  searchRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  searchInput: { flex: 1 },
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeChip: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  typeChipActive: { backgroundColor: "#dcfce7", borderColor: "#16a34a" },
  typeChipText: { color: "#6b7280", fontSize: 13, fontWeight: "700" },
  typeChipTextActive: { color: "#166534" },
  helperText: { color: "#6b7280", fontSize: 12, marginTop: 2 },
  dateInput: { justifyContent: "center" },
  dateText: { color: "#111827", fontSize: 15 },
  datePlaceholder: { color: "#9ca3af", fontSize: 15 },
  dateDoneBtn: {
    backgroundColor: "#1f2937",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
    marginTop: 8,
  },
  dateDoneText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  clearBtn: {
    backgroundColor: "#1f2937",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minWidth: 84,
    alignItems: "center",
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
  vehicleCountRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  counterBtn: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: "#1f2937",
    alignItems: "center",
    justifyContent: "center",
  },
  counterText: { color: "#fff", fontSize: 22, fontWeight: "700" },
  vehicleCountInput: { flex: 1, textAlign: "center" },
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
  cameraHeader: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 50,
    alignItems: "center",
  },
  cameraHeaderText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  cameraFrame: {
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
  qrModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  qrModalCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
  },
  qrModalTitle: { fontSize: 18, fontWeight: "700", color: "#111827", marginBottom: 16 },
  qrImage: { width: 220, height: 220, marginBottom: 16 },
  qrErrorText: {
    flex: 1,
    textAlignVertical: "center",
    textAlign: "center",
    color: "#dc2626",
    fontSize: 14,
    fontWeight: "700",
  },
  qrName: { fontSize: 16, fontWeight: "700", color: "#111827", textAlign: "center" },
  qrMeta: { fontSize: 13, color: "#6b7280", marginTop: 4, textAlign: "center" },
  qrNote: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 12,
    textAlign: "center",
    lineHeight: 18,
  },
  qrDoneBtn: {
    marginTop: 20,
    backgroundColor: "#16a34a",
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: "center",
    alignSelf: "stretch",
  },
  qrDoneText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
