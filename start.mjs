// Diagnostic startup wrapper — catches any crash and logs it before exit
process.on('uncaughtException', (err) => {
  console.error('[STARTUP CRASH] Uncaught Exception:', err.message);
  console.error(err.stack);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('[STARTUP CRASH] Unhandled Rejection:', reason);
  process.exit(1);
});
console.log('[DIAG] Starting server... PORT=' + process.env.PORT);
console.log('[DIAG] NODE_ENV=' + process.env.NODE_ENV);
console.log('[DIAG] CWD=' + process.cwd());
import fs from 'fs';
console.log('[DIAG] Files in /app/dist/:', fs.readdirSync('./dist'));
console.log('[DIAG] node_modules exists:', fs.existsSync('./node_modules'));
try {
  await import('./dist/index.js');
  console.log('[DIAG] Import completed successfully');
} catch (err) {
  console.error('[STARTUP CRASH] Failed to import dist/index.js:', err.message);
  console.error(err.stack);
  process.exit(1);
}
