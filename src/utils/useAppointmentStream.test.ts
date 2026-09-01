jest.mock("../services/api", () => ({
  API_URL: "https://app-plant.icpladda.com/ICPBooking/api",
}));

import { parseAppointmentStreamPayload } from "./useAppointmentStream";

describe("parseAppointmentStreamPayload", () => {
  it("parses visitor appointment JSON and ignores the connection marker", () => {
    expect(parseAppointmentStreamPayload("connected")).toBeNull();
    expect(parseAppointmentStreamPayload('{"_id":"a1","deleted":true}')).toEqual({
      _id: "a1",
      deleted: true,
    });
  });

  it("ignores invalid stream payloads", () => {
    expect(parseAppointmentStreamPayload("not-json")).toBeNull();
    expect(parseAppointmentStreamPayload("[]")).toBeNull();
  });
});
