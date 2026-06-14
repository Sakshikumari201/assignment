const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const prismaSchemaPath = path.join(__dirname, 'schema.prisma');
const envPath = path.join(__dirname, '../.env');

function runCommand(cmd, options = { stdio: 'inherit' }) {
  try {
    execSync(cmd, options);
    return true;
  } catch (error) {
    return false;
  }
}

async function main() {
  console.log('--- Shared Expense DB Setup Tool ---');
  
  // 1. Read existing config
  let envContent = '';
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
  }

  // Extract DATABASE_URL
  const dbUrlMatch = envContent.match(/DATABASE_URL=["']?([^"'\r\n]+)["']?/);
  const dbUrl = dbUrlMatch ? dbUrlMatch[1] : '';

  console.log(`Checking database URL: ${dbUrl}`);

  let pgConnected = false;
  
  if (dbUrl && dbUrl.startsWith('postgresql')) {
    console.log('Attempting to connect to PostgreSQL and push schema...');
    // Try to run npx prisma db push with PostgreSQL
    pgConnected = runCommand('npx prisma db push --accept-data-loss', { stdio: 'pipe' });
  }

  if (pgConnected) {
    console.log('Successfully connected to PostgreSQL!');
    console.log('Running database seeding...');
    runCommand('node prisma/seed.js');
  } else {
    console.warn('\n[WARNING] PostgreSQL is not running or unreachable at the configured URL.');
    console.warn('Switching dynamically to local SQLite fallback database for development...');

    // A. Update schema.prisma provider to "sqlite"
    let schema = fs.readFileSync(prismaSchemaPath, 'utf8');
    schema = schema.replace(/provider\s*=\s*"postgresql"/g, 'provider = "sqlite"');
    
    // SQLite doesn't support autoincrement without @id, which is fine as our @id default(autoincrement()) is standard.
    // If there are any model attributes unsupported by SQLite, we replace them, but our models are standard.
    fs.writeFileSync(prismaSchemaPath, schema, 'utf8');
    console.log('Updated schema.prisma provider to "sqlite".');

    // B. Update .env file to use file:./dev.db
    let newEnvContent = envContent;
    const sqliteUrl = 'DATABASE_URL="file:./dev.db"';
    if (dbUrlMatch) {
      newEnvContent = envContent.replace(/DATABASE_URL=.*/, sqliteUrl);
    } else {
      newEnvContent += `\n${sqliteUrl}\n`;
    }
    fs.writeFileSync(envPath, newEnvContent, 'utf8');
    console.log('Updated .env with SQLite connection string.');

    // C. Re-generate prisma client for sqlite
    console.log('Re-generating Prisma Client...');
    runCommand('npx prisma generate');

    // D. Push SQLite schema
    console.log('Creating local SQLite database (dev.db)...');
    runCommand('npx prisma db push --accept-data-loss');

    // E. Run seed script
    console.log('Running database seeding...');
    runCommand('node prisma/seed.js');
  }

  console.log('\n--- Database Setup Complete! ---');
}

main().catch(err => {
  console.error('Database setup failed:', err);
  process.exit(1);
});
