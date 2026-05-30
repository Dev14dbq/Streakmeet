/** PM2: Rust microservices + optional Node for legal/memories/uploads.
 *  Run: pm2 start /home/streakmeet/deploy/ecosystem-rust.config.cjs
 */
module.exports = {
  apps: [
    {
      name: 'streakmeet-api-rust',
      cwd: '/home/streakmeet/backend-rust',
      script: 'target/release/api-gateway',
      env: {
        RUST_LOG: 'info,streakmeet=debug',
      },
    },
    {
      name: 'streakmeet-sync-rust',
      cwd: '/home/streakmeet/backend-rust',
      script: 'target/release/sync-gateway',
      env: {
        RUST_LOG: 'info,streakmeet=debug',
      },
    },
    {
      name: 'streakmeet-worker-rust',
      cwd: '/home/streakmeet/backend-rust',
      script: 'target/release/worker-service',
      env: {
        RUST_LOG: 'info,streakmeet=debug',
      },
    },
    {
      name: 'streakmeet-api-node',
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
