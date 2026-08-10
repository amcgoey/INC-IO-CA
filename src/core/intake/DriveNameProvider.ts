/**
 * @file DriveNameProvider.ts
 * @description Pure core intake re-export seam for DriveNameProvider interface.
 *
 * Relocated to src/core/intake/ under GitHub Issue #171.
 * Pure Tier 1 domain interface with zero GAS ambient API dependencies.
 */

export type { DriveNameProvider, SharedDriveInfo } from '../interfaces/DriveNameProvider';

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {};
}
