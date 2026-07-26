// src/DriveNameProvider.ts

interface DriveNameProvider {
  getAvailableDriveNames(): string[];
}

class GoogleDriveNameProvider implements DriveNameProvider {
  private cacheAdapter: CacheAdapter;

  constructor(cacheAdapter?: CacheAdapter) {
    if (cacheAdapter) {
      this.cacheAdapter = cacheAdapter;
    } else if (typeof defaultCacheAdapter !== "undefined") {
      this.cacheAdapter = defaultCacheAdapter;
    } else {
      try {
        const { defaultCacheAdapter: importedDefault, GoogleScriptCacheAdapter: ImportedGoogleAdapter } = require("./CacheAdapter");
        this.cacheAdapter = importedDefault || new ImportedGoogleAdapter();
      } catch (e) {
        this.cacheAdapter = new GoogleScriptCacheAdapter();
      }
    }
  }

  getAvailableDriveNames(): string[] {
    const cached = this.cacheAdapter.get("cached_shared_drives");
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
      }
    } catch (err: any) {
      // Fail gracefully on Drive API errors
    }

    if (names.length > 0) {
      try {
        this.cacheAdapter.put("cached_shared_drives", JSON.stringify(names), 21600);
      } catch (e) {
        // Ignore cache errors
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
