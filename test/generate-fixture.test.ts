/**
 * @file generate-fixture.test.ts
 * @description Unit tests for scripts/template/generate-fixture.ts.
 */

import test from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { generateFixture } from "../scripts/template/generate-fixture";
import { createWorkbookTemplateViewModel } from "../scripts/template/spec-loader";

test("generateFixture - generates valid template JSON fixture file from loaded specs", () => {
  const tmpDir = path.resolve(process.cwd(), ".scratch", "test-gen-fixture");
  fs.mkdirSync(tmpDir, { recursive: true });
  const testOutputPath = path.resolve(tmpDir, "test-fixture.json");

  try {
    const outputPath = generateFixture(undefined, testOutputPath);
    assert.strictEqual(outputPath, testOutputPath);
    assert.ok(fs.existsSync(testOutputPath), "Fixture file must be written");

    const content = fs.readFileSync(testOutputPath, "utf-8");
    const json = JSON.parse(content);

    assert.strictEqual(json.schemaVersion, "1.0.0");
    assert.ok(Array.isArray(json.tabs), "tabs must be an array");
    assert.ok(json.tabs.length >= 5, "must contain at least 5 tabs");
    assert.ok(Array.isArray(json.namedRanges), "namedRanges must be an array");
  } finally {
    if (fs.existsSync(testOutputPath)) fs.unlinkSync(testOutputPath);
    if (fs.existsSync(tmpDir)) fs.rmdirSync(tmpDir);
  }
});

test("generateFixture - supports custom injected ViewModel", () => {
  const vm = createWorkbookTemplateViewModel();
  const tmpDir = path.resolve(process.cwd(), ".scratch", "test-gen-fixture-custom");
  fs.mkdirSync(tmpDir, { recursive: true });
  const testOutputPath = path.resolve(tmpDir, "custom-fixture.json");

  try {
    const outputPath = generateFixture(vm, testOutputPath);
    assert.strictEqual(outputPath, testOutputPath);
    assert.ok(fs.existsSync(testOutputPath));

    const content = fs.readFileSync(testOutputPath, "utf-8");
    const json = JSON.parse(content);
    assert.strictEqual(json.schemaVersion, vm.getSpec().schemaVersion);
  } finally {
    if (fs.existsSync(testOutputPath)) fs.unlinkSync(testOutputPath);
    if (fs.existsSync(tmpDir)) fs.rmdirSync(tmpDir);
  }
});