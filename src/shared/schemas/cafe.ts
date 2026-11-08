// COPIED from frontend/src/lib/schemas/cafe.ts by `npm run sync:shared`. Edit the frontend file, not this one.
import { z } from "zod";

export const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Use at least 3 characters")
  .max(40, "Use 40 characters or fewer")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Use lowercase letters, numbers and single hyphens",
  );

export const cafeNameSchema = z
  .string()
  .trim()
  .min(2, "Café name needs at least 2 characters")
  .max(60, "Keep the café name under 60 characters");

/* ---------- Sections (e.g. "Hot Coffee", "Pizza") ---------- */

export const MAX_SIZES = 4;

/** Icons a section can show next to its title ("none" = no icon). Drawings live in the frontend. */
export const SECTION_ICONS = [
  "none",
  "coffee",
  "tea",
  "cold-drink",
  "shake",
  "mojito",
  "pizza",
  "burger",
  "sandwich",
  "garlic-bread",
  "momos",
  "fries",
  "pasta",
  "wrap",
  "dessert",
  "ice-cream",
  "combo",
  "plate",
] as const;
export type SectionIcon = (typeof SECTION_ICONS)[number];
export const MAX_NOTICES = 4;

/** Price key used by dishes in a section without sizes. */
export const BASE_SIZE_ID = "base";

export const sectionSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Section name needs at least 2 characters")
      .max(30, "Keep the section name under 30 characters"),
    sizes: z
      .array(
        z.object({
          /** Present for sizes that already exist, so dish prices stay attached. */
          sizeId: z.string().optional(),
          label: z
            .string()
            .trim()
            .min(1, "Name this size")
            .max(12, "Keep size names under 12 characters"),
        }),
      )
      .max(MAX_SIZES, `Use at most ${MAX_SIZES} sizes`),
    note: z.string().trim().max(120, "Keep the note under 120 characters"),
    icon: z.enum(SECTION_ICONS, { error: "Choose an icon from the list" }).default("none"),
  })
  .superRefine((section, ctx) => {
    const seen = new Set<string>();
    section.sizes.forEach((size, index) => {
      const key = size.label.trim().toLowerCase();
      if (key && seen.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: ["sizes", index, "label"],
          message: "Each size needs a different name",
        });
      }
      seen.add(key);
    });
  });

export type SectionInput = z.input<typeof sectionSchema>;

export type SectionSize = { id: string; label: string };

export type Section = {
  id: string;
  name: string;
  /** Empty means dishes have one price. Order is the column order on the menu. */
  sizes: SectionSize[];
  /** Shown under the section, e.g. "Add any topping for ₹20". */
  note: string;
  icon: SectionIcon;
};

/* ---------- Café profile (Settings) ---------- */

/**
 * http(s), a dotted domain, no whitespace. Explicit rather than z.url(), because browser
 * URL parsers disagree (Chrome accepts "https://not a link"; Node rejects it).
 */
const LINK_PATTERN = /^https?:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?([/?#]\S*)?$/i;

/** Accepts "instagram.com/x" or a full URL; stores a full https URL or "". */
const linkSchema = z
  .string()
  .trim()
  .transform((value) => (value && !/^https?:\/\//i.test(value) ? `https://${value}` : value))
  .refine((value) => value === "" || LINK_PATTERN.test(value), "Enter a valid link, e.g. instagram.com/yourcafe");

const NOTICE_MAX = 100;

/** API shape: a list of short notices. */
const noticeListSchema = z
  .array(z.string().trim().min(1).max(NOTICE_MAX, `Keep each notice under ${NOTICE_MAX} characters`))
  .max(MAX_NOTICES, `Add at most ${MAX_NOTICES} notices`);

/** Settings form shape: a textarea with one notice per line → list of notices. */
const noticesTextSchema = z
  .string()
  .superRefine((value, ctx) => {
    const lines = toLines(value);
    if (lines.length > MAX_NOTICES) {
      ctx.addIssue({ code: "custom", message: `Add at most ${MAX_NOTICES} notices` });
    }
    if (lines.some((line) => line.length > NOTICE_MAX)) {
      ctx.addIssue({ code: "custom", message: `Keep each notice under ${NOTICE_MAX} characters` });
    }
  })
  .transform(toLines);

function toLines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/** The café profile as sent to and validated by the API (`PATCH /api/cafe`). */
export const cafeProfileSchema = z.object({
  name: cafeNameSchema,
  slug: slugSchema,
  tagline: z.string().trim().max(80, "Keep the tagline under 80 characters"),
  address: z.string().trim().max(120, "Keep the address under 120 characters"),
  phone: z
    .string()
    .trim()
    .regex(/^[+\d][\d\s-]{5,18}$|^$/, "Enter a valid phone number"),
  currency: z.enum(CURRENCIES, { error: "Choose a currency" }),
  /** Small data-URL image until there is file storage. */
  logo: z
    .string()
    .refine((v) => v === "" || v.startsWith("data:image/"), "Upload an image file")
    .refine((v) => v.length < 300_000, "That image is too large. Try a smaller one."),
  notices: noticeListSchema,
  instagram: linkSchema,
  facebook: linkSchema,
  zomato: linkSchema,
  swiggy: linkSchema,
});

/** Same fields, but notices come from a textarea. Its output matches `CafeProfile`. */
export const cafeProfileFormSchema = cafeProfileSchema.extend({ notices: noticesTextSchema });

export type CafeProfile = z.output<typeof cafeProfileSchema>;
export type CafeProfileFormInput = z.input<typeof cafeProfileFormSchema>;

export type Cafe = CafeProfile & {
  id: string;
  /** Menu sections in display order. */
  sections: Section[];
  createdAt: string;
  updatedAt: string;
};
