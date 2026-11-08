// COPIED from frontend/src/lib/schemas/menu-item.ts by `npm run sync:shared`. Edit the frontend file, not this one.
import { z } from "zod";

export const DIETARY_OPTIONS = ["unspecified", "veg", "egg", "non-veg"] as const;
export type Dietary = (typeof DIETARY_OPTIONS)[number];

export const DISCOUNT_TYPES = ["none", "percent", "flat"] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

export const ITEM_TAGS = ["none", "bestseller", "new", "special"] as const;
export type ItemTag = (typeof ITEM_TAGS)[number];

export const MAX_PERCENT_DISCOUNT = 90;

const priceSchema = z
  .number({ error: "Enter a price" })
  .positive("Price must be more than 0")
  .max(100_000, "That price looks too high")
  .multipleOf(0.01, "Use at most 2 decimal places");

export const menuItemSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Name needs at least 2 characters")
      .max(60, "Keep the name under 60 characters"),
    description: z
      .string()
      .trim()
      .max(160, "Keep the description under 160 characters"),
    sectionId: z.string().min(1, "Choose a section"),
    /**
     * Price per size id. Sections without sizes use the single key BASE_SIZE_ID.
     * A missing size means the dish isn't sold in that size.
     */
    prices: z.record(z.string(), priceSchema.optional()),
    discountType: z.enum(DISCOUNT_TYPES),
    discountValue: z
      .number({ error: "Enter a discount amount" })
      .positive("Discount must be more than 0")
      .optional(),
    dietary: z.enum(DIETARY_OPTIONS),
    tag: z.enum(ITEM_TAGS),
    isAvailable: z.boolean(),
  })
  .superRefine((item, ctx) => {
    const amounts = Object.values(item.prices).filter((n): n is number => n !== undefined);
    if (amounts.length === 0) {
      ctx.addIssue({ code: "custom", path: ["prices"], message: "Enter at least one price" });
    }

    if (item.discountType === "none") return;

    if (item.discountValue === undefined) {
      ctx.addIssue({ code: "custom", path: ["discountValue"], message: "Enter a discount amount" });
      return;
    }
    if (item.discountType === "percent" && item.discountValue > MAX_PERCENT_DISCOUNT) {
      ctx.addIssue({
        code: "custom",
        path: ["discountValue"],
        message: `A percentage discount can be at most ${MAX_PERCENT_DISCOUNT}%`,
      });
    }
    if (item.discountType === "flat" && amounts.length && item.discountValue >= Math.min(...amounts)) {
      ctx.addIssue({
        code: "custom",
        path: ["discountValue"],
        message:
          amounts.length > 1
            ? "Discount must be less than the lowest price"
            : "Discount must be less than the price",
      });
    }
  })
  .transform((item) => ({
    ...item,
    prices: Object.fromEntries(
      Object.entries(item.prices).filter((entry): entry is [string, number] => entry[1] !== undefined),
    ),
    discountValue: item.discountType === "none" ? undefined : item.discountValue,
  }));

export type MenuItemInput = z.input<typeof menuItemSchema>;
export type MenuItemData = z.output<typeof menuItemSchema>;

export type MenuItem = MenuItemData & {
  id: string;
  cafeId: string;
  /** Order within its section (ascending). */
  position: number;
  createdAt: string;
  updatedAt: string;
};
