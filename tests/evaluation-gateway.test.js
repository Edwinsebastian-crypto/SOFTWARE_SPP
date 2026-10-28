'use strict';
// Evaluation gateway: token signing, route allow-list, practice authorization and HTTP round trip
// against a local fake of the Python service. No database, no external network.
const assert = require('assert');
const crypto = require('crypto');
const http = require('http');

const HttpError = require('../src/utils/http-error');
const EvaluationServiceClient = require('../src/infrastructure/evaluation-service');
const EvaluationGatewayService = require('../src/services/evaluation-gateway.service');
const EvaluationController = require('../src/controllers/evaluation.controller');

const SECRET = 'test-secret-test-secret-test-secret';
const tutor = { role: 'tutor', documentNumber: 'T-1001' };
const student = { role: 'student', documentNumber: 'E-2002' };
const director = { role: 'director', documentNumber: 'D-1' };

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✔', name); } catch (err) { console.error('  ✘', name, '\n   ', err.message); process.exitCode = 1; }
}
const rejects = (promise, status, pattern) => assert.rejects(promise, (e) => e instanceof HttpError && e.status === status && (!pattern || pattern.test(e.message)));
const jsonResponse = (status, body) => ({ status, json: async () => { if (body === undefined) throw new Error('no body'); return body; } });

/** PracticeAccessService fake: PRA-1 is the tutor's, anything else is "not found" (the real one answers 404). */
const practices = { 'PRA-1': { id: 'PRA-1', status: 'active', studentDocument: 'E-2002', tutorDocument: 'T-1001' },
  'PRA-X': { id: 'PRA-X', status: 'cancelled', studentDocument: 'E-2002', tutorDocument: 'T-1001' } };
const activities = { 'PRA-1-A1': { id: 'PRA-1-A1', practiceId: 'PRA-1' }, 'PRA-2-A1': { id: 'PRA-2-A1', practiceId: 'PRA-2' } };
const access = {
  loadAuthorized: async (user, id) => { const p = practices[id]; if (!p || p.tutorDocument !== user.documentNumber) throw HttpError.notFound('Practice not found'); return p; },
  loadAuthorizedActivity: async (user, id) => { const a = activities[id]; if (!a) throw HttpError.notFound('Activity not found'); return { activity: a, practice: practices[a.practiceId] }; }
};

/** Gateway wired to a fake fetch that records the call and answers with `reply`. */
function build(reply = jsonResponse(200, { ok: true })) {
  const calls = [];
  const client = new EvaluationServiceClient({
    url: 'http://eval.internal:8000/', secret: SECRET, now: () => 1_800_000_000_000,
    fetchImpl: async (url, init) => { calls.push({ url: String(url), init }); return typeof reply === 'function' ? reply(url, init) : reply; }
  });
  return { calls, gateway: new EvaluationGatewayService({ client, practiceAccessService: access }) };
}

(async () => {
  console.log('# token');
  await test('signs an HS256 token the service can verify, with sub = document number', () => {
    const client = new EvaluationServiceClient({ url: 'http://x', secret: SECRET, now: () => 1_800_000_000_000 });
    const [h, p, s] = client.signToken(tutor).split('.');
    assert.equal(crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url'), s);
    assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { alg: 'HS256', typ: 'JWT' });
    assert.deepEqual(JSON.parse(Buffer.from(p, 'base64url')), { sub: 'T-1001', rol: 'TUTOR', iat: 1_800_000_000, exp: 1_800_000_120, iss: 'spp-monolith' });
    assert.equal(JSON.parse(Buffer.from(client.signToken(student).split('.')[1], 'base64url')).rol, 'ESTUDIANTE');
  });
  await test('the director gets a DIRECTOR token; the advisor has no evaluations', () => {
    const client = new EvaluationServiceClient({ url: 'http://x', secret: SECRET, now: () => 1_800_000_000_000 });
    assert.equal(JSON.parse(Buffer.from(client.signToken(director).split('.')[1], 'base64url')).rol, 'DIRECTOR');
    assert.throws(() => client.signToken({ role: 'advisor', documentNumber: '1' }), (e) => e.status === 403);
  });

  console.log('# client');
  await test('not configured -> 503', async () => {
    const client = new EvaluationServiceClient({ url: '', secret: '' });
    await rejects(client.request({ user: tutor, method: 'GET', path: '/x' }), 503);
  });
  await test('unreachable -> 502, timeout -> 504', async () => {
    const mk = (err) => new EvaluationServiceClient({ url: 'http://x', secret: SECRET, fetchImpl: async () => { throw err; } });
    await rejects(mk(new TypeError('fetch failed')).request({ user: tutor, method: 'GET', path: '/x' }), 502);
    const timeout = Object.assign(new Error('t'), { name: 'TimeoutError' });
    await rejects(mk(timeout).request({ user: tutor, method: 'GET', path: '/x' }), 504);
  });

  console.log('# route allow-list');
  await test('forwards an allowed route with prefix /api/v1, bearer token and role segment', async () => {
    const { gateway, calls } = build(jsonResponse(200, [{ id_evaluacion: 1 }]));
    const r = await gateway.forward(student, { role: 'student', method: 'GET', path: '/evaluaciones' });
    assert.deepEqual(r, { status: 200, body: [{ id_evaluacion: 1 }] });
    assert.equal(calls[0].url, 'http://eval.internal:8000/api/v1/estudiante/evaluaciones');
    assert.match(calls[0].init.headers.Authorization, /^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
  });
  await test('unknown routes, wrong verbs, odd ids and traversal are 404 and never reach the service', async () => {
    const { gateway, calls } = build();
    for (const [role, method, path] of [
      ['tutor', 'GET', '/admin'], ['tutor', 'DELETE', '/intentos/1'], ['tutor', 'GET', '/evaluaciones/abc'],
      ['tutor', 'GET', '/evaluaciones/1/../../x'], ['tutor', 'GET', '/evaluaciones//1'], ['student', 'POST', '/evaluaciones'],
      ['student', 'GET', '/respuestas/1'], ['nope', 'GET', '/evaluaciones'], ['tutor', 'GET', '/evaluaciones/1%2F..']
    ]) await rejects(gateway.forward(tutor, { role, method, path }), 404);
    assert.equal(calls.length, 0);
  });
  await test('meta health goes to /api/v1/health', async () => {
    const { gateway, calls } = build(jsonResponse(200, { status: 'ok' }));
    await gateway.forward(tutor, { role: 'meta', method: 'GET', path: '/health' });
    assert.equal(calls[0].url, 'http://eval.internal:8000/api/v1/health');
  });

  console.log('# authorization by practice');
  await test('create: student comes from the practice, never from the request', async () => {
    const { gateway, calls } = build(jsonResponse(201, { id_evaluacion: 5 }));
    const r = await gateway.forward(tutor, { role: 'tutor', method: 'POST', path: '/evaluaciones', body: {
      id_practica: 'PRA-1', id_estudiante: 'ATTACKER', id_tutor: 'OTHER', titulo: 'Quiz 1', intentos_permitidos: 2, estado: 'PUBLICADA', extra: 1 } });
    assert.equal(r.status, 201);
    assert.deepEqual(JSON.parse(calls[0].init.body), { id_practica: 'PRA-1', id_estudiante: 'E-2002', titulo: 'Quiz 1', intentos_permitidos: 2 });
  });
  await test('create: practice of another tutor / missing / cancelled / activity of another practice', async () => {
    const { gateway, calls } = build();
    const go = (body) => gateway.forward(tutor, { role: 'tutor', method: 'POST', path: '/evaluaciones', body });
    await rejects(go({ id_practica: 'PRA-2', titulo: 'x' }), 404);
    await rejects(go({ titulo: 'x' }), 400);
    await rejects(go(null), 400);
    await rejects(go({ id_practica: 'PRA-X', titulo: 'x' }), 409);
    await rejects(go({ id_practica: 'PRA-1', id_actividad: 'PRA-2-A1', titulo: 'x' }), 400, /another practice/);
    assert.equal(calls.length, 0);
    await go({ id_practica: 'PRA-1', id_actividad: 'PRA-1-A1', titulo: 'x' });
    assert.equal(JSON.parse(calls[0].init.body).id_actividad, 'PRA-1-A1');
  });
  await test('list and evidence are scoped to the tutor practices', async () => {
    const { gateway, calls } = build(jsonResponse(200, []));
    await rejects(gateway.forward(tutor, { role: 'tutor', method: 'GET', path: '/evidencias', query: { id_practica: 'PRA-2' } }), 404);
    await rejects(gateway.forward(tutor, { role: 'tutor', method: 'GET', path: '/evidencias', query: {} }), 400);
    await rejects(gateway.forward(tutor, { role: 'tutor', method: 'GET', path: '/evaluaciones', query: { id_practica: 'PRA-2' } }), 404);
    await gateway.forward(tutor, { role: 'tutor', method: 'GET', path: '/evidencias', query: { id_practica: 'PRA-1', otro: 'x' } });
    assert.equal(calls[0].url, 'http://eval.internal:8000/api/v1/tutor/evidencias?id_practica=PRA-1');
    await gateway.forward(tutor, { role: 'tutor', method: 'GET', path: '/evaluaciones' });
    assert.equal(calls[1].url, 'http://eval.internal:8000/api/v1/tutor/evaluaciones');
  });

  console.log('# director (read only)');
  const PRACTICES = [
    { id: 'PRA-1', studentName: 'Ana Pérez', tutorName: 'Luis Gómez', institutionName: 'Colegio Sol', typeName: 'Observación', status: 'active', studentDocument: 'E-2002', tutorDocument: 'T-1001' },
    { id: 'PRA-9', studentName: 'Sofía Ruiz', tutorName: 'Marta Díaz', institutionName: null, typeName: 'Regencia', status: 'completed', studentDocument: 'E-9', tutorDocument: 'T-9' }
  ];
  const overview = { totales: { evaluaciones: 2 }, por_tutor: [{ id_tutor: 'T-1001' }, { id_tutor: 'T-404' }],
    alertas: [{ id_evaluacion: 1, id_practica: 'PRA-1', id_tutor: 'T-1001' }, { id_evaluacion: 2, id_practica: 'PRA-GONE', id_tutor: 'T-404' }] };
  function buildDirector(reply, { ttl } = {}) {
    const calls = [];
    let listed = 0;
    let clock = 1_000;
    const gateway = new EvaluationGatewayService({
      client: new EvaluationServiceClient({ url: 'http://eval.internal:8000', secret: SECRET, fetchImpl: async (url, init) => { calls.push({ url: String(url), init }); return reply; } }),
      practiceAccessService: access, practiceRepository: { list: async () => { listed++; return PRACTICES; } }, now: () => clock
    });
    return { gateway, calls, listed: () => listed, tick: (ms) => { clock += ms; } };
  }
  await test('only GET reaches /director/*; any other verb or path is a 404 and never reaches the service', async () => {
    const { gateway, calls } = buildDirector(jsonResponse(200, overview));
    for (const [method, path] of [['POST', '/evaluaciones'], ['PATCH', '/evaluaciones/1'], ['DELETE', '/evaluaciones/1'], ['PUT', '/resumen'],
      ['GET', '/admin'], ['GET', '/evaluaciones/abc'], ['GET', '/evaluaciones/1/no-existe'], ['GET', '/respuestas/3'], ['GET', '/evaluaciones/1/../x']]) {
      await rejects(gateway.forward(director, { role: 'director', method, path, body: {} }), 404);
    }
    assert.equal(calls.length, 0);
  });
  await test('director can read questions, attempts and attempt details', async () => {
    const { gateway, calls } = buildDirector(jsonResponse(200, { ok: true, id_estudiante: 'E-9' }));
    for (const path of ['/evaluaciones/1/preguntas', '/evaluaciones/1/intentos', '/intentos/3']) {
      const res = await gateway.forward(director, { role: 'director', method: 'GET', path });
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.directorio.estudiantes, { 'E-9': 'Sofía Ruiz' });
    }
    assert.equal(calls.length, 3);
  });
  await test('overview is forwarded to /api/v1/director/resumen with a DIRECTOR token', async () => {
    const { gateway, calls } = buildDirector(jsonResponse(200, overview));
    await gateway.forward(director, { role: 'director', method: 'GET', path: '/resumen', query: { q: 'ignored' } });
    assert.equal(calls[0].url, 'http://eval.internal:8000/api/v1/director/resumen');   // no query without a hook
    const claims = JSON.parse(Buffer.from(calls[0].init.headers.Authorization.split('.')[1], 'base64url'));
    assert.deepEqual([claims.sub, claims.rol], ['D-1', 'DIRECTOR']);
  });
  await test('adds readable names for the ids in the response; unknown ids are simply absent', async () => {
    const { gateway } = buildDirector(jsonResponse(200, overview));
    const { body } = await gateway.forward(director, { role: 'director', method: 'GET', path: '/resumen' });
    assert.deepEqual(body.directorio.practicas, { 'PRA-1': { estudiante: 'Ana Pérez', tutor: 'Luis Gómez', institucion: 'Colegio Sol', tipo: 'Observación', estado: 'active' } });
    assert.deepEqual(body.directorio.tutores, { 'T-1001': 'Luis Gómez' });      // T-404 and PRA-GONE do not exist
    assert.deepEqual(body.directorio.estudiantes, {});                           // overview has no student ids
    assert.deepEqual(body.totales, overview.totales);                            // the rest is untouched
  });
  await test('list: only validated filters are forwarded', async () => {
    const { gateway, calls } = buildDirector(jsonResponse(200, { total: 0, items: [] }));
    await gateway.forward(director, { role: 'director', method: 'GET', path: '/evaluaciones', query: {
      estado: 'publicada', id_tutor: 'T-1', q: ' fracciones ', solo_alertas: 'true', limite: '10', desplazamiento: '20', evil: '1', id_estudiante: 'E-9' } });
    const url = new URL(calls[0].url);
    assert.equal(url.pathname, '/api/v1/director/evaluaciones');
    assert.deepEqual(Object.fromEntries(url.searchParams), { estado: 'PUBLICADA', id_tutor: 'T-1', q: 'fracciones', solo_alertas: 'true', limite: '10', desplazamiento: '20' });
    for (const query of [{ estado: 'NOPE' }, { limite: '0' }, { limite: '101' }, { limite: 'x' }, { desplazamiento: '-1' }, { id_tutor: 'x'.repeat(31) }]) {
      await rejects(gateway.forward(director, { role: 'director', method: 'GET', path: '/evaluaciones', query }), 400);
    }
    assert.equal(calls.length, 1);
  });
  await test('detail: names are resolved from the ids in the payload; service errors are translated', async () => {
    const detail = { id_evaluacion: 1, id_practica: 'PRA-9', id_tutor: 'T-9', id_estudiante: 'E-9', preguntas: [], intentos: [{ id_intento: 1 }] };
    const ok = buildDirector(jsonResponse(200, detail));
    const { body } = await ok.gateway.forward(director, { role: 'director', method: 'GET', path: '/evaluaciones/1' });
    assert.deepEqual(body.directorio.estudiantes, { 'E-9': 'Sofía Ruiz' });
    assert.deepEqual(body.directorio.tutores, { 'T-9': 'Marta Díaz' });
    const missing = buildDirector(jsonResponse(404, { detail: 'La evaluación no existe.' }));
    await rejects(missing.gateway.forward(director, { role: 'director', method: 'GET', path: '/evaluaciones/99' }), 404, /^La evaluación no existe\.$/);
    assert.equal(missing.listed(), 0);   // errors do not touch the practice database
  });
  await test('the practice list is read once per 30 seconds, not once per request', async () => {
    const ctx = buildDirector(jsonResponse(200, overview));
    for (let i = 0; i < 3; i++) await ctx.gateway.forward(director, { role: 'director', method: 'GET', path: '/resumen' });
    assert.equal(ctx.listed(), 1);
    ctx.tick(31_000);
    await ctx.gateway.forward(director, { role: 'director', method: 'GET', path: '/resumen' });
    assert.equal(ctx.listed(), 2);
  });
  await test('without a practice repository the response is returned as is', async () => {
    const { gateway } = build(jsonResponse(200, overview));
    const { body } = await gateway.forward(director, { role: 'director', method: 'GET', path: '/resumen' });
    assert.deepEqual(body, overview);
  });

  console.log('# service errors');
  await test('FastAPI errors become { error } messages; auth/5xx failures become 502', async () => {
    const run = (status, body) => build(jsonResponse(status, body)).gateway.forward(student, { role: 'student', method: 'GET', path: '/intentos/3' });
    await rejects(run(404, { detail: 'El intento no existe.' }), 404, /^El intento no existe\.$/);
    await rejects(run(422, { detail: [{ msg: 'Value error, Debe haber 4 opciones' }, { msg: 'Field required' }] }), 422, /Debe haber 4 opciones · Field required/);
    await rejects(run(409, {}), 409, /Evaluation service error \(409\)/);
    await rejects(run(401, { detail: 'Token inválido' }), 502, /EVALUATION_SERVICE_SECRET/);
    await rejects(run(500, { detail: 'boom: secret stack' }), 502, /^The evaluation service failed$/);
  });

  console.log('# controller');
  await test('204 has no body; JSON is passed through; wildcard path is rebuilt', async () => {
    const seen = [];
    const gateway = { forward: async (_u, req) => { seen.push(req); return req.method === 'DELETE' ? { status: 204, body: null } : { status: 200, body: { a: 1 } }; } };
    const controller = new EvaluationController({ evaluationGatewayService: gateway });
    const res = { status(s) { this.code = s; return this; }, json(b) { this.body = b; return this; }, end() { this.ended = true; return this; } };
    const handler = controller.proxy('tutor');
    await handler({ user: tutor, method: 'DELETE', params: ['evaluaciones/7'], query: {}, body: {} }, res);
    assert.equal(res.code, 204); assert.ok(res.ended);
    const res2 = Object.create(res);
    await handler({ user: tutor, method: 'GET', params: ['evaluaciones/7/'], query: { id_practica: 'PRA-1' }, body: {} }, res2);
    assert.equal(res2.code, 200); assert.deepEqual(res2.body, { a: 1 });
    assert.equal(seen[1].path, '/evaluaciones/7');
  });

  console.log('# real HTTP round trip');
  await test('query, JSON body, status and headers reach a real HTTP server and come back', async () => {
    const received = [];
    const server = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => { raw += c; });
      req.on('end', () => {
        received.push({ method: req.method, url: req.url, auth: req.headers.authorization, type: req.headers['content-type'], raw });
        if (req.url.startsWith('/api/v1/tutor/evaluaciones/9/generar')) { res.writeHead(201, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ id_generacion: 3 })); }
        if (req.method === 'DELETE') { res.writeHead(204); return res.end(); }
        res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ detail: 'No existe.' }));
      });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const url = `http://127.0.0.1:${server.address().port}`;
      const gateway = new EvaluationGatewayService({ client: new EvaluationServiceClient({ url, secret: SECRET }), practiceAccessService: access });
      const created = await gateway.forward(tutor, { role: 'tutor', method: 'POST', path: '/evaluaciones/9/generar', body: { cantidad: 3 } });
      assert.deepEqual(created, { status: 201, body: { id_generacion: 3 } });
      assert.equal(received[0].type, 'application/json');
      assert.deepEqual(JSON.parse(received[0].raw), { cantidad: 3 });
      const [h, p, s] = received[0].auth.replace('Bearer ', '').split('.');
      assert.equal(crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url'), s);
      assert.deepEqual(await gateway.forward(tutor, { role: 'tutor', method: 'DELETE', path: '/evaluaciones/9' }), { status: 204, body: null });
      assert.equal(received[1].raw, '');
      await rejects(gateway.forward(tutor, { role: 'tutor', method: 'GET', path: '/evaluaciones/1' }), 404, /^No existe\.$/);
    } finally { server.close(); }
  });
  await test('a service that never answers is cut off by the timeout (504)', async () => {
    const server = http.createServer(() => { /* never responds */ });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const client = new EvaluationServiceClient({ url: `http://127.0.0.1:${server.address().port}`, secret: SECRET, timeoutMs: 150 });
      await rejects(client.request({ user: tutor, method: 'GET', path: '/tutor/evaluaciones' }), 504);
    } finally { server.closeAllConnections(); server.close(); }
  });

  console.log(`\n${passed} passed`);
})();
