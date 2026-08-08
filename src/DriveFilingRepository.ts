/// <reference path="./types.ts" />
/**
 * @file DriveFilingRepository.ts
 * @description Re-export of GoogleDriveFilingRepository and default instance seam.
 */

export { GoogleDriveFilingRepository, defaultDriveFilingRepository } from "./adapters/gas/GoogleDriveFilingRepository";
const { GoogleDriveFilingRepository: GDFR, defaultDriveFilingRepository: dDFR } = require("./adapters/gas/GoogleDriveFilingRepository");

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    GoogleDriveFilingRepository: GDFR,
    defaultDriveFilingRepository: dDFR
  };
}
