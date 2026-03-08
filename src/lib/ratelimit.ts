import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

/**
 * Auth limiter — strict, for login/auth endpoints.
 * 5 requests per 60 seconds (sliding window).
 */
export const authLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, "60 s"),
    analytics: false,
    prefix: "rl:auth",
});

/**
 * API limiter — standard, for all other API endpoints.
 * 30 requests per 10 seconds (sliding window).
 */
export const apiLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(30, "10 s"),
    analytics: false,
    prefix: "rl:api",
});
