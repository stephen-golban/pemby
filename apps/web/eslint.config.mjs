import { defineConfig } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

import rootConfig from "../../eslint.config.mjs";

// Next.js rules first, then the shared root config so repo-wide rule settings win.
export default defineConfig([...nextVitals, ...nextTs, ...rootConfig]);
