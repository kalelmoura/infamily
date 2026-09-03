/**
 * Shrink a photo in the browser, before it is uploaded.
 *
 * A picture straight off a phone camera is 3-5 MB. The backend re-encodes it to
 * around 250 KB anyway — so those megabytes exist only to be thrown away, after
 * travelling over Yasmin's mobile connection to a backend on Render's free tier
 * that may be cold-starting. That is the difference between an upload that
 * feels instant and one that makes her think the app is broken.
 *
 * This is an *optimisation*, not a safety measure. Anything sent from a browser
 * can be forged, so the real validation — is this actually an image? — happens
 * server-side in `app/services/images.py`. Which is why every failure path here
 * falls back to the original file instead of throwing: a compression that did
 * not work must never be the reason a photo cannot be saved.
 */

/** Longest edge, in pixels. Matches the backend's cap so it re-encodes without
 *  resizing again. */
const MAX_DIMENSION = 1600;

/** JPEG quality, 0-1. Visually indistinguishable from 0.95 on photos, at about
 *  half the bytes. */
const QUALITY = 0.82;

/**
 * Return a downscaled JPEG copy of `file`, or the original file if the browser
 * cannot do the conversion.
 */
export async function compressImage(
  file: File,
  maxDimension = MAX_DIMENSION,
  quality = QUALITY,
): Promise<Blob> {
  try {
    // `createImageBitmap` decodes off the main thread, so a large photo does
    // not freeze the interface while it is being read. It also honours the EXIF
    // orientation flag, which is what stops a portrait phone photo from being
    // drawn on its side.
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });

    const scale = Math.min(
      1,
      maxDimension / Math.max(bitmap.width, bitmap.height),
    );

    // Already small enough: re-encoding would only lose quality for nothing.
    if (scale === 1 && file.type === "image/jpeg") {
      bitmap.close();
      return file;
    }

    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return file;
    }

    // JPEG has no transparency, and an unpainted canvas is transparent black —
    // so a PNG with a transparent background would come out with black behind
    // it. Painting white first is what keeps it looking like the original.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    // Frees the decoded pixels immediately rather than waiting for the garbage
    // collector — a 12-megapixel bitmap is ~48 MB.
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => {
      // `toBlob` is callback-based (it can encode asynchronously); wrapping it
      // in a Promise is what lets the caller just await this function.
      canvas.toBlob(resolve, "image/jpeg", quality);
    });

    // `toBlob` hands back null if the encode failed.
    return blob ?? file;
  } catch {
    // An unsupported source format, a canvas that is not available, an
    // out-of-memory decode. Send the original and let the server deal with it.
    return file;
  }
}
