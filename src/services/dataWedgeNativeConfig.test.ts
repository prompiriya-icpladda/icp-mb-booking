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

  it("configures the launcher profile used by the kiosk home activity", () => {
    const source = dataWedgeModuleSource();

    expect(source).toContain('private const val PROFILE_NAME = "Launcher"');
    expect(source).toContain('val resultListSuccess = !resultList.isNullOrEmpty()');
    expect(source).toContain('putString("CONFIG_MODE", "CREATE_IF_NOT_EXIST")');
    expect(source).toContain('putParcelableArrayList("PLUGIN_CONFIG", arrayListOf(barcodePlugin(), keystrokePlugin(), intentPlugin()))');
    expect(source).not.toContain('APP_LIST');
    expect(source).not.toContain('SWITCH_TO_PROFILE');
    expect(source).not.toContain('putString("CONFIG_MODE", "UPDATE")');
    expect(source).toContain('putInt("intent_delivery", 2)');
    expect(source).toContain('putString("intent_category", Intent.CATEGORY_DEFAULT)');
    expect(source).toContain('addCategory(Intent.CATEGORY_DEFAULT)');
    expect(source).not.toContain('putString("intent_delivery", "2")');
  });
});