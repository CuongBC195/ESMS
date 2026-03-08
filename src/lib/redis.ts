import { Redis } from "@upstash/redis";

export const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// ─── Cache Helpers ──────────────────────────────────────

const DEFAULT_TTL = 60; // seconds

/**
 * Get cached data or fetch from source.
 * - If cache hit → return cached data instantly
 * - If cache miss → call fetcher, store in Redis, return data
 */
export async function cached<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl = DEFAULT_TTL
): Promise<T> {
    try {
        const hit = await redis.get<T>(key);
        if (hit !== null && hit !== undefined) return hit;
    } catch {
        // Redis down → skip cache, query DB directly
    }

    const data = await fetcher();

    // Store in cache (fire-and-forget, don't block response)
    redis.set(key, JSON.stringify(data), { ex: ttl }).catch(() => { });

    return data;
}

/**
 * Invalidate cache keys by prefix pattern.
 * Use after mutations to clear stale data.
 */
export async function invalidateCache(...prefixes: string[]) {
    try {
        const pipeline = redis.pipeline();
        for (const prefix of prefixes) {
            // Scan for keys matching prefix and delete them
            const keys = await redis.keys(`${prefix}*`);
            for (const key of keys) {
                pipeline.del(key);
            }
        }
        await pipeline.exec();
    } catch {
        // Redis down → silently ignore
    }
}

/**
 * Invalidate a single exact cache key.
 */
export async function invalidateKey(...keys: string[]) {
    try {
        if (keys.length > 0) {
            await redis.del(...keys);
        }
    } catch {
        // Redis down → silently ignore
    }
}
