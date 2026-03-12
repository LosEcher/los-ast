export function registerBackendRoutes(app) {
  app.get('/users', (req, res) => {
    return res.send({ ok: true });
  });
}
