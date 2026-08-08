/**
 * @file FakeDriveFilingRepository.ts
 * @description Re-export of promoted FakeDriveFilingRepository adapter.
 */

export { FakeDriveFilingRepository } from "../../../src/adapters/fakes/FakeDriveFilingRepository";
const { FakeDriveFilingRepository } = require("../../../src/adapters/fakes/FakeDriveFilingRepository");

declare var module: any;
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    FakeDriveFilingRepository
  };
}
