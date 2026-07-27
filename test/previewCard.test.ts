import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { generateCardSnapshots } from "../scripts/previewCard";

test("previewCard CLI inspector exports expected non-empty card snapshot JSON files", () => {
  const snapshots = generateCardSnapshots();

  const snapshotKeys = [
    "main_card",
    "validation_error_card",
    "interaction_prompt_tag_card",
    "interaction_prompt_vendor_card",
    "outgoing_success_arch_card",
    "outgoing_success_ffe_card"
  ];

  for (const key of snapshotKeys) {
    assert.ok(snapshots[key], `Snapshot for ${key} should exist in returned map`);
    const filePath = path.join(process.cwd(), "test", "snapshots", "cards", `${key}.json`);
    assert.ok(fs.existsSync(filePath), `Snapshot file ${filePath} should exist on disk`);

    const fileContent = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    assert.ok(fileContent.navigation.card.sections.length > 0, `Snapshot ${key} should constain non-empty card sections`);
  }
});
