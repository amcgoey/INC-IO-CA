/// <reference path="./types.ts" />
/**
 * @file DriveFilingRepository.ts
 * @description Re-export of GoogleDriveFilingRepository and default instance seam.
 */

export { GoogleDriveFilingRepository, defaultDriveFilingRepository } from "./adapters/gas/GoogleDriveFilingRepository";
declare var GoogleDriveFilingRepository: any;
declare var defaultDriveFilingRepository: any;
declare var require: any;

const _gdfrMod = typeof require !== "undefined" ? (function() { try { return require("./adapters/gas/GoogleDriveFilingRepository"); } catch (_e) { return {}; } })() : {};
const GDFR = typeof GoogleDriveFilingRepository !== "undefined" ? GoogleDriveFilingRepository : _gdfrMod.GoogleDriveFilingRepository;
const dDFR = typeof defaultDriveFilingRepository !== "undefined" ? defaultDriveFilingRepository : _gdfrMod.defaultDriveFilingRepository;

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    GoogleDriveFilingRepository: GDFR,
    defaultDriveFilingRepository: dDFR
  };
}
