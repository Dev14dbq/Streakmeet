/** PM2: API + face-service. Запуск: pm2 start /home/streakmeet/deploy/ecosystem.config.cjs */
module.exports = {
  apps: [
    {
      name: 'streakmeet-api',
      cwd: '/home/streakmeet/backend',
      script: 'dist/index.js',
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'streakmeet-face',
      cwd: '/home/streakmeet/face-service',
      script: 'start.sh',
      interpreter: 'bash',
      env: {
        NO_ALBUMENTATIONS_UPDATE: '1',
      },
    },
  ],
}
