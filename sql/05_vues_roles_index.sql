CREATE OR REPLACE VIEW public.vue_courtier_marche AS
SELECT
    t.titre_id,
    t.symbole,
    t.nom AS nom_titre,
    t.secteur,
    t.devise,
    t.cours_actuel,
    count(p.position_id) AS nb_detenteurs,
    coalesce(sum(p.quantite), 0) AS total_actions_en_circulation
FROM public.titres t
LEFT JOIN public.portefeuilles_positions p ON t.titre_id = p.titre_id
GROUP BY t.titre_id, t.symbole, t.nom, t.secteur, t.devise, t.cours_actuel;

CREATE OR REPLACE VIEW public.vue_audit_transactions AS
SELECT
    tr.transaction_id,
    tr.date_transaction,
    c.client_id,
    c.nom || ' ' || c.prenom AS client_nom_complet,
    c.email,
    ce.compte_id,
    ce.devise AS devise_compte,
    t.symbole,
    t.nom AS nom_titre,
    tr.type AS type_ordre,
    tr.quantite,
    tr.prix_unitaire,
    round(tr.quantite * tr.prix_unitaire, 2) AS montant_total
FROM public.transactions tr
JOIN public.clients c ON tr.client_id = c.client_id
JOIN public.comptes_especes ce ON tr.compte_id = ce.compte_id
JOIN public.titres t ON tr.titre_id = t.titre_id;

ALTER PROCEDURE public.executer_ordre(bigint, bigint, bigint, text, numeric, bigint) SECURITY DEFINER;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'courtier_trader') THEN
        CREATE ROLE courtier_trader;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'auditeur_conformite') THEN
        CREATE ROLE auditeur_conformite;
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'trader_alex') THEN
        CREATE USER trader_alex WITH PASSWORD 'TraderPass2026!';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'auditeur_claire') THEN
        CREATE USER auditeur_claire WITH PASSWORD 'AuditPass2026!';
    END IF;
END;
$$;

GRANT courtier_trader TO trader_alex;
GRANT auditeur_conformite TO auditeur_claire;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
        GRANT trader_alex, auditeur_claire, courtier_trader, auditeur_conformite TO postgres;
    END IF;
END;
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM courtier_trader, auditeur_conformite;

GRANT USAGE ON SCHEMA public TO courtier_trader;
GRANT SELECT ON public.vue_courtier_marche TO courtier_trader;
GRANT EXECUTE ON PROCEDURE public.executer_ordre(bigint, bigint, bigint, text, numeric, bigint) TO courtier_trader;

GRANT USAGE ON SCHEMA public TO auditeur_conformite;
GRANT SELECT ON public.vue_audit_transactions TO auditeur_conformite;

CREATE INDEX IF NOT EXISTS idx_transactions_client_date
ON public.transactions(client_id, date_transaction DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_titre_date
ON public.transactions(titre_id, date_transaction);
