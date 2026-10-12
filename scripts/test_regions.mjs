import net from 'net';

const projectRef = 'cqkeiqpuvklxrenpywxd';
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

async function checkRegion(region) {
  const host = `aws-0-${region}.pooler.supabase.com`;
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port: 6543, timeout: 2000 });
    socket.on('connect', () => {
      socket.destroy();
      resolve(region);
    });
    socket.on('error', () => resolve(null));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(null);
    });
  });
}

async function findRegion() {
  console.log('Recherche du pooler Supabase IPv4 accessible...');
  for (const r of regions) {
    const reachable = await checkRegion(r);
    if (reachable) {
      console.log(`Pooler accessible: aws-0-${r}.pooler.supabase.com`);
    }
  }
}

findRegion();
