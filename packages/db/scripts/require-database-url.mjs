if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required to run database migrations.');
  process.exit(1);
}
