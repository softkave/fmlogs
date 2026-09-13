import assert from "assert";
import { getCoreConfig } from "../../common/getCoreConfig.js";
import {
  getSourceMapUpload,
  markSourceMapUploadLocalZipIngested,
} from "./getSourceMapUploads.js";
import { ingestSourceMapsToMongo } from "./ingestSourceMapsToMongo.js";
import {
  getLocalSourceMapCacheEntry,
  upsertLocalSourceMapCacheEntry,
} from "./localSourceMapCache.js";
import { materializeLocalSourceMapZip } from "./materializeLocalSourceMapZip.js";

function getSourceMapsLocalDir(): string {
  const dir = getCoreConfig().sourceMaps?.localDir;
  assert.ok(dir, "FIMIDX_SOURCE_MAPS_LOCAL_DIR is not set");
  return dir;
}

/**
 * Ensure the source map for (projectId, repoIdentifier, version) is available
 * locally. Only zip uploads are supported: we download the zip from fimidara
 * (if needed) and unzip to a local cache dir. Returns the local directory path
 * or null if no upload or no zip found.
 */
export async function ensureLocalSourceMap(
  projectId: string,
  repoIdentifier: string,
  version: string,
  cycleCount: number
): Promise<string | null> {
  const cached = await getLocalSourceMapCacheEntry(
    projectId,
    repoIdentifier,
    version
  );
  const upload = await getSourceMapUpload(projectId, repoIdentifier, version);

  if (cached) {
    await upsertLocalSourceMapCacheEntry({
      ...cached,
      lastUsedCycleCount: cycleCount,
    });
    // Cache may exist from a prior download that failed mid-ingest; finish
    // ingest before treating the upload as done.
    if (upload && !upload.localZipIngested) {
      await ingestSourceMapsToMongo(
        projectId,
        repoIdentifier,
        version,
        cached.localPath
      );
    }
    await markSourceMapUploadLocalZipIngested(
      projectId,
      repoIdentifier,
      version
    );
    return cached.localPath;
  }

  if (!upload) return null;

  const localPath = await materializeLocalSourceMapZip({
    localDir: getSourceMapsLocalDir(),
    projectId,
    repoIdentifier,
    version,
    fimidaraPath: upload.fimidaraPath,
  });

  await ingestSourceMapsToMongo(projectId, repoIdentifier, version, localPath);

  await upsertLocalSourceMapCacheEntry({
    projectId,
    repoIdentifier,
    version,
    localPath,
    lastUsedCycleCount: cycleCount,
  });
  await markSourceMapUploadLocalZipIngested(
    projectId,
    repoIdentifier,
    version
  );
  return localPath;
}
