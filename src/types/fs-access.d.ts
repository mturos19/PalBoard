/**
 * File System Access API bits TypeScript's DOM lib still does not ship.
 *
 * Kept free of imports so it stays a global script rather than a module — both
 * the web project and the test project pull it in, and neither should have to
 * drag the rest of the app along with it.
 */

interface FileSystemDirectoryHandle {
  /** Async-iterates the folder's children. Present in Chromium, not in the lib. */
  values(): AsyncIterableIterator<FileSystemDirectoryHandle | FileSystemFileHandle>
}

interface Window {
  showDirectoryPicker?: (options?: {
    id?: string
    mode?: 'read' | 'readwrite'
    startIn?: string
  }) => Promise<FileSystemDirectoryHandle>
}
