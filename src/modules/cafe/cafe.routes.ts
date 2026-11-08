import { Router } from "express";
import { authOf, requireAuth } from "../../middleware/require-auth.ts";
import type { Deps } from "../../types.ts";
import * as cafes from "./cafe.service.ts";

/** Owner's own café (`/api/cafe`). */
export function cafeRouter(deps: Deps): Router {
  const router = Router();
  router.use(requireAuth(deps));

  router.get("/", async (_req, res) => {
    res.json({ cafe: await cafes.getCafe(deps, authOf(res).cafeId) });
  });

  router.patch("/", async (req, res) => {
    res.json({ cafe: await cafes.updateProfile(deps, authOf(res), req.body) });
  });

  return router;
}

/** Public menus (`/api/public`). No sign-in. */
export function publicRouter(deps: Deps): Router {
  const router = Router();

  router.get("/menus/:slug", async (req, res) => {
    const menu = await cafes.getPublicMenu(deps, req.params.slug);
    // Always revalidate, so a price change shows on the next scan.
    res.set("Cache-Control", "no-cache");
    res.json(menu);
  });

  return router;
}
