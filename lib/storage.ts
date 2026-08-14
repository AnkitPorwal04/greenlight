import fs from "fs";
import path from "path";
import { Redis } from "@upstash/redis";

const DATA_DIR = path.join(process.cwd(), ".data");

function redisClient(): Redis | null {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

const redis = redisClient();

export const storageBackend = redis ? "redis" : "file";

function filePath(key: string) {
  return path.join(DATA_DIR, `${key.replace(/[^a-z0-9_-]/gi, "_")}.json`);
}

export async function getJSON<T>(key: string): Promise<T | null> {
  if (redis) {
    return (await redis.get<T>(key)) ?? null;
  }
  const p = filePath(key);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as T;
  } catch {
    return null;
  }
}

export async function setJSON(key: string, value: unknown): Promise<void> {
  if (redis) {
    await redis.set(key, value);
    return;
  }
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(filePath(key), JSON.stringify(value, null, 2), {
    mode: 0o600,
  });
}

export async function delKey(key: string): Promise<void> {
  if (redis) {
    await redis.del(key);
    return;
  }
  const p = filePath(key);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}
