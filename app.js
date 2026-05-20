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
    
    player.onended = () => api('/profile/video-progress', 'POST', { video_id: v.id, status: 'completed', watched_seconds: Math.floor(player.duration) }).catch(console.error);

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
    _profileData = data; // Store for certificate generation
    const u = data.user;
    
    document.getElementById('profileName').textContent = u.name || u.email;
    document.getElementById('profileEmail').textContent = u.email;
    
    const initials = (u.name || u.email)[0].toUpperCase();
    document.getElementById('profileInitials').textContent = initials;
    
    document.getElementById('statWatched').textContent = data.stats.watched;
    document.getElementById('statTotal').textContent = data.stats.totalVideos;
    const pct = data.stats.totalVideos ? Math.round((data.stats.watched / data.stats.totalVideos) * 100) : 0;
    document.getElementById('progressText').textContent = `${pct}%`;
    document.getElementById('progressBar').style.width = `${pct}%`;

    // Render Certificate
    const certBlock = document.getElementById('certificateBlock');
    if (data.hasCertificate) {
      certBlock.classList.remove('d-none');
    }

    // Render Watched Videos
    const watchedList = document.getElementById('watchedVideosList');
    if (data.watchedVideosDetails && data.watchedVideosDetails.length) {
      watchedList.innerHTML = data.watchedVideosDetails.map(w => `
        <tr>
          <td><i class="fas fa-play-circle text-primary me-2"></i> ${w.title}</td>
          <td class="text-muted">${new Date(w.updated_at).toLocaleDateString()}</td>
          <td class="text-end"><span class="badge bg-success">Просмотрено</span></td>
        </tr>
      `).join('');
    } else {
      watchedList.innerHTML = '<tr><td colspan="3" class="text-center text-muted">Вы еще не посмотрели ни одного видео.</td></tr>';
    }

    // Render Grades
    const gradesList = document.getElementById('gradesList');
    if (data.gradedSubmissions && data.gradedSubmissions.length) {
      gradesList.innerHTML = data.gradedSubmissions.map(g => {
        const badgeColor = g.grade >= 4 ? 'success' : (g.grade === 3 ? 'warning' : 'danger');
        return `
        <tr>
          <td>
            <div class="fw-bold">${g.assignment_title}</div>
            <div class="small text-muted">${g.video_title || 'Задание'}</div>
          </td>
          <td><span class="badge bg-${badgeColor} fs-6">${g.grade}</span></td>
          <td class="text-muted small">${g.feedback || '-'}</td>
          <td class="text-end text-muted small">${new Date(g.created_at).toLocaleDateString()}</td>
        </tr>
      `}).join('');
    } else {
      gradesList.innerHTML = '<tr><td colspan="4" class="text-center text-muted">У вас пока нет проверенных заданий.</td></tr>';
    }

  } catch (e) {
    window.location.href = '/login.html';
  }
}

// Certificate Generation
let _profileData = null; // Store profile data for certificate

function generateCertificate() {
  if (!_profileData) return;
  const canvas = document.getElementById('certCanvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  // === Background ===
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, '#fdfcfb');
  bgGrad.addColorStop(1, '#f5f0e8');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // === Decorative outer border ===
  ctx.strokeStyle = '#b8860b';
  ctx.lineWidth = 6;
  ctx.strokeRect(30, 30, W - 60, H - 60);
  ctx.strokeStyle = '#daa520';
  ctx.lineWidth = 2;
  ctx.strokeRect(45, 45, W - 90, H - 90);

  // === Corner ornaments ===
  drawCornerOrnament(ctx, 50, 50, 1, 1);
  drawCornerOrnament(ctx, W - 50, 50, -1, 1);
  drawCornerOrnament(ctx, 50, H - 50, 1, -1);
  drawCornerOrnament(ctx, W - 50, H - 50, -1, -1);

  // === Top decorative line ===
  ctx.strokeStyle = '#daa520';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(200, 140);
  ctx.lineTo(W - 200, 140);
  ctx.stroke();

  // === Medal icon (drawn) ===
  drawMedal(ctx, W / 2, 210);

  // === "СЕРТИФИКАТ" ===
  ctx.fillStyle = '#1a1a2e';
  ctx.font = 'bold 72px Montserrat, Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('СЕРТИФИКАТ', W / 2, 340);

  // === Subtitle ===
  ctx.fillStyle = '#555';
  ctx.font = '26px Montserrat, Georgia, serif';
  ctx.fillText('об успешном прохождении онлайн-курса', W / 2, 390);

  // === Decorative divider ===
  ctx.strokeStyle = '#daa520';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 120, 420);
  ctx.lineTo(W / 2 + 120, 420);
  ctx.stroke();
  // Diamond in center
  ctx.fillStyle = '#daa520';
  ctx.beginPath();
  ctx.moveTo(W / 2, 412);
  ctx.lineTo(W / 2 + 8, 420);
  ctx.lineTo(W / 2, 428);
  ctx.lineTo(W / 2 - 8, 420);
  ctx.closePath();
  ctx.fill();

  // === "Настоящим удостоверяется, что" ===
  ctx.fillStyle = '#666';
  ctx.font = 'italic 24px Montserrat, Georgia, serif';
  ctx.fillText('Настоящим подтверждается, что', W / 2, 480);

  // === Student Name ===
  const userName = _profileData.user.name || _profileData.user.email;
  ctx.fillStyle = '#1a1a2e';
  ctx.font = 'bold 56px Montserrat, Georgia, serif';
  ctx.fillText(userName, W / 2, 550);

  // === Underline under name ===
  const nameWidth = ctx.measureText(userName).width;
  ctx.strokeStyle = '#daa520';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W / 2 - nameWidth / 2 - 20, 565);
  ctx.lineTo(W / 2 + nameWidth / 2 + 20, 565);
  ctx.stroke();

  // === Description ===
  ctx.fillStyle = '#555';
  ctx.font = '24px Montserrat, Georgia, serif';
  ctx.fillText('успешно завершил(а) все разделы образовательного курса', W / 2, 620);

  // === Course Name ===
  ctx.fillStyle = '#4a47a3';
  ctx.font = 'bold 44px Montserrat, Georgia, serif';
  ctx.fillText('«Стереометрия»', W / 2, 690);

  ctx.fillStyle = '#777';
  ctx.font = '22px Montserrat, Georgia, serif';
  ctx.fillText('на платформе Stereometry Online', W / 2, 730);

  // === Stats line ===
  const stats = _profileData.stats;
  ctx.fillStyle = '#888';
  ctx.font = '20px Montserrat, Georgia, serif';
  ctx.fillText(`Просмотрено уроков: ${stats.watched} из ${stats.totalVideos}  •  Выполнено заданий: ${stats.completedWithAssignments || stats.watched}`, W / 2, 780);

  // === Bottom decorative line ===
  ctx.strokeStyle = '#daa520';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(200, 820);
  ctx.lineTo(W - 200, 820);
  ctx.stroke();

  // === Date and Certificate ID ===
  const today = new Date();
  const dateStr = today.toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' });
  const certId = 'SO-' + today.getFullYear() + '-' + String(_profileData.user.id).padStart(4, '0');

  // Left: Date
  ctx.textAlign = 'left';
  ctx.fillStyle = '#888';
  ctx.font = '20px Montserrat, Georgia, serif';
  ctx.fillText('Дата выдачи:', 120, 880);
  ctx.fillStyle = '#333';
  ctx.font = 'bold 22px Montserrat, Georgia, serif';
  ctx.fillText(dateStr, 120, 910);

  // Right: Certificate ID
  ctx.textAlign = 'right';
  ctx.fillStyle = '#888';
  ctx.font = '20px Montserrat, Georgia, serif';
  ctx.fillText('Номер сертификата:', W - 120, 880);
  ctx.fillStyle = '#333';
  ctx.font = 'bold 22px Montserrat, Georgia, serif';
  ctx.fillText(certId, W - 120, 910);

  // Center: Signature line
  ctx.textAlign = 'center';
  ctx.strokeStyle = '#999';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 100, 905);
  ctx.lineTo(W / 2 + 100, 905);
  ctx.stroke();
  ctx.fillStyle = '#888';
  ctx.font = '18px Montserrat, Georgia, serif';
  ctx.fillText('Преподаватель', W / 2, 930);

  // === Bottom footer ===
  ctx.fillStyle = '#bbb';
  ctx.font = '16px Montserrat, Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('stereometryonline.vercel.app', W / 2, 1000);

  // === Watermark seal ===
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = '#4a47a3';
  ctx.font = 'bold 200px Montserrat, Georgia, serif';
  ctx.translate(W / 2, H / 2 + 50);
  ctx.rotate(-0.3);
  ctx.fillText('VERIFIED', 0, 0);
  ctx.restore();

  // === Bottom decorative border ===
  ctx.strokeStyle = '#daa520';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(200, 1040);
  ctx.lineTo(W - 200, 1040);
  ctx.stroke();

  // === Download ===
  const link = document.createElement('a');
  link.download = `Сертификат_${userName.replace(/\s+/g, '_')}_StereometryOnline.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

function drawCornerOrnament(ctx, x, y, dx, dy) {
  ctx.save();
  ctx.strokeStyle = '#daa520';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + dx * 60, y);
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + dy * 60);
  // Small arc
  ctx.moveTo(x + dx * 15, y + dy * 15);
  ctx.arc(x + dx * 15, y + dy * 15, 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawMedal(ctx, x, y) {
  // Ribbon tails
  ctx.fillStyle = '#c0392b';
  ctx.beginPath();
  ctx.moveTo(x - 25, y + 10);
  ctx.lineTo(x - 35, y + 55);
  ctx.lineTo(x - 15, y + 40);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#2980b9';
  ctx.beginPath();
  ctx.moveTo(x + 25, y + 10);
  ctx.lineTo(x + 35, y + 55);
  ctx.lineTo(x + 15, y + 40);
  ctx.closePath();
  ctx.fill();

  // Medal circle
  const grad = ctx.createRadialGradient(x, y, 5, x, y, 35);
  grad.addColorStop(0, '#f9d423');
  grad.addColorStop(1, '#daa520');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#b8860b';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Star inside medal
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 30px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('★', x, y + 2);
  ctx.textBaseline = 'alphabetic';
}

// Global init
document.addEventListener('DOMContentLoaded', () => {
  initNav();
  if (window.location.pathname.includes('profile.html')) loadProfile();
});
