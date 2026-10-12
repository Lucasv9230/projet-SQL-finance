import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const client = new pg.Client({
  host: 'aws-0-eu-west-1.pooler.supabase.com',
  port: 5432,
  user: 'postgres.cqkeiqpuvklxrenpywxd',
  password: 'otpI75R4IiqdxFei',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  console.log('Connexion à Supabase...');
  await client.connect();
  console.log('Connecté avec succès !');

  // Vérifier si 01_schema.sql doit être exécuté
  const checkSchema = await client.query("SELECT to_regclass('public.clients') AS has_clients");
  if (!checkSchema.rows[0].has_clients) {
    console.log('\nExécution de sql/01_schema.sql...');
    const sql1 = fs.readFileSync(path.join(rootDir, 'sql/01_schema.sql'), 'utf-8');
    await client.query(sql1);
    console.log(' sql/01_schema.sql exécuté.');
  } else {
    console.log('\n Schéma 01 déjà en place.');
  }

  // Vérifier si 02_donnees.sql doit être exécuté
  const checkData = await client.query('SELECT count(*) FROM public.clients');
  if (parseInt(checkData.rows[0].count, 10) === 0) {
    console.log('\nExécution de sql/02_donnees.sql...');
    const sql2 = fs.readFileSync(path.join(rootDir, 'sql/02_donnees.sql'), 'utf-8');
    await client.query(sql2);
    console.log(' sql/02_donnees.sql exécuté.');
  } else {
    console.log(`\n Données déjà présentes (${checkData.rows[0].count} clients).`);
  }

  // Exécution de 03_procedure_trigger.sql
  console.log('\nExécution de sql/03_procedure_trigger.sql...');
  const sql3 = fs.readFileSync(path.join(rootDir, 'sql/03_procedure_trigger.sql'), 'utf-8');
  await client.query(sql3);
  console.log(' sql/03_procedure_trigger.sql exécuté.');

  // Exécution de 04_tests_integrite.sql (pour valider que tout est 100% fonctionnel)
  console.log('\nExécution des tests de validation sql/04_tests_integrite.sql...');
  const sql4 = fs.readFileSync(path.join(rootDir, 'sql/04_tests_integrite.sql'), 'utf-8');
  await client.query(sql4);
  console.log(' sql/04_tests_integrite.sql validé avec succès (ROLLBACK automatique de test).');

  // Stats finales
  const resClients = await client.query('SELECT count(*) FROM public.clients');
  const resTitres = await client.query('SELECT count(*) FROM public.titres');
  const resPositions = await client.query('SELECT count(*) FROM public.portefeuilles_positions');
  const resTrans = await client.query('SELECT count(*) FROM public.transactions');

  console.log('\n================ BILAN SUPABASE ================');
  console.log(` Clients : ${resClients.rows[0].count}`);
  console.log(` Titres cotés : ${resTitres.rows[0].count}`);
  console.log(` Positions ouvertes : ${resPositions.rows[0].count}`);
  console.log(` Transactions enregistrées : ${resTrans.rows[0].count}`);
  console.log(' Procédure "executer_ordre" & Trigger : OK');
  console.log('================================================\n');

  await client.end();
}

run().catch(async (err) => {
  console.error('\n Erreur lors du déploiement :', err);
  try { await client.end(); } catch (e) {}
  process.exit(1);
});
