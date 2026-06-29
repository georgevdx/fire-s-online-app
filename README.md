# Fireye App - vinnige gids

Hierdie is 'n eenvoudige web/PWA app vir Fireye inspeksies. Dit het nie 'n installasie-framework nodig nie; dit loop as statiese webleers met `index.html`, `app.js`, `styles.css` en die JSON-datalyste.

## Waarvoor gebruik jy dit?

Gebruik dit as jou veld-inspeksie platform:

1. Maak die app oop.
2. Klik `New Project`.
3. Vul die site, adres, kontakpersoon, inspekteur en occupancy in.
4. Werk deur die checklist.
5. Voeg fotos en notas by.
6. Klik `Report` om die verslag te sien.
7. Klik `PDF` om 'n PDF te maak.
8. Gebruik `Export Backup` gereeld om jou inspeksies as 'n JSON backup te stoor.

## Hoe loop jy dit plaaslik?

Moenie net op `index.html` dubbelkliek nie. Die app laai JSON-leers en werk beter deur 'n klein plaaslike webserver.

As Python beskikbaar is, open 'n terminal in hierdie folder en hardloop:

```powershell
python -m http.server 8787
```

Maak dan oop:

```text
http://127.0.0.1:8787/
```

## Hoe skakel dit met jou huidige werk in?

Die app vervang nie jou hele admin proses nie. Dink daaraan as die capture en verslag-deel:

- `checklists.json` en `templates.json`: jou inspeksie-items en templates.
- `occupancies.json`: occupancy keuses.
- `requirements.json`: vereistes wat per occupancy gewys word.
- `localStorage`: waar inspeksies op die toestel gestoor word.
- `Export Backup` / `Import Backup`: handmatige data-oordrag en rugsteun.
- `Cloud`: opsionele Supabase sync as die databasis reg opgestel is.

## Belangrike nota oor cloud sync

Die app bevat reeds Supabase login/sync kode. Dit sal net betroubaar werk as die Supabase projek en `inspections` tabel korrek opgestel is. Sonder dit kan jy steeds plaaslik werk en backups uitvoer.
