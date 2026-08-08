/**
 * @file GoogleDriveNameProvider.ts
 * @description Google Apps Script production adapter for DriveNameProvider using Drive Advanced API service.
 *
 * Classified as Tier 2 (GAS Infrastructure Adapter) under ADR 0013 / CODING_STANDARDS.md.
 */

import { DriveNameProvider, SharedDriveInfo } from './core/intake/DriveNameProvider';

export class GoogleDriveNameProvider implements DriveNameProvider {
  private cacheAdapter?: any;
  private readonly CACHE_KEY = "cached_shared_drives";
  private readonly CACHE_TTL_SECONDS = 21600; // 6 hours

  constructor(cacheAdapter?: any) {
    if (cacheAdapter) {
      this.cacheAdapter = cacheAdapter;
    } else if (typeof defaultCacheAdapter !== "undefined") {
      this.cacheAdapter = defaultCacheAdapter;
    }
  }

  getSharedDrives(): SharedDriveInfo[] {
    const cache = this.cacheAdapter || (typeof defaultCacheAdapter !== "undefined" ? defaultCacheAdapter : null);
    if (cache && typeof cache.get === "function") {
      const cached = cache.get(this.CACHE_KEY);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) {
            return parsed.map((item: any) => {
              if (typeof item === "string") return { id: "", name: item };
              return { id: item.id || "", name: item.name || "" };
            });
          }
        } catch (e) {}
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
    } catch (err: any) {}

    if (querySuccess && cache && typeof cache.put === "function") {
      try {
        cache.put(this.CACHE_KEY, JSON.stringify(drives), this.CACHE_TTL_SECONDS);
      } catch (e) {}
    }

    return drives;
  }

  getAvailableDriveNames(): string[] {
    return this.getSharedDrives().map(d => d.name);
  }
}

/** Global default instance seam for DriveNameProvider. */
export var defaultDriveNameProvider: DriveNameProvider = new GoogleDriveNameProvider();

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    GoogleDriveNameProvider,
    defaultDriveNameProvider
  };
}
