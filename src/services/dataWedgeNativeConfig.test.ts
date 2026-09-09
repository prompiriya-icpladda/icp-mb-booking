import { readFileSync } from "fs";
import { join } from "path";

const dataWedgeModuleSource = () =>
  readFileSync(
    join(
      process.cwd(),
      "android/app/src/main/java/com/icpladda/apscanner/DataWedgeModule.kt",
    ),
    "utf8",
  );

describe("DataWedge native profile config", () => {
  it("selects the TC21 internal imager instead of auto scanner selection", () => {
    const source = dataWedgeModuleSource();

    expect(source).toContain('putString("scanner_selection_by_identifier", "INTERNAL_IMAGER")');
    expect(source).not.toContain('putString("scanner_selection", "auto")');
  });

  it("enables side scan buttons and key-mapped scan trigger", () => {
    const source = dataWedgeModuleSource();

    expect(source).toContain(
      'putStringArray("scanner_trigger_resource", arrayOf("LEFT", "RIGHT", "KEY_MAPPER_SCAN", "KEY_MAPPER_L1", "KEY_MAPPER_R1"))',
    );
  });

  it("uses broadcast intent delivery and switches to the app scanner profile", () => {
    const source = dataWedgeModuleSource();

    expect(source).toContain('putString("CONFIG_MODE", "CREATE_IF_NOT_EXIST")');
    expect(source).not.toContain('putString("CONFIG_MODE", "UPDATE")');
    expect(source).toContain('private const val SWITCH_TO_PROFILE = "com.symbol.datawedge.api.SWITCH_TO_PROFILE"');
    expect(source).toContain("sendDataWedgeIntent(SWITCH_TO_PROFILE, PROFILE_NAME, SWITCH_TO_PROFILE_COMMAND_ID)");
    expect(source).toContain('putInt("intent_delivery", 2)');
    expect(source).not.toContain('putString("intent_delivery", "2")');
  });
});
