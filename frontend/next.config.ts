import type { NextConfig } from "next";

function getOrigin(value: string | undefined): string | null {
  if (!value) return null;

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

const isDevelopment = process.env.NODE_ENV === "development";
const apiOrigin = getOrigin(process.env.NEXT_PUBLIC_API_URL);
const connectSources = ["'self'", "https://*.supabase.co"];

if (!apiOrigin) {
  throw new Error("NEXT_PUBLIC_API_URL must be an absolute URL");
}

const parsedApiOrigin = new URL(apiOrigin);
const isLocalApi = ["localhost", "127.0.0.1"].includes(
  parsedApiOrigin.hostname,
);

if (!isDevelopment && parsedApiOrigin.protocol !== "https:" && !isLocalApi) {
  throw new Error("NEXT_PUBLIC_API_URL must use HTTPS in production");
}

connectSources.push(apiOrigin);
if (isDevelopment) connectSources.push("http:", "ws:");

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self' data:",
  `connect-src ${connectSources.join(" ")}`,
  "frame-src https://www.google.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDevelopment ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: contentSecurityPolicy,
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  ...(isDevelopment
    ? []
    : [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000",
        },
      ]),
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
