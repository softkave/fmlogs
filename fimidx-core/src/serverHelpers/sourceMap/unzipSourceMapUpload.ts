import type { ISourceMapUpload } from "../../definitions/sourceMap.js";
import { getCoreConfig } from "../../common/getCoreConfig.js";
import { getProjectCycleCounts } from "./getProjectCycleCounts.js";
import { markSourceMapUploadLocalZipIngested } from "./getSourceMapUploads.js";
import { ingestSourceMapsToMongo } from "./ingestSourceMapsToMongo.js";
import { upsertLocalSourceMapCacheEntry } from "./localSourceMapCache.js";
import { materializeLocalSourceMapZip } from "./materializeLocalSourceMapZip.js";

function getSourceMapsLocalDir(): string {
  const dir = getCoreConfig().sourceMaps?.localDir;
  return dir;
}

/**
 * Unzip a source map upload locally: download zip from fimidara (if needed),
 * extract to local cache dir, ingest into Mongo, then upsert local cache.
 * Symbolication will use this cache when ensuring a local source map.
 */
export async function unzipSourceMapUpload(
  upload: ISourceMapUpload
): Promise<void> {
  const localPath = await materializeLocalSourceMapZip({
    localDir: getSourceMapsLocalDir(),
    projectId: upload.projectId,
    repoIdentifier: upload.repoIdentifier,
    version: upload.version,
    fimidaraPath: upload.fimidaraPath,
  });

  await ingestSourceMapsToMongo(
    upload.projectId,
    upload.repoIdentifier,
    upload.version,
    localPath
  );

  const cycleCounts = await getProjectCycleCounts();
  const cycleCount = cycleCounts.get(upload.projectId) ?? 0;

  // Cache + ingested flag only after successful ingest so retries can reuse the
  // local zip without re-downloading, and cache hits imply Mongo is ready.
  await upsertLocalSourceMapCacheEntry({
    projectId: upload.projectId,
    repoIdentifier: upload.repoIdentifier,
    version: upload.version,
    localPath,
    lastUsedCycleCount: cycleCount,
  });
  await markSourceMapUploadLocalZipIngested(
    upload.projectId,
    upload.repoIdentifier,
    upload.version
  );
}
