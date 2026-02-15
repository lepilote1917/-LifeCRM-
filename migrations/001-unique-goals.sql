-- Migration: Empêcher les doublons d'objectifs financiers
-- Date: 2026-02-15

-- Nettoyer les doublons existants (garde le plus récent par montant)
DELETE FROM financial_goals
WHERE id NOT IN (
  SELECT MAX(id)
  FROM financial_goals
  GROUP BY amount
);

-- Ajouter contrainte UNIQUE sur amount
ALTER TABLE financial_goals
ADD CONSTRAINT financial_goals_amount_unique UNIQUE (amount);
