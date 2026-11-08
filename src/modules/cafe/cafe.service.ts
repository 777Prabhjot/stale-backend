import { AppError } from "@shared/errors";
import { cafeProfileSchema, slugSchema, type Cafe as CafeDto } from "@shared/schemas/cafe";
import type { MenuItem } from "@shared/schemas/menu-item";
import { parseInput } from "../../lib/validation.ts";
import type { AuthContext, Deps } from "../../types.ts";
import { cafeInclude, itemInclude, itemOrder, toCafeDto, toItemDto } from "../menu/serializers.ts";

export async function getCafe({ db }: Deps, cafeId: string): Promise<CafeDto> {
  const cafe = await db.cafe.findUnique({ where: { id: cafeId }, include: cafeInclude });
  if (!cafe) throw new AppError("NOT_FOUND", "This café no longer exists.");
  return toCafeDto(cafe);
}

export async function updateProfile(deps: Deps, auth: AuthContext, input: unknown): Promise<CafeDto> {
  const data = parseInput(cafeProfileSchema, input);
  const { db } = deps;

  const slugOwner = await db.cafe.findUnique({ where: { slug: data.slug }, select: { id: true } });
  if (slugOwner && slugOwner.id !== auth.cafeId) {
    throw new AppError("CONFLICT", "This menu link is taken.", {
      fieldErrors: { slug: "This menu link is taken. Try another." },
    });
  }

  const cafe = await db.cafe.update({ where: { id: auth.cafeId }, data, include: cafeInclude });
  return toCafeDto(cafe);
}

/** What diners see after scanning the QR code. */
export async function getPublicMenu({ db }: Deps, slug: string): Promise<{ cafe: CafeDto; items: MenuItem[] }> {
  const notFound = new AppError("NOT_FOUND", "We couldn't find this café's menu.");
  // Malformed slugs can't exist; skip the database for them.
  const parsed = slugSchema.safeParse(slug);
  if (!parsed.success) throw notFound;

  const cafe = await db.cafe.findUnique({ where: { slug: parsed.data }, include: cafeInclude });
  if (!cafe) throw notFound;

  const items = await db.item.findMany({ where: { cafeId: cafe.id }, include: itemInclude, orderBy: itemOrder });
  return { cafe: toCafeDto(cafe), items: items.map(toItemDto) };
}
