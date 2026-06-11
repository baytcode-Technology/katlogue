-- Reference industries (Shopify-style parent + sub-industry)
CREATE TABLE IF NOT EXISTS public.industries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES public.industries (id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT industries_slug_unique UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS idx_industries_parent_id ON public.industries (parent_id);
CREATE INDEX IF NOT EXISTS idx_industries_sort_order ON public.industries (sort_order);

ALTER TABLE public.industries ENABLE ROW LEVEL SECURITY;

CREATE POLICY industries_select_authenticated
  ON public.industries
  FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY industries_select_anon
  ON public.industries
  FOR SELECT
  TO anon
  USING (is_active = true);

-- Parent industries
INSERT INTO public.industries (parent_id, name, slug, sort_order) VALUES
  (NULL, 'Apparel & Accessories', 'apparel-accessories', 1),
  (NULL, 'Beauty & Personal Care', 'beauty-personal-care', 2),
  (NULL, 'Electronics', 'electronics', 3),
  (NULL, 'Food & Beverage', 'food-beverage', 4),
  (NULL, 'Health & Wellness', 'health-wellness', 5),
  (NULL, 'Home & Garden', 'home-garden', 6),
  (NULL, 'Baby & Kids', 'baby-kids', 7),
  (NULL, 'Pet Supplies', 'pet-supplies', 8),
  (NULL, 'Sports & Outdoors', 'sports-outdoors', 9),
  (NULL, 'Arts & Crafts', 'arts-crafts', 10),
  (NULL, 'Automotive', 'automotive', 11),
  (NULL, 'Books & Media', 'books-media', 12),
  (NULL, 'Services', 'services', 13)
ON CONFLICT (slug) DO NOTHING;

-- Sub-industries: Apparel & Accessories
INSERT INTO public.industries (parent_id, name, slug, sort_order)
SELECT p.id, v.name, v.slug, v.sort_order
FROM public.industries p
CROSS JOIN (VALUES
  ('Clothing', 'clothing', 1),
  ('Shoes', 'shoes', 2),
  ('Jewelry', 'jewelry', 3),
  ('Bags & Luggage', 'bags-luggage', 4),
  ('Watches', 'watches', 5)
) AS v(name, slug, sort_order)
WHERE p.slug = 'apparel-accessories'
ON CONFLICT (slug) DO NOTHING;

-- Beauty & Personal Care
INSERT INTO public.industries (parent_id, name, slug, sort_order)
SELECT p.id, v.name, v.slug, v.sort_order
FROM public.industries p
CROSS JOIN (VALUES
  ('Skincare', 'skincare', 1),
  ('Hair Care', 'hair-care', 2),
  ('Makeup', 'makeup', 3),
  ('Fragrance', 'fragrance', 4),
  ('Personal Care', 'personal-care', 5)
) AS v(name, slug, sort_order)
WHERE p.slug = 'beauty-personal-care'
ON CONFLICT (slug) DO NOTHING;

-- Electronics
INSERT INTO public.industries (parent_id, name, slug, sort_order)
SELECT p.id, v.name, v.slug, v.sort_order
FROM public.industries p
CROSS JOIN (VALUES
  ('Mobile Phones', 'mobile-phones', 1),
  ('Computers & Laptops', 'computers-laptops', 2),
  ('Audio & Headphones', 'audio-headphones', 3),
  ('Cameras', 'cameras', 4),
  ('Accessories', 'electronics-accessories', 5)
) AS v(name, slug, sort_order)
WHERE p.slug = 'electronics'
ON CONFLICT (slug) DO NOTHING;

-- Food & Beverage
INSERT INTO public.industries (parent_id, name, slug, sort_order)
SELECT p.id, v.name, v.slug, v.sort_order
FROM public.industries p
CROSS JOIN (VALUES
  ('Groceries', 'groceries', 1),
  ('Snacks', 'snacks', 2),
  ('Beverages', 'beverages', 3),
  ('Bakery', 'bakery', 4),
  ('Restaurant & Takeaway', 'restaurant-takeaway', 5)
) AS v(name, slug, sort_order)
WHERE p.slug = 'food-beverage'
ON CONFLICT (slug) DO NOTHING;

-- Health & Wellness
INSERT INTO public.industries (parent_id, name, slug, sort_order)
SELECT p.id, v.name, v.slug, v.sort_order
FROM public.industries p
CROSS JOIN (VALUES
  ('Supplements', 'supplements', 1),
  ('Fitness Equipment', 'fitness-equipment', 2),
  ('Medical Supplies', 'medical-supplies', 3),
  ('Ayurveda & Herbal', 'ayurveda-herbal', 4)
) AS v(name, slug, sort_order)
WHERE p.slug = 'health-wellness'
ON CONFLICT (slug) DO NOTHING;

-- Home & Garden
INSERT INTO public.industries (parent_id, name, slug, sort_order)
SELECT p.id, v.name, v.slug, v.sort_order
FROM public.industries p
CROSS JOIN (VALUES
  ('Furniture', 'furniture', 1),
  ('Kitchen & Dining', 'kitchen-dining', 2),
  ('Home Decor', 'home-decor', 3),
  ('Garden & Outdoor', 'garden-outdoor', 4),
  ('Appliances', 'home-appliances', 5)
) AS v(name, slug, sort_order)
WHERE p.slug = 'home-garden'
ON CONFLICT (slug) DO NOTHING;

-- Baby & Kids
INSERT INTO public.industries (parent_id, name, slug, sort_order)
SELECT p.id, v.name, v.slug, v.sort_order
FROM public.industries p
CROSS JOIN (VALUES
  ('Baby Clothing', 'baby-clothing', 1),
  ('Toys', 'toys', 2),
  ('Kids Clothing', 'kids-clothing', 3),
  ('School Supplies', 'school-supplies', 4)
) AS v(name, slug, sort_order)
WHERE p.slug = 'baby-kids'
ON CONFLICT (slug) DO NOTHING;

-- Pet Supplies
INSERT INTO public.industries (parent_id, name, slug, sort_order)
SELECT p.id, v.name, v.slug, v.sort_order
FROM public.industries p
CROSS JOIN (VALUES
  ('Pet Food', 'pet-food', 1),
  ('Pet Accessories', 'pet-accessories', 2),
  ('Grooming', 'pet-grooming', 3)
) AS v(name, slug, sort_order)
WHERE p.slug = 'pet-supplies'
ON CONFLICT (slug) DO NOTHING;

-- Sports & Outdoors
INSERT INTO public.industries (parent_id, name, slug, sort_order)
SELECT p.id, v.name, v.slug, v.sort_order
FROM public.industries p
CROSS JOIN (VALUES
  ('Sportswear', 'sportswear', 1),
  ('Fitness', 'sports-fitness', 2),
  ('Outdoor Gear', 'outdoor-gear', 3),
  ('Cycling', 'cycling', 4)
) AS v(name, slug, sort_order)
WHERE p.slug = 'sports-outdoors'
ON CONFLICT (slug) DO NOTHING;

-- Arts & Crafts
INSERT INTO public.industries (parent_id, name, slug, sort_order)
SELECT p.id, v.name, v.slug, v.sort_order
FROM public.industries p
CROSS JOIN (VALUES
  ('Art Supplies', 'art-supplies', 1),
  ('Handmade', 'handmade', 2),
  ('Craft Materials', 'craft-materials', 3)
) AS v(name, slug, sort_order)
WHERE p.slug = 'arts-crafts'
ON CONFLICT (slug) DO NOTHING;

-- Automotive
INSERT INTO public.industries (parent_id, name, slug, sort_order)
SELECT p.id, v.name, v.slug, v.sort_order
FROM public.industries p
CROSS JOIN (VALUES
  ('Car Accessories', 'car-accessories', 1),
  ('Bike Accessories', 'bike-accessories', 2),
  ('Parts & Tools', 'auto-parts-tools', 3)
) AS v(name, slug, sort_order)
WHERE p.slug = 'automotive'
ON CONFLICT (slug) DO NOTHING;

-- Books & Media
INSERT INTO public.industries (parent_id, name, slug, sort_order)
SELECT p.id, v.name, v.slug, v.sort_order
FROM public.industries p
CROSS JOIN (VALUES
  ('Books', 'books', 1),
  ('Music', 'music', 2),
  ('Movies & Games', 'movies-games', 3)
) AS v(name, slug, sort_order)
WHERE p.slug = 'books-media'
ON CONFLICT (slug) DO NOTHING;

-- Services
INSERT INTO public.industries (parent_id, name, slug, sort_order)
SELECT p.id, v.name, v.slug, v.sort_order
FROM public.industries p
CROSS JOIN (VALUES
  ('Consulting', 'consulting', 1),
  ('Repairs & Maintenance', 'repairs-maintenance', 2),
  ('Education & Training', 'education-training', 3),
  ('Events', 'events', 4)
) AS v(name, slug, sort_order)
WHERE p.slug = 'services'
ON CONFLICT (slug) DO NOTHING;
