# Nova Social

## Dateien
- `index.html` — Seitenstruktur
- `styles.css` — Layout und Design für Handy/PC
- `app.js` — Supabase-Verbindung und Funktionen
- `supabase.sql` — Ergänzungen für Antworten und Profilbilder

## 1. Supabase verbinden
Öffne `app.js` und trage deine Projektwerte ein:

```js
const SUPABASE_URL = 'https://DEINE-PROJEKT-ID.supabase.co';
const SUPABASE_KEY = 'sb_publishable_DEIN_KEY';
```

Nutze niemals einen `sb_secret_...`- oder `service_role`-Key im Frontend.

## 2. SQL ausführen
Öffne Supabase → SQL Editor → New query. Prüfe `supabase.sql`, kopiere den Inhalt hinein und klicke Run.
Das ergänzt die Tabelle `replies` und die Spalte `profiles.avatar_url`; bestehende Posts werden nicht gelöscht.

## 3. Storage-Bucket
Erstelle in Supabase → Storage einen Bucket namens `avatars` und aktiviere „Public bucket“.
Danach können die Storage-Regeln aus `supabase.sql` ausgeführt werden. Falls du den SQL-Teil bereits vor dem Erstellen des Buckets ausgeführt hast, führe die Datei danach erneut aus.

## 4. Lokal öffnen
Da `app.js` ein JavaScript-Modul importiert, solltest du die Seite über einen lokalen Webserver öffnen, nicht unbedingt per Doppelklick auf die HTML-Datei.
Zum Beispiel in einem Terminal im Projektordner:

```bash
python -m http.server 8000
```

Öffne dann `http://localhost:8000`.

## Enthalten
- Registrierung und Login mit Supabase Auth
- öffentlicher Feed, Posts mit bis zu 280 Zeichen
- Likes und eigene Posts löschen
- Antworten auf Posts
- Profilseiten und eigene Posts
- Profilbild-Upload in Supabase Storage
- klickbare `@Erwähnungen` und `#Hashtags`
- responsives Layout für Handy und PC

Hinweis: `@Erwähnungen` öffnen das Profil, wenn der eingegebene Name einem existierenden Benutzernamen entspricht. Hashtag-Suche filtert die aktuell geladenen letzten 100 Posts.
