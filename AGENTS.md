# findyourlogic

## Zweck & Links

- Bubbles (Gruppen, die es schon gibt: Stammtisch, Telegram, Nostr-Gruppe) fragen andere Bubbles an und reden in kleinen Runden nach festen Spielregeln (Sichten, Fragen, Zusammenfassen). Dazu Treffer: Leute mit 3 oder mehr gemeinsamen Merkmalen (Bubbles und Interessen), nur wer auffindbar ist. Login per Magic Link oder Nostr (eigener Dialog in `apps/web/src/lib/nostr.svelte.ts`: Browser-Erweiterung per NIP-07, Signer-App per NIP-46 mit nostrconnect-QR).
- Live: https://findyourlogic.pleasance.org, Coolify-Projekt `pleasance-findyourlogic`, Ressource `findyourlogic`.
- Vorlage: `robinchoice/starter`. Mockups (Fassung 2) waren die Vorlage für Version 1.

## Checks

`bun run check && bun run test && bun run build`. Die Browser-Tests starten API und Web auf eigenen Ports (53100, 54100). Testet ein anderer Worktree gleichzeitig, mit anderen Ports aufrufen: `TEST_API_PORT=53101 TEST_WEB_PORT=54101 bun run test`.

## Deploy

- Ein Push auf `main` baut nach grüner CI die Images und deployt sie über die Coolify-API. Danach fotografiert sie die Live-Seite nach `docs/screenshots/`, committet geänderte Bilder mit `[skip ci]` und meldet den Deploy an `robinchoice/pleasance` (README, „Screenshots“). Ohne das Secret `COOLIFY_TOKEN` überspringt die CI Deploy, Screenshots und Meldung. Ohne `PLEASANCE_DISPATCH_TOKEN` entfällt nur die Meldung.
- Prüfen: `gh run watch`. Der Deploy-Job ist erst grün, wenn `https://findyourlogic.pleasance.org/api/health` den Commit als `revision` meldet.

## Fallen

- Die Signer-App antwortet nur über die Relays in `RELAYS` (`apps/web/src/lib/nostr.svelte.ts`), die zweite Kopie steht in `connect-src` in `apps/web/svelte.config.js`. Neue Relays in beide Listen. `switch_relays` ist aus, sonst wollte der Signer auf Relays wechseln, die die CSP blockt. Der Browser-Test deckt nur NIP-07 ab, NIP-46 braucht echte Relays und läuft nicht in der CI.
- Schlüssel werden nicht mehr im Browser angelegt und nirgends gespeichert: Nach dem Signieren zählt nur die Session. Beim Abmelden räumt `forgetKey` die alten `__nostrlogin*`-Einträge von nostr-login weg (bis 2026-10 im Einsatz).
- Der Nostr-Login ist ein NIP-98-Event (Kind 27235) mit Challenge aus `/auth/nostr/challenge` und `u` = `APP_URL/api/v1/auth/nostr`. Stimmt `APP_URL` nicht mit der Adresse im Browser überein, scheitert jeder Nostr-Login mit 400.
- Live ist `SIGNUPS_OPEN=false` (Coolify, Standard im Compose): Anmelden können nur Konten, die es schon gibt, Magic Links gehen nur an bekannte Adressen, die Login-Seite zeigt einen Hinweis. Öffnen mit `SIGNUPS_OPEN=true` in Coolify und neu deployen.
- Ein Konto hat E-Mail, npub oder beides (`users.email` ist nullable). Mit Session verknüpft `/auth/nostr` den Schlüssel mit dem Konto, `/auth/me/email` bestätigt eine Adresse per Link (`magic_links.user_id`).
- Treffer werden bei jedem Aufruf aus `bubble_members` (`as_trait`) und `interests` gerechnet, nur über auffindbare Konten. Personen erst ab `MIN_SHARED` (3) gemeinsamen Merkmalen, darunter nur die Anzahl. Interessen-Vorschläge zeigen fremde Interessen erst ab 3 Leuten.
- Es werden keine Meinungen oder Haltungen gespeichert, nur Mitgliedschaften, selbst gewählte Interessen, Zusagen und Nachrichten. Neue Felder an Personen nur mit dieser Grenze.

## Abweichungen vom Standard

- Keine App: `apps/mobile`, `mobile.yml` und `standards/` sind gelöscht.
- CSP weiter als im starter: `connect-src` mit den zwei Relays für den Nostr-Login per Signer-App.
- `z.config({ jitless: true })` in `packages/shared`: zod prüft sonst per `eval`, ob es Parser kompilieren darf, und die CSP meldet das als Fehler.

## Konventionen

Stack und Aufbau: siehe README.md. Gestaltung: siehe DESIGN.md.

- Neue Tabelle: `packages/db/src/schema.ts` ändern, `bun run db:generate`. Die Migration läuft beim nächsten API-Start, `migrateDb` lässt mehrere Instanzen nacheinander migrieren. Jede Migration muss mit dem noch laufenden alten Code funktionieren: Spalten nullable oder mit Default hinzufügen, Umbenennen und Löschen erst im Deploy danach. Nichts von Hand in der Datenbank ändern.
- Neue Route: Datei in `apps/api/src/routes`, in `app.ts` einhängen. `requireAuth` für eingeloggte Nutzer (danach `c.get('user')`), `validJson(schema)` mit dem Schema aus `packages/shared`.
- Jeder sichtbare Text steht auf Deutsch und Englisch: für Web und API in `packages/shared/src/messages.ts`, für die App in `lib/core/messages.dart`. Fehlt eine Sprache, schlagen `bun run check` bzw. `flutter analyze` fehl. Im Web `t()` aus `$lib/i18n`, in der API `t(c)` aus `lib/i18n.ts`, in der App `ref.watch(messagesProvider)`. Eigene zod-Meldungen sind Schlüssel aus `messages.ts`. Umgeschaltet wird im `PleasanceFooter`.
- Fehler antworten immer als `{ error: string }` mit einem Text aus `t(c)`, also in der Sprache, die der Client per `Accept-Language` schickt. Das Web zeigt ihn als Toast.
- Alles, was Mails verschickt oder Geheimnisse prüft, bekommt ein `rateLimit` aus `lib/rate-limit.ts`. Die Zähler liegen in Postgres und gelten für alle API-Instanzen.
- Mails über `sendMail` aus `lib/mail.ts`.
- Zustandslos, damit eine App ohne Umbau auf einen anderen Server umzieht oder repliziert hinter einem Load Balancer läuft (`infra.md`, „Skalierung“): Platte und Prozessspeicher halten keinen Zustand, der eine Instanz überlebt oder für alle gelten muss. Sessions, Rate-Limits und Feedback liegen schon in Postgres. Uploads und Medien gehen nach S3 (Hetzner Object Storage, Bucket nach Namensregel) über `Bun.s3`, das `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT` und `S3_BUCKET` selbst aus der Env liest. Kein Volume außer `pgdata`. Locks per `pg_advisory_xact_lock`. Caches im Speicher nur, wenn jede Instanz sie verlieren darf, ein geteilter Cache läuft als Valkey-Container in `docker-compose.prod.yml`.
- Hintergrundjobs und Zeitpläne laufen nie im API-Prozess, sondern als eigene Rolle: Service `worker` in `docker-compose.prod.yml` aus dem API-Image mit eigenem Einstieg `apps/api/src/worker.ts`, erst wenn ein Prototyp ihn braucht. Aufträge sind Zeilen in Postgres, der Worker holt sie mit `FOR UPDATE SKIP LOCKED`. Fällige Zeitpläne beansprucht er atomar (`update … set next_run = … where name = … and next_run <= now() returning`). So führt auch bei mehreren Workern nur einer jeden Auftrag aus, und kein Job geht bei einem Neustart verloren. Nichts in `setTimeout`, `setInterval` oder Listen im Speicher. Kurze Nacharbeit einer Anfrage wie eine Mail bleibt in der Anfrage.
- Jede Rolle hat einen Healthcheck im Image: API `/api/health` (mit Datenbank), Web `/health` (nur der Prozess), ein Worker ein `/health` auf einem eigenen Port. Uptime Kuma und ein Load Balancer prüfen `/api/health` über die öffentliche Adresse.
- Konfiguration nur über die Env: Jede neue Variable steht in `.env.example`, `.env.production.example` und `docker-compose.prod.yml`. Im Code keine Domains, IPs, Hostnamen oder Pfade des Servers. Service-Namen aus der Compose-Datei (`api`, `postgres`) sind erlaubt.
- Postgres hat im Compose eine Speichergrenze (`POSTGRES_MEMORY`, Standard `512m`). Wird sie eng, in Coolify erhöhen, nicht entfernen.
- Der Feedback-Knopf bleibt in jedem Prototyp, auch ab 1.0: Dann ist der Käfer nur im Testmodus sichtbar, „Feedback geben“ immer (README, „Feedback“). Eigene Overlays, die nicht auf den Screenshot sollen, bekommen im Web `data-feedback-ignore`. Neue API-Aufrufe laufen über `api` bzw. `apiProvider`, sonst fehlen ihre Fehler in den Meldungen. Offene Meldungen eines Repos: `gh issue list --label feedback`.
- `users.name` ist ein freier Anzeigename ohne Filter. Bekommt ein Prototyp eindeutige öffentliche Handles (z. B. `/@name`): NFKC-normalisiert und kleingeschrieben speichern und eindeutig machen, reservierte Namen sperren (`admin`, `root`, `api`, `support`, `www`, `login`, `settings`, dazu alle eigenen Routen). Einen Wortfilter für Vulgäres gibt es nur bei öffentlichen Community-Apps, dann mit `obscenity`. Eigene Wortlisten erzeugen Fehltreffer.
- Web: API-Aufrufe über `api` aus `$lib/api`, Login-Zustand aus `$lib/auth.svelte`. Seiten hinter dem Login unter `routes/(app)`.
- Externe Quellen im Browser (Skripte, Fonts, Bilder, APIs) in die CSP in `apps/web/svelte.config.js` eintragen, sonst blockt der Browser sie. Der Browser-Test in `apps/web/tests` scheitert an jedem Konsolenfehler, also auch an CSP-Verstößen. Inline-`<style>` erlaubt die CSP nur im Dev-Modus.
- Mobile (`apps/mobile`): API-Aufrufe über `apiProvider`, Login-Zustand aus `authProvider`, Seiten in `lib/features/<name>`, Routen in `lib/core/router.dart`. DTOs von Hand schreiben wie `User` in `core/auth.dart`. OpenAPI aus zod mit generiertem Client erst, wenn die API stabil ist.
- Mobile-Karte: flutter_map mit OSM. Google Maps nur, wenn Google-Places-Daten nötig sind (wie doener).
- Mobile bei Bedarf: sembast für Offline und Sync (Vorbild doener). Kein eigener Dart-Server, kein Supabase.
- Screenshots für pleasance.org: Kernscreens als öffentliche Seiten in `PAGES` in `apps/web/screenshots.ts` eintragen, die CI fotografiert sie nach jedem Deploy (README, „Screenshots“). Seiten hinter dem Login nicht, die CI hat keinen Login und die Bilder zeigen keine echten Nutzerdaten. Der Bot committet die Bilder auf `main`, vor dem Push also holen.
- Link-Vorschau: Das Layout setzt die `og:`-Tags, das Bild rendert `bun run og-image` in `apps/web` (DESIGN.md, „Vorschaubild“). Danach neu rendern und committen, wenn sich `APP_NAME`, `APP_BAND`, `tagline` oder die Kachel ändern. Die Kachel liegt als `static/favicon.svg`, dieselbe wie `img/werkzeuge/<slug>.svg` im pleasance-Repo. Öffentliche Seiten mit eigenem Inhalt, etwa geteilte Links, geben im Server-Load `meta` mit Titel, Beschreibung und optional einem absoluten Bild-URL zurück. Private Inhalte, Links mit Passwort, abgelaufene und ungültige Links bekommen die allgemeine Vorschau. Link-Crawler führen kein JavaScript aus, also wirkt `meta` nur in `+page.server.ts` bzw. `+page.ts` auf Seiten mit SSR, nicht unter `routes/(app)` (`ssr = false`). WhatsApp speichert Vorschauen lange zwischen.
- Formatierung und Lint: Biome, Regeln in `biome.json`. `bun run format` behebt das meiste selbst.
- Apple-Zugangsdaten der Prototype Factory stehen zentral in `~/.secrets`: `APPLE_TEAM_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8` (base64), dazu das CI-Signing-Zertifikat `APPLE_CI_DEV_CERTIFICATE_BASE64` (base64-PKCS12) und `APPLE_CI_DEV_CERTIFICATE_PASSWORD`. Ablage und Kopien: `~/dev/kontor/infra.md`, Abschnitt „Zugangsdaten: wo liegt was“. Im selben Aufruf mit `set -a; . ~/.secrets; set +a` laden; Werte nie ausgeben oder ins Repo schreiben. Nach Freigabe richtet `~/dev/kontor/apple-ci-secrets.sh robinchoice/<repo>` die GitHub-CI ein: ASC-IDs als Variablen, `ASC_KEY_P8`, `IOS_DEV_CERTIFICATE` und `IOS_DEV_CERTIFICATE_PASSWORD` als Secrets.
