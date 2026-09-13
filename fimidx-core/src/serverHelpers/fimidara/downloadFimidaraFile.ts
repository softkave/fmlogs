import { createWriteStream } from "fs";
import { mkdir, rename, rm } from "fs/promises";
import path from "path";
import { pipeline } from "stream/promises";
import { getFimidaraEndpoints } from "./fimidaraClient.js";

/**
 * Download a file from fimidara to a local path. Writes to a temp file first,
 * then renames into place so callers never see a partial file at `localPath`.
 */
export async function downloadFimidaraFile(
  filepath: string,
  localPath: string,
  authToken?: string
): Promise<void> {
  await mkdir(path.dirname(localPath), { recursive: true });
  const endpoints = getFimidaraEndpoints(authToken);
  const stream = await endpoints.files.readFile(
    { filepath },
    { responseType: "stream" }
  );
  // Stable sibling path so a crashed/partial attempt is overwritten on retry
  // instead of leaving uniquely named leftovers. Destination dirs are already
  // per version, so this does not collide across uploads.
  const tmpPath = `${localPath}.tmp`;
  try {
    const wstream = createWriteStream(tmpPath, { autoClose: true });
    await pipeline(stream, wstream);
    await rename(tmpPath, localPath);
  } catch (error) {
    await rm(tmpPath, { force: true }).catch(() => undefined);
    throw error;
  }
}
