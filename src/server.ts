import express from 'express';
import { fileURLToPath } from 'url';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

const PORT = parseInt(process.env.PORT ?? '3000');

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => console.log(`session-travel listening on :${PORT}`));
}

export { app };
