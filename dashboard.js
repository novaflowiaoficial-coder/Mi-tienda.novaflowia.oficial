   /* =========================================================
   Novaflowia — dashboard.js
   Painel de administração: lista de clientes + gráfico de registros.

   Segurança:
   - Este arquivo só CONTROLA A EXIBIÇÃO (esconde/mostra o painel).
   - A segurança REAL está na função RPC `get_all_perfis` do Supabase,
     que deve verificar internamente se quem chama é admin
     (ex.: usando auth.uid() + checagem de is_admin dentro da função,
     com SECURITY DEFINER). O client nunca deve ser a única barreira.
   ========================================================= */
if (!window.novaflowiaAdminLoaded) {
window.novaflowiaAdminLoaded = true;

const SUPABASE_URL = 'https://myfnhisnxlkagusgjhwt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15Zm5oaXNueGxrYWd1c2dqaHd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1NjE5NjYsImV4cCI6MjA5ODEzNzk2Nn0.qkoYXxUOQpRRJTPZhEJ5GcR0S57WbMA6z-pDQiYQWnk';

// 🟢 Reaproveita a mesma instância do cliente se script.js já rodou nesta página
window.supabase_client = window.supabase_client || window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabase = window.supabase_client;

/* ---------- Helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);

let chartInstance = null;
let allClientes = [];
let toastTimer;

function toast(msg) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 3000);
}

function denyAccess() {
  $('#accessDenied').hidden = false;
  $('#dashboardContent').hidden = true;
}

function showDashboard() {
  $('#accessDenied').hidden = true;
  $('#dashboardContent').hidden = false;
}

/* =========================================================
   CARREGAMENTO DOS DADOS
   ========================================================= */
async function loadDashboard() {
  const { data, error } = await supabase.rpc('get_all_perfis');

  if (error) {
    $('#adminClientList').innerHTML = `<p class="muted">Erro ao carregar dados: ${error.message}</p>`;
    return;
  }

  allClientes = data || [];
  $('#statTotal').textContent = allClientes.length;
  $('#statUltimo').textContent = allClientes[0]
    ? new Date(allClientes[0].created_at).toLocaleString('pt-BR')
    : '—';

  renderClientList(allClientes);
  renderChart(allClientes);
}

function renderClientList(list) {
  const box = $('#adminClientList');
  if (!list.length) {
    box.innerHTML = '<p class="muted center">Nenhum cliente encontrado.</p>';
    return;
  }
  box.innerHTML = list.map(c => `
    <div class="admin-client-row">
      <span class="name">${c.nome || '(sem nome)'}</span>
      <span class="date">${new Date(c.created_at).toLocaleDateString('pt-BR')}</span>
    </div>
  `).join('');
}

function renderChart(list) {
  const canvas = $('#chartRegistros');
  if (!canvas || typeof Chart === 'undefined') return;

  const counts = {};
  list.forEach(c => {
    const day = new Date(c.created_at).toLocaleDateString('pt-BR');
    counts[day] = (counts[day] || 0) + 1;
  });
  const labels = Object.keys(counts).reverse();
  const values = Object.values(counts).reverse();

  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{ label: 'Registros', data: values, borderColor: '#c9a96e', tension: 0.3, fill: false }],
    },
    options: { responsive: true, plugins: { legend: { display: false } } },
  });
}

/* =========================================================
   BUSCA
   ========================================================= */
$('#adminSearch').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  renderClientList(allClientes.filter(c => (c.nome || '').toLowerCase().includes(q)));
});

/* =========================================================
   LOGOUT
   ========================================================= */
$('#logoutBtn').addEventListener('click', async () => {
  await supabase.auth.signOut();
  window.location.href = 'index.html';
});

/* =========================================================
   CONTROLE DE ACESSO
   getSession() responde imediatamente com a sessão já existente,
   sem depender de esperar um evento do onAuthStateChange.
   ========================================================= */
async function checkAccess() {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) { denyAccess(); return; }

  const { data: perfil, error } = await supabase
    .from('perfis')
    .select('is_admin')
    .eq('id', session.user.id)
    .single();

  if (error || !perfil?.is_admin) { denyAccess(); return; }

  showDashboard();
  loadDashboard();
}

// Checagem inicial imediata ao carregar a página
checkAccess();

// Só reage a mudanças futuras (login/logout na mesma aba)
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') denyAccess();
  if (event === 'SIGNED_IN') checkAccess();
});

}
