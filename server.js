import { join } from "path";

const rootDir = new URL(".", import.meta.url).pathname;
const port = 3000;

Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname === "/" ? "/index.html" : url.pathname;

    if (path.includes("..")) {
      return new Response("Bad Request", { status: 400 });
    }

    const filePath = join(rootDir, path);
    const file = Bun.file(filePath);
    if (await file.exists()) {
      return new Response(file);
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Kanshi UI running at http://localhost:${port}`);
