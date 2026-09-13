import { open } from "fs/promises";

/** PK\x05\x06 — End of Central Directory signature (little-endian). */
const kZipEocdSignature = Buffer.from([0x50, 0x4b, 0x05, 0x06]);

/** EOCD fixed fields are 22 bytes; zip comment may add up to 65535 bytes. */
const kZipEocdMaxCommentLength = 65_535;
const kZipEocdFixedLength = 22;
const kZipEocdSearchWindow =
  kZipEocdFixedLength + kZipEocdMaxCommentLength;

/**
 * Async integrity check: the zip EOCD record must appear near the end of the
 * file. Catches truncated downloads without loading/parsing the whole archive.
 * Does not prove the archive is fully valid.
 */
export async function hasZipEocd(filePath: string): Promise<boolean> {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(filePath, "r");
    const { size } = await handle.stat();
    if (size < kZipEocdFixedLength) return false;

    const readLength = Math.min(size, kZipEocdSearchWindow);
    const buffer = Buffer.allocUnsafe(readLength);
    const { bytesRead } = await handle.read(
      buffer,
      0,
      readLength,
      size - readLength
    );
    if (bytesRead < kZipEocdFixedLength) return false;

    const haystack = bytesRead === readLength ? buffer : buffer.subarray(0, bytesRead);

    // EOCD is at the end (possibly before a comment). Search backwards for the
    // signature so we pick the last match, matching zip readers.
    for (let i = haystack.length - kZipEocdFixedLength; i >= 0; i--) {
      if (
        haystack[i] === kZipEocdSignature[0] &&
        haystack[i + 1] === kZipEocdSignature[1] &&
        haystack[i + 2] === kZipEocdSignature[2] &&
        haystack[i + 3] === kZipEocdSignature[3]
      ) {
        const commentLength = haystack.readUInt16LE(i + 20);
        // Comment must exactly fill the bytes after the fixed EOCD fields.
        if (i + kZipEocdFixedLength + commentLength === haystack.length) {
          return true;
        }
      }
    }
    return false;
  } catch {
    return false;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}
