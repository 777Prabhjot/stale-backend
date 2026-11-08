import type { SectionIcon } from "@shared/schemas/cafe";
import type { Dietary, ItemTag } from "@shared/schemas/menu-item";
import type { Db } from "../db.ts";
import { hashPassword } from "../lib/passwords.ts";

/** Demo owner: sign in with 9876543210 / demo1234 (the frontend's "Use the demo account" button). */
export const DEMO_OWNER = { phone: "+919876543210", password: "demo1234", slug: "cafe-bites" } as const;

/*
 * Demo menu, transcribed from Cafe Bites' printed menu (Fauji Road, Kotkapura).
 * Prices follow the section's size order; `null` = not sold in that size.
 */
type SeedDish = [name: string, prices: (number | null)[], extra?: { description?: string; tag?: ItemTag; dietary?: Dietary }];
type SeedSection = { name: string; icon: SectionIcon; sizes: string[]; note?: string; dishes: SeedDish[] };

const REG_LARGE = ["Reg", "Large"];
const SML = ["Small", "Med", "Large"];

const demoMenu: SeedSection[] = [
  {
    name: "Hot Coffee", icon: "coffee", sizes: REG_LARGE,
    dishes: [
      ["Black Coffee", [40, 60]], ["Espresso", [50, 70]], ["Beat Coffee", [70, 90]],
      ["Choco Latte", [80, 100]], ["Hazel Nut Coffee", [90, 110]], ["Caramel Coffee", [90, 110]],
    ],
  },
  {
    name: "Coolers", icon: "mojito", sizes: [],
    dishes: [
      ["Fresh Lime Soda", [50]], ["Masala Thums-Up / Coke", [60]],
      ["Mojito", [70], { description: "Mint, black current or pineapple" }], ["Spicy Mango Mojito", [80]],
    ],
  },
  {
    name: "Cold Coffee", icon: "coffee", sizes: REG_LARGE,
    dishes: [
      ["Cold Coffee", [70, 90]], ["Cold Coffee with Caramel", [80, 100]], ["Cold Coffee with Honey", [80, 100]],
      ["Cold Coffee with Ice Cream", [90, 110]], ["Café Frappe", [90, 110]],
    ],
  },
  {
    name: "Spl. Thick Shakes", icon: "shake", sizes: REG_LARGE,
    dishes: [
      ["Tasty Vanilla", [80, 110]], ["Pink Strawberry", [80, 110]], ["Mango Burpp", [80, 110]],
      ["Pulpy Pineapple", [80, 110]], ["Butter Scotch", [80, 110]], ["Oreo Blast", [80, 110]],
      ["Black Current Blast", [80, 110]], ["Chocolate Shake", [80, 110]], ["Kit-Kat Shake", [90, 120]],
    ],
  },
  {
    name: "Fusion Shakes", icon: "shake", sizes: REG_LARGE,
    dishes: [
      ["Choco Vanilla", [90, 120]], ["Vanilla Caramel", [90, 120]], ["Pinacolada Shake", [90, 120]],
      ["Choco Caramel", [90, 120]], ["Vanilla Oreo", [90, 120]], ["Vanilla Strawberry", [90, 120]],
      ["Vanilla, Black Current & Honey", [90, 120]],
    ],
  },
  {
    name: "Crunchy Pizza", icon: "pizza", sizes: SML, note: "Add any topping for ₹20",
    dishes: [
      ["Any Single Topping Pizza", [100, 150, 230], { description: "Onion, corn or capsicum" }],
      ["Veg Pizza", [130, 190, 270], { description: "Onion, capsicum, tomato" }],
      ["Paneer Corn Pizza", [150, 210, 290], { description: "Onion, capsicum, tomato, corn, paneer" }],
      ["Farm Fresh Pizza", [170, 240, 310], { description: "Olives, jalapeño, mushroom, onion, capsicum, tomato" }],
      ["Peppy Paneer Pizza", [170, 240, 310], { description: "Onion, capsicum, jalapeño, red paprika, paneer" }],
      ["Cafe Special Pizza", [null, 240, 340]],
      ["Tandoori Paneer Pizza", [null, 240, 340]],
      ["Vegie Delight Pizza", [null, 240, 340], { tag: "special" }],
      ["Makhni Paneer Pizza", [null, 260, 360], { tag: "special" }],
    ],
  },
  {
    name: "Momos", icon: "momos", sizes: [],
    dishes: [["Steam Momos (8 pc)", [100]], ["Kurkure Momos (8 pc)", [120]], ["Chilli Momos", [120]]],
  },
  {
    name: "Combos", icon: "combo", sizes: [],
    dishes: [
      ["Veg Combo", [110], { description: "Veg burger, fries and a cold drink" }],
      ["Family Combo", [399], { description: "4 aloo tikki burgers, paneer sandwich, fries and a cold drink (750 ml)" }],
    ],
  },
  {
    name: "Desserts", icon: "dessert", sizes: [], note: "Extra dips ₹20",
    dishes: [
      ["Brownie", [90], { dietary: "unspecified" }],
      ["Choco Lava", [90], { dietary: "unspecified" }],
      ["Brownie with Ice Cream", [120], { dietary: "unspecified" }],
    ],
  },
];

export type SeedResult = "created" | "exists";

/**
 * Creates the demo owner, café and menu. Idempotent: does nothing if the demo owner exists,
 * unless `reset` is set, in which case the demo owner (and everything they own) is recreated.
 */
export async function seedDemo(db: Db, options: { scryptCost: number; reset?: boolean }): Promise<SeedResult> {
  const existing = await db.user.findUnique({ where: { phone: DEMO_OWNER.phone }, select: { id: true } });
  if (existing && !options.reset) return "exists";

  const passwordHash = await hashPassword(DEMO_OWNER.password, options.scryptCost);

  await db.$transaction(
    async (tx) => {
      // Deleting the user cascades to the café, its sections and dishes.
      if (existing) await tx.user.delete({ where: { id: existing.id } });

      const user = await tx.user.create({
        data: {
          name: "Demo Owner",
          phone: DEMO_OWNER.phone,
          passwordHash,
          cafe: {
            create: {
              name: "Cafe Bites",
              slug: DEMO_OWNER.slug,
              tagline: "Not just a coffee shop, but much more",
              address: "Fauji Road, Kotkapura",
              phone: "+91 95173 01313",
              notices: ["Please wait 15–20 minutes after ordering", "Counter order, self service"],
            },
          },
        },
        include: { cafe: true },
      });
      const cafeId = user.cafe!.id;

      for (const [sectionPosition, s] of demoMenu.entries()) {
        const section = await tx.section.create({
          data: {
            cafeId,
            name: s.name,
            icon: s.icon,
            note: s.note ?? "",
            position: sectionPosition,
            sizes: { create: s.sizes.map((label, position) => ({ label, position })) },
          },
          include: { sizes: { orderBy: { position: "asc" } } },
        });

        for (const [position, [name, amounts, extra]] of s.dishes.entries()) {
          const prices = section.sizes.length
            ? section.sizes.flatMap((size, i) => (amounts[i] == null ? [] : [{ sizeId: size.id, amount: amounts[i] }]))
            : [{ sizeId: null, amount: amounts[0]! }];
          await tx.item.create({
            data: {
              cafeId,
              sectionId: section.id,
              position,
              name,
              description: extra?.description ?? "",
              dietary: extra?.dietary ?? "veg",
              tag: extra?.tag ?? "none",
              prices: { create: prices },
            },
          });
        }
      }
    },
    { timeout: 30_000 },
  );

  return "created";
}
