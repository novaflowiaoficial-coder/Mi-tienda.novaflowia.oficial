/* =========================================================
   Novaflowia — script.js  (versão vanilla, comentada)

   Responsabilidades:
   1) Inicializar o cliente Supabase (auth + dados).
   2) Buscar produtos da tabela `produtos` e renderizar no grid.
   3) Gerenciar carrinho em localStorage (com total em tempo real).
   4) Cadastro, login, logout e recuperação de senha.
   5) Inserir o pedido em `pedidos` no checkout.
   6) Verificar se o usuário é admin (mostra/oculta botão admin).
   ========================================================= */
if (!window.novaflowiaLoaded) {
window.novaflowiaLoaded = true;
const SUPABASE_URL = 'https://myfnhisnxlkagusgjhwt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15Zm5oaXNueGxrYWd1c2dqaHd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1NjE5NjYsImV4cCI6MjA5ODEzNzk2Nn0.qkoYXxUOQpRRJTPZhEJ5GcR0S57WbMA6z-pDQiYQWnk';

window.supabase_client = window.supabase_client || window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabase = window.supabase_client;

/* ---------- Helpers ---------- */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const formatBRL = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n || 0);

function parcelamento(total) {
  if (!total) return { parcelas: 1, valor: 0 };
  let parcelas = Math.min(10, Math.floor(total / 50)) || 1;
  return { parcelas, valor: total / parcelas };
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 3000);
}

/* =========================================================
   1) CARRINHO  (estado em localStorage, sempre recalculado)
   ========================================================= */
const CART_KEY = 'novaflowia_cart_v1';
let cart = JSON.parse(localStorage.getItem(CART_KEY) || '[]');

function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  renderCart();
  updateCartCount();
}

function addToCart(produto) {
  const found = cart.find((i) => i.id === produto.id);
  if (found) found.qty += 1;
  else cart.push({ ...produto, qty: 1 });
  saveCart();
  openDrawer('cart');
}

function updateQty(id, delta) {
  const it = cart.find((i) => i.id === id);
  if (!it) return;
  it.qty += delta;
  if (it.qty <= 0) cart = cart.filter((i) => i.id !== id);
  saveCart();
}

function removeItem(id) {
  cart = cart.filter((i) => i.id !== id);
  saveCart();
}

function cartSubtotal() {
  return cart.reduce((sum, i) => sum + i.preco * i.qty, 0);
}

function updateCartCount() {
  const count = cart.reduce((n, i) => n + i.qty, 0);
  const el = $('#cartCount');
  el.textContent = count;
  el.hidden = count === 0;
}

function renderCart() {
  const list = $('#cartItems');
  const foot = $('#cartFooter');

  if (cart.length === 0) {
    list.innerHTML = '<p class="muted center" style="padding:48px 24px;">Sua sacola está vazia.</p>';
    foot.hidden = true;
    return;
  }

  list.innerHTML = cart.map((i) => `
    <div class="cart-item">
      <img src="${i.imagem_url || ''}" alt="${i.nome}" />
      <div class="info">
        <h3>${i.nome}</h3>
        <span class="price">${formatBRL(i.preco * i.qty)}</span>
        <div class="qty">
          <button data-action="dec" data-id="${i.id}">−</button>
          <span>${i.qty}</span>
          <button data-action="inc" data-id="${i.id}">+</button>
          <button class="remove" data-action="rm" data-id="${i.id}">Remover</button>
        </div>
      </div>
    </div>
  `).join('');

  const sub = cartSubtotal();
  $('#cartSubtotal').textContent = formatBRL(sub);
  const par = parcelamento(sub);
  $('#cartParcel').textContent = `ou ${par.parcelas}x de ${formatBRL(par.valor)} sem juros`;
  foot.hidden = false;
}

$('#cartItems').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = btn.dataset.id;
  if (btn.dataset.action === 'inc') updateQty(id, +1);
  if (btn.dataset.action === 'dec') updateQty(id, -1);
  if (btn.dataset.action === 'rm')  removeItem(id);
});

/* =========================================================
   2) PRODUTOS — leitura da tabela `produtos`
   ========================================================= */
let allProducts = [];
let currentCategoria = 'todos';

function normalizar(txt) {
  return (txt || '').toString().toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function applyFilter(categoria) {
  currentCategoria = categoria;
  $$('.category-trigger').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.categoria === categoria)
  );
  const lista = categoria === 'todos'
    ? allProducts
    : allProducts.filter(p => normalizar(p.categoria) === normalizar(categoria));
  renderProducts(lista);
}

document.addEventListener('click', (e) => {
  const trig = e.target.closest('.category-trigger');
  if (!trig) return;
  e.preventDefault();
  applyFilter(trig.dataset.categoria);
  closeDrawer('menu');
  $('#colecao').scrollIntoView({ behavior: 'smooth' });
});

async function loadProducts() {
  const grid = $('#productGrid');
  if (!supabase) {
    grid.innerHTML = '<p class="muted">⚠️ Configure SUPABASE_URL e SUPABASE_ANON_KEY em script.js.</p>';
    return;
  }
  const { data, error } = await supabase
    .from('produtos')
    .select('id, nome, descricao, preco, imagem_url, categoria, avaliacao')
    .order('created_at', { ascending: false });

  if (error) {
    grid.innerHTML = `<p class="muted">Erro ao carregar produtos: ${error.message}</p>`;
    return;
  }
  if (!data?.length) {
    grid.innerHTML = '<p class="muted">Nenhum produto disponível ainda.</p>';
    return;
  }
  allProducts = data;
  applyFilter(currentCategoria);
}

function renderProducts(list) {
  $('#productGrid').innerHTML = list.map((p) => {
    const par = parcelamento(p.preco);
    return `
      <article class="card" data-id="${p.id}">
        <div class="card-media">
          ${p.imagem_url
        ? `<img src="${p.imagem_url}" alt="${p.nome}" loading="lazy"
       onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'no-image-icon',textContent:'🛍'}))" />`
  : `<div class="no-image-icon">🛍</div>`}
          <button class="card-add" data-add="${p.id}">Adicionar à sacola</button>
        </div>
        <div class="card-body">
          ${p.categoria ? `<span class="card-cat">${p.categoria}</span>` : ''}
          <h3 class="card-name">${p.nome}</h3>
          <div class="card-row">
            <span class="card-price">${formatBRL(p.preco)}</span>
            ${p.avaliacao ? `<span class="card-rating">★ ${Number(p.avaliacao).toFixed(1)}</span>` : ''}
          </div>
          <span class="card-parcel">em ${par.parcelas}x de ${formatBRL(par.valor)} sem juros</span>
        </div>
      </article>`;
  }).join('');

  $$('#productGrid [data-add]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = list.find((x) => x.id === btn.dataset.add);
      if (p) addToCart({ id: p.id, nome: p.nome, preco: p.preco, imagem_url: p.imagem_url });
    });
  });
}

/* =========================================================
   3) DRAWERS / MODAL — utilidades de abrir/fechar
   ========================================================= */
function openDrawer(kind) {
  if (kind === 'menu') $('#mobileMenu').hidden = false;
  if (kind === 'cart') $('#cartDrawer').hidden = false;
  if (kind === 'auth') $('#authModal').hidden = false;
}
function closeDrawer(kind) {
  if (kind === 'menu') $('#mobileMenu').hidden = true;
  if (kind === 'cart') $('#cartDrawer').hidden = true;
  if (kind === 'auth') $('#authModal').hidden = true;
}
document.addEventListener('click', (e) => {
  const close = e.target.closest('[data-close]');
  if (close) closeDrawer(close.dataset.close);
});

$('#menuBtn').addEventListener('click', () => openDrawer('menu'));
$('#cartBtn').addEventListener('click', () => openDrawer('cart'));
$('#accountBtn').addEventListener('click', (e) => { e.preventDefault(); openDrawer('auth'); });
$('#drawerAuthLink').addEventListener('click', (e) => { e.preventDefault(); closeDrawer('menu'); openDrawer('auth'); });

$('#searchBtn').addEventListener('click', () => {
  const bar = $('#searchBar');
  bar.hidden = !bar.hidden;
  if (!bar.hidden) $('#searchInput').focus();
});

$('#searchInput').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  $$('#productGrid .card').forEach((card) => {
    const name = card.querySelector('.card-name')?.textContent.toLowerCase() || '';
    card.style.display = name.includes(q) ? '' : 'none';
  });
});

/* =========================================================
   4) AUTENTICAÇÃO — abas: login / cadastro / recuperar
   ========================================================= */
$$('.tab').forEach((tab) => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});
$$('[data-goto]').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.goto)));

function switchTab(name) {
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  $('#loginForm').hidden  = name !== 'login';
  $('#signupForm').hidden = name !== 'signup';
  $('#forgotForm').hidden = name !== 'forgot';
}

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const { error } = await supabase.auth.signInWithPassword({
    email: f.get('email'), password: f.get('password'),
  });
  if (error) return toast('Falha no login: ' + error.message);
  toast('Bem-vindo de volta!');
  closeDrawer('auth');
  refreshAuthUI();
  checkAdmin();
});

$('#signupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const { data, error } = await supabase.auth.signUp({
    email: f.get('email'),
    password: f.get('password'),
    options: {
      emailRedirectTo: `${window.location.origin}/`,
      data: { nome: f.get('nome') },
    },
  });
  if (error) return toast('Não foi possível cadastrar: ' + error.message);

  if (data.user) {
    await supabase.from('perfis').upsert({ id: data.user.id, nome: f.get('nome') });
  }
  await fetch("https://hook.us2.make.com/3jp3bxh2ohc07eb9cc7q1tqd4m2q1tn3", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nombre: f.get('nome'), email: f.get('email') })
  });
  toast('Conta criada! Redirecionando…');
  closeDrawer('auth');
  refreshAuthUI();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

$('#forgotForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = new FormData(e.target).get('email');
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/`,
  });
  if (error) return toast('Erro: ' + error.message);
  toast('Enviamos um link para seu e-mail.');
});

async function refreshAuthUI() {
  if (!supabase) return;
  const { data } = await supabase.auth.getUser();
  const link = $('#drawerAuthLink');
  if (data.user) {
    link.textContent = 'Sair da conta';
    link.onclick = async (e) => { e.preventDefault(); await supabase.auth.signOut(); refreshAuthUI(); checkAdmin(); toast('Você saiu.'); };
  } else {
    link.textContent = 'Entrar / Cadastrar';
    link.onclick = (e) => { e.preventDefault(); closeDrawer('menu'); openDrawer('auth'); };
  }
}

/* =========================================================
   5) CHECKOUT — grava em `pedidos` (exige usuário logado)
   ========================================================= */
$('#checkoutBtn').addEventListener('click', async () => {
  if (!supabase) return toast('Configure as chaves do Supabase em script.js');
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) {
    closeDrawer('cart');
    openDrawer('auth');
    return toast('Faça login para concluir a compra.');
  }
  const btn = $('#checkoutBtn');
  btn.disabled = true; btn.textContent = 'Processando…';
  const { error } = await supabase.from('pedidos').insert({
    user_id: u.user.id,
    itens_json: cart,
    total: cartSubtotal(),
    status: 'pendente',
  });
  btn.disabled = false; btn.textContent = 'Finalizar compra';
  if (error) return toast('Erro: ' + error.message);

  toast('Pedido confirmado!');
  cart = []; saveCart();
  closeDrawer('cart');
});

/* =========================================================
   6) ADMIN — verifica se o usuário logado é admin
   🟢 Este bloco pertence à LOJA (script.js), diferente do
   painel admin (admin.js), que tem sua própria lógica de acesso.
   ========================================================= */
async function checkAdmin() {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) { $('#adminBtn').hidden = true; return; }
  const { data: perfil } = await supabase.from('perfis').select('is_admin').eq('id', u.user.id).single();
  $('#adminBtn').hidden = !perfil?.is_admin;
}

/* =========================================================
   BOOT
   ========================================================= */
$('#year').textContent = new Date().getFullYear();
updateCartCount();
renderCart();
loadProducts();
refreshAuthUI();
checkAdmin();
}
  
