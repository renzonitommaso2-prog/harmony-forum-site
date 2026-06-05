# HARMONY Board

Sito contenitore per il progetto di produzione multimediale.

Avvio locale consigliato:

```powershell
python -m http.server 49321
```

Poi aprire:

`http://127.0.0.1:49321/`

Il sito contiene:

- logo, prodotto, pubblicita e fumetto in `assets/`
- due modelli GLB in `assets/`
- walking simulator in `walking-simulator/`
- viewer 3D con Three.js via CDN e fallback link ai file GLB

Non aprire con doppio click su `index.html`: browser e audio/modelli locali funzionano correttamente via HTTP/HTTPS.
