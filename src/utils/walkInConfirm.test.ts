import { confirmWalkInSubmit } from "./walkInConfirm";

describe("confirmWalkInSubmit", () => {
  it("asks for confirmation before saving a walk-in visitor", () => {
    const onConfirm = jest.fn();
    const alert = jest.fn();

    confirmWalkInSubmit(
      {
        visitorName: "สมชาย ใจดี",
        visitorTypeLabel: "visitor ผู้เยี่ยมชม",
        companyName: "บริษัท ก",
        hostName: "คุณโฮสต์",
        notifyDepartmentRelated: true,
        visitorCount: 2,
        licensePlates: ["กข 1234"],
      },
      alert,
      onConfirm,
    );

    expect(onConfirm).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith(
      "ยืนยันการลงทะเบียน",
      expect.stringContaining("สมชาย ใจดี"),
      expect.arrayContaining([
        expect.objectContaining({ text: "ยกเลิก", style: "cancel" }),
        expect.objectContaining({ text: "ยืนยัน", onPress: onConfirm }),
      ]),
    );
    expect(alert.mock.calls[0][1]).toContain("บริษัท ก");
    expect(alert.mock.calls[0][1]).toContain("คุณโฮสต์");
    expect(alert.mock.calls[0][1]).toContain("ส่ง LINE ให้ผู้ที่ต้องการพบ");
    expect(alert.mock.calls[0][1]).toContain("ส่งเพิ่มให้พนักงานรายเดือนในแผนกเดียวกัน");
    expect(alert.mock.calls[0][1]).toContain("2 คน");
    expect(alert.mock.calls[0][1]).toContain("กข 1234");
  });

  it("does not mention department LINE notifications when not selected", () => {
    const alert = jest.fn();

    confirmWalkInSubmit(
      {
        visitorName: "แม่ค้า",
        visitorTypeLabel: "แม่ค้า",
        visitorCount: 1,
        licensePlates: [],
        notifyDepartmentRelated: false,
      },
      alert,
      jest.fn(),
    );

    expect(alert.mock.calls[0][1]).not.toContain("แผนกเดียวกัน");
  });
});
