import { createClient } from "@/lib/supabase";

// Base URL of the FastAPI backend (e.g. http://localhost:8000 in dev).
// Read once at module scope: `NEXT_PUBLIC_*` vars are inlined at build time,
// so this is a constant, not a lookup that could change between calls.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

/**
 * An error carrying the HTTP status alongside a message already written in
 * Portuguese and safe to show the user.
 *
 * A plain `Error` would force every page to re-inspect the response to tell
 * "product not found" (404) apart from "the server is down". Subclassing lets
 * a page do `catch (error) { if (error instanceof ApiError) ... }` and read
 * `error.status` when it cares, or just print `error.message` when it doesn't.
 */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    // Status 0 is used for failures that never reached the server (no
    // network, missing configuration) — there is no HTTP status for those.
    this.status = status;
  }
}

// Shape of a JSON request body. `unknown` (not `any`) for the values: we never
// inspect them here, we only hand them to JSON.stringify.
type JsonBody = Record<string, unknown>;

// A request body is either JSON (almost everything) or a `FormData` (file
// uploads). They are serialised differently and, crucially, need different
// Content-Type handling — see `request` below.
type RequestBody = JsonBody | FormData;

/**
 * Turn a failed response into one readable Portuguese sentence.
 *
 * FastAPI reports errors in two different shapes under the same `detail` key:
 *   * `{"detail": "Produto não encontrado"}`      — our own HTTPExceptions;
 *   * `{"detail": [{"msg": "...", "loc": [...]}]}` — Pydantic 422 validation.
 * Both are handled, and anything unexpected falls back to a generic message —
 * an error path must never throw an error of its own.
 */
async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload: unknown = await response.json();
    const detail = (payload as { detail?: unknown })?.detail;

    if (typeof detail === "string") {
      return detail;
    }

    if (Array.isArray(detail)) {
      const messages = detail
        .map((item) => (item as { msg?: unknown })?.msg)
        .filter((msg): msg is string => typeof msg === "string");

      if (messages.length > 0) {
        return messages.join(". ");
      }
    }
  } catch {
    // The body was empty or not JSON (a proxy error page, for instance).
    // Nothing to salvage — fall through to the generic message.
  }

  return `Erro ${response.status} ao comunicar com o servidor.`;
}

/**
 * The single place every backend call goes through: attach the token, send the
 * request, translate anything that isn't a success into an `ApiError`.
 */
async function request<T>(
  method: string,
  path: string,
  body?: RequestBody,
): Promise<T> {
  if (!API_BASE_URL) {
    throw new ApiError(
      "Configuração ausente: NEXT_PUBLIC_API_URL não foi definida.",
      0,
    );
  }

  // The token is read per request, not cached in a module variable: the
  // Supabase client refreshes the session in the background, and a cached
  // token would keep being sent after it expired. `getSession()` reads from
  // storage and returns the current (refreshed) one.
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;

  const headers: Record<string, string> = {};
  if (accessToken) {
    // The exact format app/auth.py expects: `Authorization: Bearer <token>`.
    headers.Authorization = `Bearer ${accessToken}`;
  }
  // Only JSON bodies get an explicit Content-Type. For a `FormData` the header
  // is deliberately left off so the *browser* sets it — a multipart type has to
  // carry a boundary marker (`multipart/form-data; boundary=----WebKitForm...`)
  // that only the browser knows. Writing "multipart/form-data" by hand omits
  // the boundary, the server cannot split the parts, and the upload fails with
  // a confusing 422 about a missing field.
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  if (body !== undefined && !isFormData) {
    headers["Content-Type"] = "application/json";
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body:
        body === undefined
          ? undefined
          : isFormData
            ? (body as FormData)
            : JSON.stringify(body),
    });
  } catch {
    // `fetch` only rejects when the request never completed — offline, DNS
    // failure, backend not running, CORS refusal. HTTP errors (404, 500) do
    // NOT reject; they arrive as a normal response with `ok === false`, which
    // is why the status checks below are separate from this catch.
    throw new ApiError(
      "Não foi possível conectar ao servidor. Verifique sua conexão.",
      0,
    );
  }

  if (response.status === 401) {
    // The token is missing, expired or invalid. The proxy already guards
    // *navigation* to protected pages, but it cannot help a page that is
    // already open when the session runs out — this is that second line of
    // defence. A full page load (rather than the router) is deliberate: it
    // discards every piece of stale client state on the way out.
    if (typeof window !== "undefined") {
      window.location.replace(new URL("/login", window.location.origin));
    }
    throw new ApiError("Sessão expirada. Faça login novamente.", 401);
  }

  if (!response.ok) {
    throw new ApiError(await readErrorMessage(response), response.status);
  }

  // 204 No Content (what DELETE returns) has no body at all, and calling
  // `.json()` on it throws. Returning early is what keeps `api.delete` from
  // blowing up on a *successful* delete.
  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

/**
 * The verbs pages actually call. Each one takes the caller's expected response
 * type as a generic (`api.get<Product[]>("/api/products")`) — TypeScript cannot
 * know the shape of JSON coming off the wire, so the caller declares it.
 */
export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body: JsonBody) => request<T>("POST", path, body),
  put: <T>(path: string, body: JsonBody) => request<T>("PUT", path, body),
  patch: <T>(path: string, body: JsonBody) => request<T>("PATCH", path, body),
  /**
   * Send a single file as `multipart/form-data`.
   *
   * The field name is `"file"` because that is what the FastAPI endpoint
   * declares (`file: UploadFile = File(...)`) — the parameter name *is* the
   * form field name, and a mismatch is a 422.
   *
   * Takes a `Blob` rather than a `File` so a compressed copy (which comes back
   * from `canvas.toBlob` as a plain Blob) can be sent directly. The filename is
   * passed separately since a Blob has none, and the backend needs one only to
   * keep its multipart parser happy — the stored name is generated server-side.
   */
  upload: <T>(path: string, file: Blob, filename = "photo.jpg") => {
    const form = new FormData();
    form.append("file", file, filename);
    return request<T>("PUT", path, form);
  },
  // Defaults to `void` because the backend answers 204 with an empty body.
  delete: <T = void>(path: string) => request<T>("DELETE", path),
};
