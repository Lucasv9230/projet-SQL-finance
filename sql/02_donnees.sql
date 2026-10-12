-- Jeu de donnees de demonstration pour la plateforme de courtage.
-- A executer une seule fois apres sql/01_schema.sql dans Supabase.

BEGIN;

-- Evite de creer des doublons si le script est relance par erreur.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.clients)
        OR EXISTS (SELECT 1 FROM public.comptes_especes)
        OR EXISTS (SELECT 1 FROM public.titres)
        OR EXISTS (SELECT 1 FROM public.portefeuilles_positions)
        OR EXISTS (SELECT 1 FROM public.transactions)
    THEN
        RAISE EXCEPTION 'Les tables metier ne sont pas vides. Le jeu de donnees n''a pas ete insere.';
    END IF;
END;
$$;

-- Cree 500 clients avec des noms et des dates d'inscription varies.
INSERT INTO public.clients (nom, prenom, email, date_inscription)
SELECT
    (ARRAY['Tremblay', 'Gagnon', 'Roy', 'Cote', 'Bouchard', 'Gauthier',
           'Morin', 'Lavoie', 'Fortin', 'Gagne'])[((numero - 1) % 10) + 1],
    (ARRAY['Alexandre', 'Camille', 'Sophie', 'Thomas', 'Lea', 'Gabriel',
           'Emma', 'Felix', 'Mia', 'Nathan'])[((numero * 7 - 1) % 10) + 1],
    'demo.client.' || lpad(numero::text, 5, '0') || '@finance.test',
    now() - make_interval(days => 365 + ((numero * 37) % 1095))
FROM generate_series(1, 500) AS serie(numero);
FROM generate_series(1, 500) AS numero;

-- Les soldes en CAD sont suffisants pour les achats de demonstration.
INSERT INTO public.comptes_especes (client_id, solde, devise, date_ouverture)
SELECT
    client_id,
    75000 + ((client_id * 97) % 25000),
    'CAD',
    date_inscription + make_interval(days => (1 + (client_id % 30))::integer)
FROM public.clients
WHERE email LIKE 'demo.client.%@finance.test';

-- Cours de demonstration en CAD, bases sur des titres cotes au Canada.
INSERT INTO public.titres (symbole, nom, secteur, devise, cours_actuel)
VALUES
    ('RY.TO', 'Banque Royale du Canada', 'Finance', 'CAD', 160.00),
    ('TD.TO', 'Groupe Banque TD', 'Finance', 'CAD', 85.00),
    ('BNS.TO', 'Banque Scotia', 'Finance', 'CAD', 70.00),
    ('BMO.TO', 'Banque de Montreal', 'Finance', 'CAD', 140.00),
    ('CM.TO', 'Banque CIBC', 'Finance', 'CAD', 80.00),
    ('ENB.TO', 'Enbridge', 'Energie', 'CAD', 55.00),
    ('CNQ.TO', 'Canadian Natural Resources', 'Energie', 'CAD', 50.00),
    ('SU.TO', 'Suncor Energie', 'Energie', 'CAD', 55.00),
    ('CNR.TO', 'Compagnie des chemins de fer nationaux', 'Transport', 'CAD', 150.00),
    ('CP.TO', 'Chemin de fer Canadien Pacifique Kansas City', 'Transport', 'CAD', 110.00),
    ('SHOP.TO', 'Shopify', 'Technologie', 'CAD', 140.00),
    ('CSU.TO', 'Constellation Software', 'Technologie', 'CAD', 4000.00),
    ('BAM.TO', 'Brookfield Asset Management', 'Finance', 'CAD', 75.00),
    ('TRI.TO', 'Thomson Reuters', 'Technologie', 'CAD', 220.00),
    ('ATD.TO', 'Alimentation Couche-Tard', 'Consommation', 'CAD', 80.00),
    ('MFC.TO', 'Financiere Manuvie', 'Finance', 'CAD', 45.00),
    ('SLF.TO', 'Sun Life Financial', 'Finance', 'CAD', 85.00),
    ('WCN.TO', 'Waste Connections', 'Industrie', 'CAD', 250.00),
    ('NTR.TO', 'Nutrien', 'Materiaux', 'CAD', 75.00),
    ('TECK.B.TO', 'Teck Resources', 'Materiaux', 'CAD', 65.00);

-- Genere 40 ordres par client : 20 achats, puis les ventes associees.
-- Les ventes portent sur une quantite inferieure aux achats precedents.
WITH clients_demo AS (
    SELECT
        client_id,
           (substring(email FROM '^demo[.]client[.]([0-9]+)@'))::integer AS numero_client
    FROM public.clients
    WHERE email LIKE 'demo.client.%@finance.test'
),
comptes_demo AS (
    SELECT compte_id, client_id
    FROM public.comptes_especes
),
titres_demo AS (
    SELECT
        titre_id,
        cours_actuel,
        row_number() OVER (ORDER BY titre_id)::integer AS numero_titre
    FROM public.titres
),
ordres AS (
    SELECT
        clients_demo.client_id,
        clients_demo.numero_client,
        comptes_demo.compte_id,
        numero_ordre,
        CASE WHEN numero_ordre <= 20 THEN numero_ordre ELSE numero_ordre - 20 END AS numero_paire,
        CASE WHEN numero_ordre <= 20 THEN 'ACHAT' ELSE 'VENTE' END AS type_ordre,
        ((CASE WHEN numero_ordre <= 20 THEN numero_ordre ELSE numero_ordre - 20 END - 1) % 10) + 1 AS numero_titre,
        CASE
            WHEN numero_ordre <= 20
                THEN 5 + ((clients_demo.numero_client * 13 + numero_ordre * 7) % 6)
            ELSE 1 + ((clients_demo.numero_client * 11 + (numero_ordre - 20) * 3) % 4)
        END AS quantite,
        numero_ordre
    FROM clients_demo
    JOIN comptes_demo USING (client_id)
    CROSS JOIN generate_series(1, 40) AS numero_ordre
    CROSS JOIN generate_series(1, 40) AS serie(numero_ordre)
)
INSERT INTO public.transactions (
    client_id, compte_id, titre_id, type, quantite, prix_unitaire, date_transaction
)
SELECT
    ordres.client_id,
    ordres.compte_id,
    titres_demo.titre_id,
    ordres.type_ordre,
    ordres.quantite,
    round(
        titres_demo.cours_actuel *
        CASE
            WHEN ordres.type_ordre = 'ACHAT'
                THEN 0.95 + ((ordres.numero_client * 17 + ordres.numero_paire * 13) % 11) / 100.0
            ELSE 0.95 + ((ordres.numero_client * 19 + ordres.numero_paire * 7) % 16) / 100.0
        END,
        4
    ),
    comptes_especes.date_ouverture + make_interval(days => ordres.numero_ordre * 7)
FROM ordres
JOIN titres_demo USING (numero_titre)
JOIN public.comptes_especes USING (compte_id);

-- Calcule les positions restantes et le prix moyen depuis l'historique insere.
INSERT INTO public.portefeuilles_positions (
    client_id, titre_id, quantite, prix_moyen_achat, date_premier_achat
)
SELECT
    client_id,
    titre_id,
    sum(CASE WHEN type = 'ACHAT' THEN quantite ELSE -quantite END),
    round(
        sum(CASE WHEN type = 'ACHAT' THEN quantite * prix_unitaire ELSE 0 END)
        / sum(CASE WHEN type = 'ACHAT' THEN quantite ELSE 0 END),
        4
    ),
    min(date_transaction) FILTER (WHERE type = 'ACHAT')
FROM public.transactions
GROUP BY client_id, titre_id
HAVING sum(CASE WHEN type = 'ACHAT' THEN quantite ELSE -quantite END) > 0;

COMMIT;