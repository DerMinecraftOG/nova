import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Supabase-Konfiguration
const SUPABASE_URL = 'https://ykxtcimsxmpmftlhzgyp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_rdgP2E0Gh70RSqzmpL3Qvw_UeAB0kXL';

const db = createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = id => document.getElementById(id);

let currentUser = null;
let authMode = 'signup';
let route = 'home';
let routeValue = '';
let selectedPostImage = null;
let selectedAvatar = null;

// Verhindert, dass ältere Ladevorgänge neuere überschreiben.
let feedLoadId = 0;
let profileLoadId = 0;
let accountLoadId = 0;

// Verhindert doppelte Initialisierung.
let appStarted = false;

// Hilfsfunktionen
function el(tag, cls = '', text = '') {
  const node = document.createElement(tag);

  if (cls) node.className = cls;
  if (text !== '') node.textContent = text;

  return node;
}

function status(id, message, error = false) {
  const node = $(id);

  if (!node) return;

  node.textContent = message || '';
  node.style.color = error ? '#fb929c' : '';
}

function dateText(value) {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString('de-DE', {
        dateStyle: 'medium',
        timeStyle: 'short'
      });
}

function usernameOf(user) {
  return user?.user_metadata?.username ||
    user?.email?.split('@')[0] ||
    'user';
}

function makeAvatar(url, name, big = false) {
  const avatar = el('div', 'avatar' + (big ? ' big' : ''));

  if (url) {
    const img = document.createElement('img');

    img.src = url;
    img.alt = 'Profilbild von ' + (name || 'Nutzer');

    avatar.append(img);
  } else {
    avatar.textContent = (name || '?').slice(0, 1).toUpperCase();
  }

  return avatar;
}

// Verifizierungsabzeichen
function badges(profile) {
  const result = el('span', 'badge-group');

  if (profile?.verified === true) {
    const badge = el('span', 'verified-badge', '✓');

    badge.title = 'Verifiziert';
    badge.setAttribute('aria-label', 'Blau verifiziert');

    result.append(badge);
  }

  if (profile?.red_verified === true) {
    const badge = el('span', 'red-badge', '✓');

    badge.title = 'Besonderes Profil';
    badge.setAttribute('aria-label', 'Roter Haken');

    result.append(badge);
  }

  return result;
}

// Username mit Link zum Profil
function nameLink(profile, prefix = '@') {
  const name = profile?.username || 'user';
  const link = el('a', 'username');

  link.href = '#profile/' + encodeURIComponent(name);

  link.append(
    document.createTextNode(prefix + name),
    badges(profile)
  );

  return link;
}

// Hashtags und Erwähnungen anklickbar machen
function richText(container, text) {
  const re = /(^|\s)(#[\p{L}\p{N}_]+|@[\p{L}\p{N}_]+)/gu;

  let last = 0;
  let match;

  text = text || '';

  while ((match = re.exec(text)) !== null) {
    container.append(
      document.createTextNode(text.slice(last, match.index))
    );

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

// Navigation
function showRouteSections() {
  const signedIn = !!currentUser;

  $('authPanel').classList.toggle('hidden', signedIn);
  $('logout').classList.toggle('hidden', !signedIn);

  $('sideAccount').textContent = signedIn
    ? '@' + usernameOf(currentUser)
    : 'Nicht angemeldet';

  $('composer').classList.toggle(
    'hidden',
    !signedIn || !['home', 'compose'].includes(route)
  );

  $('feedSection').classList.toggle(
    'hidden',
    !['home', 'compose', 'hashtag'].includes(route)
  );

  $('profileView').classList.toggle('hidden', route !== 'profile');
  $('accountView').classList.toggle('hidden', route !== 'account');

  $('authHeading').textContent = authMode === 'signup'
    ? 'Willkommen bei Nova'
    : 'Willkommen zurück';

  $('authSubmit').textContent = authMode === 'signup'
    ? 'Registrieren'
    : 'Anmelden';

  $('switchAuth').textContent = authMode === 'signup'
    ? 'Ich habe ein Konto'
    : 'Neues Konto erstellen';

  $('username').classList.toggle('hidden', authMode === 'login');
  $('username').required = authMode === 'signup';

  $('pageTitle').textContent = ({
    home: 'Für dich',
    compose: 'Beitrag schreiben',
    account: 'Mein Konto',
    profile: 'Profil',
    hashtag: '#' + routeValue
  })[route] || 'Nova';

  document.querySelectorAll('.nav a').forEach(a => {
    a.classList.toggle('active', a.dataset.route === route);
  });
}

function setRoute() {
  let raw = location.hash || '#home';

  try {
    raw = decodeURIComponent(raw);
  } catch {}

  const parts = raw.slice(1).split('/');

  route = parts[0] || 'home';
  routeValue = parts.slice(1).join('/');

  if (!['home', 'compose', 'account', 'profile', 'hashtag'].includes(route)) {
    route = 'home';
  }

  showRouteSections();

  if (route === 'profile') {
    loadProfilePage(routeValue);
  } else if (route === 'account') {
    loadMyAccount();
  } else if (['home', 'compose', 'hashtag'].includes(route)) {
    loadFeed();
  }
}

// Bilder hochladen
async function uploadImage(file, bucket, folder) {
  if (!file) return null;

  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Bitte JPG, PNG oder WebP auswählen.');
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Das Bild darf maximal 5 MB groß sein.');
  }

  const ext = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp'
  }[file.type];

  const path = `${folder}/${crypto.randomUUID()}.${ext}`;

  const { error } = await db.storage
    .from(bucket)
    .upload(path, file, {
      contentType: file.type,
      upsert: false
    });

  if (error) throw error;

  return db.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

// Posts anhand ihrer Datenbank-ID deduplizieren
function uniquePosts(posts) {
  const seen = new Set();

  return (posts || []).filter(post => {
    if (!post || post.id == null || seen.has(post.id)) {
      return false;
    }

    seen.add(post.id);
    return true;
  });
}

// FEED LADEN
async function loadFeed() {
  const loadId = ++feedLoadId;

  $('reload').disabled = true;
  status('feedStatus', 'Beiträge werden geladen …');

  try {
    const { data, error } = await db
      .from('posts')
      .select(
        'id,user_id,content,image_url,created_at,' +
        'profiles!posts_user_id_fkey(id,username,avatar_url,verified,red_verified),' +
        'likes(user_id)'
      )
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    // Ältere Ladevorgänge ignorieren.
    if (loadId !== feedLoadId) return;

    let posts = uniquePosts(data);

    if (route === 'hashtag') {
      posts = posts.filter(post =>
        (post.content || '')
          .toLowerCase()
          .includes('#' + routeValue.toLowerCase())
      );
    }

    const feed = $('feed');
    const fragment = document.createDocumentFragment();

    status(
      'feedStatus',
      posts.length ? 'Die neuesten Beiträge' : 'Noch keine Beiträge.'
    );

    for (const post of posts) {
      if (loadId !== feedLoadId) return;

      const card = await buildPost(post);

      if (loadId !== feedLoadId) return;

      fragment.append(card);
    }

    // Erst vollständig gerenderte Ergebnisse einsetzen.
    if (loadId === feedLoadId) {
      feed.replaceChildren(fragment);
    }
  } catch (e) {
    if (loadId === feedLoadId) {
      console.error(e);
      status('feedStatus', 'Feed-Fehler: ' + e.message, true);
    }
  } finally {
    if (loadId === feedLoadId) {
      $('reload').disabled = false;
    }
  }
}

// Einzelnen Beitrag erstellen
async function buildPost(post) {
  const profile = post.profiles || {};
  const card = el('article', 'post');

  // Eindeutige ID für spätere Fehlersuche.
  card.dataset.postId = String(post.id);

  const head = el('div', 'post-head');
  const avatar = makeAvatar(profile.avatar_url, profile.username);

  avatar.style.cursor = 'pointer';

  avatar.addEventListener('click', () => {
    location.hash = '#profile/' +
      encodeURIComponent(profile.username || 'user');
  });

  const meta = el('div', 'post-meta');

  meta.append(
    nameLink(profile),
    el('div', 'date', dateText(post.created_at))
  );

  head.append(avatar, meta);
  card.append(head);

  if (post.content) {
    const content = el('div', 'post-content');

    richText(content, post.content);
    card.append(content);
  }

  if (post.image_url) {
    const image = document.createElement('img');

    image.className = 'post-image';
    image.src = post.image_url;
    image.alt = 'Bild in einem Nova-Beitrag';
    image.loading = 'lazy';

    card.append(image);
  }

  const actions = el('div', 'post-actions');
  const likes = post.likes || [];

  const liked = !!currentUser &&
    likes.some(item => item.user_id === currentUser.id);

  const like = el(
    'button',
    'action' + (liked ? ' liked' : ''),
    (liked ? '♥' : '♡') + ' ' + likes.length
  );

  like.type = 'button';

  like.addEventListener('click', () => {
    toggleLike(post.id, liked);
  });

  actions.append(like);

  const followCount = await countFollowers(profile.id);

  if (profile.id && currentUser && profile.id !== currentUser.id) {
    const following = await isFollowing(profile.id);

    const follow = el(
      'button',
      'action',
      following ? '✓ Folge ich' : '+ Folgen'
    );

    follow.type = 'button';

    follow.addEventListener('click', async () => {
      follow.disabled = true;

      try {
        if (following) {
          const { error } = await db
            .from('follows')
            .delete()
            .eq('follower_id', currentUser.id)
            .eq('following_id', profile.id);

          if (error) throw error;
        } else {
          const { error } = await db
            .from('follows')
            .insert({
              follower_id: currentUser.id,
              following_id: profile.id
            });

          if (error) throw error;
        }

        setRoute();
      } catch (e) {
        alert('Folgen fehlgeschlagen: ' + e.message);
        follow.disabled = false;
      }
    });

    actions.append(follow);
  }

  actions.append(el('span', 'status', followCount + ' Follower'));

  if (currentUser?.id === post.user_id) {
    const del = el('button', 'action delete', 'Löschen');

    del.type = 'button';
    del.addEventListener('click', () => deletePost(post.id));

    actions.append(del);
  }

  card.append(actions);

  return card;
}

// Follower zählen
async function countFollowers(userId) {
  if (!userId) return 0;

  const { count, error } = await db
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('following_id', userId);

  if (error) {
    console.warn(error.message);
    return 0;
  }

  return count || 0;
}

async function countFollowing(userId) {
  if (!userId) return 0;

  const { count, error } = await db
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('follower_id', userId);

  if (error) {
    console.warn(error.message);
    return 0;
  }

  return count || 0;
}

async function isFollowing(userId) {
  if (!currentUser || !userId) return false;

  const { data, error } = await db
    .from('follows')
    .select('follower_id')
    .eq('follower_id', currentUser.id)
    .eq('following_id', userId)
    .maybeSingle();

  return !error && !!data;
}

// PROFILSEITE LADEN – gegen mehrfache Aufrufe abgesichert
async function loadProfilePage(username) {
  const loadId = ++profileLoadId;

  $('profileHeader').replaceChildren();
  $('profilePosts').replaceChildren();

  try {
    const { data: profile, error } = await db
      .from('profiles')
      .select(
        'id,username,avatar_url,bio,created_at,verified,red_verified'
      )
      .eq('username', username)
      .maybeSingle();

    if (error) throw error;

    // Veraltete Profilanfragen nicht rendern.
    if (loadId !== profileLoadId) return;

    if (!profile) {
      $('profileHeader').textContent = 'Profil nicht gefunden.';
      return;
    }

    const header = el('div', 'profile-header');
    const cover = el('div', 'profile-cover');

    cover.append(makeAvatar(profile.avatar_url, profile.username, true));

    const details = el('div');
    const title = el('h2');

    title.append(
      document.createTextNode('@' + profile.username),
      badges(profile)
    );

    details.append(title);

    details.append(
      el('p', 'profile-bio', profile.bio || 'Keine Biografie angegeben.')
    );

    details.append(
      el('p', 'status', 'Mitglied seit ' + dateText(profile.created_at))
    );

    cover.append(details);
    header.append(cover);

    const followers = await countFollowers(profile.id);
    const followingCount = await countFollowing(profile.id);

    if (loadId !== profileLoadId) return;

    const stats = el('div', 'profile-stats');
    const f = el('span');

    f.append(el('strong', '', String(followers)), ' Follower');

    const g = el('span');

    g.append(el('strong', '', String(followingCount)), ' Folgt');

    stats.append(f, g);
    header.append(stats);

    if (currentUser && currentUser.id !== profile.id) {
      const isOn = await isFollowing(profile.id);

      if (loadId !== profileLoadId) return;

      const btn = el(
        'button',
        'btn secondary',
        isOn ? '✓ Folge ich' : 'Folgen'
      );

      btn.type = 'button';

      btn.addEventListener('click', async () => {
        btn.disabled = true;

        try {
          const result = isOn
            ? await db
                .from('follows')
                .delete()
                .eq('follower_id', currentUser.id)
                .eq('following_id', profile.id)
            : await db
                .from('follows')
                .insert({
                  follower_id: currentUser.id,
                  following_id: profile.id
                });

          if (result.error) throw result.error;

          // Neu laden, damit der Button den aktuellen Status zeigt.
          if (loadId === profileLoadId) {
            await loadProfilePage(username);
          }
        } catch (e) {
          alert(e.message);
          btn.disabled = false;
        }
      });

      header.append(btn);
    }

    if (loadId !== profileLoadId) return;

    $('profileHeader').replaceChildren(header);

    const { data: posts, error: postError } = await db
      .from('posts')
      .select(
        'id,user_id,content,image_url,created_at,' +
        'profiles!posts_user_id_fkey(id,username,avatar_url,verified,red_verified),' +
        'likes(user_id)'
      )
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (postError) throw postError;

    if (loadId !== profileLoadId) return;

    const postsUnique = uniquePosts(posts);
    const fragment = document.createDocumentFragment();

    if (!postsUnique.length) {
      fragment.append(el('p', 'feed-status', 'Noch keine Beiträge.'));
    } else {
      for (const post of postsUnique) {
        if (loadId !== profileLoadId) return;

        const card = await buildPost(post);

        if (loadId !== profileLoadId) return;

        fragment.append(card);
      }
    }

    // Nur der neueste Ladevorgang darf die Posts einsetzen.
    if (loadId === profileLoadId) {
      $('profilePosts').replaceChildren(fragment);
    }
  } catch (e) {
    if (loadId !== profileLoadId) return;

    console.error(e);

    $('profileHeader').textContent =
      'Profil konnte nicht geladen werden: ' + e.message;
  }
}

// MEIN KONTO LADEN – gegen mehrfache Aufrufe abgesichert
async function loadMyAccount() {
  const loadId = ++accountLoadId;

  $('accountPreview').replaceChildren();
  $('myPosts').replaceChildren();

  if (!currentUser) {
    $('accountPreview').append(
      el('p', 'status', 'Bitte melde dich an, um dein Konto zu bearbeiten.')
    );

    $('profileForm').classList.add('hidden');
    return;
  }

  const userId = currentUser.id;

  $('profileForm').classList.remove('hidden');

  try {
    const { data: profile, error } = await db
      .from('profiles')
      .select(
        'id,username,avatar_url,bio,created_at,verified,red_verified'
      )
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;

    if (loadId !== accountLoadId) return;

    if (!profile) {
      throw new Error(
        'Profil fehlt. Prüfe, ob das SQL-Setup ausgeführt wurde.'
      );
    }

    $('editUsername').value = profile.username || usernameOf(currentUser);
    $('editBio').value = profile.bio || '';

    const summary = el('div', 'profile-details');

    summary.append(makeAvatar(profile.avatar_url, profile.username, true));

    const info = el('div');
    const title = el('h2');

    title.append(
      document.createTextNode('@' + profile.username),
      badges(profile)
    );

    info.append(
      title,
      el('p', 'profile-bio', profile.bio || 'Keine Biografie angegeben.')
    );

    summary.append(info);

    if (loadId !== accountLoadId) return;

    $('accountPreview').replaceChildren(summary);

    const { data: posts, error: postError } = await db
      .from('posts')
      .select(
        'id,user_id,content,image_url,created_at,' +
        'profiles!posts_user_id_fkey(id,username,avatar_url,verified,red_verified),' +
        'likes(user_id)'
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (postError) throw postError;

    if (loadId !== accountLoadId) return;

    const postsUnique = uniquePosts(posts);
    const fragment = document.createDocumentFragment();

    if (!postsUnique.length) {
      fragment.append(el('p', 'status', 'Du hast noch keine Beiträge.'));
    } else {
      for (const post of postsUnique) {
        if (loadId !== accountLoadId) return;

        const card = await buildPost(post);

        if (loadId !== accountLoadId) return;

        fragment.append(card);
      }
    }

    if (loadId === accountLoadId) {
      $('myPosts').replaceChildren(fragment);
    }
  } catch (e) {
    if (loadId !== accountLoadId) return;

    console.error(e);
    status('profileStatus', e.message, true);
  }
}

// Profilbild auswählen
$('avatarFile').addEventListener('change', e => {
  selectedAvatar = e.target.files?.[0] || null;

  status(
    'avatarStatus',
    selectedAvatar
      ? selectedAvatar.name + ' ausgewählt'
      : 'Profilbild: JPG, PNG oder WebP, max. 2 MB.'
  );
});

// Profil speichern
$('profileForm').addEventListener('submit', async e => {
  e.preventDefault();

  if (!currentUser) return;

  const username = $('editUsername').value.trim().toLowerCase();
  const bio = $('editBio').value.trim();

  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    return status(
      'profileStatus',
      'Benutzername: 3–24 Zeichen, nur a–z, 0–9 und _.',
      true
    );
  }

  $('saveProfile').disabled = true;

  try {
    let avatar_url;

    if (selectedAvatar) {
      avatar_url = await uploadImage(
        selectedAvatar,
        'avatars',
        currentUser.id
      );
    }

    const changes = { username, bio };

    if (avatar_url) {
      changes.avatar_url = avatar_url;
    }

    const { error } = await db
      .from('profiles')
      .update(changes)
      .eq('id', currentUser.id);

    if (error) throw error;

    const { error: authError } = await db.auth.updateUser({
      data: { username }
    });

    if (authError) throw authError;

    selectedAvatar = null;
    $('avatarFile').value = '';

    status('profileStatus', 'Profil gespeichert.');

    await loadMyAccount();
  } catch (e) {
    console.error(e);

    status(
      'profileStatus',
      e.message || 'Profil konnte nicht gespeichert werden.',
      true
    );
  } finally {
    $('saveProfile').disabled = false;
  }
});

// Beitragsbild auswählen
$('postImage').addEventListener('change', e => {
  selectedPostImage = e.target.files?.[0] || null;

  $('postImageName').textContent = selectedPostImage
    ? selectedPostImage.name
    : 'Kein Bild ausgewählt';
});

$('postText').addEventListener('input', () => {
  $('charCount').textContent = $('postText').value.length + ' / 280';
});

// Beitrag veröffentlichen
$('postForm').addEventListener('submit', async e => {
  e.preventDefault();

  if (!currentUser) {
    return status('postStatus', 'Bitte melde dich an.', true);
  }

  const content = $('postText').value.trim();

  if (!content && !selectedPostImage) {
    return status(
      'postStatus',
      'Schreibe Text oder wähle ein Bild aus.',
      true
    );
  }

  $('postSubmit').disabled = true;

  try {
    let image_url = null;

    if (selectedPostImage) {
      image_url = await uploadImage(
        selectedPostImage,
        'post-images',
        currentUser.id
      );
    }

    const { error } = await db.from('posts').insert({
      user_id: currentUser.id,
      content,
      image_url
    });

    if (error) throw error;

    $('postText').value = '';
    $('postImage').value = '';
    $('postImageName').textContent = 'Kein Bild ausgewählt';
    $('charCount').textContent = '0 / 280';

    selectedPostImage = null;

    status('postStatus', 'Beitrag veröffentlicht.');

    if (location.hash !== '#home') {
      location.hash = '#home';
    } else {
      await loadFeed();
    }
  } catch (e) {
    console.error(e);

    status(
      'postStatus',
      e.message || 'Beitrag konnte nicht veröffentlicht werden.',
      true
    );
  } finally {
    $('postSubmit').disabled = false;
  }
});

// Beitrag liken oder Like entfernen
async function toggleLike(postId, liked) {
  if (!currentUser) {
    return alert('Zum Liken musst du angemeldet sein.');
  }

  const result = liked
    ? await db
        .from('likes')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', currentUser.id)
    : await db.from('likes').insert({
        post_id: postId,
        user_id: currentUser.id
      });

  if (result.error) {
    alert(result.error.message);
  } else {
    setRoute();
  }
}

// Beitrag löschen
async function deletePost(id) {
  if (!currentUser || !confirm('Diesen Beitrag wirklich löschen?')) {
    return;
  }

  const { error } = await db
    .from('posts')
    .delete()
    .eq('id', id)
    .eq('user_id', currentUser.id);

  if (error) {
    alert(error.message);
  } else {
    setRoute();
  }
}

// Anmeldung / Registrierung umschalten
$('switchAuth').addEventListener('click', () => {
  authMode = authMode === 'signup' ? 'login' : 'signup';

  showRouteSections();
  status('authStatus', '');
});

// Anmeldung und Registrierung
$('authForm').addEventListener('submit', async e => {
  e.preventDefault();

  const email = $('email').value.trim();
  const password = $('password').value;
  const username = $('username').value.trim().toLowerCase();

  if (
    authMode === 'signup' &&
    !/^[a-z0-9_]{3,24}$/.test(username)
  ) {
    return status(
      'authStatus',
      'Benutzername: 3–24 Zeichen, nur a–z, 0–9 und _.',
      true
    );
  }

  $('authSubmit').disabled = true;

  try {
    const result = authMode === 'signup'
      ? await db.auth.signUp({
          email,
          password,
          options: { data: { username } }
        })
      : await db.auth.signInWithPassword({ email, password });

    if (result.error) throw result.error;

    currentUser = result.data.user;

    if (authMode === 'signup' && !result.data.session) {
      status(
        'authStatus',
        'Konto erstellt. Bitte bestätige deine E-Mail, falls verlangt.'
      );
    } else {
      status('authStatus', 'Erfolgreich angemeldet.');
    }

    setRoute();
  } catch (e) {
    status(
      'authStatus',
      e.message || 'Anmeldung fehlgeschlagen.',
      true
    );
  } finally {
    $('authSubmit').disabled = false;
  }
});

// Passwort zurücksetzen
$('forgot-password').addEventListener('click', async () => {
  const email = prompt('Gib deine registrierte E-Mail-Adresse ein:');

  if (!email?.trim()) return;

  try {
    const { error } = await db.auth.resetPasswordForEmail(
      email.trim(),
      {
        redirectTo: window.location.origin + '/reset-password.html'
      }
    );

    if (error) throw error;

    alert(
      'Falls ein Konto mit dieser Adresse besteht, erhältst du eine E-Mail zum Zurücksetzen.'
    );
  } catch (e) {
    alert('Fehler: ' + e.message);
  }
});

// Abmelden
$('logout').addEventListener('click', async () => {
  const { error } = await db.auth.signOut();

  if (error) {
    return status('authStatus', error.message, true);
  }

  currentUser = null;

  // Noch laufende Profil- und Feed-Aufrufe ungültig machen.
  feedLoadId++;
  profileLoadId++;
  accountLoadId++;

  location.hash = '#home';
  setRoute();
});

// Feed manuell neu laden
$('reload').addEventListener('click', setRoute);

// Navigation über Hash-Links
window.addEventListener('hashchange', setRoute);

// App starten
async function start() {
  if (appStarted) return;

  appStarted = true;

  const { data, error } = await db.auth.getSession();

  if (error) console.error(error);

  currentUser = data?.session?.user || null;

  db.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;

    showRouteSections();

    if (route === 'account') {
      loadMyAccount();
    } else if (route === 'profile') {
      loadProfilePage(routeValue);
    } else {
      loadFeed();
    }
  });

  setRoute();
}

start();
