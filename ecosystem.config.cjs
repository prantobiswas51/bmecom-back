// pm2 config for the backend API on the VPS. The deploy workflow ships this file inside
// each release and starts it with APP_CURRENT set to the "current" symlink (the live release).
// Settings (database, JWT secret, PORT, ...) come from the .env file in that release, which is a
// link to the shared .env that survives deploys.
module.exports = {
  apps: [
    {
      // Keep this in step with PM2_BACK_NAME in the backend .env, which the System health page reads.
      name: process.env.PM2_APP_NAME || 'bmback-prod',
      script: 'dist/main.js',
      cwd: process.env.APP_CURRENT,
      env: { NODE_ENV: 'production' },
      max_memory_restart: '700M',
    },
  ],
};
