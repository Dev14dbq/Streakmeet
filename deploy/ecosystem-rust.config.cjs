/** PM2: Rust microservices + face-service (Node backend retired). */
module.exports = {
  apps: [
    {
      name: 'streakmeet-api-rust',
      cwd: '/home/streakmeet/backend-rust',
      script: 'target/debug/api-gateway',
      env: {
        RUST_LOG: 'info,streakmeet=debug',
      },
    },
    {
      name: 'streakmeet-sync-rust',
      cwd: '/home/streakmeet/backend-rust',
      script: 'target/debug/sync-gateway',
      env: {
        RUST_LOG: 'info,streakmeet=debug',
      },
    },
    {
      name: 'streakmeet-worker-rust',
      cwd: '/home/streakmeet/backend-rust',
      script: 'target/debug/worker-service',
      env: {
        RUST_LOG: 'info,streakmeet=debug',
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
