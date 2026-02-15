-- Supprimer les objectifs dupliqués (garder le plus récent de chaque amount/label)
DELETE FROM financial_goals
WHERE id NOT IN (
  SELECT MAX(id)
  FROM financial_goals
  GROUP BY amount, COALESCE(label, '')
);
