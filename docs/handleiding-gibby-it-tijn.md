# Handleiding gibby.it — voor Tijn

Welkom bij **gibby.it**: een online tool voor zzp’ers en kleine ondernemers om klanten, uren, facturen en offertes bij te houden.

Je hebt een **eigen account** met een **eigen omgeving**. Je data is gescheiden van andere gebruikers (bijv. Mark). Je begint met een lege administratie en bouwt alles zelf op.

---

## Inloggen

| | |
|---|---|
| **Website** | https://portaal.gibby.it/auth |
| **E-mail** | `tijn@gibby.it` |
| **Wachtwoord** | *(door Mark doorgegeven — wijzig dit na eerste login)* |

**Tip:** Ga na het inloggen direct naar **Instellingen → Wachtwoord wijzigen** en kies een eigen wachtwoord.

**Problemen met inloggen?**
- Controleer of je op `/auth` zit (staff-login), niet op `/klantenportaal` (dat is voor klanten).
- Uitloggen, browser-cache legen, of een incognito-venster proberen.
- Zie je lege schermen terwijl je Mark’s data verwacht? Dan ben je op het verkeerde account — elk e-mailadres heeft zijn eigen omgeving.

---

## E-mail die je naar Tijn kunt sturen

Onderstaande tekst kun je copy-pasten:

---

**Onderwerp:** Toegang tot gibby.it

Hoi Tijn,

Je kunt nu inloggen op gibby.it — een tool om klanten, uren en facturen bij te houden.

**Inloggen:** https://portaal.gibby.it/auth  
**E-mail:** tijn@gibby.it  
**Wachtwoord:** [vul in]

Je hebt een **eigen omgeving** (los van mij). Alles staat leeg; je kunt zelf klanten en uren toevoegen.

**Aan de slag in 4 stappen:**
1. **Instellingen** — vul je bedrijfsgegevens in (naam, adres, KvK, BTW, IBAN). Die komen op je facturen.
2. **Bedrijven** — voeg je klanten toe (naam, contactpersoon, uurtarief).
3. **Uren** — registreer gewerkte uren per klant.
4. **Facturen** — maak een factuur van openstaande uren (of van een dienst/product).

Uitgebreide handleiding staat in het bijgevoegde bestand `handleiding-gibby-it-tijn.md`.

Groet,  
Mark

---

## Overzicht menu

| Menu | Wat doet het? |
|---|---|
| **Dashboard** | Overzicht: klanten, uren deze maand, openstaande facturen, omzet. Grafieken en waarschuwingen. |
| **Bedrijven** | Je klanten beheren. Per klant: contactgegevens, standaard uurtarief, krediet/voorschot, klantenportaal. |
| **Uren** | Urenregistratie per klant, datum, omschrijving en tarief. |
| **Facturen** | Facturen maken, bewerken, PDF downloaden, status bijwerken, splitsen. |
| **Offertes** | Offertes opstellen (vergelijkbaar met facturen, maar vóór de opdracht). |
| **Overzichten** | Rapportages over uren en omzet per periode. |
| **Notities** | Dagelijkse notities / werklogboek. |
| **Abonnementen** | Terugkerende abonnementen en betalingen bijhouden. |
| **Leads** | Potentiële klanten / sales pipeline. |
| **Producten** | Productcatalogus (algemeen). Per klant kun je ook producten instellen. |
| **Instellingen** | Jouw bedrijfsgegevens, diensten, wachtwoord, Telegram-test. |
| **Klantenportaal** | Voorbeeld/preview van wat klanten zien (aparte login voor klanten). |

---

## Stappenplan: van nul naar je eerste factuur

### Stap 1 — Instellingen invullen

1. Ga naar **Instellingen** (linksonder).
2. Vul in onder **Zakelijke gegevens**:
   - Bedrijfsnaam, contactpersoon, e-mail, telefoon
   - Adres, KvK, BTW-nummer, IBAN
3. Optioneel: **Privé-adres** (voor privé-facturen).
4. Klik **Opslaan**.
5. Wijzig je wachtwoord onder **Wachtwoord wijzigen**.

Deze gegevens verschijnen op PDF-facturen die je downloadt.

---

### Stap 2 — Eerste klant toevoegen

1. Ga naar **Bedrijven**.
2. Klik **Nieuw bedrijf**.
3. Vul minimaal in:
   - **Naam** (of contactpersoon — zonder naam wordt “Klant” getoond)
   - **Standaard uurtarief** (bijv. `75`)
4. Optioneel: adres, e-mail, KvK, BTW, notities.
5. **Krediet / voorschot**: als een klant vooruit heeft betaald, kun je dat hier bijhouden en later verrekenen op facturen.
6. Opslaan.

**Klantenportaal (optioneel):**  
Per klant kun je een login aanmaken zodat de klant zelf uren en facturen kan inzien. Stel een e-mail + wachtwoord in bij het bedrijf. De klant logt in op:

https://portaal.gibby.it/klantenportaal

---

### Stap 3 — Uren registreren

1. Ga naar **Uren**.
2. Klik **Uren toevoegen**.
3. Kies **klant**, **datum**, **aantal uren**, **omschrijving**.
4. **Uurtarief**: laat leeg om het standaardtarief van de klant te gebruiken, of vul een afwijkend tarief in.
5. Opslaan.

Herhaal dit voor elke werkdag/opdracht. Uren die nog niet op een factuur staan, zijn “open” en kunnen later gefactureerd worden.

---

### Stap 4 — Factuur maken

1. Ga naar **Facturen**.
2. Klik **Nieuwe factuur**.
3. Kies de **klant**.
4. Kies het type factuur:
   - **Uren** — selecteer openstaande uren van die klant
   - **Dienst** — een vast bedrag (bijv. “Website onderhoud”)
   - **Product** — producten van die klant (eerst instellen via klantdetail)
5. Stel **BTW** in (standaard 21%, of 0% voor privé-facturen).
6. Optioneel: **krediet/voorschot** verrekenen als de klant saldo heeft.
7. Kies **betaalwijze**: overboeking of contant.
8. Maak de factuur aan.

**Daarna:**
- **PDF downloaden** (knop bij de factuur)
- **Status wijzigen**: `concept` → `verzonden` → `betaald`
- **Splitsen**: grote factuur in termijnen verdelen

---

## Offertes

Werkt grotendeels hetzelfde als facturen, maar dan vóór de opdracht:

1. **Offertes** → **Nieuwe offerte**
2. Klant kiezen, regels toevoegen, PDF downloaden
3. Status bijhouden (concept, verzonden, geaccepteerd, etc.)

---

## Handige extra’s

### Diensten (Instellingen)
Vaste diensten met standaardbedrag aanmaken (bijv. “Consultancy 1 uur — €95”). Handig bij factureren op dienstbasis.

### Producten per klant
Open een klant via **Bedrijven** → klik op de klant. Daar kun je producten met verkoop- en inkoopprijs toevoegen voor productfacturen.

### Dashboard
- Zie in één oogopslag uren, omzet en openstaande facturen
- Waarschuwing als je deze maand nog geen factuur hebt gemaakt
- Overzicht concept-facturen die nog verstuurd moeten worden

### Notities
Kalender met dagelijkse notities — handig als werklogboek naast je uren.

### Abonnementen & Leads
Optioneel — alleen nodig als je terugkerende inkomsten of sales leads wilt bijhouden.

---

## Typische weekworkflow

```
Maandag–vrijdag:  uren bijwerken (5 min per dag)
Einde maand:      facturen maken van open uren
Na betaling:      factuurstatus op "betaald" zetten
```

---

## Veelgestelde vragen

**Zie ik Mark’s klanten of facturen?**  
Nee. Elk account is volledig gescheiden. Jij ziet alleen je eigen data.

**Kan ik op mobiel?**  
Ja, de site werkt in de browser op telefoon en tablet.

**Waar staan mijn facturen als PDF?**  
Je downloadt ze zelf via de knop bij elke factuur. gibby.it stuurt geen e-mails naar klanten — jij verstuurt de PDF (e-mail, WhatsApp, etc.).

**Wat als ik “serverfout” krijg bij factureren?**  
Log uit en opnieuw in. Blijft het? Neem contact op met Mark — dan wordt de server/database nagekeken.

**Wachtwoord vergeten?**  
Er is geen “wachtwoord vergeten”-knop. Mark kan het wachtwoord in de database resetten.

---

## Contact

Vragen over je account of technische problemen: **Mark** (mark@gibby.it).

---

*Versie: juli 2026 — gibby.it / client-flow*
