import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No incremental cache override: nothing is written to KV/R2. Catalog JSON is memoised per
// Worker isolate (src/lib/poc-loader.ts) and pages render on demand with Cache-Control headers.
export default defineCloudflareConfig({});
