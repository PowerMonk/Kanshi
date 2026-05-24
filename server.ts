/**
 * =============================================================================
 * KANSHI RC INTELLIGENCE SYSTEM - DEVELOPMENT SERVER (TypeScript)
 * =============================================================================
 *
 * File: server.ts
 * Execution Context: Desktop PC (Bun Runtime)
 * Usage: bun run dev (development mode)
 *
 * PURPOSE:
 * This is the development HTTP server for the Kanshi desktop application.
 * It serves static files from the project directory, enabling local testing
 * of the web interface before deployment.
 *
 * RUNTIME ENVIRONMENT:
 * This server runs on Bun (https://bun.sh), a fast JavaScript runtime
 * that provides native TypeScript support and efficient HTTP serving.
 * The import.meta.dir feature is Bun-specific.
 *
 * SERVER ARCHITECTURE:
 *
 *   [Developer's Browser]
 *        ↓ HTTP requests
 *   [Bun.serve() - port 3000]
 *        ↓ file lookup
 *   [Project Directory]
 *        ↓
 *   [HTML/CSS/JS files]
 *
 * FILE SERVING BEHAVIOR:
 *   - "/" → serves index.html (default page)
 *   - "/frontend/dist/index.js" → serves the bundled JS
 *   - "/AIconfig.html" → serves AI configuration page
 *   - etc.
 *
 * SECURITY:
 * Basic path traversal protection is implemented to prevent
 * requests like "/../../../etc/passwd" from accessing files
 * outside the project directory.
 *
 * DEVELOPMENT WORKFLOW:
 *   1. Run "bun run build" to compile TypeScript to JS bundles
 *   2. Run "bun run dev" to start this server
 *   3. Open http://localhost:3000 in browser
 *   4. Make changes to source files
 *   5. Rebuild and refresh to see changes
 *
 * NOTE: This server is for development only. It lacks production
 * features like caching, compression, HTTPS, etc.
 *
 * =============================================================================
 */

import { join } from "path";

/**
 * ROOT DIRECTORY
 *
 * The base directory for file serving.
 * import.meta.dir is a Bun-specific feature that provides the
 * directory containing the current file.
 *
 * All file paths are resolved relative to this directory,
 * which is the project root where this server.ts file resides.
 */
const rootDir = import.meta.dir;

/**
 * SERVER PORT
 *
 * The HTTP port the server listens on.
 * Port 3000 is a conventional choice for local development servers.
 *
 * To use a different port, change this constant or implement
 * environment variable reading (e.g., process.env.PORT).
 */
const port = 3000;

/**
 * BUN HTTP SERVER
 *
 * Bun.serve() creates a high-performance HTTP server.
 * The configuration object specifies:
 *   - port: TCP port to listen on
 *   - fetch: Request handler function
 *
 * FETCH HANDLER:
 * The fetch function receives each incoming request and must
 * return a Response object (or Promise<Response>).
 *
 * Bun's file handling (Bun.file) provides efficient static file
 * serving with automatic MIME type detection.
 */
Bun.serve({
  port,

  /**
   * REQUEST HANDLER
   *
   * Processes each incoming HTTP request.
   *
   * @param request - The incoming Request object (standard Fetch API)
   * @returns Response object with file contents or error message
   *
   * PROCESSING STEPS:
   *   1. Parse the URL to extract the path
   *   2. Default "/" to "/index.html"
   *   3. Validate path for security (no "..")
   *   4. Resolve file path in project directory
   *   5. Return file contents or 404
   */
  async fetch(request) {
    /*
     * PARSE REQUEST URL
     *
     * The URL constructor parses the full request URL.
     * pathname gives us the path portion without query strings.
     */
    const url = new URL(request.url);

    /*
     * DEFAULT PAGE HANDLING
     *
     * Requests to "/" serve index.html, providing a default
     * landing page for the application.
     */
    const path = url.pathname === "/" ? "/index.html" : url.pathname;

    /*
     * PATH TRAVERSAL PROTECTION
     *
     * Reject any path containing ".." to prevent directory
     * traversal attacks that could access files outside the
     * project directory.
     *
     * Example blocked paths:
     *   - "/../../../etc/passwd"
     *   - "/frontend/../.env"
     *
     * This is a basic security measure; production servers
     * should use more robust path validation.
     */
    if (path.includes("..")) {
      return new Response("Bad Request", { status: 400 });
    }

    /*
     * RESOLVE FILE PATH
     *
     * Combine the root directory with the requested path.
     * join() handles path normalization and OS-specific separators.
     */
    const filePath = join(rootDir, path);

    /*
     * FILE LOOKUP AND RESPONSE
     *
     * Bun.file() creates a file reference without immediately reading.
     * The exists() method checks if the file is accessible.
     *
     * If the file exists, returning the Bun file object directly
     * streams its contents efficiently with automatic MIME typing.
     */
    const file = Bun.file(filePath);
    if (await file.exists()) {
      return new Response(file);
    }

    /*
     * FILE NOT FOUND
     *
     * Return 404 for any path that doesn't match an existing file.
     */
    return new Response("Not Found", { status: 404 });
  },
});

/*
 * SERVER STARTUP MESSAGE
 *
 * Log the server URL for developer convenience.
 * This runs once when the server starts.
 */
console.log(`Kanshi UI running at http://localhost:${port}`);
