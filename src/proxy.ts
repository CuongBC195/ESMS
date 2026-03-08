import { NextRequest, NextResponse } from "next/server";

export async function proxy(req: NextRequest) {
    const { pathname } = req.nextUrl;

    // Skip non-API routes
    if (!pathname.startsWith("/api")) {
        return NextResponse.next();
    }

    // Skip worker endpoints (QStash signature-verified)
    if (pathname.startsWith("/api/workers")) {
        return NextResponse.next();
    }

    // Skip rate limiting in development — Edge Runtime sandbox blocks external fetch
    if (process.env.NODE_ENV === "development") {
        return NextResponse.next();
    }

    // ─── Production: Apply rate limiting ─────────────────────
    try {
        const { authLimiter, apiLimiter } = await import("@/lib/ratelimit");

        const ip =
            req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
            req.headers.get("x-real-ip") ||
            "127.0.0.1";

        const isAuth = pathname.startsWith("/api/auth");
        const limiter = isAuth ? authLimiter : apiLimiter;
        const identifier = `${ip}:${isAuth ? "auth" : "api"}`;

        const { success, limit, remaining, reset } = await limiter.limit(identifier);

        if (!success) {
            return NextResponse.json(
                { error: "Too many requests. Please try again later." },
                {
                    status: 429,
                    headers: {
                        "X-RateLimit-Limit": limit.toString(),
                        "X-RateLimit-Remaining": remaining.toString(),
                        "X-RateLimit-Reset": reset.toString(),
                        "Retry-After": Math.ceil((reset - Date.now()) / 1000).toString(),
                    },
                }
            );
        }

        const response = NextResponse.next();
        response.headers.set("X-RateLimit-Limit", limit.toString());
        response.headers.set("X-RateLimit-Remaining", remaining.toString());
        response.headers.set("X-RateLimit-Reset", reset.toString());
        return response;
    } catch (error) {
        // Fail open — if Redis is down, let requests through
        console.error("[RateLimit] Error, failing open:", error);
        return NextResponse.next();
    }
}

export const config = {
    matcher: ["/api/:path*"],
};
