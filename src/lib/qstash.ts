import { Client } from "@upstash/qstash";

/**
 * Upstash QStash client for publishing async background jobs.
 *
 * Required env vars:
 *   QSTASH_TOKEN  — from https://console.upstash.com/qstash
 *
 * If QSTASH_TOKEN is missing, qstashClient will be null.
 * Producer code should fall back to synchronous execution when null.
 */
export const qstashClient = process.env.QSTASH_TOKEN
    ? new Client({ token: process.env.QSTASH_TOKEN })
    : null;
