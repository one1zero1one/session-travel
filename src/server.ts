import express from 'express';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

const PORT = parseInt(process.env.PORT ?? '3000');
app.listen(PORT, () => console.log(`session-travel listening on :${PORT}`));

export { app };
