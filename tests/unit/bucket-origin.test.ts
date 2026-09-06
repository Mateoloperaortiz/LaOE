import { describe, expect, it } from "vitest";
import { bucketOrigin } from "@/shared/lib/storage-origin";

describe("origen del bucket para CSP", () => {
  it.each([
    ["http://localhost:3900", true, "http://localhost:3900"],
    ["https://t3.storageapi.dev/path?ignored=1", true, "https://t3.storageapi.dev"],
    ["https://t3.storageapi.dev", false, "https://media.t3.storageapi.dev"],
    ["http://storage.test:9000/path", false, "http://media.storage.test:9000"],
  ])("%s (path-style=%s)", (endpoint, forcePathStyle, expected) => {
    expect(bucketOrigin({ endpoint, bucket: "media", forcePathStyle })).toBe(expected);
  });
});
