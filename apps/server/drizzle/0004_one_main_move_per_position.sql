-- One main move per position: older PGN imports (several games, e.g. Chessable chapters) could
-- mark several moves of a position as main. Keep the first one imported (lowest id).
UPDATE `rep_moves` SET `is_main` = 0
WHERE `is_main` = 1
  AND `id` NOT IN (SELECT MIN(`id`) FROM `rep_moves` WHERE `is_main` = 1 GROUP BY `repertoire_id`, `from_fen`);
