import { Router } from "express";
import { z } from "zod";
import { authOf, requireAuth } from "../../middleware/require-auth.ts";
import { assertId, moveSchema, parseInput } from "../../lib/validation.ts";
import type { Deps } from "../../types.ts";
import * as items from "./items.service.ts";

const availabilitySchema = z.object({ isAvailable: z.boolean({ error: "isAvailable must be true or false" }) });

/** Owner's dishes (`/api/items`). */
export function itemsRouter(deps: Deps): Router {
  const router = Router();
  router.use(requireAuth(deps));

  router.get("/", async (_req, res) => {
    res.json({ items: await items.listItems(deps, authOf(res)) });
  });

  router.get("/:id", async (req, res) => {
    res.json({ item: await items.getItem(deps, authOf(res), assertId(req.params.id, "dish")) });
  });

  router.post("/", async (req, res) => {
    res.status(201).json({ item: await items.createItem(deps, authOf(res), req.body) });
  });

  router.put("/:id", async (req, res) => {
    res.json({ item: await items.updateItem(deps, authOf(res), assertId(req.params.id, "dish"), req.body) });
  });

  router.patch("/:id/availability", async (req, res) => {
    const { isAvailable } = parseInput(availabilitySchema, req.body);
    res.json({ item: await items.setAvailability(deps, authOf(res), assertId(req.params.id, "dish"), isAvailable) });
  });

  router.post("/:id/move", async (req, res) => {
    const { direction } = parseInput(moveSchema, req.body);
    res.json({ items: await items.moveItem(deps, authOf(res), assertId(req.params.id, "dish"), direction) });
  });

  router.delete("/:id", async (req, res) => {
    await items.deleteItem(deps, authOf(res), assertId(req.params.id, "dish"));
    res.status(204).end();
  });

  return router;
}
