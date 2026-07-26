// src/DriveNameProvider.ts

interface DriveNameProvider {
  getAvailableDriveNames(): string[];
  getSharedDrives(): SharedDriveInfo[];
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

  getAvailableDriveNames(): string[] {
    return this.getSharedDrives().map(d => d.name);
  }
}

class FakeDriveNameProvider implements DriveNameProvider {
  private drives: SharedDriveInfo[];

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

  getSharedDrives(): SharedDriveInfo[] {
    return this.drives.map(d => ({ ...d }));
  }

  getAvailableDriveNames(): string[] {
    return this.drives.map(d => d.name);
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
