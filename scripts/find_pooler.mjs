import pg from 'pg';

const projectRef = 'cqkeiqpuvklxrenpywxd';
const password = 'otpI75R4IiqdxFei';
const regions = [
  'ca-central-1',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'eu-central-1',
  'eu-central-2',
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-northeast-1',
  'ap-northeast-2',
  'ap-south-1',
  'sa-east-1'
];

async function findCorrectPooler() {
  for (const r of regions) {
    const host = `aws-0-${r}.pooler.supabase.com`;
    const client = new pg.Client({
      host,
      port: 6543,
      user: `postgres.${projectRef}`,
      password,
      database: 'postgres',
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 3000
    });

    try {
      await client.connect();
      console.log(`TROUVÉ ! La région est ${r} (${host}) !`);
      await client.end();
      return host;
    } catch (err) {
      if (err.message.includes('password authentication failed')) {
        console.log(`Région trouvée mais mot de passe erroné: ${r}`);
        await client.end();
        return host;
      }
      // tenant not found or timeout
    }
  }
  console.log('Aucune région ne correspond.');
  return null;
}

findCorrectPooler();
