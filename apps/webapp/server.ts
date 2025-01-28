import path from "path";
import { Hono } from "hono";
import { handle } from "hono/vercel";
import type { MiddlewareHandler } from "hono";
import { compress } from "hono/compress";
import morgan from "morgan";
import { reactRouter } from "remix-hono/handler";
import { WebSocketServer } from "ws";
import { broadcastDevReady, logDevReady } from "@vercel/remix";
// import { secureHeaders } from "hono/secure-headers";
// import { createRequestHandler } from '@vercel/remix/server';
import * as build from "@remix-run/dev/server-build";
import { staticAssets } from "remix-hono/cloudflare";

export const runtime = "edge";

type Bindings = {};

type Variables = {};

type ContextEnv = { Bindings: Bindings; Variables: Variables };

const app = new Hono<ContextEnv>();

const strictTransportSecurityMiddleware: MiddlewareHandler = async (ctx, next) => {
  const { req, res, redirect } = ctx;

  // Add helpful headers
  res.headers.set("Strict-Transport-Security", `max-age=${60 * 60 * 24 * 365 * 100}`);

  // Redirect `/path/` to `/path`
  if (req.path.endsWith("/") && req.path.length > 1) {
    const query = req.url.slice(req.path.length);
    const safePath = req.path.slice(0, -1).replace(/\/+/g, "/");
    return redirect(`${safePath}${query}`, 301);
  }

  await next();
};

app.use(strictTransportSecurityMiddleware);

if (process.env.DISABLE_COMPRESSION !== "1") {
  app.use(compress());
}

// TODO: https://hono.dev/docs/middleware/builtin/secure-headers#middleware-conflict
// app.disable("x-powered-by");

// Remix fingerprints its assets so we can cache forever.
app.use(
  "/build/*",
  staticAssets({
    root: "./public/build", // Path to static assets
    immutable: true,
    maxAge: 60 * 60 * 24 * 365, // Cache for 1 year
  })
);
// app.use("/build", express.static("public/build", { immutable: true, maxAge: "1y" }));

// Everything else (like favicon.ico) is cached for an hour. You may want to be
// more aggressive with this caching.
// app.use(express.static("public", { maxAge: "1h" }));

app.use(morgan("tiny"));

const MODE = process.env.NODE_ENV as "development" | "production";

app.all(
  "*",
  // createRequestHandler({
  //   build,
  //   mode: MODE,
  // })
  reactRouter({
    build,
    mode: MODE,
  })
);

export default handle(app);

const port = process.env.REMIX_APP_PORT || process.env.PORT || 3000;

if (process.env.HTTP_SERVER_DISABLED !== "true") {
  const wss: WebSocketServer | undefined = build.entry.module.wss;

  const server = app.listen(port, () => {
    console.log(`✅ app ready: http://localhost:${port} [NODE_ENV: ${MODE}]`);

    if (MODE === "development") {
      broadcastDevReady(build)
        .then(() => logDevReady(build))
        .catch(console.error);
    }
  });

  server.keepAliveTimeout = 65 * 1000;

  process.on("SIGTERM", () => {
    server.close((err) => {
      if (err) {
        console.error("Error closing express server:", err);
      } else {
        console.log("Express server closed gracefully.");
      }
    });
  });

  server.on("upgrade", async (req, socket, head) => {
    console.log(
      `Attemping to upgrade connection at url ${req.url} with headers: ${JSON.stringify(
        req.headers
      )}`
    );

    const url = new URL(req.url ?? "", "http://localhost");

    // Only upgrade the connecting if the path is `/ws`
    if (url.pathname !== "/ws") {
      socket.destroy(
        new Error(
          "Cannot connect because of invalid path: Please include `/ws` in the path of your upgrade request."
        )
      );
      return;
    }

    console.log(`Client connected, upgrading their connection...`);

    // Handle the WebSocket connection
    wss?.handleUpgrade(req, socket, head, (ws) => {
      wss?.emit("connection", ws, req);
    });
  });
} else {
  require(BUILD_DIR);
  console.log(`✅ app ready (skipping http server)`);
}
