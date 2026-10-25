import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Supabase: Project URL und Publishable Key hier eintragen.
// Niemals einen sb_secret_- oder service_role-Key in den Browsercode setzen.
const SUPABASE_URL = 'https://ykxtcimsxmpmftlhzgyp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_rdgP2E0Gh70RSqzmpL3Qvw_UeAB0kXL';


document
  .getElementById("forgot-password")
  ?.addEventListener("click", async () => {
    const email = prompt(
      "Gib deine registrierte E-Mail-Adresse ein:"
    );

    if (!email) return;

    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      {
        redirectTo: window.location.origin + "/reset-password.html"
      }
    );

    if (error) {
      alert("Fehler: " + error.message);
    } else {
      alert(
        "Wenn die Adresse registriert ist, erhältst du eine E-Mail zum Zurücksetzen des Passworts."
      );
    }
  });




const configured = SUPABASE_URL.startsWith('https://') &&
  SUPABASE_KEY.startsWith('sb_publishable_');
const db = configured ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

const $ = id => document.getElementById(id);
let currentUser = null;
let authMode = 'signup';
let route = 'home';
let routeValue = '';

function setStatus(id, text, error = false) {
  $(id).textContent = text;
  $(id).style.color = error ? '#fb929c' : '';
}
function el(tag, cls = '', text = '') {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== '') n.textContent = text;
  return n;
}
function usernameOf(user) {
  return user?.user_metadata?.username || user?.email?.split('@')[0] || 'user';
}
function dateText(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' :
    d.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
}
function makeAvatar(url, name, big = false) {
  const a = el('div', 'avatar' + (big ? ' big' : ''));
  if (url) {
    const img = document.createElement('img');
    img.src = url;
    img.alt = 'Profilbild von ' + name;
    a.append(img);
  } else {
    a.textContent = (name || '?').slice(0, 1).toUpperCase();
  }
  return a;
}
// Rendert Text sicher als Text und macht @Namen/#Hashtags anklickbar.
function richText(container, text) {
  const re = /(^|\s)(#[\p{L}\p{N}_]+|@[\p{L}\p{N}_]+)/gu;
  let last = 0, match;
  while ((match = re.exec(text)) !== null) {
    container.append(document.createTextNode(text.slice(last, match.index)));
    container.append(document.createTextNode(match[1]));
    const token = match[2];
    const link = el('a', 'rich-link', token);
    link.href = token.startsWith('#')
      ? '#hashtag/' + encodeURIComponent(token.slice(1).toLowerCase())
      : '#profile/' + encodeURIComponent(token.slice(1).toLowerCase());
    container.append(link);
    last = re.lastIndex;
  }
  container.append(document.createTextNode(text.slice(last)));
}
function setAuthUI() {
  const signedIn = !!currentUser;
  $('authForm').classList.toggle('hidden', signedIn);
  $('logout').classList.toggle('hidden', !signedIn);
  $('authHeading').textContent = signedIn ? 'Du bist angemeldet' :
    (authMode === 'signup' ? 'Willkommen bei Nova' : 'Willkommen zurück');
  $('sideAccount').textContent = signedIn ? '@' + usernameOf(currentUser) : 'Nicht angemeldet';
  $('composer').classList.toggle('hidden', !signedIn || !['home', 'compose'].includes(route));
  $('profileEditor').classList.toggle('hidden', !signedIn || route !== 'account');
  if (signedIn && route === 'account') loadMyProfile();
}
function setRoute() {
  const hash = decodeURIComponent(location.hash || '#home');
  const parts = hash.slice(1).split('/');
  route = parts[0] || 'home';
  routeValue = parts.slice(1).join('/');
  if (!['home', 'compose', 'account', 'profile', 'hashtag'].includes(route)) route = 'home';

  $('authPanel').classList.toggle('hidden', route !== 'account');
  $('feedSection').classList.toggle('hidden', !['home', 'compose', 'hashtag'].includes(route));
  $('profileView').classList.toggle('hidden', route !== 'profile');
  $('pageTitle').textContent = ({
    home: 'Für dich', compose: 'Beitrag schreiben', account: 'Mein Konto',
    profile: 'Profil', hashtag: '#' + routeValue
  })[route] || 'Nova';

  document.querySelectorAll('.nav a').forEach(a =>
    a.classList.toggle('active', a.dataset.route === route));
  setAuthUI();

  if (!db) {
    $('feedStatus').textContent = 'Setup nötig: Supabase Project URL und Publishable Key in app.js eintragen.';
    return;
  }
  if (route === 'profile') loadProfilePage(routeValue);
  else if (['home', 'compose', 'hashtag'].includes(route)) loadFeed();
}
async function loadMyProfile() {
  if (!db || !currentUser) return;
  const { data, error } = await db.from('profiles')
    .select('username, avatar_url').eq('id', currentUser.id).maybeSingle();
  if (error) return setStatus('profileStatus', error.message, true);
  const oldAvatar = $('myAvatar');
  const newAvatar = makeAvatar(data?.avatar_url, data?.username || usernameOf(currentUser), true);
  newAvatar.id = 'myAvatar';
  oldAvatar.replaceWith(newAvatar);
  setStatus('profileStatus', data?.username ? '@' + data.username : 'Profil wird eingerichtet.');
}
async function uploadAvatar(file) {
  if (!db || !currentUser || !file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    return setStatus('profileStatus', 'Bitte JPG, PNG oder WebP auswählen.', true);
  if (file.size > 2 * 1024 * 1024)
    return setStatus('profileStatus', 'Das Bild darf maximal 2 MB groß sein.', true);

  setStatus('profileStatus', 'Bild wird hochgeladen …');
  const ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' })[file.type];
  const path = currentUser.id + '/' + crypto.randomUUID() + '.' + ext;
  try {
    const { error: uploadError } = await db.storage.from('avatars').upload(path, file, {
      contentType: file.type, upsert: false
    });
    if (uploadError) throw uploadError;
    const { data: urlData } = db.storage.from('avatars').getPublicUrl(path);
    const { error: saveError } = await db.from('profiles')
      .update({ avatar_url: urlData.publicUrl }).eq('id', currentUser.id);
    if (saveError) throw saveError;
    setStatus('profileStatus', 'Profilbild gespeichert.');
    await loadMyProfile();
    await loadFeed();
  } catch (e) {
    console.error(e);
    setStatus('profileStatus', e.message || 'Upload fehlgeschlagen.', true);
  }
}
$('fileInput').addEventListener('change', e => uploadAvatar(e.target.files?.[0]));

async function loadFeed() {
  if (!db) return;
  $('reload').disabled = true;
  $('feedStatus').textContent = 'Beiträge werden geladen …';
  try {
    const { data, error } = await db.from('posts')
      .select('id,user_id,content,created_at,profiles!posts_user_id_fkey(username,avatar_url),likes(user_id)')
      .order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    let posts = data || [];
    if (route === 'hashtag') {
      const needle = '#' + routeValue.toLowerCase();
      posts = posts.filter(p => p.content.toLowerCase().includes(needle));
      $('feedStatus').textContent = posts.length ? 'Beiträge mit ' + needle : 'Noch keine Beiträge mit ' + needle;
    } else {
      $('feedStatus').textContent = posts.length ? 'Die neuesten Beiträge' : 'Noch keine Beiträge. Sei der Erste!';
    }
    $('feed').replaceChildren();
    for (const post of posts) $('feed').append(await buildPost(post));
  } catch (e) {
    console.error(e);
    $('feedStatus').textContent = 'Feed-Fehler: ' + (e.message || 'Bitte Tabellen, Fremdschlüssel und RLS prüfen.');
  } finally {
    $('reload').disabled = false;
  }
}
async function buildPost(post) {
  const card = el('article', 'post');
  const profile = post.profiles || {};
  const name = profile.username || 'user';
  const head = el('div', 'post-head');
  const av = makeAvatar(profile.avatar_url, name);
  av.style.cursor = 'pointer';
  av.addEventListener('click', () => location.hash = '#profile/' + encodeURIComponent(name));
  const meta = el('div', 'post-meta');
  const userLink = el('a', 'username', '@' + name);
  userLink.href = '#profile/' + encodeURIComponent(name);
  meta.append(userLink, el('div', 'date', dateText(post.created_at)));
  head.append(av, meta);
  card.append(head);

  const content = el('div', 'post-content');
  richText(content, post.content);
  card.append(content);

  const actions = el('div', 'post-actions');
  const likes = post.likes || [];
  const liked = !!currentUser && likes.some(x => x.user_id === currentUser.id);
  const like = el('button', 'action' + (liked ? ' liked' : ''), (liked ? '♥' : '♡') + ' ' + likes.length);
  like.type = 'button';
  like.addEventListener('click', () => toggleLike(post.id, liked));
  const replyButton = el('button', 'action', '💬 Antworten');
  replyButton.type = 'button';
  actions.append(like, replyButton);
  if (currentUser?.id === post.user_id) {
    const del = el('button', 'action delete', 'Löschen');
    del.type = 'button';
    del.addEventListener('click', () => deletePost(post.id));
    actions.append(del);
  }
  card.append(actions);

  const replyArea = el('div', 'reply-area hidden');
  replyButton.addEventListener('click', async () => {
    const opening = replyArea.classList.contains('hidden');
    replyArea.classList.toggle('hidden');
    if (opening) await loadReplies(post.id, replyArea);
  });
  card.append(replyArea);
  return card;
}
async function loadReplies(postId, area) {
  area.replaceChildren(el('p', 'status', 'Antworten werden geladen …'));
  try {
    const { data, error } = await db.from('replies')
      .select('id,user_id,content,created_at,profiles!replies_user_id_fkey(username,avatar_url)')
      .eq('post_id', postId).order('created_at', { ascending: true });
    if (error) throw error;
    area.replaceChildren();
    if (!data.length) area.append(el('p', 'status', 'Noch keine Antworten.'));
    for (const reply of data) {
      const item = el('div', 'reply');
      const name = reply.profiles?.username || 'user';
      const link = el('a', 'rich-link', '@' + name);
      link.href = '#profile/' + encodeURIComponent(name);
      item.append(link, el('div', 'date', dateText(reply.created_at)));
      const text = el('div');
      richText(text, reply.content);
      item.append(text);
      if (currentUser?.id === reply.user_id) {
        const del = el('button', 'action', 'Antwort löschen');
        del.type = 'button';
        del.addEventListener('click', async () => {
          const { error: deleteError } = await db.from('replies').delete()
            .eq('id', reply.id).eq('user_id', currentUser.id);
          if (deleteError) alert(deleteError.message);
          else loadReplies(postId, area);
        });
        item.append(del);
      }
      area.append(item);
    }
    if (currentUser) {
      const form = el('form');
      const input = el('textarea');
      input.rows = 2; input.maxLength = 280; input.required = true;
      input.placeholder = 'Schreibe eine Antwort …';
      const submit = el('button', 'btn small', 'Antworten');
      submit.type = 'submit';
      form.append(input, submit);
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const content = input.value.trim();
        if (!content) return;
        submit.disabled = true;
        const { error: insertError } = await db.from('replies').insert({
          post_id: postId, user_id: currentUser.id, content
        });
        submit.disabled = false;
        if (insertError) return alert('Antwort fehlgeschlagen: ' + insertError.message);
        await loadReplies(postId, area);
      });
      area.append(form);
    } else {
      area.append(el('p', 'status', 'Melde dich an, um zu antworten.'));
    }
  } catch (e) {
    console.error(e);
    area.replaceChildren(el('p', 'status', 'Antworten konnten nicht geladen werden: ' + e.message));
  }
}
async function loadProfilePage(username) {
  $('profileHeader').replaceChildren();
  $('profilePosts').replaceChildren();
  try {
    const { data: profile, error } = await db.from('profiles')
      .select('id,username,avatar_url,created_at').eq('username', username).maybeSingle();
    if (error) throw error;
    if (!profile) {
      $('profileHeader').textContent = 'Profil nicht gefunden.';
      return;
    }
    const row = el('div', 'profile-details');
    row.append(makeAvatar(profile.avatar_url, profile.username, true));
    const details = el('div');
    details.append(el('h2', '', '@' + profile.username),
      el('p', 'status', 'Mitglied seit ' + dateText(profile.created_at)));
    row.append(details);
    $('profileHeader').append(row, el('p', 'status', 'Beiträge von @' + profile.username));
    const { data: posts, error: postsError } = await db.from('posts')
      .select('id,user_id,content,created_at,profiles!posts_user_id_fkey(username,avatar_url),likes(user_id)')
      .eq('user_id', profile.id).order('created_at', { ascending: false }).limit(100);
    if (postsError) throw postsError;
    if (!posts.length) $('profilePosts').append(el('p', 'status', 'Noch keine Beiträge.'));
    for (const post of posts) $('profilePosts').append(await buildPost(post));
  } catch (e) {
    console.error(e);
    $('profileHeader').textContent = 'Profil konnte nicht geladen werden: ' + e.message;
  }
}
async function toggleLike(postId, liked) {
  if (!currentUser) return alert('Zum Liken musst du angemeldet sein.');
  const result = liked
    ? await db.from('likes').delete().eq('post_id', postId).eq('user_id', currentUser.id)
    : await db.from('likes').insert({ post_id: postId, user_id: currentUser.id });
  if (result.error) alert(result.error.message);
  else if (route === 'profile') loadProfilePage(routeValue);
  else loadFeed();
}
async function deletePost(id) {
  if (!currentUser || !confirm('Diesen Beitrag wirklich löschen?')) return;
  const { error } = await db.from('posts').delete().eq('id', id).eq('user_id', currentUser.id);
  if (error) alert(error.message);
  else if (route === 'profile') loadProfilePage(routeValue);
  else loadFeed();
}

$('switchAuth').addEventListener('click', () => {
  authMode = authMode === 'signup' ? 'login' : 'signup';
  $('authHeading').textContent = authMode === 'signup' ? 'Willkommen bei Nova' : 'Willkommen zurück';
  $('authSubmit').textContent = authMode === 'signup' ? 'Registrieren' : 'Anmelden';
  $('switchAuth').textContent = authMode === 'signup' ? 'Ich habe ein Konto' : 'Neues Konto erstellen';
  $('username').classList.toggle('hidden', authMode === 'login');
  $('username').required = authMode === 'signup';
  $('password').autocomplete = authMode === 'signup' ? 'new-password' : 'current-password';
  setStatus('authStatus', '');
});
$('authForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (!db) return setStatus('authStatus', 'Bitte Supabase-URL und Publishable Key eintragen.', true);
  const email = $('email').value.trim();
  const password = $('password').value;
  const username = $('username').value.trim().toLowerCase();
  if (authMode === 'signup' && !/^[a-z0-9_]{3,24}$/.test(username))
    return setStatus('authStatus', 'Benutzername: 3–24 Zeichen, nur a–z, 0–9 und _.', true);
  $('authSubmit').disabled = true;
  try {
    const result = authMode === 'signup'
      ? await db.auth.signUp({ email, password, options: { data: { username } } })
      : await db.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error;
    currentUser = result.data.user;
    if (authMode === 'signup' && !result.data.session)
      setStatus('authStatus', 'Konto erstellt. Bitte prüfe deine E-Mail, falls Bestätigung aktiviert ist.');
    else setStatus('authStatus', 'Erfolgreich angemeldet.');
    setAuthUI();
    location.hash = '#home';
    await loadFeed();
  } catch (e) {
    setStatus('authStatus', e.message || 'Registrierung fehlgeschlagen.', true);
  } finally {
    $('authSubmit').disabled = false;
  }
});
$('logout').addEventListener('click', async () => {
  const { error } = await db.auth.signOut();
  if (error) return setStatus('authStatus', error.message, true);
  currentUser = null;
  setAuthUI();
  location.hash = '#home';
  loadFeed();
});
$('postText').addEventListener('input', () => {
  $('charCount').textContent = $('postText').value.length + ' / 280';
});
$('postForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (!currentUser) return setStatus('postStatus', 'Bitte melde dich an.', true);
  const content = $('postText').value.trim();
  if (!content || content.length > 280) return setStatus('postStatus', 'Bitte 1–280 Zeichen eingeben.', true);
  $('postSubmit').disabled = true;
  const { error } = await db.from('posts').insert({ user_id: currentUser.id, content });
  $('postSubmit').disabled = false;
  if (error) return setStatus('postStatus', error.message, true);
  $('postText').value = '';
  $('charCount').textContent = '0 / 280';
  setStatus('postStatus', 'Beitrag veröffentlicht!');
  location.hash = '#home';
  await loadFeed();
});
$('reload').addEventListener('click', () => route === 'profile' ? loadProfilePage(routeValue) : loadFeed());
window.addEventListener('hashchange', setRoute);

async function start() {
  if (!db) {
    $('feedStatus').textContent = 'Setup nötig: Supabase Project URL und Publishable Key in app.js eintragen.';
    setAuthUI();
    return;
  }
  const { data } = await db.auth.getSession();
  currentUser = data.session?.user || null;
  setAuthUI();
  db.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
    setAuthUI();
    if (['home', 'compose', 'hashtag'].includes(route)) loadFeed();
  });
  setRoute();
}
start();

