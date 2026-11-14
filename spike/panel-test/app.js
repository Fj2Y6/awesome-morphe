'use strict';
// Phase 0, spikes 2 and 3. The token is held in this variable only: never stored,
// never written to the page, cleared on Lock or when the tab closes.
const API = 'https://api.github.com';
const WORKFLOW = 'spike-request.yml';
const $ = (id) => document.getElementById(id);
let session = null;
let taps = 0;
let tapTimer = 0;

function log(line) {
  $('log').textContent += line + '\n';
}

async function gh(method, path, body) {
  const headers = { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + session.token };
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch { /* 204 has no body */ }
  return { status: res.status, data };
}

async function run(label, fn) {
  if (!session) { log('Locked.'); return; }
  try { await fn(); } catch (e) { log(label + ': failed to reach GitHub (' + e.name + ')'); }
}

function dispatch(request) {
  return gh('POST', '/repos/' + session.repo + '/actions/workflows/' + WORKFLOW + '/dispatches',
    { ref: 'main', inputs: { request: JSON.stringify(request) } });
}

$('logo').addEventListener('click', () => {
  taps += 1;
  clearTimeout(tapTimer);
  tapTimer = setTimeout(() => { taps = 0; }, 1500);
  if (taps >= 5) { taps = 0; $('unlock').showModal(); }
});

$('cancel').addEventListener('click', () => $('unlock').close());

$('unlock-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const repo = $('user').value.trim();
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(repo)) { log('Builder must look like owner/name.'); return; }
  session = { repo, token: $('pass').value };
  $('pass').value = '';
  $('unlock').close();
  $('tools').hidden = false;
  $('hint').hidden = true;
  log('Unlocked for this tab only.');
});

$('dispatch').addEventListener('click', () => run('Start test run', async () => {
  const r = await dispatch({ schema: 1, action: 'add', app: { package: 'com.example.test', name: 'Example' } });
  log('Start test run: HTTP ' + r.status + (r.status === 204 ? ' (accepted)' : ''));
}));

$('tricky').addEventListener('click', () => run('Tricky request', async () => {
  const r = await dispatch({ schema: 1, action: 'add', note: '$(id) `id` ${{ github.token }} "; exit 1' });
  log('Tricky request: HTTP ' + r.status + '. The run log must show only its length and keys.');
}));

$('status').addEventListener('click', () => run('Read last run', async () => {
  const r = await gh('GET', '/repos/' + session.repo + '/actions/workflows/' + WORKFLOW + '/runs?per_page=1');
  const w = r.data && r.data.workflow_runs && r.data.workflow_runs[0];
  log('Read last run: HTTP ' + r.status + (w ? ', ' + w.status + ' / ' + (w.conclusion || 'running') + ', ' + w.html_url : ''));
}));

$('write').addEventListener('click', () => run('Write test', async () => {
  const r = await gh('PUT', '/repos/' + session.repo + '/contents/spike-write-test.txt',
    { message: 'spike: should be refused', content: btoa('should be refused') });
  log('Write test: HTTP ' + r.status + (r.status === 403 || r.status === 404 ? ' (refused, as it should be)' : ' (NOT refused: stop and tell Isaac)'));
}));

$('lock').addEventListener('click', () => {
  session = null;
  $('tools').hidden = true;
  $('hint').hidden = false;
  log('Locked.');
});
