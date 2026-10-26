# findyourlogic

Bubbles fragen Bubbles, und Leute finden sich über ihre Schnittmengen. Live: https://findyourlogic.pleasance.org. Was für dieses Repo gilt, steht in `AGENTS.md`. Der Rest dieser Datei ist die README der Vorlage `robinchoice/starter`.

## Vorlage

Vorlage für Web- und Mobile-Prototypen: Bun, Hono, SvelteKit, Drizzle und Postgres, dazu eine CLI und optional eine Flutter-App gegen dieselbe API. Deutsch und Englisch mit Umschalter in der Fußzeile, Login per Magic Link (Web) oder Code (App), Feedback-Knopf mit Screenshot, ALTCHA vor Login-Mails, Link-Vorschau, Mail über SMTP, Rate-Limit, Security-Header mit CSP, GlitchTip, PostHog, Healthcheck, CI mit Browser-Test, Dependabot, Coolify-Deploy und Screenshots nach jedem Deploy sind fertig eingebaut.

## Neues Projekt

1. Einen Slug aus ASCII-Kleinbuchstaben und Ziffern wählen, beginnend mit einem Buchstaben, ohne Bindestrich (z. B. `savor`). Repo und lokaler Ordner heißen gleich: `~/dev/<slug>`. Repo aus der Vorlage anlegen: `gh repo create robinchoice/<slug> --template robinchoice/starter --private --clone`
2. `APP_NAME`, `APP_ID` (`org.pleasance.<slug>`, daraus heißt auch die CLI) und `APP_BAND` in `packages/shared/src/index.ts` setzen. Welcher Ausschnitt aus dem Farbband passt, steht in DESIGN.md.
3. In `AGENTS.md` Titel, „Zweck & Links“, die Prüf-URL unter „Deploy“ und „Fallen“ für das Projekt ausfüllen und den einleitenden Absatz zur Vorlage löschen.
4. Lokal starten:
   ```sh
   cp .env.example .env
   docker compose up -d
   bun install
   bunx playwright install chromium   # einmalig, für den Browser-Test
   bun run dev
   ```
   Web läuft auf http://localhost:5173, die API auf Port 3000. Ohne `SMTP_HOST` stehen die Login-Links im API-Log. In Produktion startet die API ohne `SMTP_HOST` nicht, sonst könnte jeder mit Zugriff auf die Logs sich als beliebiger Nutzer anmelden.

## Aufbau

| Pfad | Inhalt |
|---|---|
| `apps/api` | Hono-API unter `/api/v1`, Migrationen beim Start, `/api/health` prüft auch die DB |
| `apps/web` | SvelteKit. Leitet `/api` an die API weiter, im Dev macht das der Vite-Proxy. Seiten hinter dem Login liegen unter `routes/(app)`, `/health` ist der Healthcheck des Web-Servers |
| `packages/db` | Drizzle-Schema und Migrationen |
| `apps/cli` | Befehlszeile der App gegen dieselbe API, siehe „CLI“ |
| `packages/shared` | App-Name, zod-Schemas, Typen und Texte für API, Web und CLI |
| `apps/mobile` | Flutter-App, siehe unten. Reine Web-Projekte löschen den Ordner und `.github/workflows/mobile.yml` |

Befehle: `bun run dev`, `check` (Biome und Typen), `format`, `test`, `build`, `db:generate`, `standards` (Übersicht der Standards auf http://localhost:4300), in `apps/web` außerdem `screenshots` (siehe „Screenshots“) und `og-image` (Vorschaubild für geteilte Links, DESIGN.md). `build` baut Web und CLI. `test` umfasst die API-Tests, die CLI-Tests und Browser-Tests von Login, Feedback und Link-Vorschau (Playwright, baut das Web vor dem Start und testet den Produktions-Build mit derselben CSP wie live; API und Web starten auf eigenen Ports 31100 und 31101, nie gegen laufende Dev-Server; testen zwei Worktrees gleichzeitig, bekommt einer andere per `TEST_API_PORT` und `TEST_WEB_PORT`, etwa 31102 und 31103). Testports bleiben unter dem ephemeren Linux-Portbereich (32768–60999). Alle laufen gegen `DATABASE_URL` und legen nur Testkonten mit frischen Adressen an.

## Secret-Scan

Das Repo ist öffentlich, Code, Historie und CI-Logs. Der Workflow `.github/workflows/secrets.yml` läuft bei jedem Push auf jedem Branch und bei PRs aus Forks, ohne `paths-ignore`, und scannt mit gitleaks (Docker-Image, Version per Digest fest) die neuen Commits. Ein Fund macht den Lauf rot, der Wert steht dank `--redact` nicht im Log.

- Regeln: die Standardregeln von gitleaks, dazu `.gitleaks.toml`. Die nimmt nur `generic-api-key` in `patches/*.patch` und `bun.lock` aus, dort schlägt gebündelter Fremdcode an. Echte Token-Formate (`ghp_…`, `sk_live_…`) fallen dort weiter auf.
- Fehlalarm: den `Fingerprint` aus dem Log als Zeile in `.gitleaksignore` eintragen.
- Davor sitzt GitHubs Push Protection (hier eingeschaltet): Sie lehnt Pushes mit bekannten Token-Formaten ab, bevor sie öffentlich werden, Secret Scanning meldet Funde als Alert im Repo. Eine Sperre nur nach Prüfung umgehen, nie für einen echten Wert.
- Echter Fund: gitleaks läuft erst nach dem Push, das Secret ist also schon öffentlich. Sofort rotieren, Entfernen aus dem Code oder der Historie reicht nicht.

## Feedback

Eingeloggte Tester sehen auf jeder Seite einen Käfer-Knopf, im Web unter `routes/(app)`, in der App über allen Screens. Er lässt sich verschieben. Ein Tipp macht einen Screenshot des Bildschirms, der Tester kann die Stelle markieren und schreibt dazu, was nicht stimmt. Anregungen und Wünsche ohne Screenshot gehen über „Feedback geben“ im Kopf (Web) bzw. im Profil (App).

Den Käfer schaltet der Testmodus, in der Fußzeile (Web) bzw. im Profil (App), gespeichert pro Gerät. Bis 1.0 ist er an. Ab 1.0 (`LIVE` in `packages/shared`, `live` in `config.dart`) ist er aus, bis jemand ihn einschaltet: Du und Tester behalten den Käfer, alle anderen sehen nur „Feedback geben“.

Mitgeschickt werden Seite, Version, Gerät, Fenstergröße, Sprache und die letzten fünf fehlgeschlagenen API-Aufrufe. Der Tester sieht das im Formular unter „Was mitgeschickt wird“.

Die API speichert jede Meldung in `feedback` und legt dann ein Issue im Repo des Prototyps an, mit den Labels `feedback`, `bug` oder `idea` und der Plattform. Im Issue steht keine Mail-Adresse. Danach geht eine Mail an `FEEDBACK_EMAIL` mit Screenshot im Anhang und Link aufs Issue. Wer auf die Mail antwortet, schreibt dem Tester. Fällt GitHub oder die Mail aus, bleibt die Meldung gespeichert.

- Alle offenen Meldungen: `gh search issues --owner robinchoice --label feedback --state open`
- Screenshots stehen nicht im öffentlichen Issue, nur im Anhang der Mail. `/api/v1/feedback/<id>/screenshot` liefert sie nur an eingeloggte Admins aus `ADMIN_EMAILS` aus.
- Das Repo backt die CI als `GITHUB_REPOSITORY` ins API-Image. Ohne `FEEDBACK_GITHUB_TOKEN` entsteht kein Issue, ohne `FEEDBACK_EMAIL` keine Mail.

## Deploy auf Coolify

VPS 1 baut nichts. Die CI baut bei jedem grünen Push auf `main` die Images `ghcr.io/<owner>/<repo>-web` und `-api` für arm64 (Tags `:<sha>` und `:latest`), Coolify zieht sie nur. Die GHCR-Packages bleiben privat. VPS 1 zieht sie mit dem vorhandenen Pull-Token `vps1-ghcr-pull`, pro Projekt ist dafür nichts einzurichten.

1. Ressource aus dem GitHub-Repo im Projekt `pleasance-<slug>` oder `privat-<slug>`, Build Pack „Docker Compose“, Datei `docker-compose.prod.yml`, Ressourcenname `<slug>`. Deploy-Key `github-deploy-<repo>`.
2. Domain nur beim Service `web` eintragen, mit Port: `https://<domain>:3000`.
3. Variablen aus `.env.production.example` setzen. `IMAGE_PREFIX` und `IMAGE_TAG` setzt die CI.
4. In GitHub die Secrets `COOLIFY_TOKEN` (eigener Coolify-API-Token `ci-<repo>` mit den Rechten `read`, `write` und `deploy`, nie den Laptop-Token aus `~/.secrets`) und `COOLIFY_UUID` (UUID der Ressource) setzen. Ohne `COOLIFY_TOKEN` überspringt die CI den Deploy. Mit Token setzt sie `IMAGE_PREFIX` und `IMAGE_TAG`, schaltet das Auto-Deploy der Ressource aus, ersetzt den Build durch `docker compose pull`, startet mit `up -d --no-build --remove-orphans` und wartet, bis Coolify den Deploy abgeschlossen hat und `/api/health` unter der öffentlichen URL den neuen Commit als `revision` meldet.
5. pleasance.org: Secret `PLEASANCE_DISPATCH_TOKEN` setzen, damit die CI jeden Deploy meldet (siehe „Screenshots“): `set -a; . ~/.secrets; set +a; printf '%s' "$GITHUB_PLEASANCE_DISPATCH_TOKEN" | gh secret set PLEASANCE_DISPATCH_TOKEN -R robinchoice/<slug>`. Ein Token für alle Prototypen, fein granuliert, nur für `robinchoice/pleasance` mit „Contents: Read and write“. Ohne das Secret überspringt die CI die Meldung.
6. GlitchTip: Projekt anlegen, DSN in `SENTRY_DSN` und `PUBLIC_SENTRY_DSN`.
7. Feedback: `FEEDBACK_EMAIL` und `FEEDBACK_GITHUB_TOKEN` setzen. Das Token ist eines für alle Prototypen, fein granuliert, nur „Issues: Read and write“, und liegt in `~/.secrets` als `GITHUB_FEEDBACK_TOKEN`.
8. PostHog (optional): `PUBLIC_POSTHOG_KEY` aus `~/.secrets` (`POSTHOG_PROTOTYPES_API_KEY`). Alle Prototypen teilen sich ein Projekt in der EU Cloud, Filter in den Insights per `$host`. Läuft cookieless ohne Session Replay, also ohne Cookie-Banner. Der Web-Server leitet `/ingest` an PostHog weiter, die CSP braucht keinen Eintrag. Replay oder Personenprofile nur mit Einwilligungsbanner.
9. Uptime Kuma: HTTP-Monitor auf `https://<domain>/api/health`.
10. Neue Software in `vps1/advisory-alarm` aufnehmen, siehe `infra.md`.

## Screenshots

Nach jedem erfolgreichen Deploy fotografiert der CI-Job `screenshots` die Live-Seite mit headless Chromium: jede Seite aus `PAGES` in `apps/web/screenshots.ts` als Desktop (1440×900) und Handy (390×844, doppelte Dichte), als WebP in `docs/screenshots/<seite>-<gerät>-<sprache>.webp`. Haben sich Bilder geändert, committet der Bot sie mit `[skip ci]` auf `main`, das löst keinen neuen Deploy aus. Danach schickt derselbe Job ein `repository_dispatch` an `robinchoice/pleasance` (`event_type: prototype-deployed`, `client_payload: {slug, sha}`), damit pleasance.org die neuen Bilder übernimmt.

- Nur öffentliche Seiten: Die CI hat keinen Login, die Bilder zeigen nie Nutzerdaten. Kernscreens hinter dem Login kommen erst dazu, wenn der Prototyp sie öffentlich zeigt, z. B. als Demo-Seite mit Beispieldaten.
- Sprachen: `LOCALES` steht auf `de`. `en` nur ergänzen, wenn die englischen Bilder mehr zeigen als dieselben Screens in anderer Sprache.
- Fotografiert wird die GitHub-Variable `API_URL` (ab 1.0 die eigene Domain), ohne sie `https://<repo>.pleasance.org`. Aufrufe an `/ingest` blockt das Skript, PostHog zählt sie nicht.
- Lokal: `bun run screenshots [url]` in `apps/web`, ohne URL gegen `bun run dev`.
- Nach einem Deploy liegt oft ein Bot-Commit auf `main`, also vor dem nächsten Push holen.

## ALTCHA

Öffentliche Formulare, die Mails verschicken oder Daten anlegen, schützt [ALTCHA](https://altcha.org) (MIT, Proof of Work, ohne Cookies und ohne Drittanbieter): Vor dem Absenden rechnet der Browser oder die CLI eine kleine Aufgabe, die API prüft die Lösung. Hier gilt das für `/auth/magic-link` und `/auth/code`. Der Nostr-Login verschickt keine Mail und braucht es nicht. Es ergänzt die Rate-Limits: Jede Anfrage kostet Rechenzeit, und ohne Lösung kann niemand die Limits einer fremden Adresse aufbrauchen.

- API: `GET /api/v1/altcha` gibt eine Challenge aus (`altcha-lib`, PBKDF2/SHA-256, 10 Minuten gültig). `requireAltcha` aus `lib/altcha.ts` steht vor `validJson`, liest das Feld `altcha` im JSON-Body und antwortet sonst mit 403 und `altchaFailed`. Jede Lösung gilt einmal, das merkt sich ein Zähler in `rate_limits`. Den HMAC-Schlüssel erzeugt die API beim ersten Aufruf und legt ihn in `server_secrets` ab, alle Instanzen teilen ihn, eine Env-Variable braucht es nicht.
- Web: `Altcha.svelte` ins Formular, mit `bind:payload` und `bind:this`. Das erste Absenden startet die Rechnung, danach schickt das Widget das Formular selbst noch einmal ab. Der Handler übergeht deshalb Absenden ohne Payload und ruft nach einem Fehler `reset()` auf, Vorbild `routes/login/+page.svelte`. Das Widget kommt aus `altcha/external` mit eigener CSS- und Worker-Datei, so bleibt die CSP ohne Ausnahme. Seine Texte bringt es auf Deutsch und Englisch mit, die Sprache folgt dem Umschalter. Das Sammeln von Zeiger- und Scrolldaten (`humanInteractionSignature`) ist aus.
- CLI: `login` holt eine Challenge und löst sie mit `altcha-lib`, bevor sie den Code anfordert.
- Schwierigkeit: `COST` und Zählerbereich in `apps/api/src/lib/altcha.ts`. Auf einem Laptop rechnet der Browser 0,1–0,5 s, das Widget zeigt mindestens 0,5 s. Nur erhöhen, wenn Bots durchkommen.
- Tests: `apps/api/src/testing.ts` löst Challenges für die API-Tests, der Browser-Test rechnet mit dem echten Widget.

## Login in der Savor-Vorschau

Agenten zeigen Änderungen hinter dem Login in der Savor-Vorschau mit dem Testkonto admin@pleasance.org. `login-link <slug>` aus dem Kontor ruft dafür im API-Container `bun apps/api/src/login-link.ts <email>` auf. Das gibt einen einmaligen Login-Link aus, 15 Minuten gültig wie ein gemailter, den der Agent per `browser_navigate` öffnet. Die Vorschau hat pro Projekt ein festes Profil, und Sessions in Benutzung verlängern sich bei jedem Besuch auf 30 Tage. Also bleibt sie angemeldet. Für die CLI nimmt der Agent denselben Link per Pipe, siehe „CLI“.

## CLI

Jeder Prototyp hat eine eigene Befehlszeile in `apps/cli`, damit Agenten, Skripte und Tests die App über Befehle für die Sache selbst bedienen statt über die UI. Sie spricht nur mit der HTTP-API wie das Web, nie mit der Datenbank. So gelten dieselben Rechte, Rate-Limits und die geschlossene Registrierung (`SIGNUPS_OPEN`). Die Argumente liest `parseArgs` aus `node:util`, ohne weitere Abhängigkeit.

- Bauen: `bun run build` kompiliert `apps/cli/build/<slug>`, eine einzelne Datei mit Bun darin (gut 100 MB). Der Name kommt aus `APP_ID` in `packages/shared`. Die Adresse der App ist eingebacken: `APP_URL` aus der Umgebung beim Bauen (die CI setzt die Live-URL, ab 1.0 `API_URL`), sonst `https://<slug>.pleasance.org`. `--url` wählt eine andere, etwa `http://localhost:5173` gegen `bun run dev`, danach gilt die Adresse des letzten Logins. Ohne Bauen: `bun apps/cli/src/main.ts <befehl>`.
- Anmelden: `<slug> login` fragt nach der Adresse und nach dem Code aus der Mail, wie die App. `<slug> login --link <link>` löst einen Login-Link ein, `--link -` liest ihn von stdin. Den Nostr-Login hat nur das Web. Danach liegt der Token dieses Geräts mit `0600` in `$XDG_CONFIG_HOME/<slug>/session.json` (sonst `~/.config`, unter macOS `~/Library/Application Support`, unter Windows `%APPDATA%`), zusammen mit der Adresse, an andere Adressen geht er nie. Er ist eine gewöhnliche Session als Bearer: gehasht in `sessions`, 365 Tage, verlängert sich bei Nutzung, jedes Gerät hat seine eigene. `whoami` zeigt das Konto, `logout` widerruft den Token auf dem Server und löscht die Datei, ein neuer Login widerruft den alten.
- Befehle für die App: `requests [--tab mine|open|sent]` zeigt die Anfragen wie die Startseite im Web.
- Ausgabe: Text für Menschen, mit `--json` genau ein JSON-Wert auf stdout, auch Fehler als `{ "error": "…" }` und die Hilfe als Liste der Befehle. Exit-Codes: 0 erledigt, 1 Fehler (auch Absagen der API wie die geschlossene Registrierung), 2 falscher Aufruf, 3 nicht angemeldet. Hilfe und Meldungen stehen als `cli…` in `packages/shared/src/messages.ts`, die Sprache kommt aus `LANG` oder `--lang`, die API antwortet per `Accept-Language` in derselben.
- Eigene Befehle: Datei in `apps/cli/src/commands` nach dem Beispiel `requests.ts` und in `commands` in `src/cli.ts` eintragen. Ein Befehl nennt Hilfezeilen, Optionen und `run`. Das ruft über `ctx.api` die API auf, liest die Antwort mit zod und gibt `{ data, text }` zurück, `data` für `--json`. `currentUser(ctx)` verlangt den Login, Fehler enden als `Failure` mit einem Code aus `EXIT`. Die Tests in `src/cli.test.ts` rufen die CLI im Prozess gegen die echte API auf, wie die API-Tests gegen `DATABASE_URL`.
- Agenten: nur mit dem Testkonto admin@pleasance.org, nie mit Kundenkonten. Den Token holen sie ohne Container über den Login-Link aus dem Kontor, per Pipe, so steht der Link nicht in ihrem Kontext: `login-link <slug> | apps/cli/build/<slug> login --link -`. Danach bleibt die CLI auf diesem Rechner angemeldet.
- Verteilen: Für andere Plattformen `bun run build --target=bun-darwin-arm64` in `apps/cli` (ebenso `bun-linux-x64`, `bun-linux-arm64`, `bun-windows-x64`), das überschreibt `build/<slug>`. Die CI baut die Datei bei jedem Lauf zur Probe, veröffentlicht sie aber nicht. Release-Artefakte erst, wenn ein Prototyp die CLI an Menschen außerhalb des Repos gibt.

## Live als 1.0

Nur auf Robins ausdrücklichen Auftrag („X geht als 1.0 live“). Der Prototyp bekommt dann eine eigene Domain.

1. Namen prüfen, bevor es Domain-Vorschläge gibt. Marken: DPMAregister, EUIPO/TMview, bei internationaler Zielgruppe auch USPTO, vor allem in den Klassen 9 und 42 (Software, SaaS). Verwechslung: App Store, Google Play, GitHub und Websuche nach gleich oder ähnlich klingenden Produkten in derselben Branche. Treffer mit Fundstelle nennen. Ist der Name belegt oder zu nah dran, neue Namen vorschlagen. Der Slug bleibt, nur Anzeigename (`APP_NAME`) und Domain ändern sich. Dabei die Wettbewerbsprüfung aus `prototypes.md` wiederholen: Ist seit dem Start ein vergleichbares Produkt live gegangen, das melden, bevor es weitergeht.
2. 3–5 freie Domains vorschlagen, mit Empfehlung. Verfügbarkeit über die Porkbun-API (`/domain/checkDomain/<domain>`, Keys `PORKBUN_*` in `~/.secrets`), Preise aus `https://api.porkbun.com/api/json/v3/pricing/get`. Zu jedem Vorschlag Erst- und Verlängerungspreis nennen. Ziel ist das beste Preis-Leistungs-Verhältnis: kurz, eindeutig. Endung: erst `<name>.com` ohne Zusatz, dann `<name>.app`. Sind beide belegt oder zu teuer, einen anderen Namen vorschlagen statt eines Zusatzes (`get<name>.com`) oder einer anderen TLD. Länder-TLDs wie `.de` oder `.eu` nicht, sie binden an eine Region. Premium-Domains nur mit Begründung.
3. Robin kauft die Domain bei Porkbun, mit Auto-Renew und eingeschaltetem API-Zugriff für die Domain.
4. DNS über die Porkbun-API: A-Einträge für `@` und `www` auf VPS 1, TTL 600.
5. Coolify: Die neue Domain kommt beim Service `web` als erste dazu (`https://<domain>:3000,https://<slug>.pleasance.org:3000`). `APP_URL` auf die neue Domain setzen und neu deployen.
6. Umleitung: `/data/coolify/proxy/dynamic/<slug>-redirect.yaml` auf VPS 1. Ein Router mit höherer Priorität und `tls.certResolver: letsencrypt` leitet `<slug>.pleasance.org` und `www.<domain>` per `redirectRegex` (`permanent: true`) auf `https://<domain>` um. Gibt es eine App, bleibt `/api` unter der alten Adresse vom Redirect ausgenommen, bis keine Builds mit alter `API_URL` mehr im Umlauf sind: Apps folgen Redirects bei POST nicht.
7. Nachziehen: `LIVE` in `packages/shared` und `live` in `apps/mobile/lib/config.dart` auf `true` (Testmodus, siehe „Feedback“), GitHub-Variable `API_URL`, Monitor in Uptime Kuma, Referrer von API-Keys, `AGENTS.md` des Projekts (Live-URL, Prüf-URL) und die Zeile in `infra.md`.
8. Prüfen: `curl -sI` auf alte Adresse und `www.` (301 auf die neue Domain), `curl -s https://<domain>/api/health`, Login per Magic Link über die neue Domain.
9. Tag `v1.0.0` setzen, wenn `main` gleich `origin/main` ist und die CI auf genau diesem Commit grün ist. Vorher den CI-Status dieses Commits zeigen, dann `git push origin v1.0.0`. Gepushte Tags sind fest: nie löschen oder verschieben, geht etwas schief, folgt `v1.0.1`.

## Mobile-App

Flutter mit Riverpod und go_router, Karte mit flutter_map und OSM, Token in `flutter_secure_storage`, GlitchTip über `sentry_flutter`. Die App spricht dieselbe API wie das Web: Code per Mail anfordern (`POST /api/v1/auth/code`), Code gegen Session-Token tauschen (`/auth/code/verify`), danach Bearer-Token. Einen eigenen Server braucht sie nicht.

### Neues Projekt

1. Umbenennen, `<slug>` ohne Bindestrich:
   ```sh
   cd apps/mobile
   grep -rl org.pleasance.starter lib android ios | xargs sed -i 's/org\.pleasance\.starter/org.pleasance.<slug>/g'
   mv android/app/src/main/kotlin/org/pleasance/starter android/app/src/main/kotlin/org/pleasance/<slug>
   ```
   Anzeigename in `lib/config.dart` (`appName`), `android/app/src/main/AndroidManifest.xml` (`android:label`) und `ios/Runner/Info.plist` (`CFBundleDisplayName`). Den Farbband-Ausschnitt wie im Web in `lib/config.dart` (`appBand`).
2. Lokal starten, die API läuft dabei über `bun run dev`:
   ```sh
   cd apps/mobile
   flutter run                                              # iOS-Simulator
   flutter run --dart-define=API_URL=http://10.0.2.2:3000   # Android-Emulator
   ```
   Auf einem echten Gerät die LAN-IP des Laptops nehmen. Ohne `SMTP_HOST` steht der Code im API-Log.

### Release

`.github/workflows/mobile.yml` prüft jede Änderung an der App mit `flutter analyze` und `flutter test`. Auf `main` baut die CI für Android ein signiertes AAB als Artefakt. Zu TestFlight lädt sie iOS nur bei einem Release-Tag `v*` oder von Hand mit `gh workflow run mobile.yml`, denn ein macOS-Lauf kostet in privaten Repos etwa 60 Actions-Minuten.

- **GitHub-Variablen:** `API_URL` (`https://<domain>`, ohne werden beide Release-Jobs übersprungen), `SENTRY_DSN` (eigenes GlitchTip-Projekt für die App), `ASC_KEY_ID` und `ASC_ISSUER_ID`.
- **GitHub-Secrets:** `ASC_KEY_P8` (App-Store-Connect-API-Key, base64), `IOS_DEV_CERTIFICATE` (festes „Apple Development“-Zertifikat als base64-PKCS12, läuft am 04.10.2027 ab), `IOS_DEV_CERTIFICATE_PASSWORD`, `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
- Ohne `ASC_KEY_ID` wird der iOS-Job übersprungen, ohne `IOS_DEV_CERTIFICATE` bricht er ab. Ohne festes Zertifikat legt Xcode pro Lauf ein neues an, bis die Zertifikatsgrenze des Teams erreicht ist. Ohne Keystore signiert Android mit Debug-Keys (nur zum Testen).
- Die App vorher in App Store Connect mit der Bundle-ID anlegen. Team-ID steht in `ios/ExportOptions.plist` und im Xcode-Projekt.
