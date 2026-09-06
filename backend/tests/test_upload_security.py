"""Resource-limit checks for product photo uploads."""

import asyncio
import io

import pytest
from fastapi import HTTPException, UploadFile

from app.routers.products import MAX_UPLOAD_BYTES, _read_photo_with_limit


def make_upload(size: int) -> UploadFile:
    return UploadFile(filename="photo.jpg", file=io.BytesIO(b"x" * size))


def test_photo_reader_accepts_file_at_limit() -> None:
    upload = make_upload(MAX_UPLOAD_BYTES)

    contents = asyncio.run(_read_photo_with_limit(upload))

    assert len(contents) == MAX_UPLOAD_BYTES


def test_photo_reader_rejects_file_over_limit() -> None:
    upload = make_upload(MAX_UPLOAD_BYTES + 1)

    with pytest.raises(HTTPException) as error:
        asyncio.run(_read_photo_with_limit(upload))

    assert error.value.status_code == 413
