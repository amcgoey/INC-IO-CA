/**
 * @file DriveNameProvider.ts
 * @description Service providing available Google Shared Drive names and IDs for project selection.
 *
 * Provides `GoogleDriveNameProvider` with 6-hour caching (`CacheAdapter`) for Google Drive API queries and
 * `FakeDriveNameProvider` for unit testing.
 */

/**
 * Service interface for querying available Shared Drive details and names.
 */
interface DriveNameProvider {
  /** Retrieves string names of all accessible Shared Drives. */
  getAvailableDriveNames(): string[];
  /** Retrieves structured `SharedDriveInfo` objects (ID and name) for all accessible Shared Drives. */
  getSharedDrives(): SharedDriveInfo[];
}

/**
 * Production implementation of `DriveNameProvider` using the Google Drive Advanced API service.
 * Caches retrieved Shared Drive lists for up to 6 hours (21,600 seconds) via `CacheAdapter`.
 */
class GoogleDriveNameProvider implements DriveNameProvider {
  private cacheAdapter: CacheAdapter;
  private readonly CACHE_KEY = "cached_shared_drives";
  private readonly CACHE_TTL_SECONDS = 21600; // 6 hours

  /**
   * Constructs a `GoogleDriveNameProvider` instance.
   *
   * @param cacheAdapter - Optional custom `CacheAdapter` instance.
   */
  constructor(cacheAdapter?: CacheAdapter) {
    if (cacheAdapter) {
      this.cacheAdapter = cacheAdapter;
    } else if (typeof defaultCacheAdapter !== "undefined") {
      this.cacheAdapter = defaultCacheAdapter;
    } else {
      this.cacheAdapter = require("./CacheAdapter").defaultCacheAdapter;
    }
  }

  /**
   * Queries Google Drive for accessible Shared Drives, incorporating user cache lookup and fallback logic.
   *
   * @returns Array of `SharedDriveInfo` objects containing Drive IDs and names.
   */
  getSharedDrives(): SharedDriveInfo[] {
    const cached = this.cacheAdapter.get(this.CACHE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          return parsed.map((item: any) => {
            if (typeof item === "string") return { id: "", name: item };
            return { id: item.id || "", name: item.name || "" };
          });
        }
      } catch (e) {
        // Ignore parse errors
      }
    }

    let drives: SharedDriveInfo[] = [];
    let querySuccess = false;

    try {
      if (typeof Drive !== "undefined" && (Drive as any).Drives && (Drive as any).Drives.list) {
        let pageToken: string | undefined;
        do {
          const resp = (Drive as any).Drives.list({
            maxResults: 100,
            pageToken: pageToken,
            fields: "items(id,name),nextPageToken"
          });
          if (resp && resp.items) {
            drives = drives.concat(resp.items.map((d: any) => ({ id: d.id, name: d.name })));
          }
          pageToken = resp ? resp.nextPageToken : undefined;
        } while (pageToken);
        querySuccess = true;
      }
    } catch (err: any) {
      // Fail gracefully on Drive API errors
    }

    if (querySuccess) {
      try {
        this.cacheAdapter.put(this.CACHE_KEY, JSON.stringify(drives), this.CACHE_TTL_SECONDS);
      } catch (e) {
        // Ignore cache write errors
      }
    }

    return drives;
  }

  /**
   * Returns string names of all available Shared Drives.
   *
   * @returns Array of Shared Drive name strings.
   */
  getAvailableDriveNames(): string[] {
    return this.getSharedDrives().map(d => d.name);
  }
}


/** Global default instance seam for DriveNameProvider. */
var defaultDriveNameProvider: DriveNameProvider = new GoogleDriveNameProvider();

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    GoogleDriveNameProvider,
    defaultDriveNameProvider
  };
}
