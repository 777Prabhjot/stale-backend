import { Router } from "express";
import { authOf, requireAuth } from "../../middleware/require-auth.ts";
import { assertId, moveSchema, parseInput } from "../../lib/validation.ts";
import type { Deps } from "../../types.ts";
import * as sections from "./sections.service.ts";

/** Owner's menu sections (`/api/sections`). */
export function sectionsRouter(deps: Deps): Router {
  const router = Router();
  router.use(requireAuth(deps));

  router.post("/", async (req, res) => {
    res.status(201).json(await sections.createSection(deps, authOf(res), req.body));
  });

  router.put("/:id", async (req, res) => {
    res.json(await sections.updateSection(deps, authOf(res), assertId(req.params.id, "section"), req.body));
  });

  router.delete("/:id", async (req, res) => {
    res.json({ cafe: await sections.deleteSection(deps, authOf(res), assertId(req.params.id, "section")) });
  });

  router.post("/:id/move", async (req, res) => {
    const { direction } = parseInput(moveSchema, req.body);
    res.json({ cafe: await sections.moveSection(deps, authOf(res), assertId(req.params.id, "section"), direction) });
  });

  return router;
}
