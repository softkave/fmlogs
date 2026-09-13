import { access, mkdir, rm } from "fs/promises";
import path from "path";
import { kSourceMapZipFileName } from "../fimidara/fimidaraClient.js";
import { downloadFimidaraFile } from "../fimidara/index.js";
import { extractSourceMapZipInWorker } from "./extractSourceMapZipInWorker.js";
import { hasZipEocd } from "./hasZipEocd.js";

async function localFileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure the source-map zip is present under `localPath` and extracted.
 * Reuses a local zip when an EOCD check passes; otherwise re-downloads.
 * Downloads land atomically so interrupted transfers do not leave a
 * reuseable partial at the final path. Zip parse/extract runs on a worker
 * thread.
 */
export async function materializeLocalSourceMapZip(params: {
  localDir: string;
  projectId: string;
  repoIdentifier: string;
  version: string;
  fimidaraPath: string;
}): Promise<string> {
  const localPath = path.join(
    params.localDir,
    "maps",
    params.projectId,
    params.repoIdentifier,
    params.version
  );
  await mkdir(localPath, { recursive: true });

  const zipLocalPath = path.join(localPath, kSourceMapZipFileName);
  const zipExists =
    (await localFileExists(zipLocalPath)) && (await hasZipEocd(zipLocalPath));

  if (!zipExists) {
    await rm(zipLocalPath, { force: true }).catch(() => undefined);
    await downloadFimidaraFile(params.fimidaraPath, zipLocalPath);
  }

  if (!(await hasZipEocd(zipLocalPath))) {
    await rm(zipLocalPath, { force: true }).catch(() => undefined);
    throw new Error(
      `Downloaded source map zip is truncated or missing EOCD: ${zipLocalPath}`
    );
  }

  try {
    await extractSourceMapZipInWorker(zipLocalPath, localPath);
  } catch (error) {
    await rm(zipLocalPath, { force: true }).catch(() => undefined);
    throw new Error(
      `Downloaded source map zip is unreadable: ${zipLocalPath}`,
      { cause: error }
    );
  }

  return localPath;
}
