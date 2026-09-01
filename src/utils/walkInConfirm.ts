export interface WalkInConfirmDetails {
  visitorName: string;
  visitorTypeLabel: string;
  companyName?: string;
  hostName?: string;
  notifyDepartmentRelated?: boolean;
  visitorCount: number;
  licensePlates: string[];
}

export type WalkInAlertButton = {
  text: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void;
};

export type WalkInAlert = (
  title: string,
  message?: string,
  buttons?: WalkInAlertButton[],
) => void;

export function walkInConfirmMessage(details: WalkInConfirmDetails): string {
  const rows = [
    `ผู้มาติดต่อ: ${details.visitorName || "-"}`,
    `ประเภท: ${details.visitorTypeLabel || "-"}`,
  ];
  if (details.companyName) rows.push(`บริษัท: ${details.companyName}`);
  if (details.hostName) rows.push(`มาพบ: ${details.hostName}`);
  rows.push(`จำนวน: ${Math.max(1, details.visitorCount || 1)} คน`);
  if (details.licensePlates.length > 0) {
    rows.push(`ทะเบียนรถ: ${details.licensePlates.join(", ")}`);
  }
  if (details.hostName) {
    rows.push("ส่ง LINE ให้ผู้ที่ต้องการพบ");
  }
  if (details.notifyDepartmentRelated) {
    rows.push("ส่งเพิ่มให้พนักงานรายเดือนในแผนกเดียวกัน");
  }
  return `${rows.join("\n")}\n\nยืนยันบันทึกข้อมูลนี้หรือไม่?`;
}

export function confirmWalkInSubmit(
  details: WalkInConfirmDetails,
  alert: WalkInAlert,
  onConfirm: () => void,
) {
  alert("ยืนยันการลงทะเบียน", walkInConfirmMessage(details), [
    { text: "ยกเลิก", style: "cancel" },
    { text: "ยืนยัน", onPress: onConfirm },
  ]);
}
