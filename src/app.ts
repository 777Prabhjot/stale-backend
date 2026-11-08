import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import helmet from "helmet";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.ts";
import { authRouter } from "./modules/auth/auth.routes.ts";
import { cafeRouter, publicRouter } from "./modules/cafe/cafe.routes.ts";
import { itemsRouter } from "./modules/items/items.routes.ts";
import { sectionsRouter } from "./modules/sections/sections.routes.ts";
import type { Deps } from "./types.ts";

/**
 * Builds the API. The frontend reaches it through a Next.js rewrite of /api/*, so the browser
 * sees one origin: no CORS, and the session cookie is first-party.
 */
export function createApp(deps: Deps): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", deps.config.trustProxy);

  app.use(helmet());
  // Logos travel as small data URLs, so allow a little more than the default 100 KB.
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  if (deps.config.env === "development") {
    app.use((req, res, next) => {
      const start = performance.now();
      res.on("finish", () =>
        console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${Math.round(performance.now() - start)} ms)`),
      );
      next();
    });
  }

  const api = express.Router();
  // Owner data is personal: never let a browser or proxy cache it. Routes can override.
  api.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  api.get("/health", async (_req, res) => {
    await deps.db.$queryRaw`SELECT 1`;
    res.json({ status: "ok" });
  });
  api.use("/auth", authRouter(deps));
  api.use("/cafe", cafeRouter(deps));
  api.use("/sections", sectionsRouter(deps));
  api.use("/items", itemsRouter(deps));
  api.use("/public", publicRouter(deps));

  app.use("/api", api);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
