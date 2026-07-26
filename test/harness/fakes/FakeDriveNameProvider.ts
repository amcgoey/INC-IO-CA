/**
 * @file FakeDriveNameProvider.ts
 * @description Pure in-memory fake implementsTion of `DriveNameProvider` for fast offline unit testing without Google Drive App dependencies.
 */

export class FakeDriveNameProvider implements DriveNameProvider {
  private drives: SharedDriveInfo[];

  /**
   * Constructs a `FakeDriveNameProvider` instance.
   *
   * @param initialDrives - Initial array of Shared Drive names or `SharedDriveInfo` objects.
   */
  constructor(initialDrives: (string | SharedDriveInfo)[] = []) {
    this.drives = initialDrives.map(item =>
      typeof item === "string" ? { id: "", name: item } : { ...item }
    );
  }

  setDriveNames(names: string[]): void {
    this.drives = names.map(name => ({ id: "", name }));
  }

  setSharedDrives(drives: SharedDriveInfo[]): void {
    this.drives = drives.map(d => ({ ...d }));
  }

  /** @override */
  getSharedDrives(): SharedDriveInfo[] {
    return this.drives.map(d => ({ ...d }));
  }

  /** @override */
  getAvailableDriveNames(): string[] {
    return this.drives.map(d => d.name);
  }
}
