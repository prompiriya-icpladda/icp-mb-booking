import { CameraView, useCameraPermissions } from "expo-camera";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import {
  AppText as Text,
  AppTextInput as TextInput,
} from "../theme/typography";
import {
  createWalkInVisit,
  fetchRecentCompanyNames,
  HrEmployee,
  ocrLicensePlate,
  searchHrEmployees,
  VISITOR_TYPE_OPTIONS,
  visitorTypeNeedsCompany,
  visitorTypeNeedsHost,
  VisitorType,
  visitorAppointmentQrImageUrl,
} from "../services/api";
import { readThaiIdCardName } from "../services/thaiIdCard";
import {
  buildPdpaSignaturePayload,
  hasPdpaSignature,
  isPdpaScrollAtEnd,
  PDPA_CONSENT_TEXT,
  PDPA_CONSENT_VERSION,
} from "../utils/pdpaConsent";
import type {
  PdpaScrollMetrics,
  PdpaSignaturePoint,
  PdpaSignatureStroke,
} from "../utils/pdpaConsent";
import { useAppointmentStream } from "../utils/useAppointmentStream";
import { confirmWalkInSubmit } from "../utils/walkInConfirm";
import {
  WALK_IN_QR_MODAL_AUTO_CLOSE_MS,
  formatWalkInDepartmentTargetName,
  isOperationDepartment,
  shouldNotifyDepartmentRelatedEmployees,
  walkInPendingApprovalFromResult,
  walkInDepartmentOptionsFromEmployees,
  walkInQrModalFromApprovedStream,
  walkInQrModalFromResult,
  type WalkInPendingApprovalState,
  type WalkInQrModalState,
} from "../utils/walkInSubmitUi";

const MIN_VEHICLE_COUNT = 1;
const SIGNATURE_POINT_MIN_DISTANCE = 2;
const RECENT_COMPANY_LIMIT = 30;
const COMPANY_SUGGESTION_LIMIT = 8;

type PdpaStep = "consent" | "signature";

export default function WalkInScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [visitorName, setVisitorName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [recentCompanyNames, setRecentCompanyNames] = useState<string[]>([]);
  const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false);
  const [companyOptionsLoading, setCompanyOptionsLoading] = useState(false);
  const [companyOptionsError, setCompanyOptionsError] = useState<string | null>(null);
  const [purpose, setPurpose] = useState("");
  const [visitorType, setVisitorType] = useState<VisitorType>("visitor");
  const [visitorCount, setVisitorCount] = useState(1);
  const [hostQuery, setHostQuery] = useState("");
  const [hostResults, setHostResults] = useState<HrEmployee[]>([]);
  const [selectedHost, setSelectedHost] = useState<HrEmployee | null>(null);
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [includeDepartmentRelatedEmployees, setIncludeDepartmentRelatedEmployees] =
    useState(true);
  const [pdpaModalOpen, setPdpaModalOpen] = useState(false);
  const [pdpaStep, setPdpaStep] = useState<PdpaStep>("consent");
  const [pdpaTextScrolledToEnd, setPdpaTextScrolledToEnd] = useState(false);
  const [pdpaConsentAccepted, setPdpaConsentAccepted] = useState(false);
  const [pdpaConsentedAt, setPdpaConsentedAt] = useState("");
  const [pdpaSignatureStrokes, setPdpaSignatureStrokes] = useState<PdpaSignatureStroke[]>([]);
  const [signatureBoxSize, setSignatureBoxSize] = useState({ width: 0, height: 0 });
  const [hostLoading, setHostLoading] = useState(false);
  const [hostError, setHostError] = useState<string | null>(null);
  const [hasVehicle, setHasVehicle] = useState(false);
  const [vehicleCount, setVehicleCount] = useState(1);
  const [licensePlates, setLicensePlates] = useState([""]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [activePlateIndex, setActivePlateIndex] = useState<number | null>(null);
  const [ocrLoadingIndex, setOcrLoadingIndex] = useState<number | null>(null);
  const [cardReading, setCardReading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{
    type: "ok" | "error";
    text: string;
  } | null>(null);
  const [qrModal, setQrModal] = useState<WalkInQrModalState | null>(null);
  const [pendingApproval, setPendingApproval] = useState<WalkInPendingApprovalState | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const qrAutoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const signatureBoxSizeRef = useRef(signatureBoxSize);
  const pdpaScrollMetricsRef = useRef<PdpaScrollMetrics>({
    layoutHeight: 0,
    contentHeight: 0,
    offsetY: 0,
  });

  // แม่ค้ามาขายของ ไม่ต้องเลือกผู้ที่ต้องการพบ
  const hostRequired = visitorTypeNeedsHost(visitorType);
  const companyVisible = visitorTypeNeedsCompany(visitorType);
  const selectedDepartmentName = selectedDepartment.trim();
  const selectedTargetDepartment = selectedHost?.department || selectedDepartmentName;
  const selectedTargetIsOperation = isOperationDepartment(selectedTargetDepartment);
  const hasSelectedDepartmentTarget = !!selectedDepartmentName;
  const canToggleDepartmentRelatedEmployees =
    hostRequired && !!selectedHost && !selectedTargetIsOperation;
  const hostDepartmentOptions = walkInDepartmentOptionsFromEmployees(hostResults);
  const companyQuery = normalizeText(companyName);
  const companySuggestions = recentCompanyNames
    .filter((name) => !companyQuery || normalizeText(name).includes(companyQuery))
    .slice(0, COMPANY_SUGGESTION_LIMIT);
  const pdpaSignature = buildPdpaSignaturePayload(pdpaSignatureStrokes, signatureBoxSize);
  const pdpaSignatureReady = hasPdpaSignature(pdpaSignature);
  const pdpaConsentStepReady = pdpaTextScrolledToEnd && pdpaConsentAccepted;
  const pdpaReady = pdpaConsentStepReady && pdpaSignatureReady && !!pdpaConsentedAt;

  const signatureResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => {
        const point = signaturePointFromEvent(event);
        setPdpaConsentedAt("");
        setPdpaSignatureStrokes((current) => [...current, [point]]);
      },
      onPanResponderMove: (event) => {
        appendSignaturePoint(signaturePointFromEvent(event));
      },
    }),
  ).current;

  useEffect(() => {
    const query = hostQuery.trim();
    if (query.length < 2 || selectedHost || selectedDepartmentName) {
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
  }, [hostQuery, selectedHost, selectedDepartmentName]);

  useEffect(() => {
    let cancelled = false;
    setCompanyOptionsLoading(true);
    setCompanyOptionsError(null);

    fetchRecentCompanyNames("", RECENT_COMPANY_LIMIT)
      .then((companies) => {
        if (cancelled) return;
        setRecentCompanyNames(companies);
      })
      .catch((error) => {
        if (cancelled) return;
        setCompanyOptionsError(
          error instanceof Error ? error.message : "โหลดรายชื่อบริษัทล่าสุดไม่สำเร็จ",
        );
      })
      .finally(() => {
        if (!cancelled) setCompanyOptionsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!companyVisible) setCompanyDropdownOpen(false);
  }, [companyVisible]);

  useEffect(() => {
    return () => {
      if (qrAutoCloseTimerRef.current) clearTimeout(qrAutoCloseTimerRef.current);
    };
  }, []);

  function clearQrAutoCloseTimer() {
    if (!qrAutoCloseTimerRef.current) return;
    clearTimeout(qrAutoCloseTimerRef.current);
    qrAutoCloseTimerRef.current = null;
  }

  function closeQrModal() {
    clearQrAutoCloseTimer();
    setQrModal(null);
  }

  function openQrModal(nextModal: WalkInQrModalState) {
    clearQrAutoCloseTimer();
    setQrModal(nextModal);
    qrAutoCloseTimerRef.current = setTimeout(() => {
      qrAutoCloseTimerRef.current = null;
      setQrModal(null);
    }, WALK_IN_QR_MODAL_AUTO_CLOSE_MS);
  }

  useAppointmentStream((appointment) => {
    const approvedQrModal = walkInQrModalFromApprovedStream(appointment, pendingApproval);
    if (approvedQrModal) {
      setPendingApproval(null);
      setMessage({
        type: "ok",
        text: "อนุมัติแล้ว กรุณาให้ผู้มาติดต่อถ่ายรูป QR",
      });
      openQrModal(approvedQrModal);
      return;
    }

    if (pendingApproval && appointment._id === pendingApproval.id && appointment.entryRejectedAt) {
      const reason = String(appointment.entryRejectReason || "").trim();
      const text = reason ? `ไม่อนุมัติให้เข้า: ${reason}` : "ไม่อนุมัติให้เข้า";
      setPendingApproval(null);
      setMessage({ type: "error", text });
      Alert.alert("ไม่อนุมัติให้เข้า", reason || "ผู้ถูกติดต่อไม่อนุมัติรายการนี้");
    }
  });

  function resetForm() {
    setVisitorName("");
    setCompanyName("");
    setCompanyDropdownOpen(false);
    setPurpose("");
    setVisitorType("visitor");
    setVisitorCount(1);
    setHostQuery("");
    setSelectedHost(null);
    setSelectedDepartment("");
    setHostResults([]);
    setIncludeDepartmentRelatedEmployees(true);
    setPdpaModalOpen(false);
    setPdpaStep("consent");
    setPdpaTextScrolledToEnd(false);
    setPdpaConsentAccepted(false);
    setPdpaConsentedAt("");
    setPdpaSignatureStrokes([]);
    pdpaScrollMetricsRef.current = { layoutHeight: 0, contentHeight: 0, offsetY: 0 };
    setHasVehicle(false);
    setVehicleCount(1);
    setLicensePlates([""]);
  }

  function updateVisitorCount(nextCount: number) {
    setVisitorCount(Math.max(1, Math.floor(nextCount || 0)));
  }

  function handleVisitorTypeChange(next: VisitorType) {
    setVisitorType(next);
    if (!visitorTypeNeedsCompany(next)) setCompanyName("");
  }

  function handleCompanyNameChange(nextName: string) {
    setCompanyName(nextName);
    setCompanyDropdownOpen(true);
  }

  function pickCompanyName(nextName: string) {
    setCompanyName(nextName);
    setCompanyDropdownOpen(false);
  }

  function rememberRecentCompanyName(nextName: string) {
    const normalizedName = nextName.trim();
    if (!normalizedName) return;
    const normalizedKey = normalizeText(normalizedName);
    setRecentCompanyNames((current) => [
      normalizedName,
      ...current.filter((item) => normalizeText(item) !== normalizedKey),
    ].slice(0, RECENT_COMPANY_LIMIT));
  }

  function pdpaMissingMessage() {
    if (!pdpaConsentAccepted) return "กรุณายินยอม PDPA ก่อนอ่านบัตรประชาชน";
    if (!pdpaTextScrolledToEnd) return "กรุณาเลื่อนอ่านรายละเอียด PDPA ให้จบก่อนอ่านบัตรประชาชน";
    if (!pdpaSignatureReady) return "กรุณาลงลายเซ็น PDPA ก่อนอ่านบัตรประชาชน";
    return "กรุณากดยืนยัน PDPA ก่อนอ่านบัตรประชาชน";
  }

  function openPdpaModal() {
    setPdpaStep(pdpaConsentStepReady ? "signature" : "consent");
    setPdpaModalOpen(true);
  }

  function updatePdpaScrollMetrics(nextMetrics: Partial<PdpaScrollMetrics>) {
    const metrics = { ...pdpaScrollMetricsRef.current, ...nextMetrics };
    pdpaScrollMetricsRef.current = metrics;
    if (isPdpaScrollAtEnd(metrics)) setPdpaTextScrolledToEnd(true);
  }

  function signaturePointFromEvent(event: { nativeEvent: { locationX: number; locationY: number } }) {
    const size = signatureBoxSizeRef.current;
    const width = Math.max(0, size.width || 0);
    const height = Math.max(0, size.height || 0);
    return {
      x: Math.max(0, Math.min(width, event.nativeEvent.locationX || 0)),
      y: Math.max(0, Math.min(height, event.nativeEvent.locationY || 0)),
    };
  }

  function appendSignaturePoint(point: PdpaSignaturePoint) {
    setPdpaConsentedAt("");
    setPdpaSignatureStrokes((current) => {
      const lastStroke = current[current.length - 1];
      if (!lastStroke) return [[point]];
      const lastPoint = lastStroke[lastStroke.length - 1];
      if (
        lastPoint &&
        Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y) <
          SIGNATURE_POINT_MIN_DISTANCE
      ) {
        return current;
      }
      return [...current.slice(0, -1), [...lastStroke, point]];
    });
  }

  function updateSignatureLayout(width: number, height: number) {
    const nextSize = { width, height };
    signatureBoxSizeRef.current = nextSize;
    setSignatureBoxSize(nextSize);
  }

  function clearPdpaSignature() {
    setPdpaConsentedAt("");
    setPdpaSignatureStrokes([]);
  }

  function cancelPdpaConsent() {
    setPdpaModalOpen(false);
    setPdpaStep("consent");
    setPdpaConsentAccepted(false);
    setPdpaConsentedAt("");
    setPdpaSignatureStrokes([]);
  }

  function togglePdpaConsent() {
    setPdpaConsentAccepted((current) => {
      if (current) setPdpaConsentedAt("");
      return !current;
    });
  }

  function goToPdpaSignatureStep() {
    if (!pdpaTextScrolledToEnd) {
      Alert.alert("ยังอ่าน PDPA ไม่จบ", "กรุณาเลื่อนอ่านรายละเอียด PDPA ให้จบก่อน");
      return;
    }
    if (!pdpaConsentAccepted) {
      Alert.alert("ยังไม่ได้ยินยอม PDPA", "กรุณาติ๊กยินยอมก่อน");
      return;
    }
    setPdpaStep("signature");
  }

  function confirmPdpaConsent() {
    if (!pdpaConsentStepReady) {
      setPdpaStep("consent");
      if (!pdpaTextScrolledToEnd) {
        Alert.alert("ยังอ่าน PDPA ไม่จบ", "กรุณาเลื่อนอ่านรายละเอียด PDPA ให้จบก่อน");
        return;
      }
      Alert.alert("ยังไม่ได้ยินยอม PDPA", "กรุณาติ๊กยินยอมก่อนอ่านบัตรประชาชน");
      return;
    }
    if (!pdpaSignatureReady) {
      Alert.alert("ยังไม่มีลายเซ็น", "กรุณาลงลายเซ็นก่อนอ่านบัตรประชาชน");
      return;
    }
    setPdpaConsentedAt(new Date().toISOString());
    setPdpaModalOpen(false);
  }

  function renderSignatureInk() {
    return pdpaSignatureStrokes.flatMap((stroke, strokeIndex) =>
      stroke.map((point, pointIndex) => {
        if (pointIndex === 0) {
          return (
            <View
              key={`${strokeIndex}-${pointIndex}`}
              pointerEvents="none"
              style={[styles.signatureDot, { left: point.x - 2, top: point.y - 2 }]}
            />
          );
        }
        const previousPoint = stroke[pointIndex - 1];
        const length = Math.hypot(point.x - previousPoint.x, point.y - previousPoint.y);
        const angle = Math.atan2(point.y - previousPoint.y, point.x - previousPoint.x);
        return (
          <View
            key={`${strokeIndex}-${pointIndex}`}
            pointerEvents="none"
            style={[
              styles.signatureLine,
              {
                left: (point.x + previousPoint.x - length) / 2,
                top: (point.y + previousPoint.y) / 2 - 1,
                width: length,
                transform: [{ rotateZ: `${angle}rad` }],
              },
            ]}
          />
        );
      }),
    );
  }

  async function handleReadThaiIdCard() {
    if (cardReading || submitting) return;
    if (!pdpaReady) {
      const text = pdpaMissingMessage();
      setMessage({ type: "error", text });
      openPdpaModal();
      return;
    }
    setCardReading(true);
    setMessage(null);

    try {
      const cardName = await readThaiIdCardName();
      setVisitorName(cardName.fullNameTh);
      setMessage({ type: "ok", text: `อ่านบัตรสำเร็จ: ${cardName.fullNameTh}` });
    } catch (error) {
      const text = error instanceof Error ? error.message : "อ่านบัตรไม่สำเร็จ";
      setMessage({ type: "error", text });
      Alert.alert("อ่านบัตรไม่สำเร็จ", text);
    } finally {
      setCardReading(false);
    }
  }

  function pickHost(employee: HrEmployee) {
    setSelectedHost(employee);
    setSelectedDepartment("");
    setHostQuery(formatEmployeeName(employee));
    setHostResults([]);
    setHostError(null);
  }

  function pickDepartment(department: string) {
    const label = department.trim();
    setSelectedHost(null);
    setSelectedDepartment(label);
    setHostQuery(formatWalkInDepartmentTargetName(label));
    setHostResults([]);
    setHostError(null);
  }

  function clearHost() {
    setSelectedHost(null);
    setSelectedDepartment("");
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

  function validate(host: HrEmployee | null, departmentTarget: string) {
    if (!visitorName.trim()) return "กรุณากรอกชื่อผู้มาติดต่อ";
    if (!pdpaReady) return pdpaMissingMessage();
    if (hostRequired && !host && !departmentTarget) return "กรุณาเลือกผู้ที่ต้องการพบจาก HR";
    if (companyVisible && !companyName.trim()) return "กรุณากรอกชื่อบริษัท";
    if (hasVehicle) {
      if (vehicleCount < 1) return "กรุณาระบุจำนวนรถ";
      const plates = activeLicensePlates();
      if (plates.length !== vehicleCount) {
        return "กรุณากรอกทะเบียนรถให้ครบตามจำนวนรถ";
      }
    }
    return null;
  }

  function visitorTypeConfirmLabel() {
    return VISITOR_TYPE_OPTIONS.find((option) => option.value === visitorType)?.label ?? visitorType;
  }

  async function submit() {
    Keyboard.dismiss();
    if (submitting) return;

    let host = selectedHost;
    let departmentTarget = selectedDepartmentName;
    if (hostRequired && !host && !departmentTarget && hostQuery.trim().length >= 2) {
      host = await resolveHostSelection(hostQuery);
      if (host) {
        setSelectedHost(host);
        setSelectedDepartment("");
        setHostQuery(formatEmployeeName(host));
        setHostResults([]);
        setHostError(null);
      } else {
        const resolvedDepartment = await resolveDepartmentSelection(hostQuery);
        if (resolvedDepartment) {
          departmentTarget = resolvedDepartment;
          setSelectedDepartment(resolvedDepartment);
          setHostQuery(formatWalkInDepartmentTargetName(resolvedDepartment));
          setHostResults([]);
          setHostError(null);
        }
      }
    }
    if (!hostRequired) {
      host = null;
      departmentTarget = "";
    }

    const validationError = validate(host, departmentTarget);
    if (validationError) {
      setMessage({ type: "error", text: validationError });
      Alert.alert("ข้อมูลไม่ครบ", validationError);
      if (!pdpaReady && validationError === pdpaMissingMessage()) openPdpaModal();
      return;
    }
    if (hostRequired && !host && !departmentTarget) return;

    const plates = hasVehicle ? activeLicensePlates() : [];
    const normalizedCompanyName = companyVisible ? companyName.trim() : "";
    const targetName = departmentTarget
      ? formatWalkInDepartmentTargetName(departmentTarget)
      : host?.name ?? "";
    const notifyDepartmentRelated = departmentTarget
      ? shouldNotifyDepartmentRelatedEmployees({
          hostRequired,
          department: departmentTarget,
          selected: true,
        })
      : shouldNotifyDepartmentRelatedEmployees({
          hostRequired,
          hostDepartment: host?.department,
          selected: includeDepartmentRelatedEmployees,
        });

    confirmWalkInSubmit(
      {
        visitorName: visitorName.trim(),
        visitorTypeLabel: visitorTypeConfirmLabel(),
        companyName: normalizedCompanyName,
        hostName: targetName,
        notifyDepartmentRelated,
        visitorCount,
        licensePlates: plates,
      },
      Alert.alert,
      () => { void submitConfirmed(host, departmentTarget, plates, normalizedCompanyName); },
    );
  }

  async function submitConfirmed(
    host: HrEmployee | null,
    departmentTarget: string,
    plates: string[],
    normalizedCompanyName: string,
  ) {
    if (submitting) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const normalizedDepartmentTarget = departmentTarget.trim();
      const targetName = normalizedDepartmentTarget
        ? formatWalkInDepartmentTargetName(normalizedDepartmentTarget)
        : host?.name ?? "";
      const notifyDepartmentRelated = normalizedDepartmentTarget
        ? shouldNotifyDepartmentRelatedEmployees({
            hostRequired,
            department: normalizedDepartmentTarget,
            selected: true,
          })
        : shouldNotifyDepartmentRelatedEmployees({
            hostRequired,
            hostDepartment: host?.department,
            selected: includeDepartmentRelatedEmployees,
          });
      const hostUserId = host
        ? host.userId ?? host.employeeId ?? host.employeeCode
        : "";
      const result = await createWalkInVisit({
        visitorName: visitorName.trim(),
        targetDepartment: normalizedDepartmentTarget || undefined,
        hostEmployeeCode: host?.employeeCode ?? "",
        hostName: targetName,
        hostNickname: host?.nickname,
        visittingUserId: hostUserId,
        visittingUserName: targetName,
        visittingUserNickname: host?.nickname,
        visitingUserId: hostUserId,
        visitingUserName: targetName,
        visitingUserNickname: host?.nickname,
        companyName: normalizedCompanyName,
        purpose: purpose.trim(),
        visitorType,
        visitorCount,
        hasVehicle,
        vehicleCount: hasVehicle ? vehicleCount : 0,
        licensePlate: plates[0],
        licensePlates: plates,
        includeDepartmentRelatedEmployees: notifyDepartmentRelated,
        pdpaConsentAccepted: true,
        pdpaConsentedAt,
        pdpaConsentVersion: PDPA_CONSENT_VERSION,
        pdpaSignature,
        source: "mobile-walk-in",
      });
      const waitForApproval = hostRequired;
      const nextQrModal = walkInQrModalFromResult(result, visitorName.trim(), {
        waitForApproval,
      });
      const nextPendingApproval = walkInPendingApprovalFromResult(
        result,
        visitorName.trim(),
        waitForApproval,
      );
      rememberRecentCompanyName(normalizedCompanyName);
      resetForm();
      setPendingApproval(nextPendingApproval);
      setMessage({
        type: "ok",
        text: hostRequired ? "บันทึกข้อมูลเรียบร้อย รออนุมัติ" : "บันทึกข้อมูลเรียบร้อย",
      });
      if (nextQrModal) openQrModal(nextQrModal);
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
          <TouchableOpacity
            style={[styles.pdpaStatusCard, pdpaReady && styles.pdpaStatusCardReady]}
            onPress={openPdpaModal}
            activeOpacity={0.85}
          >
            <Text style={styles.pdpaStatusTitle}>
              {pdpaReady ? "ยินยอม PDPA และลงลายเซ็นแล้ว" : "ต้องยินยอม PDPA ก่อนอ่านบัตร"}
            </Text>
            <Text style={styles.pdpaStatusText}>
              {pdpaReady
                ? "ระบบพร้อมอ่านชื่อ-นามสกุลจากบัตรประชาชน"
                : "กดเพื่ออ่านรายละเอียดให้จบ ติ๊กยินยอม แล้วลงลายเซ็น"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.cardReaderBtn,
              !pdpaReady && styles.cardReaderBlocked,
              (cardReading || submitting) && styles.submitDisabled,
            ]}
            onPress={handleReadThaiIdCard}
            disabled={cardReading || submitting}
            activeOpacity={0.82}
          >
            {cardReading ? (
              <ActivityIndicator color="#166534" />
            ) : (
              <Text style={[styles.cardReaderText, !pdpaReady && styles.cardReaderBlockedText]}>
                อ่านบัตรประชาชน (ชื่อ-นามสกุล)
              </Text>
            )}
          </TouchableOpacity>
          <Text style={styles.helperText}>
            ระบบจะอ่านเฉพาะชื่อและนามสกุล ไม่อ่านเลขบัตรประชาชน
          </Text>
        </Field>

        {hostRequired && (
          <Field label="ผู้ที่ต้องการพบ">
            <View style={styles.searchRow}>
              <TextInput
                style={[styles.input, styles.searchInput]}
                value={hostQuery}
                onChangeText={(v) => {
                  setSelectedHost(null);
                  setSelectedDepartment("");
                  setHostQuery(v);
                }}
                placeholder="ค้นหาชื่อ รหัสพนักงาน หรือแผนก"
                placeholderTextColor="#9ca3af"
              />
              {(selectedHost || selectedDepartmentName) && (
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
            {hasSelectedDepartmentTarget ? (
              <Text style={styles.helperText}>
                ระบบจะแจ้งพนักงานรายเดือนทุกคนในแผนกนี้
              </Text>
            ) : canToggleDepartmentRelatedEmployees ? (
              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() =>
                  setIncludeDepartmentRelatedEmployees((current) => !current)
                }
                activeOpacity={0.8}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: includeDepartmentRelatedEmployees }}
              >
                <View
                  style={[
                    styles.checkboxBox,
                    includeDepartmentRelatedEmployees && styles.checkboxBoxActive,
                  ]}
                >
                  {includeDepartmentRelatedEmployees && (
                    <Text style={styles.checkboxMark}>✓</Text>
                  )}
                </View>
                <View style={styles.checkboxTextWrap}>
                  <Text style={styles.checkboxText}>
                    เพิ่มบุคคลที่เกี่ยวข้องในแผนกเดียวกัน
                  </Text>
                  <Text style={styles.checkboxSubText}>เฉพาะพนักงานรายเดือน</Text>
                </View>
              </TouchableOpacity>
            ) : selectedTargetIsOperation ? (
              <Text style={styles.helperText}>แผนก Operation ไม่ส่งแจ้งเตือนเพิ่มให้ทั้งแผนก</Text>
            ) : null}
            {hostDepartmentOptions.map((department) => (
              <TouchableOpacity
                key={`department-${department}`}
                style={[styles.employeeItem, styles.departmentItem]}
                onPress={() => pickDepartment(department)}
                activeOpacity={0.75}
              >
                <Text style={styles.employeeName}>แผนก {department}</Text>
                <Text style={styles.employeeMeta}>แจ้งพนักงานรายเดือนทุกคนในแผนก</Text>
              </TouchableOpacity>
            ))}
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

        {companyVisible && (
          <Field label="ชื่อบริษัท">
            <TextInput
              style={styles.input}
              value={companyName}
              onChangeText={handleCompanyNameChange}
              onFocus={() => setCompanyDropdownOpen(true)}
              placeholder="เลือกจากรายการล่าสุดหรือพิมพ์ชื่อบริษัท"
              placeholderTextColor="#9ca3af"
            />
            {companyOptionsLoading && (
              <ActivityIndicator color="#16a34a" style={styles.inlineLoading} />
            )}
            {!!companyOptionsError && !companyOptionsLoading && (
              <Text style={styles.hostError}>โหลดรายชื่อบริษัทไม่ได้ พิมพ์เองได้</Text>
            )}
            {companyDropdownOpen && !companyOptionsLoading && companySuggestions.length > 0 && (
              <View style={styles.companyDropdown}>
                {companySuggestions.map((name) => (
                  <TouchableOpacity
                    key={name}
                    style={styles.companyItem}
                    onPress={() => pickCompanyName(name)}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.employeeName}>{name}</Text>
                    <Text style={styles.employeeMeta}>จากรายการล่าสุด</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {companyDropdownOpen &&
              !companyOptionsLoading &&
              !companyOptionsError &&
              recentCompanyNames.length > 0 &&
              companySuggestions.length === 0 && (
                <Text style={styles.helperText}>ไม่มีในรายการล่าสุด พิมพ์ชื่อใหม่ได้</Text>
              )}
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
            returnKeyType="done"
            blurOnSubmit
            onSubmitEditing={Keyboard.dismiss}
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
        transparent
        animationType="fade"
        onRequestClose={closeQrModal}
      >
        <View style={styles.qrModalBackdrop}>
          <View style={styles.qrModalCard}>
            <Text style={styles.qrModalTitle}>QR Code สำหรับเช็คอิน</Text>
            <Text style={styles.qrModalSubTitle}>
              ให้ {qrModal?.visitorName ?? "ผู้มาติดต่อ"} แสดง QR นี้ที่จุดรักษาความปลอดภัย
            </Text>
            {qrModal && (
              <View style={styles.qrBox}>
                <Image
                  source={{ uri: visitorAppointmentQrImageUrl(qrModal.id) }}
                  style={styles.qrImage}
                  resizeMode="contain"
                />
              </View>
            )}
            <Text style={styles.qrHint}>หน้าต่างนี้จะปิดเองใน 30 วินาที</Text>
            <TouchableOpacity style={styles.qrDoneBtn} onPress={closeQrModal} activeOpacity={0.85}>
              <Text style={styles.qrDoneText}>เสร็จสิ้น</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={pdpaModalOpen}
        animationType="slide"
        transparent
        onRequestClose={cancelPdpaConsent}
      >
        <View style={styles.pdpaModalBackdrop}>
          <View style={styles.pdpaModalCard}>
            {pdpaStep === "consent" ? (
              <>
                <Text style={styles.pdpaModalTitle}>ยินยอม PDPA ก่อนอ่านบัตรประชาชน</Text>
                <Text style={styles.pdpaModalSubTitle}>
                  กรุณาเลื่อนอ่านรายละเอียดให้จบ แล้วติ๊กยินยอมเพื่อไปหน้าลายเซ็น
                </Text>

                <ScrollView
                  style={styles.pdpaTextBox}
                  contentContainerStyle={styles.pdpaTextContent}
                  nestedScrollEnabled
                  scrollEventThrottle={16}
                  onLayout={(event) =>
                    updatePdpaScrollMetrics({
                      layoutHeight: event.nativeEvent.layout.height,
                    })
                  }
                  onContentSizeChange={(_, height) =>
                    updatePdpaScrollMetrics({ contentHeight: height })
                  }
                  onScroll={(event) =>
                    updatePdpaScrollMetrics({
                      layoutHeight: event.nativeEvent.layoutMeasurement.height,
                      contentHeight: event.nativeEvent.contentSize.height,
                      offsetY: event.nativeEvent.contentOffset.y,
                    })
                  }
                >
                  <Text style={styles.pdpaConsentText}>{PDPA_CONSENT_TEXT}</Text>
                </ScrollView>

                <Text
                  style={[
                    styles.pdpaScrollHint,
                    pdpaTextScrolledToEnd && styles.pdpaScrollHintReady,
                  ]}
                >
                  {pdpaTextScrolledToEnd
                    ? "อ่านรายละเอียดครบแล้ว"
                    : "เลื่อนอ่านรายละเอียดให้จบก่อน ปุ่มถัดไปจึงจะกดได้"}
                </Text>

                <TouchableOpacity
                  style={styles.pdpaConsentRow}
                  onPress={togglePdpaConsent}
                  activeOpacity={0.8}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: pdpaConsentAccepted }}
                >
                  <View
                    style={[
                      styles.checkboxBox,
                      pdpaConsentAccepted && styles.checkboxBoxActive,
                    ]}
                  >
                    {pdpaConsentAccepted && <Text style={styles.checkboxMark}>✓</Text>}
                  </View>
                  <Text style={styles.pdpaConsentLabel}>
                    ข้าพเจ้ายินยอมให้บริษัทเก็บรวบรวม ใช้ และจัดเก็บข้อมูลส่วนบุคคลตามรายละเอียดนี้
                  </Text>
                </TouchableOpacity>

                <View style={styles.pdpaModalActions}>
                  <TouchableOpacity
                    style={styles.pdpaCancelBtn}
                    onPress={cancelPdpaConsent}
                  >
                    <Text style={styles.pdpaCancelText}>ยกเลิก</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.pdpaConfirmBtn,
                      !pdpaConsentStepReady && styles.submitDisabled,
                    ]}
                    onPress={goToPdpaSignatureStep}
                    disabled={!pdpaConsentStepReady}
                    accessibilityState={{ disabled: !pdpaConsentStepReady }}
                  >
                    <Text style={styles.pdpaConfirmText}>ถัดไป</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.pdpaModalTitle}>ลงลายเซ็น PDPA</Text>
                <Text style={styles.pdpaModalSubTitle}>
                  กรุณาลงลายเซ็นเพื่อยืนยันความยินยอม ก่อนอ่านบัตรประชาชน
                </Text>

                <Text style={styles.signatureLabel}>ลายเซ็นผู้มาติดต่อ</Text>
                <View
                  style={styles.signatureBox}
                  onLayout={(event) =>
                    updateSignatureLayout(
                      event.nativeEvent.layout.width,
                      event.nativeEvent.layout.height,
                    )
                  }
                  {...signatureResponder.panHandlers}
                >
                  {renderSignatureInk()}
                  {!pdpaSignatureReady && (
                    <Text pointerEvents="none" style={styles.signaturePlaceholder}>
                      เซ็นชื่อในช่องนี้
                    </Text>
                  )}
                </View>

                <View style={styles.pdpaInlineActions}>
                  <TouchableOpacity style={styles.signatureClearBtn} onPress={clearPdpaSignature}>
                    <Text style={styles.signatureClearText}>ล้างลายเซ็น</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.pdpaModalActions}>
                  <TouchableOpacity
                    style={styles.pdpaCancelBtn}
                    onPress={() => setPdpaStep("consent")}
                  >
                    <Text style={styles.pdpaCancelText}>ย้อนกลับ</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.pdpaConfirmBtn, !pdpaSignatureReady && styles.submitDisabled]}
                    onPress={confirmPdpaConsent}
                  >
                    <Text style={styles.pdpaConfirmText}>ยืนยัน</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
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

async function resolveDepartmentSelection(query: string) {
  try {
    const results = await searchHrEmployees(query);
    const options = walkInDepartmentOptionsFromEmployees(results);
    if (options.length === 0) return "";
    const normalizedQuery = normalizeText(
      query.replace(/^(แผนก|ฝ่าย|dept\.?|department)\s*/i, ""),
    );
    const exactMatches = options.filter(
      (department) => normalizeText(department) === normalizedQuery,
    );
    if (exactMatches.length === 1) return exactMatches[0];
    return options.length === 1 ? options[0] : "";
  } catch {
    return "";
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
  pdpaStatusCard: {
    backgroundColor: "#fff7ed",
    borderWidth: 1,
    borderColor: "#fdba74",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 4,
  },
  pdpaStatusCardReady: { backgroundColor: "#f0fdf4", borderColor: "#86efac" },
  pdpaStatusTitle: { color: "#9a3412", fontSize: 13, fontWeight: "800" },
  pdpaStatusText: { color: "#6b7280", fontSize: 12, marginTop: 3 },
  cardReaderBtn: {
    backgroundColor: "#dcfce7",
    borderWidth: 1,
    borderColor: "#16a34a",
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: "center",
    marginTop: 8,
  },
  cardReaderBlocked: { backgroundColor: "#f3f4f6", borderColor: "#d1d5db" },
  cardReaderText: { color: "#166534", fontSize: 14, fontWeight: "700" },
  cardReaderBlockedText: { color: "#6b7280" },
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
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#bbf7d0",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#9ca3af",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  checkboxBoxActive: { backgroundColor: "#16a34a", borderColor: "#16a34a" },
  checkboxMark: { color: "#fff", fontSize: 15, fontWeight: "800" },
  checkboxTextWrap: { flex: 1 },
  checkboxText: { color: "#166534", fontSize: 13, fontWeight: "700" },
  checkboxSubText: { color: "#6b7280", fontSize: 12, marginTop: 2 },
  employeeItem: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    padding: 10,
  },
  departmentItem: { borderColor: "#bbf7d0", backgroundColor: "#f0fdf4" },
  companyDropdown: { gap: 6 },
  companyItem: {
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
    backgroundColor: "rgba(17,24,39,0.55)",
    padding: 20,
    justifyContent: "center",
  },
  qrModalCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 18,
    alignItems: "center",
    gap: 12,
  },
  qrModalTitle: { color: "#111827", fontSize: 18, fontWeight: "800" },
  qrModalSubTitle: { color: "#4b5563", fontSize: 13, lineHeight: 20, textAlign: "center" },
  qrBox: {
    borderWidth: 2,
    borderColor: "#e5e7eb",
    borderRadius: 14,
    padding: 10,
    backgroundColor: "#fff",
  },
  qrImage: { width: 220, height: 220 },
  qrHint: { color: "#6b7280", fontSize: 12, textAlign: "center" },
  qrDoneBtn: {
    alignSelf: "stretch",
    backgroundColor: "#16a34a",
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
  },
  qrDoneText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  pdpaModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(17,24,39,0.55)",
    padding: 14,
    justifyContent: "center",
  },
  pdpaModalCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    maxHeight: "94%",
    gap: 10,
  },
  pdpaModalTitle: { color: "#111827", fontSize: 17, fontWeight: "800" },
  pdpaModalSubTitle: { color: "#6b7280", fontSize: 12, lineHeight: 18 },
  pdpaTextBox: {
    maxHeight: 220,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    backgroundColor: "#f9fafb",
  },
  pdpaTextContent: { padding: 10 },
  pdpaConsentText: { color: "#374151", fontSize: 12, lineHeight: 19 },
  pdpaScrollHint: { color: "#92400e", fontSize: 12, lineHeight: 17 },
  pdpaScrollHintReady: { color: "#166534", fontWeight: "700" },
  pdpaConsentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#bbf7d0",
    borderRadius: 8,
    padding: 10,
  },
  pdpaConsentLabel: { flex: 1, color: "#166534", fontSize: 13, lineHeight: 19, fontWeight: "700" },
  signatureLabel: { color: "#374151", fontSize: 13, fontWeight: "800" },
  signatureBox: {
    height: 160,
    borderWidth: 1,
    borderColor: "#9ca3af",
    borderRadius: 10,
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  signaturePlaceholder: {
    position: "absolute",
    alignSelf: "center",
    top: 66,
    color: "#9ca3af",
    fontSize: 13,
  },
  signatureDot: {
    position: "absolute",
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#111827",
  },
  signatureLine: {
    position: "absolute",
    height: 2,
    borderRadius: 2,
    backgroundColor: "#111827",
  },
  pdpaInlineActions: { flexDirection: "row", justifyContent: "flex-end" },
  signatureClearBtn: {
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  signatureClearText: { color: "#374151", fontSize: 12, fontWeight: "700" },
  pdpaModalActions: { flexDirection: "row", gap: 10 },
  pdpaCancelBtn: {
    flex: 1,
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  pdpaCancelText: { color: "#374151", fontSize: 14, fontWeight: "700" },
  pdpaConfirmBtn: {
    flex: 1,
    backgroundColor: "#16a34a",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  pdpaConfirmText: { color: "#fff", fontSize: 14, fontWeight: "800" },
});
