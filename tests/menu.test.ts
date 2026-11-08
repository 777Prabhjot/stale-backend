import { describe, expect, it } from "vitest";
import { createSection, dish, useTestApp } from "./helpers.ts";

const { owner, agent } = useTestApp();

describe("sections", () => {
  it("creates sections in order and rejects a duplicate name (any case)", async () => {
    const { client } = await owner();
    await createSection(client, { name: "Coffee" });
    await createSection(client, { name: "Pizza", sizes: ["Small", "Med", "Large"], note: "Add any topping for ₹20" });

    const dup = await client.post("/api/sections").send({ name: "coffee", note: "", sizes: [] });
    expect(dup.status).toBe(409);
    expect(dup.body.error.fieldErrors).toEqual({ name: "You already have a section with this name" });

    const { body } = await client.get("/api/cafe");
    expect(body.cafe.sections.map((s: { name: string }) => s.name)).toEqual(["Coffee", "Pizza"]);
    expect(body.cafe.sections[1].sizes.map((s: { label: string }) => s.label)).toEqual(["Small", "Med", "Large"]);
  });

  it("saves a section icon, defaults to none, and rejects unknown icons", async () => {
    const { client } = await owner();
    const pizza = await client.post("/api/sections").send({ name: "Pizza", note: "", sizes: [], icon: "pizza" });
    expect(pizza.body.section.icon).toBe("pizza");
    const plain = await createSection(client, { name: "Specials" });
    expect((plain as { icon?: string }).icon).toBe("none");

    const changed = await client.put(`/api/sections/${pizza.body.section.id}`).send({ name: "Pizza", note: "", sizes: [], icon: "burger" });
    expect(changed.body.section.icon).toBe("burger");

    const bad = await client.post("/api/sections").send({ name: "Odd", note: "", sizes: [], icon: "rocket" });
    expect(bad.status).toBe(400);
    expect(bad.body.error.fieldErrors).toEqual({ icon: "Choose an icon from the list" });
  });

  it("rejects duplicate size names with a field error on that size", async () => {
    const { client } = await owner();
    const res = await client.post("/api/sections").send({ name: "Shakes", note: "", sizes: [{ label: "Reg" }, { label: "reg" }] });
    expect(res.status).toBe(400);
    expect(res.body.error.fieldErrors).toEqual({ "sizes.1.label": "Each size needs a different name" });
  });

  it("moves a single price to the first size when sizes are added", async () => {
    const { client } = await owner();
    const coolers = await createSection(client, { name: "Coolers" });
    const created = await client.post("/api/items").send(dish(coolers.id, { base: 50 }));

    const res = await client.put(`/api/sections/${coolers.id}`).send({ name: "Coolers", note: "", sizes: [{ label: "Reg" }, { label: "Large" }] });
    const [reg] = res.body.section.sizes;
    const { body } = await client.get(`/api/items/${created.body.item.id}`);
    expect(body.item.prices).toEqual({ [reg.id]: 50 });
  });

  it("keeps the first available size price when sizes are removed", async () => {
    const { client } = await owner();
    const pizza = await createSection(client, { name: "Pizza", sizes: ["Small", "Med", "Large"] });
    const [, med, large] = pizza.sizes;
    const created = await client.post("/api/items").send(dish(pizza.id, { [med!.id]: 240, [large!.id]: 340 }));

    await client.put(`/api/sections/${pizza.id}`).send({ name: "Pizza", note: "", sizes: [] });
    const { body } = await client.get(`/api/items/${created.body.item.id}`);
    expect(body.item.prices).toEqual({ base: 240 });
  });

  it("keeps prices on renamed sizes and drops prices of removed sizes", async () => {
    const { client } = await owner();
    const coffee = await createSection(client, { name: "Coffee", sizes: ["Reg", "Large"] });
    const [reg, large] = coffee.sizes;
    const created = await client.post("/api/items").send(dish(coffee.id, { [reg!.id]: 40, [large!.id]: 60 }));

    // The "Small / Med / Large" preset reuses existing ids by position.
    const res = await client.put(`/api/sections/${coffee.id}`).send({
      name: "Coffee",
      note: "",
      sizes: [{ sizeId: reg!.id, label: "Small" }, { sizeId: large!.id, label: "Med" }, { label: "Large" }],
    });
    expect(res.status).toBe(200);
    const sizes = res.body.section.sizes;
    expect(sizes.map((s: { label: string }) => s.label)).toEqual(["Small", "Med", "Large"]);
    let item = (await client.get(`/api/items/${created.body.item.id}`)).body.item;
    expect(item.prices).toEqual({ [reg!.id]: 40, [large!.id]: 60 });

    // Drop "Med" (was Large=60): its price goes with it.
    await client.put(`/api/sections/${coffee.id}`).send({
      name: "Coffee",
      note: "",
      sizes: [{ sizeId: sizes[0].id, label: "Small" }, { sizeId: sizes[2].id, label: "Large" }],
    });
    item = (await client.get(`/api/items/${created.body.item.id}`)).body.item;
    expect(item.prices).toEqual({ [reg!.id]: 40 });
  });

  it("won't delete a section that still has dishes", async () => {
    const { client } = await owner();
    const momos = await createSection(client, { name: "Momos" });
    const created = await client.post("/api/items").send(dish(momos.id, { base: 100 }));

    const blocked = await client.delete(`/api/sections/${momos.id}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.message).toBe("This section still has 1 dish. Move or delete them first.");

    await client.delete(`/api/items/${created.body.item.id}`);
    const ok = await client.delete(`/api/sections/${momos.id}`);
    expect(ok.status).toBe(200);
    expect(ok.body.cafe.sections).toEqual([]);
  });

  it("reorders sections", async () => {
    const { client } = await owner();
    await createSection(client, { name: "Starters" });
    const b = await createSection(client, { name: "Mains" });
    await createSection(client, { name: "Desserts" });

    const res = await client.post(`/api/sections/${b.id}/move`).send({ direction: "up" });
    expect(res.body.cafe.sections.map((s: { name: string }) => s.name)).toEqual(["Mains", "Starters", "Desserts"]);
    const edge = await client.post(`/api/sections/${b.id}/move`).send({ direction: "up" });
    expect(edge.body.cafe.sections.map((s: { name: string }) => s.name)).toEqual(["Mains", "Starters", "Desserts"]);
    expect((await client.post(`/api/sections/${b.id}/move`).send({ direction: "sideways" })).status).toBe(400);
  });
});

describe("dishes", () => {
  it("creates a dish with prices only for the section's own sizes", async () => {
    const { client } = await owner();
    const pizza = await createSection(client, { name: "Pizza", sizes: ["Small", "Med", "Large"] });
    const other = await createSection(client, { name: "Other", sizes: ["Half"] });
    const [, med] = pizza.sizes;

    const res = await client
      .post("/api/items")
      .send(dish(pizza.id, { [med!.id]: 240, [other.sizes[0]!.id]: 999, base: 1 }, { name: "Farm Fresh", tag: "special" }));
    expect(res.status).toBe(201);
    expect(res.body.item).toMatchObject({ name: "Farm Fresh", tag: "special", prices: { [med!.id]: 240 }, position: 0 });
  });

  it("validates prices and discounts with the shared rules", async () => {
    const { client } = await owner();
    const pizza = await createSection(client, { name: "Pizza", sizes: ["Med", "Large"] });
    const [med, large] = pizza.sizes;

    const noPrice = await client.post("/api/items").send(dish(pizza.id, {}));
    expect(noPrice.body.error.fieldErrors).toEqual({ prices: "Enter at least one price" });

    const tooMuch = await client
      .post("/api/items")
      .send(dish(pizza.id, { [med!.id]: 250, [large!.id]: 350 }, { discountType: "flat", discountValue: 260 }));
    expect(tooMuch.body.error.fieldErrors).toEqual({ discountValue: "Discount must be less than the lowest price" });

    const ok = await client
      .post("/api/items")
      .send(dish(pizza.id, { [med!.id]: 250 }, { discountType: "percent", discountValue: 10 }));
    expect(ok.body.item).toMatchObject({ discountType: "percent", discountValue: 10 });
  });

  it("puts a dish moved to another section at the end of it", async () => {
    const { client } = await owner();
    const a = await createSection(client, { name: "Starters" });
    const b = await createSection(client, { name: "Mains" });
    await client.post("/api/items").send(dish(b.id, { base: 10 }, { name: "B1" }));
    const moving = (await client.post("/api/items").send(dish(a.id, { base: 20 }, { name: "Mover" }))).body.item;

    const res = await client.put(`/api/items/${moving.id}`).send(dish(b.id, { base: 25 }, { name: "Mover" }));
    expect(res.body.item).toMatchObject({ sectionId: b.id, position: 1, prices: { base: 25 } });
  });

  it("toggles availability, reorders, and deletes", async () => {
    const { client } = await owner();
    const s = await createSection(client, { name: "Coffee" });
    const first = (await client.post("/api/items").send(dish(s.id, { base: 40 }, { name: "Black" }))).body.item;
    const second = (await client.post("/api/items").send(dish(s.id, { base: 50 }, { name: "Espresso" }))).body.item;

    const sold = await client.patch(`/api/items/${first.id}/availability`).send({ isAvailable: false });
    expect(sold.body.item.isAvailable).toBe(false);

    const moved = await client.post(`/api/items/${second.id}/move`).send({ direction: "up" });
    const order = [...moved.body.items].sort((x, y) => x.position - y.position).map((i: { name: string }) => i.name);
    expect(order).toEqual(["Espresso", "Black"]);

    expect((await client.delete(`/api/items/${first.id}`)).status).toBe(204);
    expect((await client.get(`/api/items/${first.id}`)).status).toBe(404);
  });
});

describe("owners can only touch their own menu", () => {
  it("returns 404 for another café's dishes and sections", async () => {
    const alice = await owner();
    const bob = await owner();
    const section = await createSection(alice.client, { name: "Coffee" });
    const item = (await alice.client.post("/api/items").send(dish(section.id, { base: 40 }))).body.item;

    expect((await bob.client.get(`/api/items/${item.id}`)).status).toBe(404);
    expect((await bob.client.put(`/api/items/${item.id}`).send(dish(section.id, { base: 1 }))).status).toBe(404);
    expect((await bob.client.patch(`/api/items/${item.id}/availability`).send({ isAvailable: false })).status).toBe(404);
    expect((await bob.client.post(`/api/items/${item.id}/move`).send({ direction: "up" })).status).toBe(404);
    expect((await bob.client.delete(`/api/items/${item.id}`)).status).toBe(404);
    expect((await bob.client.put(`/api/sections/${section.id}`).send({ name: "Mine", note: "", sizes: [] })).status).toBe(404);
    expect((await bob.client.delete(`/api/sections/${section.id}`)).status).toBe(404);

    // Bob can't add a dish into Alice's section either.
    const sneaky = await bob.client.post("/api/items").send(dish(section.id, { base: 1 }));
    expect(sneaky.status).toBe(400);
    expect(sneaky.body.error.fieldErrors).toEqual({ sectionId: "Choose a section" });

    expect((await bob.client.get("/api/items")).body.items).toEqual([]);
    expect((await alice.client.get(`/api/items/${item.id}`)).body.item.prices).toEqual({ base: 40 });
  });
});

describe("café profile and public menu", () => {
  it("updates the profile, normalises links, and blocks a taken menu link", async () => {
    const alice = await owner({ slug: "alice-cafe" });
    const bob = await owner();
    const profile = {
      name: "Bob's",
      slug: "alice-cafe",
      tagline: "",
      address: "",
      phone: "",
      currency: "INR",
      logo: "",
      notices: ["Counter order, self service"],
      instagram: "instagram.com/bobs",
      facebook: "",
      zomato: "",
      swiggy: "",
    };
    const taken = await bob.client.patch("/api/cafe").send(profile);
    expect(taken.status).toBe(409);
    expect(taken.body.error.fieldErrors).toEqual({ slug: "This menu link is taken. Try another." });

    const ok = await bob.client.patch("/api/cafe").send({ ...profile, slug: "bobs" });
    expect(ok.body.cafe).toMatchObject({ slug: "bobs", instagram: "https://instagram.com/bobs", notices: ["Counter order, self service"] });

    const tooMany = await bob.client.patch("/api/cafe").send({ ...profile, slug: "bobs", notices: ["a", "b", "c", "d", "e"] });
    expect(tooMany.status).toBe(400);
    expect(alice.cafe.slug).toBe("alice-cafe");
  });

  it("serves the public menu without signing in, and only public fields", async () => {
    const { client, cafe } = await owner();
    const s = await createSection(client, { name: "Coffee", sizes: ["Reg", "Large"] });
    await client.post("/api/items").send(dish(s.id, { [s.sizes[0]!.id]: 40 }, { name: "Black Coffee" }));

    const res = await agent().get(`/api/public/menus/${cafe.slug}`);
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-cache");
    expect(res.body.cafe).toMatchObject({ name: cafe.name, sections: [{ name: "Coffee" }] });
    expect(res.body.items).toHaveLength(1);

    const json = JSON.stringify(res.body);
    for (const secret of ["ownerId", "passwordHash", "failedLogins", "owner"]) expect(json).not.toContain(`"${secret}"`);
  });

  it("returns 404 for unknown or malformed menu links", async () => {
    expect((await agent().get("/api/public/menus/nobody")).status).toBe(404);
    expect((await agent().get("/api/public/menus/NOT%20A%20SLUG")).status).toBe(404);
  });
});
