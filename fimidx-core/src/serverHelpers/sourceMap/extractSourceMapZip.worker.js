import { parentPort, workerData } from "node:worker_threads";
import AdmZip from "adm-zip";

/**
 * Worker entry for validating + extracting a source-map zip off the main thread.
 * Kept as plain JS so Node can load it directly (vitest + compiled dist).
 *
 * workerData: { zipPath: string, extractTo: string }
 */
const { zipPath, extractTo } = workerData;

try {
  const zip = new AdmZip(zipPath);
  // Force central-directory parse; truncated/corrupt zips throw here.
  zip.getEntries();
  zip.extractAllTo(extractTo, /* overwrite */ true);
  parentPort.postMessage({ ok: true });
} catch (error) {
  const message =
    error instanceof Error ? error.message : String(error ?? "unknown error");
  parentPort.postMessage({ ok: false, error: message });
}
