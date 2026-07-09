import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Routes anyone can visit without a session. Everything else requires login.
const PUBLIC_PATHS = ["/", "/login"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Supabase calls this when it refreshes the session. The new
          // cookies must land in two places: on the request (so code
          // running after the proxy sees the fresh session) and on the
          // response (so the browser stores it). Recreating the response
          // after mutating the request keeps the two in sync.
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Verifies the JWT against the project's JWKS (asymmetric keys), locally
  // when possible, and refreshes the session if the token is about to
  // expire — which triggers setAll above. Must run on every matched
  // request, including public pages, or sessions would silently expire
  // while the user browses them.
  const { data, error } = await supabase.auth.getClaims();
  const hasValidSession = !error && !!data?.claims;

  const isPublicPath = PUBLIC_PATHS.includes(request.nextUrl.pathname);

  if (!isPublicPath && !hasValidSession) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  // Run on every route except Next.js internals and static assets.
  // Public pages are NOT excluded here on purpose: the proxy still runs
  // there to refresh the session cookie; it just never redirects.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
