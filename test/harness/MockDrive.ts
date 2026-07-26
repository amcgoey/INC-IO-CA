/**
* @file MockDrive.ts
 * @description Virtual in-memory DriveApp filesystem and state inspector for GasMockHarness.
 */

export interface VirtualFileMetadata {
  id: string;
  name: string;
  folderId: string;
  parentIds: string[];
  url: string;
  mimeType: string;
  blob?: any;
  sharingAccess?: string;
  sharingPermission?: string;
  createdAt: number;
}

export interface VirtualFolderMetadata {
  id: string;
  name: string;
  parentIds: string[];
  childFolderIds: string[];
  childFileIds: string[];
}

export class MockBlob {
  private name: string;
  private content: string | Uint8Array;
  private contentType: string;

  constructor(content: string | Uint8Array = "", contentType: string = "application/pdf", name: string = "file.pdf") {
    this.content = content;
    this.contentType = contentType;
    this.name = name;
  }

  public getName(): string {
    return this.name;
  }

  public setName(name: string): this {
    this.name = name;
    return this;
  }

  public getContentType(): string | null {
    return this.contentType;
  }

  public setContentType(contentType: string): this {
    this.contentType = contentType;
    return this;
  }

  public getDataAsString(): string {
    if (typeof this.content === "string") return this.content;
    return Buffer.from(this.content).toString("utf8");
  }

  public getBytes(): number[] {
    if (typeof this.content === "string") {
      return Array.from(Buffer.from(this.content, "utf8"));
    }
    return Array.from(this.content);
  }

  public copyBlob(): MockBlob {
    return new MockBlob(this.content, this.contentType, this.name);
  }

  public getAs(mimeType: string): MockBlob {
    const copy = this.copyBlob();
    copy.setContentType(mimeType);
    return copy;
  }
}

export class MockFileIterator {
  private files: MockFile[];
  private index: number = 0;

  constructor(files: MockFile[]) {
    this.files = files;
  }

  public hasNext(): boolean {
    return this.index < this.files.length;
  }

  public next(): MockFile {
    if (!this.hasNext()) throw new Error("No more files in iterator");
    return this.files[this.index++];
  }
}

export class MockFolderIterator {
  private folders: MockFolder[];
  private index: number = 0;

  constructor(folders: MockFolder[]) {
    this.folders = folders;
  }

  public hasNext(): boolean {
    return this.index < this.folders.length;
  }

  public next(): MockFolder {
    if (!this.hasNext()) throw new Error("No more folders in iterator");
    return this.folders[this.index++];
  }
}

export class MockFile {
  private state: MockDriveState;
  private id: string;

  constructor(state: MockDriveState, id: string) {
    this.state = state;
    this.id = id;
  }

  public getId(): string {
    return this.id;
  }

  public getName(): string {
    const meta = this.state.getRawFile(this.id);
    return meta ? meta.name : "";
  }

  public setName(name: string): this {
    this.state.updateFileName(this.id, name);
    return this;
  }

  public getUrl(): string {
    const meta = this.state.getRawFile(this.id);
    return meta ? meta.url : 'https://drive.google.com/open?id=' + this.id;
  }

  public getBlob(): MockBlob {
    const meta = this.state.getRawFile(this.id);
    if (meta && meta.blob) {
      return meta.blob;
    }
    return new MockBlob("file-content", "application/pdf", this.getName());
  }

  public getAs(mimeType: string): MockBlob {
    return this.getBlob().getAs(mimeType);
  }

  public moveTo(targetFolder: MockFolder): this {
    this.state.moveFile(this.id, targetFolder.getId());
    return this;
  }

  public getParents(): MockFolderIterator {
    const parents = this.state.getFileParents(this.id);
    return new MockFolderIterator(parents.map(fId => new MockFolder(this.state, fId)));
  }

  public setSharing(access: string, permission: string): this {
    this.state.setFileSharing(this.id, access, permission);
    return this;
  }
}

export class MockFolder {
  private state: MockDriveState;
  private id: string;

  constructor(state: MockDriveState, id: string) {
    this.state = state;
    this.id = id;
  }

  public getId(): string {
    return this.id;
  }

  public getName(): string {
    const meta = this.state.getRawFolder(this.id);
    return meta ? meta.name : "";
  }

  public setName(name: string): this {
    this.state.updateFolderName(this.id, name);
    return this;
  }

  public createFolder(name: string): MockFolder {
    const subId = this.state.createFolder(name, this.id);
    return new MockFolder(this.state, subId);
  }

  public createFile(arg1: any, arg2?: any, arg3?: any): MockFile {
    let name: string;
    let content: any;
    let mimeType: string = "application/pdf";
    let blob: MockBlob | undefined;

    if (arg1 && typeof arg1 === "object" && typeof arg1.getName === "function") {
      blob = arg1;
      name = blob!.getName();
    } else if (typeof arg1 === "string") {
      name = arg1;
      content = arg2 || "";
      mimeType = arg3 || "application/pdf";
      blob = new MockBlob(content, mimeType, name);
    } else {
      name = "untitled.pdf";
      blob = new MockBlob("", mimeType, name);
    }

    const fileId = this.state.createFile(name, this.id, blob);
    return new MockFile(this.state, fileId);
  }

  public getFoldersByName(name: string): MockFolderIterator {
    const folderIds = this.state.getFoldersByName(this.id, name);
    return new MockFolderIterator(folderIds.map(fId => new MockFolder(this.state, fId)));
  }

  public getFilesByName(name: string): MockFileIterator {
    const fileIds = this.state.getFilesByName(this.id, name);
    return new MockFileIterator(fileIds.map(fId => new MockFile(this.state, fId)));
  }

  public getFolders(): MockFolderIterator {
    const folderIds = this.state.getFolderSubfolders(this.id);
    return new MockFolderIterator(folderIds.map(fId => new MockFolder(this.state, fId)));
  }

  public getFiles(): MockFileIterator {
    const fileIds = this.state.getFolderFiles(this.id);
    return new MockFileIterator(fileIds.map(fId => new MockFile(this.state, fId)));
  }

  public getParents(): MockFolderIterator {
    const parentIds = this.state.getFolderParents(this.id);
    return new MockFolderIterator(parentIds.map(pId => new MockFolder(this.state, pId)));
  }

  public removeFile(file: MockFile): this {
    this.state.removeFileFromFolder(this.id, file.getId());
    return this;
  }

  public addFile(file: MockFile): this {
    this.state.addFileToFolder(this.id, file.getId());
    return this;
  }
}

export class MockDriveState {
  private folders: Map<string, VirtualFolderMetadata> = new Map();
  private files: Map<string, VirtualFileMetadata> = new Map();
  private autoIdCounter: number = 1000;

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.folders.clear();
    this.files.clear();
    this.autoIdCounter = 1000;
    this.folders.set("root", {
      id: "root",
      name: "My Drive",
      parentIds: [],
      childFolderIds: [],
      childFileIds: []
    });
  }

  public getFileById(id: string): VirtualFileMetadata | null {
    const file = this.files.get(id);
    return file ? { ...file } : null;
  }

  public getFolderById(id: string): VirtualFolderMetadata | null {
    const folder = this.folders.get(id);
    return folder ? { ...folder } : null;
  }

  public getFiledDocuments(): VirtualFileMetadata[] {
    return Array.from(this.files.values()).map(f => ({ ...f }));
  }

  public getRawFile(id: string): VirtualFileMetadata | undefined {
    return this.files.get(id);
  }

  public getRawFolder(id: string): VirtualFolderMetadata | undefined {
    return this.folders.get(id);
  }

  public ensureFolder(id: string, name?: string): VirtualFolderMetadata {
    let folder = this.folders.get(id);
    if (!folder) {
      folder = {
        id,
        name: name || (id === "root" ? "My Drive" : 'Folder_' + id),
        parentIds: id === "root" ? [] : ["root"],
        childFolderIds: [],
        childFileIds: []
      };
      this.folders.set(id, folder);
      if (id !== "root") {
        const root = this.folders.get("root");
        if (root && !root.childFolderIds.includes(id)) {
          root.childFolderIds.push(id);
        }
      }
    }
    return folder;
  }

  public ensureFile(id: string, name?: string): VirtualFileMetadata {
    let file = this.files.get(id);
    if (!file) {
      const rootFolder = this.ensureFolder("root");
      file = {
        id,
        name: name || 'File_' + id + '.pdf',
        folderId: rootFolder.id,
        parentIds: [rootFolder.id],
        url: 'https://drive.google.com/open?id=' + id,
        mimeType: "application/pdf",
        blob: new MockBlob("content", "application/pdf", name || ('File_' + id + '.pdf')),
        createdAt: Date.now()
      };
      this.files.set(id, file);
      if (!rootFolder.childFileIds.includes(id)) {
        rootFolder.childFileIds.push(id);
      }
    }
    return file;
  }

  public createFolder(name: string, parentId: string): string {
    const parent = this.ensureFolder(parentId);
    const newId = 'folder_' + (++this.autoIdCounter);
    const newFolder: VirtualFolderMetadata = {
      id: newId,
      name,
      parentIds: [parent.id],
      childFolderIds: [],
      childFileIds: []
    };
    this.folders.set(newId, newFolder);
    parent.childFolderIds.push(newId);
    return newId;
  }

  public createFile(name: string, parentId: string, blob?: MockBlob): string {
    const parent = this.ensureFolder(parentId);
    const newId = 'file_' + (++this.autoIdCounter);
    const fileBlob = blob || new MockBlob("content", "application/pdf", name);
    const newFile: VirtualFileMetadata = {
      id: newId,
      name,
      folderId: parent.id,
      parentIds: [parent.id],
      url: 'https://drive.google.com/open?id=' + newId,
      mimeType: fileBlob.getContentType() || "application/pdf",
      blob: fileBlob as any,
      createdAt: Date.now()
    };
    this.files.set(newId, newFile);
    parent.childFileIds.push(newId);
    return newId;
  }

  public moveFile(fileId: string, targetFolderId: string): void {
    const file = this.ensureFile(fileId);
    const oldFolderId = file.folderId;

    if (oldFolderId) {
      const oldFolder = this.folders.get(oldFolderId);
      if (oldFolder) {
        oldFolder.childFileIds = oldFolder.childFileIds.filter(id => id !== fileId);
      }
    }

    const targetFolder = this.ensureFolder(targetFolderId);
    file.folderId = targetFolder.id;
    file.parentIds = [targetFolder.id];
    if (!targetFolder.childFileIds.includes(fileId)) {
      targetFolder.childFileIds.push(fileId);
    }
  }

  public updateFileName(fileId: string, name: string): void {
    const file = this.ensureFile(fileId);
    file.name = name;
    if (file.blob && typeof file.blob.setName === "function") {
      file.blob.setName(name);
    }
  }

  public updateFolderName(folderId: string, name: string): void {
    const folder = this.ensureFolder(folderId);
    folder.name = name;
  }

  public setFileSharing(fileId: string, access: string, permission: string): void {
    const file = this.ensureFile(fileId);
    file.sharingAccess = access;
    file.sharingPermission = permission;
  }

  public getFoldersByName(parentFolderId: string, name: string): string[] {
    const parent = this.ensureFolder(parentFolderId);
    return parent.childFolderIds.filter(id => {
      const f = this.folders.get(id);
      return f && f.name === name;
    });
  }

  public getFilesByName(parentFolderId: string, name: string): string[] {
    const parent = this.ensureFolder(parentFolderId);
    return parent.childFileIds.filter(id => {
      const f = this.files.get(id);
      return f && f.name === name;
    });
  }

  public getFolderSubfolders(parentFolderId: string): string[] {
    const parent = this.ensureFolder(parentFolderId);
    return [...parent.childFolderIds];
  }

  public getFolderFiles(parentFolderId: string): string[] {
    const parent = this.ensureFolder(parentFolderId);
    return [...parent.childFileIds];
  }

  public getFileParents(fileId: string): string[] {
    const file = this.ensureFile(fileId);
    return [...file.parentIds];
  }

  public getFolderParents(folderId: string): string[] {
    const folder = this.ensureFolder(folderId);
    return [...folder.parentIds];
  }

  public removeFileFromFolder(folderId: string, fileId: string): void {
    const folder = this.folders.get(folderId);
    if (folder) {
      folder.childFileIds = folder.childFileIds.filter(id => id !== fileId);
    }
  }

  public addFileToFolder(folderId: string, fileId: string): void {
    const folder = this.ensureFolder(folderId);
    if (!folder.childFileIds.includes(fileId)) {
      folder.childFileIds.push(fileId);
    }
    const file = this.ensureFile(fileId);
    file.folderId = folderId;
    file.parentIds = [folderId];
  }
}

export class MockDriveApp {
  private state: MockDriveState;

  public Access = {
    ANYONE_WITH_LINK: "ANYONE_WITH_LINK",
    ANYONE: "ANYONE",
    DOMAIN: "DOMAIN",
    DOMAIN_WITH_LINK: "DOMAIN_WITH_LINK",
    PRIVATE: "PRIVATE"
  };

  public Permission = {
    VIEW: "VIEW",
    EDIT: "EDIT",
    COMMENT: "COMMENT",
    ORGANIZER: "ORGANIZER",
    NONE: "NONE"
  };

  constructor(state: MockDriveState) {
    this.state = state;
  }

  public getFolderById(id: string): MockFolder {
    this.state.ensureFolder(id);
    return new MockFolder(this.state, id);
  }

  public getFileById(id: string): MockFile {
    this.state.ensureFile(id);
    return new MockFile(this.state, id);
  }

  public getRootFolder(): MockFolder {
    return this.getFolderById("root");
  }

  public createFolder(name: string): MockFolder {
    return this.getRootFolder().createFolder(name);
  }

  public createFile(name: string, content: string, mimeType?: string): MockFile {
    return this.getRootFolder().createFile(name, content, mimeType);
  }
}
