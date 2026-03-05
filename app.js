const API_BASE = '/api';

function getToken() { return localStorage.getItem('token'); }
function setToken(t) { localStorage.setItem('token', t); }
function clearToken() { localStorage.removeItem('token'); }

async function api(path, method = 'GET', body) {
  const headers = { 'Content-Type': 'application/json' };
  const t = getToken();
  if (t) headers['Authorization'] = 'Bearer ' + t;
  try {
    const r = await fetch(API_BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    
    // Check if response is JSON
    const contentType = r.headers.get('content-type');
    let data;
    if (contentType && contentType.includes('application/json')) {
      data = await r.json();
    } else {
      const text = await r.text();
      if (!r.ok) throw new Error(text || 'Server error');
      return text;
    }

    if (!r.ok) {
      if (r.status === 401) {
        clearToken();
        if (!window.location.pathname.includes('login.html') && !window.location.pathname.includes('index.html')) {
          window.location.href = '/login.html';
        }
      }
      throw new Error(data.error || 'error');
    }
    return data;
  } catch (e) {
    console.error(e);
    throw e;
  }
}

// Auth Actions
async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const pass = document.getElementById('loginPass').value;
  try {
    const r = await api('/auth/login', 'POST', { email, password: pass });
    setToken(r.token);
    window.location.href = '/profile.html';
  } catch (err) {
    let msg = 'Ошибка входа';
    if (err.message === 'invalid') {
      msg = 'Неверная почта или пароль';
    } else if (err.message === 'not_found') {
      msg = 'Пользователь с такой почтой не найден';
    }
    showAlert(msg, 'danger');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('regName').value;
  const email = document.getElementById('regEmail').value;
  const pass = document.getElementById('regPass').value;
  try {
    const r = await api('/auth/register', 'POST', { email, password: pass, name });
    setToken(r.token);
    window.location.href = '/profile.html';
  } catch (err) {
    let msg = 'Ошибка регистрации';
    if (err.message === 'exists') {
      msg = 'Пользователь с такой почтой уже существует';
    } else if (err.message === 'invalid') {
      msg = 'Пожалуйста, заполните все поля корректно';
    }
    showAlert(msg, 'danger');
  }
}

function showAlert(msg, type) {
  const el = document.getElementById('authAlert');
  if (el) {
    el.textContent = msg;
    el.className = `alert alert-${type} mt-3`;
    el.classList.remove('d-none');
  } else {
    alert(msg);
  }
}

// Check for completed videos to show checkmarks
let completedVideos = new Set();

// Navigation
async function initNav() {
  const nav = document.getElementById('navLinks');
  if (!nav) return;

  const t = getToken();
  let user = null;
  if (t) {
    try {
      const data = await api('/profile/me');
      user = data.user;
      completedVideos = new Set(data.completedVideoIds || []);
    } catch (e) {}
  }

  let html = `
    <li class="nav-item"><a class="nav-link" href="/">Главная</a></li>
    <li class="nav-item"><a class="nav-link" href="/about.html">О нас</a></li>
  `;

  if (user) {
    html += `
      <li class="nav-item"><a class="nav-link" href="/videos.html">Видеоуроки</a></li>
      <li class="nav-item"><a class="nav-link" href="/assignments.html">Задания</a></li>
      <li class="nav-item"><a class="nav-link" href="/profile.html">Профиль</a></li>
    `;
    if (user.role === 'admin') {
      html += `<li class="nav-item"><a class="nav-link" href="/admin.html">Админ</a></li>`;
    }
    html += `
      <li class="nav-item"><a class="btn btn-outline-danger btn-sm ms-3" href="#" onclick="logout()">Выход</a></li>
    `;
  } else {
    html += `
      <li class="nav-item"><a class="btn btn-primary btn-sm ms-3 px-3" href="/login.html">Войти</a></li>
    `;
  }
  nav.innerHTML = html;
}

function logout() {
  clearToken();
  window.location.href = '/';
}

// Global Redirect Function
function startLearning() {
  const token = getToken();
  if (token) {
    window.location.href = '/videos.html';
  } else {
    window.location.href = '/login.html';
  }
}

// Video Player Logic
async function loadVideo(id) {
  try {
    const data = await api(`/videos/${id}`);
    const v = data.video;
    
    document.title = v.title + ' - Stereometry Online';
    document.getElementById('videoTitle').textContent = v.title;
    document.getElementById('videoTopic').textContent = v.topic;
    document.getElementById('videoDate').textContent = new Date(v.published_at).toLocaleDateString();
    
    // Render content (HTML safe? In a real app we'd sanitize. Here we assume admin is trusted)
    const contentEl = document.getElementById('videoContent');
    if (v.content) {
       contentEl.innerHTML = v.content;
    } else {
       contentEl.innerHTML = `<p>${v.description || 'Нет описания.'}</p>`;
    }

    const player = document.getElementById('player');
    if (Hls.isSupported() && v.url.endsWith('.m3u8')) {
      const hls = new Hls();
      hls.loadSource(v.url);
      hls.attachMedia(player);
    } else {
      player.src = v.url;
    }
    
    player.onended = () => api('/profile/video-progress', 'POST', { video_id: v.id, status: 'watched', watched_seconds: Math.floor(player.duration) }).catch(console.error);

    // Comments
    renderComments(data.comments);
    
    // Setup comment form
    document.getElementById('commentForm').onsubmit = async (e) => {
      e.preventDefault();
      const txt = document.getElementById('commentText').value;
      await api(`/videos/${id}/comments`, 'POST', { content: txt });
      document.getElementById('commentText').value = '';
      loadVideo(id); // reload to see if approved or pending msg
    };

    // Assignments
    const asgs = await api(`/assignments?video_id=${id}`);
    const aList = document.getElementById('assignmentsList');
    if (asgs.length) {
      aList.innerHTML = asgs.map(a => `
        <div class="list-group-item">
          <div class="fw-bold">${a.title}</div>
          <div class="small mb-1 badge bg-${a.type === 'theory' ? 'info' : 'warning'}">${a.type === 'theory' ? 'Теория' : 'Практика'}</div>
          <p class="mb-0 small">${a.content}</p>
        </div>
      `).join('');
    }

  } catch (e) {
    console.error(e);
  }
}

function renderComments(comments) {
  const list = document.getElementById('commentsList');
  if (!comments || !comments.length) {
    list.innerHTML = '<p class="text-muted">Нет комментариев.</p>';
    return;
  }
  list.innerHTML = comments.map(c => `
    <div class="comment-item d-flex">
      <div class="comment-avatar">${c.user_name[0].toUpperCase()}</div>
      <div>
        <div class="fw-bold">${c.user_name} <span class="text-muted small fw-normal ms-2">${new Date(c.created_at).toLocaleString()}</span></div>
        <div>${c.content}</div>
      </div>
    </div>
  `).join('');
}

// Profile Logic
async function loadProfile() {
  try {
    const data = await api('/profile/me');
    const u = data.user;
    
    document.getElementById('profileName').textContent = u.name || u.email;
    document.getElementById('profileEmail').textContent = u.email;
    document.getElementById('profilePoints').textContent = u.points || 0;
    
    document.getElementById('statWatched').textContent = data.stats.watched;
    document.getElementById('statTotal').textContent = data.stats.totalVideos;
    const pct = data.stats.totalVideos ? Math.round((data.stats.watched / data.stats.totalVideos) * 100) : 0;
    document.getElementById('progressText').textContent = `${pct}%`;
    document.getElementById('progressBar').style.width = `${pct}%`;

    const achList = document.getElementById('achievementsList');
    if (data.achievements && data.achievements.length) {
      achList.innerHTML = data.achievements.map(a => `
        <div class="achievement-badge" title="${a.description}">
          <span class="fs-5 me-1">${a.icon}</span> ${a.title}
        </div>
      `).join('');
    } else {
      achList.innerHTML = '<p class="text-muted small">Пока нет достижений. Смотри видео и учись!</p>';
    }

  } catch (e) {
    window.location.href = '/login.html';
  }
}

// Global init
document.addEventListener('DOMContentLoaded', () => {
  initNav();
  if (window.location.pathname.includes('profile.html')) loadProfile();
});
