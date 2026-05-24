/**
 * =============================================================================
 * KANSHI RC INTELLIGENCE SYSTEM - PRODUCTION SERVER (JavaScript)
 * =============================================================================
 *
 * File: server.js
 * Execution Context: Desktop PC (Bun Runtime)
 * Usage: bun run serve (production mode)
 *
 * PURPOSE:
 * This is the production HTTP server for the Kanshi desktop application.
 * Functionally identical to server.ts, but written in plain JavaScript
 * for direct execution without TypeScript compilation.
 *
 * WHY BOTH .ts AND .js SERVERS?
 *   - server.ts: Used during development with "bun run dev"
 *   - server.js: Used for production with "bun run serve"
 *
 * Both provide the same functionality. The .js version exists for
 * scenarios where TypeScript transpilation overhead is undesirable
 * or where the runtime doesn't support .ts directly.
 *
 * RUNTIME ENVIRONMENT:
 * This server runs on Bun (https://bun.sh), which natively executes
 * both TypeScript and JavaScript files. The import.meta.url feature
 * is standard ES modules behavior.
 *
 * DEPLOYMENT SCENARIO:
 * In production, this server runs on the operator's desktop/laptop.
 * The browser connects to http://localhost:3000 to access the
 * Kanshi control interface.
 *
 *   [Browser]
 *        ↓ http://localhost:3000
 *   [server.js - Bun.serve()]
 *        ↓ static files
 *   [HTML/JS/CSS Assets]
 *        ↓ AJAX requests
 *   [Raspberry Pi @ 192.168.4.1]
 *
 * NETWORK CONTEXT:
 * This server only serves the UI static files. Actual robot control
 * and video streaming traffic flows directly from the browser to
 * the Raspberry Pi over WiFi, not through this server.
 *
 * =============================================================================
 */

import { join } from "path";

/**
 * ROOT DIRECTORY
 *
 * The base directory for file serving.
 *
 * IMPLEMENTATION NOTE:
 * This uses import.meta.url instead of import.meta.dir because
 * import.meta.dir is a Bun-specific extension that may not be
 * available in all contexts.
 *
 * The URL constructor with "." creates a URL for the current directory,
 * and .pathname extracts the filesystem path.
 *
 * On Unix-like systems, this produces paths like "/home/user/kanshi/"
 * On Windows, this may produce "/C:/Users/user/kanshi/" (note the leading slash)
 */
const rootDir = new URL(".", import.meta.url).pathname;

/**
 * SERVER PORT
 *
 * The HTTP port the server listens on.
 * Port 3000 is consistent with the development server.
 *
 * FIREWALL NOTE:
 * This port only needs to be accessible from localhost.
 * No external network access is required since the browser
 * runs on the same machine as the server.
 */
const port = 3000;

/**
 * BUN HTTP SERVER
 *
 * Production server configuration using Bun.serve().
 * This implementation is intentionally identical to server.ts
 * to ensure consistent behavior between development and production.
 *
 * PERFORMANCE CHARACTERISTICS:
 * Bun's built-in server is highly optimized:
 *   - Zero-copy file serving where possible
 *   - Automatic MIME type detection
 *   - Efficient request parsing
 *   - Low memory footprint
 */
Bun.serve({
  port,

  /**
   * REQUEST HANDLER
   *
   * Processes each incoming HTTP request.
   * See server.ts for detailed documentation of each step.
   *
   * @param request - The incoming Request object
   * @returns Response object with file contents or error
   */
  async fetch(request) {
    /*
     * Parse the request URL to extract the path component.
     */
    const url = new URL(request.url);

    /*
     * Default "/" to "/index.html" for root requests.
     */
    const path = url.pathname === "/" ? "/index.html" : url.pathname;

    /*
     * SECURITY: Reject paths with ".." to prevent directory traversal.
     * This is a critical security measure to prevent unauthorized
     * file access outside the project directory.
     */
    if (path.includes("..")) {
      return new Response("Bad Request", { status: 400 });
    }

    /*
     * Resolve the full filesystem path by joining root and request path.
     */
    const filePath = join(rootDir, path);

    /*
     * Check file existence and serve if found.
     * Bun.file() provides lazy file access with efficient streaming.
     */
    const file = Bun.file(filePath);
    if (await file.exists()) {
      return new Response(file);
    }

    /*
     * Return 404 for missing files.
     */
    return new Response("Not Found", { status: 404 });
  },
});

/*
 * SERVER STARTUP MESSAGE
 *
 * Confirms successful server startup and displays access URL.
 */
console.log(`Kanshi UI running at http://localhost:${port}`);
