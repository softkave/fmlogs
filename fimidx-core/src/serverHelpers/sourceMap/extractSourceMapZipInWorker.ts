import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";

export type ExtractSourceMapZipWorkerResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Run AdmZip validate + extract on a worker thread so large zips do not block
 * the main event loop.
 */
export function extractSourceMapZipInWorker(
  zipPath: string,
  extractTo: string
): Promise<void> {
  const workerPath = fileURLToPath(
    new URL("./extractSourceMapZip.worker.js", import.meta.url)
  );

  return new Promise((resolve, reject) => {
    let settled = false;
    const worker = new Worker(workerPath, {
      workerData: { zipPath, extractTo },
    });

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      worker.terminate().catch(() => undefined);
      fn();
    };

    worker.once("message", (message: ExtractSourceMapZipWorkerResult) => {
      if (message?.ok) {
        settle(() => resolve());
        return;
      }
      settle(() =>
        reject(new Error(message?.error || "Zip extract worker failed"))
      );
    });

    worker.once("error", (error) => {
      settle(() => reject(error));
    });

    worker.once("exit", (code) => {
      if (code !== 0) {
        settle(() =>
          reject(new Error(`Zip extract worker exited with code ${code}`))
        );
      }
    });
  });
}
