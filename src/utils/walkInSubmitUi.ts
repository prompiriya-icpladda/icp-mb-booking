export const WALK_IN_QR_MODAL_AUTO_CLOSE_MS = 30_000;

export type WalkInCreateResult = {
  success: boolean;
  id?: string;
};

export type WalkInQrModalState = {
  id: string;
  visitorName: string;
};

type WalkInDepartmentEmployee = {
  department?: string | null;
};

function normalizeDepartment(value?: string | null): string {
  return String(value ?? "").trim().toLowerCase();
}

export function isOperationDepartment(department?: string | null): boolean {
  return normalizeDepartment(department) === "operation";
}

function departmentLabel(value?: string | null): string {
  return String(value ?? "").trim();
}

export function formatWalkInDepartmentTargetName(department?: string | null): string {
  const label = departmentLabel(department);
  return label ? `เจ้าหน้าที่แผนก ${label}` : "เจ้าหน้าที่";
}

export function walkInDepartmentOptionsFromEmployees(
  employees: WalkInDepartmentEmployee[],
): string[] {
  const seen = new Set<string>();
  const options: string[] = [];
  for (const employee of employees) {
    const label = departmentLabel(employee.department);
    const key = normalizeDepartment(label);
    if (!label || !key || key === "operation" || seen.has(key)) continue;
    seen.add(key);
    options.push(label);
  }
  return options;
}

export function shouldNotifyDepartmentRelatedEmployees({
  hostRequired,
  hostDepartment,
  department,
  selected,
}: {
  hostRequired: boolean;
  hostDepartment?: string | null;
  department?: string | null;
  selected: boolean;
}): boolean {
  return hostRequired && selected && !isOperationDepartment(hostDepartment ?? department);
}

export function walkInQrModalFromResult(
  result: WalkInCreateResult,
  visitorName: string,
): WalkInQrModalState | null {
  const id = String(result.id ?? "").trim();
  if (!id) return null;
  return {
    id,
    visitorName: visitorName.trim() || "ผู้มาติดต่อ",
  };
}
