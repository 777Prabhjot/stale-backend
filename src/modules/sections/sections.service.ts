import { AppError } from "@shared/errors";
import { sectionSchema, type Cafe as CafeDto, type Section as SectionDto } from "@shared/schemas/cafe";
import type { Tx } from "../../db.ts";
import { parseInput } from "../../lib/validation.ts";
import type { AuthContext, Deps } from "../../types.ts";
import { getCafe } from "../cafe/cafe.service.ts";

export type MoveDirection = "up" | "down";
type SectionResult = { cafe: CafeDto; section: SectionDto };

const notFound = () => new AppError("NOT_FOUND", "This section no longer exists.");

async function assertNameFree(tx: Tx, cafeId: string, name: string, exceptId?: string) {
  const clash = await tx.section.findFirst({
    where: { cafeId, name: { equals: name, mode: "insensitive" }, ...(exceptId && { id: { not: exceptId } }) },
    select: { id: true },
  });
  if (clash) {
    throw new AppError("CONFLICT", "A section with this name already exists.", {
      fieldErrors: { name: "You already have a section with this name" },
    });
  }
}

async function withSection(deps: Deps, cafeId: string, sectionId: string): Promise<SectionResult> {
  const cafe = await getCafe(deps, cafeId);
  const section = cafe.sections.find((s) => s.id === sectionId);
  if (!section) throw notFound();
  return { cafe, section };
}

export async function createSection(deps: Deps, auth: AuthContext, input: unknown): Promise<SectionResult> {
  const data = parseInput(sectionSchema, input);

  const section = await deps.db.$transaction(async (tx) => {
    await assertNameFree(tx, auth.cafeId, data.name);
    const last = await tx.section.aggregate({ where: { cafeId: auth.cafeId }, _max: { position: true } });
    return tx.section.create({
      data: {
        cafeId: auth.cafeId,
        name: data.name,
        note: data.note,
        icon: data.icon,
        position: (last._max.position ?? -1) + 1,
        sizes: { create: data.sizes.map((s, position) => ({ label: s.label, position })) },
      },
    });
  });

  return withSection(deps, auth.cafeId, section.id);
}

/**
 * Updates name, note and sizes. Dish prices stay attached to sizes:
 * - one price → sizes: the old single price moves to the first size
 * - sizes → one price: each dish keeps its first available size price
 * - otherwise: sizes keep their prices by id; removing a size deletes its prices
 */
export async function updateSection(
  deps: Deps,
  auth: AuthContext,
  sectionId: string,
  input: unknown,
): Promise<SectionResult> {
  const data = parseInput(sectionSchema, input);

  await deps.db.$transaction(async (tx) => {
    const existing = await tx.section.findFirst({
      where: { id: sectionId, cafeId: auth.cafeId },
      include: { sizes: { orderBy: { position: "asc" } } },
    });
    if (!existing) throw notFound();
    await assertNameFree(tx, auth.cafeId, data.name, sectionId);

    const before = existing.sizes;
    const known = new Set(before.map((s) => s.id));
    const kept = new Set<string>();
    const after: string[] = [];

    for (const [position, size] of data.sizes.entries()) {
      // Reuse an existing size only once and only if it belongs to this section.
      if (size.sizeId && known.has(size.sizeId) && !kept.has(size.sizeId)) {
        await tx.sectionSize.update({ where: { id: size.sizeId }, data: { label: size.label, position } });
        kept.add(size.sizeId);
        after.push(size.sizeId);
      } else {
        const created = await tx.sectionSize.create({ data: { sectionId, label: size.label, position } });
        after.push(created.id);
      }
    }

    if (before.length === 0 && after.length > 0) {
      await tx.itemPrice.updateMany({
        where: { sizeId: null, item: { sectionId } },
        data: { sizeId: after[0] },
      });
    } else if (before.length > 0 && after.length === 0) {
      const items = await tx.item.findMany({ where: { sectionId }, include: { prices: true } });
      const singles = items.flatMap((item) => {
        const first = before
          .map((size) => item.prices.find((p) => p.sizeId === size.id))
          .find((price) => price !== undefined);
        return first ? [{ itemId: item.id, sizeId: null, amount: first.amount }] : [];
      });
      if (singles.length) await tx.itemPrice.createMany({ data: singles });
    }

    // Prices for removed sizes go with them (ON DELETE CASCADE).
    const removed = before.filter((s) => !kept.has(s.id)).map((s) => s.id);
    if (removed.length) await tx.sectionSize.deleteMany({ where: { id: { in: removed } } });

    await tx.section.update({ where: { id: sectionId }, data: { name: data.name, note: data.note, icon: data.icon } });
  });

  return withSection(deps, auth.cafeId, sectionId);
}

export async function deleteSection(deps: Deps, auth: AuthContext, sectionId: string): Promise<CafeDto> {
  await deps.db.$transaction(async (tx) => {
    const section = await tx.section.findFirst({
      where: { id: sectionId, cafeId: auth.cafeId },
      select: { id: true, _count: { select: { items: true } } },
    });
    if (!section) throw notFound();
    const count = section._count.items;
    if (count > 0) {
      throw new AppError(
        "CONFLICT",
        `This section still has ${count} ${count === 1 ? "dish" : "dishes"}. Move or delete them first.`,
      );
    }
    await tx.section.delete({ where: { id: sectionId } });
  });
  return getCafe(deps, auth.cafeId);
}

export async function moveSection(
  deps: Deps,
  auth: AuthContext,
  sectionId: string,
  direction: MoveDirection,
): Promise<CafeDto> {
  await deps.db.$transaction(async (tx) => {
    const sections = await tx.section.findMany({
      where: { cafeId: auth.cafeId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    const index = sections.findIndex((s) => s.id === sectionId);
    if (index < 0) throw notFound();
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= sections.length) return;

    [sections[index], sections[target]] = [sections[target], sections[index]];
    // Renumber densely so positions stay clean after deletes.
    for (const [position, s] of sections.entries()) {
      await tx.section.update({ where: { id: s.id }, data: { position } });
    }
  });
  return getCafe(deps, auth.cafeId);
}
