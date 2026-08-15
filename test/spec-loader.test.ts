/**
 * @file spec-loader.test.ts
 * @description Unit tests for scripts/template/spec-loader.ts:
 * JSON loading, fail-fast validation, document type spec compilation, and ViewModel factory.
 */

import test from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  loadWorkbookSpecs,
  createWorkbookTemplateViewModel,
  loadDocTypeSpecsFromDir,
  loadBaseSpecFromFile,
  loadViewSpecFromFile
} from "../scripts/template/spec-loader";

test("loadWorkbookSpecs - successfully loads, validates, and compiles default specs from src/specs", () => {
  const specs = loadWorkbookSpecs();

  assert.ok(specs, "LoadedWorkbookSpecs must be defined");
  assert.strictEqual(specs.baseSpec.schemaVersion, "1.0.0");
  assert.ok(specs.viewSpec.offsets, "View spec offsets must be defined");
  assert.strictEqual(specs.viewSpec.offsets.HEADER_ROW_INDEX, 3);
  assert.ok(Array.isArray(specs.docTypeSpecs), "docTypeSpecs must be an array");
  assert.ok(specs.docTypeSpecs.length >= 2, "Must load at least SUBMITTAL_ARCH and SUBMITTAL_FFE");

  // Verify compiled model contains required tabs
  const tabNames = specs.compiledModel.tabs.map((t) => t.name);
  assert.ok(tabNames.includes("_Config"), "Compiled model must include _Config tab");
  assert.ok(tabNames.includes("_Shared"), "Compiled model must include _Shared tab");
  assert.ok(tabNames.includes("_AuditLog"), "Compiled model must include _AuditLog tab");
  assert.ok(tabNames.includes("Submittal Arch"), "Compiled model must include Submittal Arch tab");
  assert.ok(tabNames.includes("Submittal FF&E"), "Compiled model must include Submittal FF&E tab");

  // Verify viewModel
  assert.ok(specs.viewModel, "ViewModel must be initialized");
  assert.strictEqual(specs.viewModel.getSpec(), specs.compiledModel);
  assert.strictEqual(specs.viewModel.getViewSpec(), specs.viewSpec);
});

test("createWorkbookTemplateViewModel - creates ViewModel instance with default loaded specs", () => {
  const vm = createWorkbookTemplateViewModel();
  assert.ok(vm);
  assert.ok(vm.getSpec().tabs.length >= 5);
});

test("loadBaseSpecFromFile - throws descriptive error if file does not exist", () => {
  assert.throws(
    () => loadBaseSpecFromFile("/non/existent/path/base.json"),
    /Base spec file not found/
  );
});

test("loadBaseSpecFromFile - throws descriptive error on malformed JSON syntax", () => {
  const tmpDir = path.resolve(process.cwd(), ".scratch", "test-spec-loader-base-syntax");
  fs.mkdirSync(tmpDir, { recursive: true });
  const badJsonPath = path.resolve(tmpDir, "bad-base.json");
  fs.writeFileSync(badJsonPath, "{ invalid: json", "utf-8");

  try {
    assert.throws(
      () => loadBaseSpecFromFile(badJsonPath),
      /Invalid JSON syntax in base spec/
    );
  } finally {
    if (fs.existsSync(badJsonPath)) fs.unlinkSync(badJsonPath);
    if (fs.existsSync(tmpDir)) fs.rmdirSync(tmpDir);
  }
});

test("loadBaseSpecFromFile - throws descriptive error on invalid base spec schema", () => {
  const tmpDir = path.resolve(process.cwd(), ".scratch", "test-spec-loader-base-schema");
  fs.mkdirSync(tmpDir, { recursive: true });
  const invalidSchemaPath = path.resolve(tmpDir, "invalid-base.json");
  fs.writeFileSync(invalidSchemaPath, JSON.stringify({ tabs: "not-an-array" }), "utf-8");

  try {
    assert.throws(
      () => loadBaseSpecFromFile(invalidSchemaPath),
      /Base spec validation failed/
    );
  } finally {
    if (fs.existsSync(invalidSchemaPath)) fs.unlinkSync(invalidSchemaPath);
    if (fs.existsSync(tmpDir)) fs.rmdirSync(tmpDir);
  }
});

test("loadViewSpecFromFile - throws descriptive error if file does not exist", () => {
  assert.throws(
    () => loadViewSpecFromFile("/non/existent/path/view.json"),
    /View spec file not found/
  );
});

test("loadViewSpecFromFile - throws descriptive error on malformed JSON syntax", () => {
  const tmpDir = path.resolve(process.cwd(), ".scratch", "test-spec-loader-view-syntax");
  fs.mkdirSync(tmpDir, { recursive: true });
  const badJsonPath = path.resolve(tmpDir, "bad-view.json");
  fs.writeFileSync(badJsonPath, "not json", "utf-8");

  try {
    assert.throws(
      () => loadViewSpecFromFile(badJsonPath),
      /Invalid JSON syntax in view spec/
    );
  } finally {
    if (fs.existsSync(badJsonPath)) fs.unlinkSync(badJsonPath);
    if (fs.existsSync(tmpDir)) fs.rmdirSync(tmpDir);
  }
});

test("loadViewSpecFromFile - throws descriptive error on invalid view spec schema", () => {
  const tmpDir = path.resolve(process.cwd(), ".scratch", "test-spec-loader-view-schema");
  fs.mkdirSync(tmpDir, { recursive: true });
  const invalidSchemaPath = path.resolve(tmpDir, "invalid-view.json");
  fs.writeFileSync(invalidSchemaPath, JSON.stringify({ titleRowStyle: {} }), "utf-8");

  try {
    assert.throws(
      () => loadViewSpecFromFile(invalidSchemaPath),
      /View spec validation failed/
    );
  } finally {
    if (fs.existsSync(invalidSchemaPath)) fs.unlinkSync(invalidSchemaPath);
    if (fs.existsSync(tmpDir)) fs.rmdirSync(tmpDir);
  }
});

test("loadDocTypeSpecsFromDir - throws descriptive error on invalid doc type spec schema in dir", () => {
  const tmpDir = path.resolve(process.cwd(), ".scratch", "test-spec-loader-doctype");
  fs.mkdirSync(tmpDir, { recursive: true });
  const invalidDocTypePath = path.resolve(tmpDir, "broken_doc.json");
  fs.writeFileSync(invalidDocTypePath, JSON.stringify({ key: "INVALID_SPEC" }), "utf-8");

  try {
    assert.throws(
      () => loadDocTypeSpecsFromDir(tmpDir),
      /Document type spec validation failed/
    );
  } finally {
    if (fs.existsSync(invalidDocTypePath)) fs.unlinkSync(invalidDocTypePath);
    if (fs.existsSync(tmpDir)) fs.rmdirSync(tmpDir);
  }
});