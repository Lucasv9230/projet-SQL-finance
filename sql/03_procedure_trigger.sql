-- Execute after sql/01_schema.sql and sql/02_donnees.sql in Supabase.

CREATE OR REPLACE PROCEDURE public.executer_ordre(
    IN p_client_id bigint,
    IN p_compte_id bigint,
    IN p_titre_id bigint,
    IN p_type text,
    IN p_quantite numeric,
    OUT p_transaction_id bigint
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_prix_unitaire numeric(18, 4);
BEGIN
    IF p_type IS NULL OR p_type NOT IN ('ACHAT', 'VENTE') THEN
        RAISE EXCEPTION 'Le type d''ordre doit etre ACHAT ou VENTE.'
            USING ERRCODE = '22023';
    END IF;

    IF p_quantite IS NULL OR p_quantite <= 0 THEN
        RAISE EXCEPTION 'La quantite doit etre strictement positive.'
            USING ERRCODE = '22023';
    END IF;

    SELECT t.cours_actuel
    INTO v_prix_unitaire
    FROM public.titres AS t
    WHERE t.titre_id = p_titre_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Le titre % n''existe pas.', p_titre_id
            USING ERRCODE = '22023';
    END IF;

    IF v_prix_unitaire <= 0 THEN
        RAISE EXCEPTION 'Le cours du titre % doit etre positif.', p_titre_id
            USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.transactions (
        client_id,
        compte_id,
        titre_id,
        type,
        quantite,
        prix_unitaire
    )
    VALUES (
        p_client_id,
        p_compte_id,
        p_titre_id,
        p_type,
        p_quantite,
        v_prix_unitaire
    )
    RETURNING transaction_id INTO p_transaction_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.controler_et_appliquer_ordre()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_devise_compte char(3);
    v_devise_titre char(3);
    v_cours_actuel numeric(18, 4);
    v_solde numeric(18, 2);
    v_montant numeric(18, 2);
    v_quantite_position numeric(20, 8);
BEGIN
    IF NEW.type IS NULL OR NEW.type NOT IN ('ACHAT', 'VENTE') THEN
        RAISE EXCEPTION 'Le type d''ordre doit etre ACHAT ou VENTE.'
            USING ERRCODE = '23514';
    END IF;

    IF NEW.quantite IS NULL OR NEW.quantite <= 0 THEN
        RAISE EXCEPTION 'La quantite doit etre strictement positive.'
            USING ERRCODE = '23514';
    END IF;

    -- The title row lock keeps the execution price and currency stable.
    SELECT t.devise, t.cours_actuel
    INTO v_devise_titre, v_cours_actuel
    FROM public.titres AS t
    WHERE t.titre_id = NEW.titre_id
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Le titre % n''existe pas.', NEW.titre_id
            USING ERRCODE = '23503';
    END IF;

    IF v_cours_actuel <= 0 THEN
        RAISE EXCEPTION 'Le cours du titre % doit etre positif.', NEW.titre_id
            USING ERRCODE = '23514';
    END IF;

    -- Never trust a price supplied by a direct INSERT.
    NEW.prix_unitaire := v_cours_actuel;
    v_montant := round(NEW.quantite * NEW.prix_unitaire, 2);

    SELECT c.devise, c.solde
    INTO v_devise_compte, v_solde
    FROM public.comptes_especes AS c
    WHERE c.compte_id = NEW.compte_id
      AND c.client_id = NEW.client_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Le compte % n''appartient pas au client %.',
            NEW.compte_id, NEW.client_id
            USING ERRCODE = '23503';
    END IF;

    IF v_devise_compte <> v_devise_titre THEN
        RAISE EXCEPTION 'La devise du compte doit correspondre a celle du titre.'
            USING ERRCODE = '23514';
    END IF;

    IF NEW.type = 'ACHAT' THEN
        IF v_solde < v_montant THEN
            RAISE EXCEPTION 'Solde insuffisant : %, montant requis : %.',
                v_solde, v_montant
                USING ERRCODE = '23514';
        END IF;

        UPDATE public.comptes_especes
        SET solde = solde - v_montant
        WHERE compte_id = NEW.compte_id;

        INSERT INTO public.portefeuilles_positions AS pos (
            client_id,
            titre_id,
            quantite,
            prix_moyen_achat,
            date_premier_achat
        )
        VALUES (
            NEW.client_id,
            NEW.titre_id,
            NEW.quantite,
            NEW.prix_unitaire,
            NEW.date_transaction
        )
        ON CONFLICT (client_id, titre_id)
        DO UPDATE SET
            prix_moyen_achat = round(
                (
                    pos.quantite
                    * pos.prix_moyen_achat
                    + EXCLUDED.quantite * EXCLUDED.prix_moyen_achat
                )
                / (
                    pos.quantite + EXCLUDED.quantite
                ),
                4
            ),
            quantite = pos.quantite + EXCLUDED.quantite,
            date_premier_achat = least(
                pos.date_premier_achat,
                EXCLUDED.date_premier_achat
            );
    ELSE
        SELECT p.quantite
        INTO v_quantite_position
        FROM public.portefeuilles_positions AS p
        WHERE p.client_id = NEW.client_id
          AND p.titre_id = NEW.titre_id
        FOR UPDATE;

        IF NOT FOUND OR v_quantite_position < NEW.quantite THEN
            RAISE EXCEPTION 'Quantite detenue insuffisante pour vendre le titre %.',
                NEW.titre_id
                USING ERRCODE = '23514';
        END IF;

        UPDATE public.comptes_especes
        SET solde = solde + v_montant
        WHERE compte_id = NEW.compte_id;

        IF v_quantite_position = NEW.quantite THEN
            DELETE FROM public.portefeuilles_positions
            WHERE client_id = NEW.client_id
              AND titre_id = NEW.titre_id;
        ELSE
            UPDATE public.portefeuilles_positions
            SET quantite = v_quantite_position - NEW.quantite
            WHERE client_id = NEW.client_id
              AND titre_id = NEW.titre_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS transactions_controler_et_appliquer_ordre
    ON public.transactions;

CREATE TRIGGER transactions_controler_et_appliquer_ordre
BEFORE INSERT ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.controler_et_appliquer_ordre();
