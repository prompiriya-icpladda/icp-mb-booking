import {
  addEntryToList,
  countUnread,
  createEntry,
  formatRelativeTime,
  markAllReadInList,
  MAX_AGE_MS,
  NotificationHistoryEntry,
  pruneEntries,
} from "./notificationHistory.logic";

const NOW = 1_700_000_000_000;

function entry(over: Partial<NotificationHistoryEntry> = {}): NotificationHistoryEntry {
  return { id: "x", timestamp: NOW, kind: "update", title: "t", body: "b", read: false, ...over };
}

describe("createEntry", () => {
  it("สร้าง entry read=false พร้อม id ที่รวม now กับ suffix", () => {
    const e = createEntry({ kind: "update", title: "ก", body: "ข" }, NOW, "3");
    expect(e.id).toBe(`${NOW}-3`);
    expect(e.timestamp).toBe(NOW);
    expect(e.read).toBe(false);
    expect(e.kind).toBe("update");
  });
  it("ใส่ appointmentId/tab เฉพาะเมื่อมีค่า", () => {
    const a = createEntry({ kind: "new-appointment", title: "ก", body: "ข" }, NOW, "1");
    expect("appointmentId" in a).toBe(false);
    expect("tab" in a).toBe(false);
    const b = createEntry({ kind: "new-appointment", title: "ก", body: "ข", appointmentId: "id1", tab: "normal" }, NOW, "2");
    expect(b.appointmentId).toBe("id1");
    expect(b.tab).toBe("normal");
  });
});

describe("pruneEntries", () => {
  it("ตัดรายการที่เก่ากว่า 7 วัน", () => {
    const old = entry({ id: "old", timestamp: NOW - MAX_AGE_MS - 1 });
    const fresh = entry({ id: "fresh", timestamp: NOW });
    const out = pruneEntries([fresh, old], NOW);
    expect(out.map((e) => e.id)).toEqual(["fresh"]);
  });
  it("เก็บรายการที่อยู่พอดีขอบเขต (timestamp === cutoff)", () => {
    const edge = entry({ id: "edge", timestamp: NOW - MAX_AGE_MS });
    expect(pruneEntries([edge], NOW).map((e) => e.id)).toEqual(["edge"]);
  });
});

describe("addEntryToList", () => {
  it("ใส่ entry ใหม่ไว้หัวลิสต์", () => {
    // new entry เป็น new-appointment เพื่อทดสอบ prepend โดยไม่ชน dedupe (head เป็น update)
    const list = [entry({ id: "a", timestamp: NOW - 1000 })];
    const out = addEntryToList(list, entry({ id: "b", kind: "new-appointment", timestamp: NOW }), NOW);
    expect(out.map((e) => e.id)).toEqual(["b", "a"]);
  });
  it("dedupe update ที่ติดกันภายใน 60 วิ (ไม่เพิ่ม)", () => {
    const head = entry({ id: "u1", kind: "update", timestamp: NOW });
    const next = entry({ id: "u2", kind: "update", timestamp: NOW + 30_000 });
    const out = addEntryToList([head], next, NOW + 30_000);
    expect(out.map((e) => e.id)).toEqual(["u1"]);
  });
  it("ไม่ dedupe update ที่ห่างเกิน 60 วิ", () => {
    const head = entry({ id: "u1", kind: "update", timestamp: NOW });
    const next = entry({ id: "u2", kind: "update", timestamp: NOW + 61_000 });
    const out = addEntryToList([head], next, NOW + 61_000);
    expect(out.map((e) => e.id)).toEqual(["u2", "u1"]);
  });
  it("ไม่ dedupe new-appointment แม้หัวลิสต์เป็น update", () => {
    const head = entry({ id: "u1", kind: "update", timestamp: NOW });
    const next = entry({ id: "n1", kind: "new-appointment", timestamp: NOW + 1000 });
    const out = addEntryToList([head], next, NOW + 1000);
    expect(out.map((e) => e.id)).toEqual(["n1", "u1"]);
  });
  it("prune ของเก่าทิ้งระหว่างเพิ่ม", () => {
    const old = entry({ id: "old", kind: "new-appointment", timestamp: NOW - MAX_AGE_MS - 1 });
    const next = entry({ id: "new", kind: "new-appointment", timestamp: NOW });
    const out = addEntryToList([old], next, NOW);
    expect(out.map((e) => e.id)).toEqual(["new"]);
  });
});

describe("countUnread", () => {
  it("นับเฉพาะ read=false", () => {
    expect(countUnread([entry({ read: false }), entry({ read: true }), entry({ read: false })])).toBe(2);
  });
});

describe("markAllReadInList", () => {
  it("ตั้ง read=true ทุกตัว", () => {
    const out = markAllReadInList([entry({ read: false }), entry({ read: true })]);
    expect(out.every((e) => e.read)).toBe(true);
  });
});

describe("formatRelativeTime", () => {
  it("< 1 นาที = เมื่อสักครู่", () => {
    expect(formatRelativeTime(NOW - 30_000, NOW)).toBe("เมื่อสักครู่");
  });
  it("เป็นนาที", () => {
    expect(formatRelativeTime(NOW - 10 * 60_000, NOW)).toBe("10 นาทีที่แล้ว");
  });
  it("เป็นชั่วโมง", () => {
    expect(formatRelativeTime(NOW - 3 * 3_600_000, NOW)).toBe("3 ชั่วโมงที่แล้ว");
  });
  it("เป็นวัน", () => {
    expect(formatRelativeTime(NOW - 2 * 86_400_000, NOW)).toBe("2 วันที่แล้ว");
  });
});
