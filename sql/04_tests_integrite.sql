BEGIN;

DO $$
DECLARE
    v_client_id bigint;
    v_compte_cad_id bigint;
    v_compte_usd_id bigint;
    v_titre_id bigint;
    v_transaction_id bigint;
    v_quantite numeric(20, 8);
    v_prix_moyen numeric(18, 4);
    v_solde numeric(18, 2);
BEGIN
    INSERT INTO public.clients (nom, prenom, email)
    VALUES ('Test', 'Membre3', 'membre3.' || txid_current() || '@finance.test')
    RETURNING client_id INTO v_client_id;

    INSERT INTO public.comptes_especes (client_id, solde, devise)
    VALUES (v_client_id, 10000, 'CAD')
    RETURNING compte_id INTO v_compte_cad_id;

    INSERT INTO public.comptes_especes (client_id, solde, devise)
    VALUES (v_client_id, 10000, 'USD')
    RETURNING compte_id INTO v_compte_usd_id;

    INSERT INTO public.titres (symbole, nom, devise, cours_actuel)
    VALUES ('M3-' || txid_current(), 'Titre de test membre 3', 'CAD', 100)
    RETURNING titre_id INTO v_titre_id;

    CALL public.executer_ordre(
        v_client_id, v_compte_cad_id, v_titre_id, 'ACHAT', 10, v_transaction_id
    );

    IF NOT EXISTS (
        SELECT 1
        FROM public.transactions
        WHERE transaction_id = v_transaction_id
          AND prix_unitaire = 100
    ) THEN
        RAISE EXCEPTION 'Echec du test : le premier achat ou son prix est incorrect.';
    END IF;

    UPDATE public.titres SET cours_actuel = 120 WHERE titre_id = v_titre_id;

    CALL public.executer_ordre(
        v_client_id, v_compte_cad_id, v_titre_id, 'ACHAT', 2, v_transaction_id
    );

    SELECT quantite, prix_moyen_achat
    INTO v_quantite, v_prix_moyen
    FROM public.portefeuilles_positions
    WHERE client_id = v_client_id AND titre_id = v_titre_id;

    IF v_quantite IS DISTINCT FROM 12
       OR v_prix_moyen IS DISTINCT FROM 103.3333 THEN
        RAISE EXCEPTION 'Echec du test : quantite ou prix moyen incorrect apres deux achats.';
    END IF;

    CALL public.executer_ordre(
        v_client_id, v_compte_cad_id, v_titre_id, 'VENTE', 4, v_transaction_id
    );

    SELECT quantite INTO v_quantite
    FROM public.portefeuilles_positions
    WHERE client_id = v_client_id AND titre_id = v_titre_id;

    SELECT solde INTO v_solde
    FROM public.comptes_especes
    WHERE compte_id = v_compte_cad_id;

    IF v_quantite IS DISTINCT FROM 8 OR v_solde IS DISTINCT FROM 9240 THEN
        RAISE EXCEPTION 'Echec du test : vente, position ou solde incorrect.';
    END IF;

    INSERT INTO public.transactions (
        client_id, compte_id, titre_id, type, quantite, prix_unitaire
    )
    VALUES (v_client_id, v_compte_cad_id, v_titre_id, 'ACHAT', 1, 1)
    RETURNING transaction_id INTO v_transaction_id;

    IF NOT EXISTS (
        SELECT 1
        FROM public.transactions
        WHERE transaction_id = v_transaction_id
          AND prix_unitaire = 120
    ) THEN
        RAISE EXCEPTION 'Echec du test : le trigger n''a pas impose le cours actuel.';
    END IF;

    SELECT quantite INTO v_quantite
    FROM public.portefeuilles_positions
    WHERE client_id = v_client_id AND titre_id = v_titre_id;

    SELECT solde INTO v_solde
    FROM public.comptes_especes
    WHERE compte_id = v_compte_cad_id;

    IF v_quantite IS DISTINCT FROM 9 OR v_solde IS DISTINCT FROM 9120 THEN
        RAISE EXCEPTION 'Echec du test : le trigger n''a pas applique l''achat direct.';
    END IF;

    BEGIN
        CALL public.executer_ordre(
            v_client_id, v_compte_cad_id, v_titre_id, 'VENTE', 100, v_transaction_id
        );
        RAISE EXCEPTION 'Echec du test : une vente superieure a la position a ete acceptee.'
            USING ERRCODE = 'P0001';
    EXCEPTION
        WHEN SQLSTATE '23514' THEN
            NULL;
    END;

    UPDATE public.comptes_especes
    SET solde = 10
    WHERE compte_id = v_compte_cad_id;

    BEGIN
        CALL public.executer_ordre(
            v_client_id, v_compte_cad_id, v_titre_id, 'ACHAT', 1, v_transaction_id
        );
        RAISE EXCEPTION 'Echec du test : un achat sans fonds suffisants a ete accepte.'
            USING ERRCODE = 'P0001';
    EXCEPTION
        WHEN SQLSTATE '23514' THEN
            NULL;
    END;

    SELECT solde INTO v_solde
    FROM public.comptes_especes
    WHERE compte_id = v_compte_cad_id;

    IF v_solde IS DISTINCT FROM 10 THEN
        RAISE EXCEPTION 'Echec du test : le solde a change apres le rejet d''un achat.';
    END IF;

    BEGIN
        CALL public.executer_ordre(
            v_client_id, v_compte_usd_id, v_titre_id, 'ACHAT', 1, v_transaction_id
        );
        RAISE EXCEPTION 'Echec du test : une devise de compte incompatible a ete acceptee.'
            USING ERRCODE = 'P0001';
    EXCEPTION
        WHEN SQLSTATE '23514' THEN
            NULL;
    END;

    BEGIN
        CALL public.executer_ordre(
            v_client_id, v_compte_cad_id, v_titre_id, 'DON', 1, v_transaction_id
        );
        RAISE EXCEPTION 'Echec du test : un type d''ordre invalide a ete accepte.'
            USING ERRCODE = 'P0001';
    EXCEPTION
        WHEN SQLSTATE '22023' THEN
            NULL;
    END;
END;
$$;

ROLLBACK;
