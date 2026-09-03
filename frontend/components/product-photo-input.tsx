"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A square photo preview with a button to pick a new file and, when there is a
 * photo, one to remove it.
 *
 * Used in two places that look the same but mean different things:
 *
 *   * on `/estoque`, while registering a piece that does not exist yet — the
 *     chosen file is held locally and uploaded after the product is created;
 *   * on `/estoque/produtos`, against a product that already exists — picking a
 *     file uploads it immediately.
 *
 * The component does not know the difference, and should not: it reports "the
 * user picked this file" and "the user asked to remove the photo", and the page
 * decides what that means. That is what lets one component serve both flows.
 */

type ProductPhotoInputProps = {
  /** URL of the stored photo, if the product already has one. */
  photoUrl?: string | null;
  /** A picked-but-not-yet-uploaded file, for the create form's preview. */
  selectedFile?: File | null;
  /** Called when the user picks a file. */
  onSelect: (file: File) => void;
  /** Called when the user asks to remove the current photo. Omit to hide the
   *  remove action (the create form has nothing stored to remove). */
  onRemove?: () => void;
  /** Disables every control and shows the busy label — an upload in flight. */
  isBusy?: boolean;
  /** Shown under the preview while busy. */
  busyLabel?: string;
};

export function ProductPhotoInput({
  photoUrl,
  selectedFile,
  onSelect,
  onRemove,
  isBusy = false,
  busyLabel = "Enviando…",
}: ProductPhotoInputProps) {
  // The file input is hidden and driven from the button: browsers style
  // `<input type="file">` inconsistently and it cannot be made to match the
  // rest of the form, while a button triggering it can.
  const inputRef = useRef<HTMLInputElement>(null);

  // A `blob:` URL pointing at the picked file, so the preview appears instantly
  // instead of waiting for a round-trip to the server.
  //
  // It is created in the change handler below rather than in an effect keyed on
  // `selectedFile`. Both would work, but `URL.createObjectURL` allocates a
  // resource the browser holds until it is explicitly revoked, and doing that
  // in an effect means the create/revoke pair runs on React's schedule — under
  // StrictMode's double-invoked effects that revokes a URL still on screen. The
  // handler is the one moment we know a *new* file arrived, which makes the
  // pairing obvious and exact.
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  // The outstanding URL, mirrored in a ref so the unmount cleanup can revoke it
  // without the effect having to depend on (and re-run for) the state.
  const localPreviewRef = useRef<string | null>(null);

  useEffect(() => {
    // Only a cleanup: releases the last preview if the component goes away
    // while one is on screen.
    return () => {
      if (localPreviewRef.current) {
        URL.revokeObjectURL(localPreviewRef.current);
      }
    };
  }, []);

  // A local preview only counts while the parent still holds the file it was
  // made from. When the parent clears `selectedFile` — after a successful save,
  // or on remove — the preview falls back to the stored photo, or to nothing.
  const previewUrl = (selectedFile ? localPreview : null) ?? photoUrl ?? null;

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset the input's value so picking the *same* file again still fires a
    // change event — without this, re-selecting a photo after removing it
    // silently does nothing.
    event.target.value = "";
    if (!file) return;

    // Release the previous preview before replacing it: picking five photos in
    // a row would otherwise pin all five files in memory.
    if (localPreviewRef.current) {
      URL.revokeObjectURL(localPreviewRef.current);
    }

    const url = URL.createObjectURL(file);
    localPreviewRef.current = url;
    setLocalPreview(url);
    onSelect(file);
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-[var(--internal-line)] bg-[var(--internal-paper-soft)]">
        {previewUrl ? (
          // A plain <img>, not next/image, and deliberately so: the preview
          // source is often a `blob:` URL, which the image optimizer cannot
          // process, and the stored photos are already capped at 1600px and
          // served from Supabase's CDN. Using next/image would buy nothing and
          // cost a build-time remotePatterns dependency on the Supabase host.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Foto do produto"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-400">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-8 w-8">
              <path
                d="M4 16.5 8.5 12l3 3 3.5-3.5L20 16.5M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"
                stroke="currentColor"
                strokeWidth="1.5"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <input
          ref={inputRef}
          type="file"
          // `accept="image/*"` filters the picker to images. There is
          // deliberately no `capture` attribute: adding it forces the camera
          // open and removes the gallery option, and Yasmin often already has
          // photos of the pieces on her phone. Without it, the phone offers
          // both "Câmera" and "Fotos".
          accept="image/*"
          className="hidden"
          onChange={handleChange}
          disabled={isBusy}
        />

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isBusy}
          className="min-h-11 rounded-lg border border-[var(--internal-line)] bg-[var(--internal-paper-soft)] px-4 text-sm font-semibold text-[var(--internal-ink)] transition-colors hover:border-[var(--internal-olive)] hover:bg-white disabled:opacity-50"
        >
          {isBusy ? busyLabel : previewUrl ? "Trocar foto" : "Adicionar foto"}
        </button>

        {previewUrl && onRemove && (
          <button
            type="button"
            onClick={onRemove}
            disabled={isBusy}
            className="min-h-11 rounded-lg px-4 text-sm text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
          >
            Remover foto
          </button>
        )}
      </div>
    </div>
  );
}
