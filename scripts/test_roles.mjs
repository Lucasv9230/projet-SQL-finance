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

  await client.query(`
    GRANT trader_alex TO postgres;
    GRANT auditeur_claire TO postgres;
    GRANT courtier_trader TO postgres;
    GRANT auditeur_conformite TO postgres;
  `);

  console.log('--- TEST DU RÔLE TRADER_ALEX ---');
  await client.query(`SET ROLE trader_alex;`);

  try {
    const res = await client.query(`SELECT count(*) FROM public.vue_courtier_marche;`);
    console.log(` AUTORISÉ : trader_alex a lu vue_courtier_marche (${res.rows[0].count} lignes)`);
  } catch (e) {
    console.log(` Erreur inattendue : ${e.message}`);
  }

  try {
    await client.query(`SELECT * FROM public.comptes_especes LIMIT 1;`);
    console.log(`❌ ERREUR : trader_alex ne devrait pas pouvoir lire comptes_especes !`);
  } catch (e) {
    console.log(` REFUSÉ (attendu) : trader_alex bloqué sur comptes_especes (${e.message})`);
  }

  await client.query(`RESET ROLE;`);

  console.log('\n--- TEST DU RÔLE AUDITEUR_CLAIRE ---');
  await client.query(`SET ROLE auditeur_claire;`);

  try {
    const res = await client.query(`SELECT count(*) FROM public.vue_audit_transactions;`);
    console.log(` AUTORISÉ : auditeur_claire a lu vue_audit_transactions (${res.rows[0].count} lignes)`);
  } catch (e) {
    console.log(` Erreur inattendue : ${e.message}`);
  }

  try {
    await client.query(`DELETE FROM public.transactions WHERE transaction_id = 1;`);
    console.log(`❌ ERREUR : auditeur_claire ne devrait pas pouvoir supprimer !`);
  } catch (e) {
    console.log(` REFUSÉ (attendu) : auditeur_claire bloqué sur DELETE (${e.message})`);
  }

  await client.query(`RESET ROLE;`);
  await client.end();
}

main().catch(async (e) => {
  console.error(e);
  try { await client.end(); } catch (err) {}
});
