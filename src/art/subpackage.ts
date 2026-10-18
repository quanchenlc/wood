import { catalogEntry } from "./registry";
import type { ArtSetId } from "./types";

export type SubpackageProgress = (progress01: number, status: string) => void;

/**
 * 按需加载美术分包。set0 已在 boot 的 assets 分包中，直接 resolve。
 * harness / 无 wx 时视为已就绪。
 */
export function loadArtSubpackage(
  setId: ArtSetId,
  onProgress?: SubpackageProgress,
): Promise<void> {
  const entry = catalogEntry(setId);
  if (!entry.subpackage) {
    onProgress?.(1, "原版已就绪");
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const wxApi = (globalThis as {
      wx?: {
        loadSubpackage?: (opts: {
          name: string;
          success: () => void;
          fail: (e: unknown) => void;
        }) => { onProgressUpdate?: (cb: (r: { progress?: number }) => void) => void };
      };
    }).wx;

    if (!wxApi?.loadSubpackage) {
      onProgress?.(1, "资源就绪");
      resolve();
      return;
    }

    onProgress?.(0, `加载${entry.label}`);
    const task = wxApi.loadSubpackage({
      name: entry.subpackage!,
      success: () => {
        onProgress?.(1, `${entry.label}就绪`);
        resolve();
      },
      fail: (err) => reject(err),
    });
    task?.onProgressUpdate?.((res) => {
      const p = typeof res.progress === "number" ? res.progress / 100 : 0;
      onProgress?.(Math.max(0, Math.min(1, p)), `下载${entry.label}`);
    });
  });
}
