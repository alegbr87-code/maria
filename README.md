# 🌿 GROW FAST & GROW BIG !! — Diario Coltivazione Indoor

App **PWA** (web app installabile) per iPhone pensata per tenere traccia di una
coltivazione **indoor** giorno per giorno: diario, interventi, parametri
ambientali con **controllo remoto in tempo reale**, consigli tecnici e **alert**.

> Tutto il controllo principale è **in un'unica Home**: fase, lampada, watt,
> area, piante, data, parametri, settimane, consumi e configurazione.

> ⚠️ Strumento personale di tracciamento. La coltivazione di cannabis è
> regolamentata: **verifica sempre la normativa del tuo Paese**. L'app non
> incoraggia attività illegali.

---

## ✨ Funzionalità

- **Diario giornaliero** — una nota al giorno con stato di salute, tag e foto.
- **Calendario del diario** — vista mensile con l'andamento per stadio (colorato)
  e i marker di note, interventi e parametri; tocca un giorno per i dettagli.
- **Ambiente di coltivazione** — dimensioni dell'area (es. 100×50 cm) e numero di
  piante, con **consiglio sulla potenza della lampada** in base a area e tipo.
- **Illuminazione** — tipo lampada (MH, HPS, MH+HPS, LED, CMH/LEC, CFL…) con
  **watt diversi per vegetativa e fioritura** e **orari di accensione/spegnimento**
  (ON → OFF) per fase, salvati nel report.
- **Percorso settimanale** — timeline dal seme alla raccolta (più di 8 settimane,
  fino a ~18 con SCROG/LST) con **fase corrente** (Vegetativa/Fioritura) evidenziata.
- **Consumi & Costi** — **kWh di luce** stimati (potenza × ore × giorni per stadio),
  **litri d'acqua** dalle irrigazioni, **spese extra** (semi, fertilizzanti…) con
  tariffe €/kWh e €/L, totale costo. Tutto incluso nel backup.
- **Tema "grow room underground"** — palette ambra HPS + viola UV + verde muschio,
  texture a grana e vignettatura.
- **Log interventi** — irrigazione, nutrizione, pH/EC, LST/topping, defogliazione,
  trasloco, illuminazione, parassiti, cambio soluzione, pulizia…
- **Parametri** — temperatura, umidità, **VPD**, pH, EC, PPFD, CO₂, temp acqua,
  con grafici e storico. Le letture si registrano separatamente per **giorno e
  notte** (interruttore ☀️/🌙 in Home) e compaiono nel diario del report.
- **Controllo remoto in tempo reale** — pannello dispositivi (lampada,
  estrazione, immissione, ventole, umidificatore, deumidificatore, riscaldatore,
  pompa) e target ambiente inviati a un backend via **WebSocket**.
  Include anche una **modalità demo** che simula sensori e attuatori (nessun
  hardware necessario).
- **Consiglio del giorno** approfondito e contestuale (stadio, settimana,
  substrato/idro, timer luce, ultimi parametri, irrigazione e nutrizione) +
  **schema nutrienti** per settimana.
- **Alert** automatici: parametri fuori range, irrigazione/nutrizione in ritardo,
  cambio stadio, finestra di raccolta, rischio muffa.
- **Calcolatori** — VPD (con **Δ foglia−aria**, di norma 1–3 °C), DLI, conversione
  EC⇄PPM, diluizione soluzione, fotoperiodo.
- **Offline-first** — funziona senza connessione; i dati restano sul dispositivo.
- **Backup** — export/import di tutti i dati in un file JSON.

---

## 🚀 Pubblicare su GitHub (GitHub Pages)

### 1. Crea il repository e carica il progetto

```bash
cd /Users/alegbr87/Desktop/Maria
git init
git add .
git commit -m "Maria — diario coltivazione indoor (PWA)"
git branch -M main

# crea il repo sul tuo account (sostituisci NOME-REPO) e fai il push
git remote add origin https://github.com/TUO-UTENTE/NOME-REPO.git
git push -u origin main
```

### 2. Attiva GitHub Pages

1. Vai su **github.com/TUO-UTENTE/NOME-REPO → Settings → Pages**.
2. In **Build and deployment → Source** scegli **GitHub Actions**.
3. Il workflow incluso (`.github/workflows/pages.yml`) pubblicherà l'app a ogni push.
   Dopo qualche decina di secondi l'app sarà online su:
   `https://TUO-UTENTE.github.io/NOME-REPO/`

> In alternativa (senza Actions): **Settings → Pages → Source: Deploy from a branch**
> → branch `main`, cartella `/ (root)`.

### 3. Aggiungi l'app alla schermata Home dell'iPhone (14 Pro)

1. Apri il link `https://TUO-UTENTE.github.io/NOME-REPO/` con **Safari** (non Chrome).
2. Tocca il pulsante **Condividi** (quadrato con freccia su).
3. Scorri e scegli **“Aggiungi a Home”**.
4. Conferma: comparirà l'icona **Maria**. Si aprirà a tutto schermo, come un'app
   nativa.

---

## 📡 Controllo remoto in tempo reale (backend)

La PWA funziona **subito** in modalità **demo** (Setup → *Modalità demo*):
simula sensori e attuatori direttamente sul telefono.

Per il **controllo reale** serve un piccolo backend (incluso in `server/`):

```bash
cd server
npm install
npm start            # avvia su http://localhost:8080
```

Poi nell'app: **Setup → Controllo remoto → URL WebSocket** =
`ws://IP-DEL-TUO-PC:8080` (in locale) oppure l'URL del backend cloud.

### Deploy del backend su un servizio gratuito
- **Render / Railway / Fly.io**: crea un *Web Service* dalla cartella `server/`,
  build `npm install`, start `npm start`. Imposta `PORT` (di solito automatico)
  e, se vuoi, `MARIA_TOKEN` per proteggere l'accesso.
- Dopo il deploy usa l'URL `wss://tuo-servizio.onrender.com` nell'app.

### Collegare sensori/attuatori reali
Il backend espone anche una **REST**:

```bash
# Invia una lettura da un sensore (es. ESP32)
curl -X POST "http://localhost:8080/telemetry?room=maria" \
     -H "Content-Type: application/json" \
     -d '{"temp":24.8,"rh":58,"ph":6.1,"ec":1.4}'

# Health check
curl http://localhost:8080/health
```

I comandi **on/off** dei dispositivi e i **target** vengono ricevuti dal backend
via WebSocket: puoi farli eseguire da un relè/ESP32 iscritto allo stesso canale
(vedi i messaggi `{type:"control"}` e `{type:"devices"}` in `server/server.js`).

### Protocollo (riassunto)
| Direzione | Messaggio |
|---|---|
| Client → Server | `{type:"join", room, token}` |
| Client → Server | `{type:"control", room, device, on}` |
| Client → Server | `{type:"setTarget", room, targets:{temp,rh}}` |
| Server → Client | `{type:"telemetry", room, data:{temp,rh,vpd,ph,ec,ppfd,co2,waterTemp,devices,targets}}` |
| Server → Client | `{type:"devices", room, data:{...}}` |

---

## 🗂️ Struttura del progetto

```
Maria/
├── index.html                 # app shell
├── manifest.webmanifest       # metadati PWA
├── service-worker.js          # cache offline
├── css/styles.css             # design system (dark, iOS)
├── js/
│   ├── utils.js               # helper (date, VPD, storage…)
│   ├── store.js               # stato + CRUD + persistenza
│   ├── charts.js              # grafici SVG senza dipendenze
│   ├── advice.js              # range target + consigli + nutrienti
│   ├── alerts.js              # motore di alert
│   ├── live.js                # tempo reale + controllo remoto (WS)
│   └── app.js                 # router, viste, eventi, modali
├── icons/                     # icone PWA (PNG + SVG)
├── tools/make_icons.py        # rigenera le icone
├── server/                    # backend Node.js (WebSocket + REST)
│   ├── server.js
│   └── package.json
└── .github/workflows/pages.yml
```

## 🧰 Requisiti di sviluppo

- Solo un browser moderno per usare l'app.
- `node` ≥ 18 per il backend.
- `python3` + `Pillow` solo per rigenerare le icone (`python3 tools/make_icons.py`).

## 🔒 Privacy

I dati del diario sono salvati **in locale** sul dispositivo (localStorage).
Nessun dato lascia l'iPhone a meno che tu non attivi il backend remoto.

---

Fatto con 🌱 per la tua coltivazione indoor.
