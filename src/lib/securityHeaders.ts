const cspDirectives: Record<string, string> = {
    "default-src": "'self'",
    // data: required at runtime — Astro's ClientRouter loads data: URIs during view transitions
    "script-src": "'self' 'unsafe-inline' data:",
    // unsafe-inline required for Svelte inline styles and Tailwind CSS
    "style-src": "'self' 'unsafe-inline'",
    // data: for inline SVG images; i.scdn.co serves Spotify album artwork
    "img-src": "'self' data: https://i.scdn.co",
    // fonts are self-hosted
    "font-src": "'self'",
    // no client-side API calls to external services
    "connect-src": "'self'",
    // 'self' required — Astro's ClientRouter uses iframes for view transitions
    "frame-src": "'self'",
    // 'self' required — Astro's ClientRouter frames the current origin during navigation
    "frame-ancestors": "'self'",
    // blob: required for Vite's dev-mode module runner web worker
    "worker-src": "'self' blob:",
    "object-src": "'none'",
    "base-uri": "'self'",
    "form-action": "'self'",
    "upgrade-insecure-requests": "",
};

const cspValue = Object.entries(cspDirectives)
    .map(([key, value]) => (value ? `${key} ${value}` : key))
    .join("; ");

export function addSecurityHeaders(headers: Headers): void {
    headers.set("Content-Security-Policy", cspValue);
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    headers.set("X-Frame-Options", "SAMEORIGIN");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    headers.set(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()"
    );
}
