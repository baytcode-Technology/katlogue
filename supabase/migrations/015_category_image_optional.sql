-- Category cover image is optional (null when not set).
ALTER TABLE public.categories
  ALTER COLUMN image_url DROP NOT NULL;

UPDATE public.categories
  SET image_url = NULL
  WHERE image_url = '';
