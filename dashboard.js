const SUPABASE_URL = 'https://myfnhisnxlkagusgjhwt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15Zm5oaXNueGxrYWd1c2dqaHd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1NjE5NjYsImV4cCI6MjA5ODEzNzk2Nn0.qkoYXxUOQpRRJTPZhEJ5GcR0S57WbMA6z-pDQiYQWnk';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = (sel) => document.querySelector(sel);

let chartInstance = null;
let allClientes = [];

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 3000);
}

function denyAccess() {
  $('#accessDenied').hidden = false;
  $('#dashboardContent').hidden = true;
}

async function loadDashboard() {
  // 🟡 Usa la función RPC que bypassa RLS solo si eres admin
  const { data, error } = await supabase.rpc('get_all_perfis');

  if (error || !data) {
    $('#adminClientList').innerHTML = `<p class="muted">Erro: ${error?.message || 'sem dados'}</p>`;
    return;
  }

  allClientes = data;
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

$('#adminSearch').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  renderClientList(allClientes.filter(c => (c.nome || '').toLowerCase().includes(q)));
});

function renderChart(list) {
  const counts = {};
  list.forEach(c => {
    const day = new Date(c.created_at).toLocaleDateString('pt-BR');
    counts[day] = (counts[day] || 0) + 1;
  });
  const labels = Object.keys(counts).reverse();
  const values = Object.values(counts).reverse();

  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart($('#chartRegistros'), {
    type: 'line',
    data: {
      labels,
      datasets: [{ label: 'Registros', data: values, borderColor: '#c9a96e', tension: 0.3, fill: false }],
    },
    options: { responsive: true, plugins: { legend: { display: false } } },
  });
}

$('#logoutBtn').addEventListener('click', async () => {
  await supabase.auth.signOut();
  window.location.href = 'index.html';
});

// 🟡 onAuthStateChange espera que Supabase cargue la sesión antes de verificar
// Esto arregla el problema de "aparece/desaparece"
supabase.auth.onAuthStateChange(async (event, session) => {
  if (!session) { denyAccess(); return; }

  const { data: perfil, error } = await supabase
    .from('perfis')
    .select('is_admin')
    .eq('id', session.user.id)
    .single();

  if (error || !perfil?.is_admin) { denyAccess(); return; }

  $('#dashboardContent').hidden = false;
  loadDashboard();
});
