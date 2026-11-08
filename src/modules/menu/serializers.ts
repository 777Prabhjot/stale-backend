import type { User as UserDto } from "@shared/schemas/auth";
import { BASE_SIZE_ID, type Cafe as CafeDto, type Currency, type SectionIcon } from "@shared/schemas/cafe";
import type { Dietary, DiscountType, ItemTag, MenuItem as MenuItemDto } from "@shared/schemas/menu-item";
import { Prisma } from "../../db.ts";
import type { Cafe, Item, ItemPrice, Section, SectionSize, User } from "../../../generated/prisma/client.ts";

/*
 * Database rows → the JSON shapes the frontend already uses (types from the shared schemas).
 * Internal fields (password hashes, owner ids, lockout counters) never leave this file.
 */

/** Load a café with its sections and sizes, in display order. */
export const cafeInclude = {
  sections: {
    orderBy: { position: "asc" },
    include: { sizes: { orderBy: { position: "asc" } } },
  },
} satisfies Prisma.CafeInclude;

export const itemInclude = { prices: true } satisfies Prisma.ItemInclude;

type CafeWithSections = Cafe & { sections: (Section & { sizes: SectionSize[] })[] };
type ItemWithPrices = Item & { prices: ItemPrice[] };

export function toUserDto(user: User): UserDto {
  return { id: user.id, name: user.name, phone: user.phone, createdAt: user.createdAt.toISOString() };
}

export function toCafeDto(cafe: CafeWithSections): CafeDto {
  return {
    id: cafe.id,
    name: cafe.name,
    slug: cafe.slug,
    tagline: cafe.tagline,
    address: cafe.address,
    phone: cafe.phone,
    currency: cafe.currency as Currency,
    logo: cafe.logo,
    notices: cafe.notices,
    instagram: cafe.instagram,
    facebook: cafe.facebook,
    zomato: cafe.zomato,
    swiggy: cafe.swiggy,
    sections: cafe.sections.map((s) => ({
      id: s.id,
      name: s.name,
      note: s.note,
      icon: s.icon as SectionIcon,
      sizes: s.sizes.map((z) => ({ id: z.id, label: z.label })),
    })),
    createdAt: cafe.createdAt.toISOString(),
    updatedAt: cafe.updatedAt.toISOString(),
  };
}

export function toItemDto(item: ItemWithPrices): MenuItemDto {
  return {
    id: item.id,
    cafeId: item.cafeId,
    sectionId: item.sectionId,
    position: item.position,
    name: item.name,
    description: item.description,
    // Sections without sizes store their single price with sizeId = null.
    prices: Object.fromEntries(item.prices.map((p) => [p.sizeId ?? BASE_SIZE_ID, Number(p.amount)])),
    discountType: item.discountType as DiscountType,
    discountValue: item.discountValue === null ? undefined : Number(item.discountValue),
    dietary: item.dietary as Dietary,
    tag: item.tag as ItemTag,
    isAvailable: item.isAvailable,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

/** Dishes by their position within a section; the frontend groups them under sections. */
export const itemOrder = [{ position: "asc" }, { createdAt: "asc" }] satisfies Prisma.ItemOrderByWithRelationInput[];
