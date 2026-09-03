"""Turning an uploaded file into a photo we are willing to store.

This module is deliberately **pure**: bytes in, bytes out, no network, no
database, no FastAPI. That makes it the easy half to reason about and to test —
you can call `normalize_product_photo(open("x.jpg","rb").read())` from a REPL.
The half that talks to Supabase lives next door in `storage.py`.

Why re-encode at all, rather than storing what the browser sent?

  * **Validation.** Decoding is the only honest test that an upload is an
    image. `Content-Type` is a header the client writes, and the extension is
    part of a filename the client also writes — both are trivially forged. A
    file that Pillow refuses to open is not an image, whatever it claims.
  * **Privacy.** Phones write EXIF into every photo, including GPS
    coordinates. The product-photos bucket is public-read, so shipping the
    original bytes would publish the location where each picture was taken.
    Saving through Pillow drops every EXIF tag.
  * **Orientation.** That same EXIF carries a rotation flag; phones store the
    sensor's raw landscape frame plus "rotate this 90°". Strip the EXIF without
    applying the flag first and every portrait photo ends up on its side.
  * **Predictable size.** A canonical 1600px JPEG keeps the inventory list
    quick to load regardless of what camera the file came from.
"""

import io

from PIL import Image, ImageOps, UnidentifiedImageError

# Longest edge of the stored photo, in pixels. The photo exists so Yasmin can
# recognise a piece — 1600px is generous for that (it still looks sharp opened
# full-screen on a phone) while landing around 200-350 KB per file.
MAX_DIMENSION = 1600

# JPEG quality. 82 is the usual sweet spot: visually indistinguishable from 95
# on photographic content, at roughly half the bytes.
JPEG_QUALITY = 82

# A "decompression bomb" is a small file that decodes to an enormous bitmap —
# a few KB on the wire, gigabytes of RAM once expanded, which is a cheap way to
# take a server down. Pillow warns above ~89 megapixels by default; setting an
# explicit limit makes it *raise* instead, and 50 MP is already far beyond any
# real phone camera.
Image.MAX_IMAGE_PIXELS = 50_000_000


def normalize_product_photo(raw: bytes) -> bytes:
    """Validate an uploaded image and re-encode it as a canonical JPEG.

    Raises `ValueError` when the bytes are not a decodable image. The caller
    (the router) translates that into a 400 with a Portuguese message — this
    module has no opinion about HTTP.
    """
    try:
        # `Image.open` is lazy: it reads the header to identify the format and
        # stops there. Nothing is decoded until the pixels are actually needed,
        # which is why the load happens inside the try below.
        image = Image.open(io.BytesIO(raw))

        # Applies the EXIF orientation flag by physically rotating the pixels,
        # then removes the flag. Must happen before the save, which is what
        # discards the EXIF the flag lives in.
        image = ImageOps.exif_transpose(image)

        # JPEG has no alpha channel and does not speak palette or CMYK. A PNG
        # with transparency or a screenshot in P mode would raise on save, so
        # everything is flattened to RGB first.
        if image.mode != "RGB":
            image = image.convert("RGB")

        # `thumbnail` resizes in place, preserves the aspect ratio, and — the
        # useful part — never scales *up*: a photo already smaller than the box
        # is left exactly as it is instead of being blurrily enlarged.
        image.thumbnail((MAX_DIMENSION, MAX_DIMENSION))

        buffer = io.BytesIO()
        # `optimize=True` runs an extra Huffman pass, a few percent smaller for
        # a little CPU. `exif` is not passed, so none is written.
        image.save(buffer, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    except UnidentifiedImageError as error:
        # Pillow could not work out what format this is — the usual answer for
        # a PDF, a text file, or a renamed executable.
        raise ValueError("unsupported image format") from error
    except (OSError, ValueError, Image.DecompressionBombError) as error:
        # A truncated or corrupt file, or one that decodes past the pixel cap.
        # OSError is Pillow's catch-all for "this broke while reading".
        raise ValueError("invalid or corrupt image") from error

    return buffer.getvalue()
