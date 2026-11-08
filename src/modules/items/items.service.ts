import { AppError } from "@shared/errors";
import { BASE_SIZE_ID } from "@shared/schemas/cafe";
import { menuItemSchema, type MenuItem as MenuItemDto, type MenuItemData } from "@shared/schemas/menu-item";
import type { Tx } from "../../db.ts";
import { parseInput } from "../../lib/validation.ts";
import type { AuthContext, Deps } from "../../types.ts";
import { itemInclude, itemOrder, toItemDto } from "../menu/serializers.ts";
import type { MoveDirection } from "../sections/sections.service.ts";

const notFound = () => new AppError("NOT_FOUND", "This dish no longer exists.");
const invalid = (fieldErrors: Record<string, string>) =>
  new AppError("VALIDATION", "Some fields need attention.", { fieldErrors });

/** Validates the dish and turns its prices into rows for the chosen section's sizes. */
async function parseDish(tx: Tx, cafeId: string, input: unknown) {
  const data = parseInput(menuItemSchema, input);

  const section = await tx.section.findFirst({
    where: { id: data.sectionId, cafeId },
    include: { sizes: { select: { id: true } } },
  });
  if (!section) throw invalid({ sectionId: "Choose a section" });

  // Keep only prices for sizes this section has; BASE_SIZE_ID when it has none.
  const allowed = section.sizes.length ? new Set(section.sizes.map((s) => s.id)) : new Set([BASE_SIZE_ID]);
  const prices = Object.entries(data.prices)
    .filter(([sizeId]) => allowed.has(sizeId))
    .map(([sizeId, amount]) => ({ sizeId: sizeId === BASE_SIZE_ID ? null : sizeId, amount }));
  if (prices.length === 0) throw invalid({ prices: "Enter at least one price" });

  return { data, prices };
}

function dishFields(data: MenuItemData) {
  return {
    name: data.name,
    description: data.description,
    sectionId: data.sectionId,
    discountType: data.discountType,
    discountValue: data.discountType === "none" ? null : (data.discountValue ?? null),
    dietary: data.dietary,
    tag: data.tag,
    isAvailable: data.isAvailable,
  };
}

async function nextPosition(tx: Tx, sectionId: string) {
  const last = await tx.item.aggregate({ where: { sectionId }, _max: { position: true } });
  return (last._max.position ?? -1) + 1;
}

export async function listItems({ db }: Deps, auth: AuthContext): Promise<MenuItemDto[]> {
  const items = await db.item.findMany({ where: { cafeId: auth.cafeId }, include: itemInclude, orderBy: itemOrder });
  return items.map(toItemDto);
}

export async function getItem({ db }: Deps, auth: AuthContext, id: string): Promise<MenuItemDto> {
  const item = await db.item.findFirst({ where: { id, cafeId: auth.cafeId }, include: itemInclude });
  if (!item) throw notFound();
  return toItemDto(item);
}

export async function createItem({ db }: Deps, auth: AuthContext, input: unknown): Promise<MenuItemDto> {
  const item = await db.$transaction(async (tx) => {
    const { data, prices } = await parseDish(tx, auth.cafeId, input);
    return tx.item.create({
      data: {
        ...dishFields(data),
        cafeId: auth.cafeId,
        position: await nextPosition(tx, data.sectionId),
        prices: { create: prices },
      },
      include: itemInclude,
    });
  });
  return toItemDto(item);
}

export async function updateItem({ db }: Deps, auth: AuthContext, id: string, input: unknown): Promise<MenuItemDto> {
  const item = await db.$transaction(async (tx) => {
    const existing = await tx.item.findFirst({ where: { id, cafeId: auth.cafeId } });
    if (!existing) throw notFound();
    const { data, prices } = await parseDish(tx, auth.cafeId, input);

    // A dish moved to another section goes to the end of it.
    const position =
      data.sectionId === existing.sectionId ? existing.position : await nextPosition(tx, data.sectionId);

    await tx.itemPrice.deleteMany({ where: { itemId: id } });
    return tx.item.update({
      where: { id },
      data: { ...dishFields(data), position, prices: { create: prices } },
      include: itemInclude,
    });
  });
  return toItemDto(item);
}

export async function setAvailability(
  { db }: Deps,
  auth: AuthContext,
  id: string,
  isAvailable: boolean,
): Promise<MenuItemDto> {
  const { count } = await db.item.updateMany({ where: { id, cafeId: auth.cafeId }, data: { isAvailable } });
  if (count === 0) throw notFound();
  const item = await db.item.findUniqueOrThrow({ where: { id }, include: itemInclude });
  return toItemDto(item);
}

/** Swaps a dish with its neighbour in the same section. Returns all the café's dishes. */
export async function moveItem(deps: Deps, auth: AuthContext, id: string, direction: MoveDirection): Promise<MenuItemDto[]> {
  await deps.db.$transaction(async (tx) => {
    const item = await tx.item.findFirst({ where: { id, cafeId: auth.cafeId }, select: { sectionId: true } });
    if (!item) throw notFound();

    const siblings = await tx.item.findMany({ where: { sectionId: item.sectionId }, orderBy: itemOrder, select: { id: true } });
    const index = siblings.findIndex((s) => s.id === id);
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= siblings.length) return;

    [siblings[index], siblings[target]] = [siblings[target], siblings[index]];
    for (const [position, s] of siblings.entries()) {
      await tx.item.update({ where: { id: s.id }, data: { position } });
    }
  });
  return listItems(deps, auth);
}

export async function deleteItem({ db }: Deps, auth: AuthContext, id: string): Promise<void> {
  const { count } = await db.item.deleteMany({ where: { id, cafeId: auth.cafeId } });
  if (count === 0) throw notFound();
}
