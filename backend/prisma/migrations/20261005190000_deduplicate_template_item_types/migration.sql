BEGIN;

UPDATE "BusinessTemplate" AS template
SET "itemTypes" = (
      SELECT COALESCE(jsonb_agg(types.item ORDER BY types.ordinality), '[]'::jsonb)
      FROM (
        SELECT DISTINCT ON (entry.value->>'key')
          entry.value AS item,
          entry.ordinality
        FROM jsonb_array_elements(template."itemTypes") WITH ORDINALITY AS entry(value, ordinality)
        ORDER BY entry.value->>'key', entry.ordinality
      ) AS types
    ),
    "version" = "version" + 1,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE EXISTS (
  SELECT 1
  FROM jsonb_array_elements(template."itemTypes") AS entry(value)
  GROUP BY entry.value->>'key'
  HAVING COUNT(*) > 1
);

COMMIT;
