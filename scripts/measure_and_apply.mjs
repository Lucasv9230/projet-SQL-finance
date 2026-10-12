import pg from 'pg';

const client = new pg.Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  port: 5432,
  user: 'postgres.cqkeiqpuvklxrenpywxd',
  password: 'otpI75R4IiqdxFei',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  console.log('Connecté à Supabase.');

  // Requête 1 de test (recherche transactions d'un client par date)
  const q1 = `
    EXPLAIN (ANALYZE, BUFFERS)
    SELECT transaction_id, titre_id, type, quantite, prix_unitaire, date_transaction
    FROM public.transactions
    WHERE client_id = 42
      AND date_transaction >= '2025-01-01'
    ORDER BY date_transaction DESC;
  `;

  // Requête 2 de test (agrégation par titre et date)
  const q2 = `
    EXPLAIN (ANALYZE, BUFFERS)
    SELECT type, sum(quantite) as total_volume, round(avg(prix_unitaire), 2) as prix_moyen
    FROM public.transactions
    WHERE titre_id = 11
      AND date_transaction >= '2025-01-01'
    GROUP BY type;
  `;

  console.log('\n--- MESURE AVANT INDEX ---');
  // Supprimer les index s'ils existent déjà pour une mesure propre avant
  await client.query(`DROP INDEX IF EXISTS public.idx_transactions_client_date;`);
  await client.query(`DROP INDEX IF EXISTS public.idx_transactions_titre_date;`);

  const resBefore1 = await client.query(q1);
  const planBefore1 = resBefore1.rows.map(r => r['QUERY PLAN']).join('\n');
  console.log('Plan 1 AVANT index :\n' + planBefore1);

  const resBefore2 = await client.query(q2);
  const planBefore2 = resBefore2.rows.map(r => r['QUERY PLAN']).join('\n');
  console.log('\nPlan 2 AVANT index :\n' + planBefore2);

  console.log('\n--- CRÉATION DES VUES ---');
  await client.query(`
    -- Vue 1 pour le rôle courtier_trader : catalogue marché sans accès aux soldes ni données privées
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

    -- Vue 2 pour le rôle auditeur_conformite : audit consolidé des transactions avec calculs
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
  `);
  console.log('Vues créées avec succès.');

  console.log('\n--- CRÉATION DES RÔLES ET PRIVILÈGES ---');
  // Ajuster la procédure en SECURITY DEFINER pour que le courtier puisse l'appeler sans droit direct sur transactions
  await client.query(`
    ALTER PROCEDURE public.executer_ordre(bigint, bigint, bigint, text, numeric, bigint) SECURITY DEFINER;
  `);

  await client.query(`
    -- Création des rôles métiers
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

    -- Création des utilisateurs de test
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

    -- Attribution des rôles aux utilisateurs
    GRANT courtier_trader TO trader_alex;
    GRANT auditeur_conformite TO auditeur_claire;

    -- Réinitialisation des privilèges sur le schéma public pour isoler les tables
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM courtier_trader, auditeur_conformite;

    -- Droits pour courtier_trader : UNIQUEMENT sa vue et la procédure d'ordre
    GRANT USAGE ON SCHEMA public TO courtier_trader;
    GRANT SELECT ON public.vue_courtier_marche TO courtier_trader;
    GRANT EXECUTE ON PROCEDURE public.executer_ordre(bigint, bigint, bigint, text, numeric, bigint) TO courtier_trader;

    -- Droits pour auditeur_conformite : UNIQUEMENT sa vue d'audit en lecture seule
    GRANT USAGE ON SCHEMA public TO auditeur_conformite;
    GRANT SELECT ON public.vue_audit_transactions TO auditeur_conformite;
  `);
  console.log('Rôles, utilisateurs et privilèges appliqués avec succès.');

  console.log('\n--- CRÉATION DES INDEX ---');
  await client.query(`
    CREATE INDEX idx_transactions_client_date ON public.transactions(client_id, date_transaction DESC);
    CREATE INDEX idx_transactions_titre_date ON public.transactions(titre_id, date_transaction);
  `);
  console.log('Index créés avec succès.');

  console.log('\n--- MESURE APRÈS INDEX ---');
  const resAfter1 = await client.query(q1);
  const planAfter1 = resAfter1.rows.map(r => r['QUERY PLAN']).join('\n');
  console.log('Plan 1 APRÈS index :\n' + planAfter1);

  const resAfter2 = await client.query(q2);
  const planAfter2 = resAfter2.rows.map(r => r['QUERY PLAN']).join('\n');
  console.log('\nPlan 2 APRÈS index :\n' + planAfter2);

  console.log('\n--- TESTS DE PERMISSION SUR LES RÔLES ---');
  // Test Trader
  try {
    await client.query(`SET ROLE trader_alex;`);
    const tView = await client.query(`SELECT count(*) FROM public.vue_courtier_marche;`);
    console.log(` Trader Alex lit vue_courtier_marche : OK (${tView.rows[0].count} lignes)`);
  } catch (e) {
    console.log(` Trader Alex lecture vue : ERREUR ${e.message}`);
  }

  try {
    await client.query(`SELECT * FROM public.comptes_especes LIMIT 1;`);
    console.log(`❌ Trader Alex a pu lire comptes_especes (ne devrait pas !)`);
  } catch (e) {
    console.log(` Trader Alex bloqué sur comptes_especes : REFUS NORMAL (${e.message})`);
  }

  // Test Auditeur
  try {
    await client.query(`SET ROLE auditeur_claire;`);
    const aView = await client.query(`SELECT count(*) FROM public.vue_audit_transactions;`);
    console.log(` Auditeur Claire lit vue_audit_transactions : OK (${aView.rows[0].count} lignes)`);
  } catch (e) {
    console.log(` Auditeur Claire lecture vue : ERREUR ${e.message}`);
  }

  try {
    await client.query(`DELETE FROM public.transactions WHERE transaction_id = 1;`);
    console.log(`❌ Auditeur Claire a pu supprimer (ne devrait pas !)`);
  } catch (e) {
    console.log(` Auditeur Claire bloqué sur DELETE : REFUS NORMAL (${e.message})`);
  }

  await client.query(`RESET ROLE;`);
  console.log('\nOpération terminée avec succès.');
  await client.end();
}

main().catch(async (e) => {
  console.error('Erreur:', e);
  try { await client.end(); } catch (err) {}
  process.exit(1);
});
