import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

/**
 * Auth limiter — for login/auth endpoints.
 * 20 requests per 60 seconds (NextAuth makes multiple internal calls per login).
 */
export const authLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(20, "60 s"),
    analytics: false,
    prefix: "rl:auth",
});

/**
 * API limiter — standard, for all other API endpoints.
 * 60 requests per 10 seconds (sliding window).
 */
export const apiLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(60, "10 s"),
    analytics: false,
    prefix: "rl:api",
});
