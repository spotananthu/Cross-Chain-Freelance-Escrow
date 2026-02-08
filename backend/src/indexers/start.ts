import { evmIndexer } from './evm';
import { suiIndexer } from './sui';

console.log('Starting blockchain indexers...');

// Start both indexers
evmIndexer.start();
suiIndexer.start();

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down indexers...');
  evmIndexer.stop();
  suiIndexer.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down indexers...');
  evmIndexer.stop();
  suiIndexer.stop();
  process.exit(0);
});

console.log('Indexers started. Press Ctrl+C to stop.');
