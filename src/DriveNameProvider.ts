// src/DriveNameProvider.ts

interface DriveNameProvider {
  getAvailableDriveNames(): string[];
}

class GoogleDriveNameProvider implements DriveNameProvider {
  private cacheAdapter: CacheAdapter;
  private readonly CACHE_KEY = "cached_shared_drives";
  private readonly CACHE_TTL_SECONDS = 21600; // 6 hours

  constructor(cacheAdapter?: CacheAdapter) {
    if (cacheAdapter) {
      this.cacheAdapter = cacheAdapter;
    } else if (typeof defaultCacheAdapter !== "undefined") {
      this.cacheAdapter = defaultCacheAdapter;
    } else {
      this.cacheAdapter = require("./CacheAdapter").defaultCacheAdapter;
    }
  }

  getAvailableDriveNames(): string[] {
    const cached = this.cacheAdapter.get(this.CACHE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          return parsed.map((item: any) => (typeof item === "string" ? item : item.name));
        }
      } catch (e) {
        // Ignore parse errors
      }
    }

    let names: string[] = [];
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
            names = names.concat(resp.items.map((d: any) => d.name));
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
        this.cacheAdapter.put(this.CACHE_KEY, JSON.stringify(names), this.CACHE_TTL_SECONDS);
      } catch (e) {
        // Ignore cache write errors
      }
    }

    return names;
  }
}

class FakeDriveNameProvider implements DriveNameProvider {
  private names: string[];

  constructor(initialNames: string[] = []) {
    this.names = [...initialNames];
  }

  setDriveNames(names: string[]): void {
    this.names = [...names];
  }

  getAvailableDriveNames(): string[] {
    return [...this.names];
  }
}

var defaultDriveNameProvider: DriveNameProvider = new GoogleDriveNameProvider();

declare var module: any;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    GoogleDriveNameProvider,
    FakeDriveNameProvider,
    defaultDriveNameProvider
  };
}
