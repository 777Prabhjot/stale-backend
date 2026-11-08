-- AlterTable
ALTER TABLE "sections" ADD COLUMN     "icon" TEXT NOT NULL DEFAULT 'none';

-- One-time fill for existing sections, using the same keyword rules as the frontend's
-- suggestSectionIcon() (frontend/src/lib/section-icons.ts). \m = start of a word.
UPDATE "sections" SET "icon" = CASE
  WHEN "name" ~* '\m(shake|smoothie|milkshake)' THEN 'shake'
  WHEN "name" ~* '\m(mojito|cooler|lemonade|soda|lime|mocktail)' THEN 'mojito'
  WHEN "name" ~* '\m(coffee|espresso|latte|cappuccino|kaapi)' THEN 'coffee'
  WHEN "name" ~* '\m(tea|chai)' THEN 'tea'
  WHEN "name" ~* '\m(cold drink|soft drink|beverage|drink|juice)' THEN 'cold-drink'
  WHEN "name" ~* '\m(ice ?cream|sundae|kulfi|gelato)' THEN 'ice-cream'
  WHEN "name" ~* '\m(dessert|cake|brownie|sweet|waffle|pastr|bakery)' THEN 'dessert'
  WHEN "name" ~* '\mpizza' THEN 'pizza'
  WHEN "name" ~* '\mburger' THEN 'burger'
  WHEN "name" ~* '\m(garlic|bread)' THEN 'garlic-bread'
  WHEN "name" ~* '\m(sandwich|toast)' THEN 'sandwich'
  WHEN "name" ~* '\m(momo|dumpling|dim ?sum)' THEN 'momos'
  WHEN "name" ~* '\m(fries|snack|starter|nacho)' THEN 'fries'
  WHEN "name" ~* '\m(pasta|noodle|maggi|chowmein|spaghetti)' THEN 'pasta'
  WHEN "name" ~* '\m(wrap|roll|frankie|shawarma|kathi)' THEN 'wrap'
  WHEN "name" ~* '\m(combo|meal|thali|platter|offer)' THEN 'combo'
  ELSE 'none'
END;
