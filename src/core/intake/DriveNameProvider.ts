/**
 * @file DriveNameProvider.ts
 * @description Pure core interface for querying available Shared Drive details and names.
 *
 * Classified as Tier 1 (Pure Core Logic) under ADR 0013 / CODING_STANDARDS.md.
 * Zero GAS ambient API dependencies and zero Node.js built-in imports.
 */

/** Shared Drive ID and name tuple. */
export interface SharedDriveInfo {
  id: string;
  name: string;
}

/**
 * Service interface for querying available Shared Drive details and names.
 */
export interface DriveNameProvider {
  /** Retrieves string names of all accessible Shared Drives. */
  getAvailableDriveNames(): string[];
  /** Retrieves structured `SharedDriveInfo` objects (ID and name) for all accessible Shared Drives. */
  getSharedDrives(): SharedDriveInfo[];
}

declare var defaultDriveNameProvider: DriveNameProvider;

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {};
}
