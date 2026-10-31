// cPanel "Setup Node.js App" (Passenger) loads the startup file with require(),
// but this project is ESM, so bridge into the compiled entrypoint.
import('./dist/main.js').catch((err) => {
  console.error(err);
  process.exit(1);
});
