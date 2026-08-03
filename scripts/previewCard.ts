/**
 * @file previewCard.ts
 * @description CLI script to instantiate CardPresenter with GasMockHarness, render formatted Card UI JSON structures to terminal, saving baseline JSON snapshots to test/snapshots/cards/*.json.
 */

import fs from "node:fs";
import path from "node:path";
import { CardSerializer } from "../test/harness/CardSerializer";
import { EventFactory } from "../test/harness/factories/EventFactory";
import { GasMockHarness } from "../test/harness/GasMockHarness";

// Install harness mocks
GasMockHarness.install();

require("../src/Config");
require("../src/AIUtils");
require("../src/UI");
const { CardPresenter } = require("../src/CardPresenter");

export function generateCardSnapshots() {
  const presenter = new CardPresenter();

  // 1. Main Card (default state)
  const mainEvent = EventFactory.createGmailContextEvent({ discipline: "Architecture" });
  const mainCardResponse = presenter.presentCardReload(mainEvent);
  const mainCardJson = CardSerializer.actionResponseToJSON(mainCardResponse);

  // 2. Validation Error Card
  const validationEvent = EventFactory.createCardSubmitEvent({ discipline: "Architecture" });
  const validationResponse = presenter.presentValidationError(validationEvent, ["Title is required", "Date is invalid"], ["title", "date"]);
  const validationCardJson = CardSerializer.actionResponseToJSON(validationResponse);

  // 3. Interaction Prompt Card (ADD_TAG)
  const promptTagResponse = presenter.presentInteractionPrompt(validationEvent, "ADD_TAG", "Spec Tag 'A-99' is not registered. Would you like to add it?");
  const promptTagCardJson = CardSerializer.actionResponseToJSON(promptTagResponse);

  // 4. Interaction Prompt Card (ADD_VENDOR)
  const promptVendorResponse = presenter.presentInteractionPrompt(validationEvent, "ADD_VENDOR", "Vendor 'Acme Supplies' is not registered. Would you like to add it?");
  const promptVendorCardJson = CardSerializer.actionResponseToJSON(promptVendorResponse);

  // 5. Outgoing Success Card (Architecture)
  const archResult = {
    fileId: "file-arch-001",
    newFileName: "033000-001 Concrete Submittal.pdf",
    url: "https://drive.google.com/file/d/file-arch-001/view",
    localPath: "G:\\My Drive\\033000-001 Concrete Submittal.pdf",
    targetKey: "033000-001",
    title: "Cast-in-Place Concrete",
    projectAbbr: "PROJ",
    action: "Approved",
    incomingRouting: "To Review",
    directRowUrl: "https://docs.google.com/spreadsheets/d/log-123/edit?gid=0#gid=0",
    failedColumns: [],
    emptyFallbacks: []
  };
  const archParams = { targetFolderId: "folder-001", logFileId: "log-123", projectAbbr: "PROJ" };
  const archSuccessResponse = presenter.presentOutgoingSuccess(mainEvent, archResult, archParams);
  const archSuccessCardJson = CardSerializer.actionResponseToJSON(archSuccessResponse);

  // 6. Outgoing Success Card (FF&E)
  const ffeEvent = EventFactory.createCardSubmitEvent({ discipline: "FF&E" });
  const ffeResult = {
    fileId: "file-ffe-002",
    newFileName: "CH-01 Side Chair Submittal.pdf",
    url: "https://drive.google.com/file/d/file-ffe-002/view",
    localPath: "G:\\My Drive\\CH-01 Side Chair Submittal.pdf",
    targetKey: "CH-01-001",
    title: "Dining Side Chair",
    projectAbbr: "PROJ",
    action: "Approved",
    incomingRouting: "",
    directRowUrl: "https://docs.google.com/spreadsheets/d/log-ffe/edit?gid=0#gid=0",
    failedColumns: [],
    emptyFallbacks: []
  };
  const ffeParams = { targetFolderId: "folder-ffe", logFileId: "log-ffe", projectAbbr: "PROJ" };
  const ffeSuccessResponse = presenter.presentOutgoingSuccess(ffeEvent, ffeResult, ffeParams);
  const ffeSuccessCardJson = CardSerializer.actionResponseToJSON(ffeSuccessResponse);

  // 7. Unbiased Intake Card
  const unbiasedResponse = presenter.presentUnbiasedIntakeCard(mainEvent);
  const unbiasedCardJson = CardSerializer.actionResponseToJSON(unbiasedResponse);

  const snapshots: Record<string, any> = {
    main_card: mainCardJson,
    unbiased_intake_card: unbiasedCardJson,
    validation_error_card: validationCardJson,
    interaction_prompt_tag_card: promptTagCardJson,
    interaction_prompt_vendor_card: promptVendorCardJson,
    outgoing_success_arch_card: archSuccessCardJson,
    outgoing_success_ffe_card: ffeSuccessCardJson
  };
  const snapshotDir = path.join(process.cwd(), "test", "snapshots", "cards");
  fs.mkdirSync(snapshotDir, { recursive: true });

  for (const [name, jsonContent] of Object.entries(snapshots)) {
    const filePath = path.join(snapshotDir, name + ".json");
    fs.writeFileSync(filePath, JSON.stringify(jsonContent, null, 2), "utf-8");
  }

  return snapshots;
}

if (require.main === module) {
  const divider = "====================================================";
  console.log(divider);
  console.log("    Local Card Preview CLI Inspector");
  console.log(divider);
  console.log("");

  const snapshots = generateCardSnapshots();

  for (const [name, jsonContent] of Object.entries(snapshots)) {
    console.log("--- Card Snapshot: " + name + " ---");
    console.log(JSON.stringify(jsonContent, null, 2));
    console.log("");
  }

  console.log(divider);
  console.log("OK: Baseline JSON snapshots saved to test/snapshots/cards/");
  console.log(divider);
  console.log("");
}
