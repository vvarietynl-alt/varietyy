# Whale Hunter

Idle-/clicker-vissersgame voor Android (Play Store), gebouwd op het GDD en de balance-sheet van "Whale Hunter".
Gebouwd met **Three.js** (lowpoly 3D) + **TypeScript** + **Vite**, en verpakt als Android-app met **Capacitor**.

## Snel starten

```bash
npm install
npm run dev        # speel in de browser: http://localhost:5173 (gebruik telefoon-weergave in DevTools)
npm test           # unit tests (economie, bossfight, spelregels, savegames)
npm run sim        # balanssimulatie: hoe lang duurt elk level?
npm run build      # productie-build naar dist/
```

## Android-app bouwen

Vereist: Android Studio (met Android SDK) en JDK 21.

```bash
npm run android:sync   # build + kopieer naar android/
npm run android:open   # opent het project in Android Studio → Run / Build > Generate Signed Bundle (AAB)
```

App-id: `nl.variety.whalehunter` (aan te passen in `capacitor.config.ts` **vóór** de eerste upload naar de Play Store).

## Hoe het spel werkt (economie à la Egg Inc)

| Egg Inc | Whale Hunter |
|---|---|
| Kip (produceert) | **Visser** (vangt vis per seconde, ook offline) |
| Ei (verkoop je) | **Vis** — de vloot verkoopt elke vis voor de gemiddelde waarde van je beste zone |
| Beter ei-type | Verdere zone / hoger level = waardevollere vis |

De speler zelf vaart met de boot: tikken om vis binnen te halen, bosses verslaan, goudvissen pakken
en zeldzame vissen verzamelen voor de Marine Atlas.

## Wat zit er in deze eerste versie

- 10 levels × 10 zones in ringen rond het eiland, elk level met eigen kleuren en vissen-thema
- 300 vissoorten (30 per level: 10 gewoon, 7 zeldzaam, 5 bedreigd, 5 legendarisch, 2 mythisch/boss, 1 goudvis)
- Vissen met de hengel: boot vaart naar de dichtstbijzijnde vis, tikken haalt hem binnen; tik op een vis om hem als volgende te kiezen
- Bosses in zone 5 en 10: 60 seconden, minigame op 80% en 40% (2% schade per groene hit, slider versnelt)
- Gebouwen: Research Center (zones/levels), Fishing Workshop (skill, speed), Boat Workshop (automatic gear, radar),
  Fishermen's School (25 vissers met mijlpaal-bonussen), Aquarium Museum en Lighthouse (nog "coming soon")
- Goudvissen (8 seconden zichtbaar, meer met radar), trofeeën, Marine Atlas met 3D-previews
- Offline inkomsten (GDD-curve 80% / 50% / 10%, met een limiet van 12 uur) en ×3 voor rubies
- Opslaan in de telefoon, tutorial-tips, geluidseffecten, trillen
- **Je vissersbedrijf in beeld**: elke visser vaart in een eigen boot (roeiboot → vissersboot → trawler → galjoen → magisch schip),
  vist rond het eiland en lost kratten in de haven; de haven groeit mee
- **Verslavende lussen**: 3 missies tegelijk, dagelijkse beloning (7-daagse reeks), boosts (2× goud, 2× tikkracht, 3× goudvissen),
  combo-meter met Frenzy (8 s dubbele schade), kritieke treffers, Lucky catches (×3 goud), drijvende schatkisten en flessenpost

## Balans: wijzigingen ten opzichte van de sheet

Alle getallen staan in **`src/data/balance.ts`**, met bij elke wijziging een `FIX:`-commentaar.
Na een aanpassing: `npm run sim` om het effect op de speeltijd te zien.

| Probleem in de sheet | Oplossing |
|---|---|
| "Num of fish" groeide ×10 per level (23 miljard vis in één zone) | Vervangen door het Egg Inc-model: de vloot produceert vis per seconde |
| Legendarische vis 0,01% (praktisch nooit te vangen) | 1–2% in zone 6–9 |
| Vissers: elke tier ×3 duurder maar ×2 productie (Ocean God = 68 jaar terugverdientijd) | 25 vissers (GDD), tier ×7,5 kosten / ×2,4 productie, inhuren ×1,12 |
| Fishing Workshop speed: prijs ×2 voor +0,5 | Prijs ×1,62 |
| Boat Workshop: niveau 100 al betaalbaar in level 4 | Prijs groeit mee met de economie |
| Vis-HP daalde in de verste zones van level 2–4 | HP stijgt altijd naar buiten |
| Geen boss-HP, geen goud per zeldzaamheid, geen goudvis-beloning | Toegevoegd |
| Zones kostten maar een paar vissen | Prijsfactor per level, afgesteld met de simulatie |

Resultaat van de simulatie (rekent ook kisten, missies, evenementen en Lucky catches mee, en komt overeen met de speeltest):
level 1 ≈ 14 min (snelle eerste indruk), daarna 20, 29, 39, 50, 60, 64, 70, 75 en 80 min — ≈ 8,4 uur actief spelen voor de
eerste reis, plus de tijd dat de vloot offline doorvist. **Langste wachttijd op een nieuwe zone**: 4–7 min in level 1–4,
15–21 min in level 5–10 (zee-evenementen elke 3–5 min, kisten elke ±2 min en missies vullen die tijd).

Prijsmodel: elk level begint bij de prijs die je betaalde om erheen te varen; zone 2 = 30% daarvan, elke volgende zone een
vaste factor duurder (afgesteld per level), het volgende level kost evenveel als zone 9. Zo springt de prijs nergens weg
van je inkomen.

## Eindeloos spelen

- **Na level 10 gaat het door**: de zeeën komen terug als zwaardere versies ("Sunny Shallows II", "III" …) met waardevollere vis
  en sterkere bosses. Vissers blijven elke 100 extra inhuringen ×2 produceren.
- **Nieuwe Reis (prestige)** bij de vuurtoren, vanaf level 3: terug naar level 1 voor **parels**. Elke ooit verdiende parel geeft
  permanent +2% goud. Hoe verder je komt (level + zone), hoe meer parels.
- **Parelwinkel**: Master Angler, Bigger Nets, Head Start, Long Breath, Lucky Charm, Deep Pockets, Pearl Diver.
- Simulatie: `npm run sim -- --voyages 12` — elke reis komt 5–8 levels verder dan de vorige (reis 12: level 85), reizen duren
  geleidelijk langer (2 → 11 uur actief). De getallen blijven tot ongeveer level 200 binnen wat JavaScript aankan; daarboven stopt de game veilig.

## Speelplezier (na speeltest)

- **Zee-evenementen** elke 4–7 min: Fish Frenzy (grote school, ×2 goud, 30 s) of Golden Hour (regen van goudvissen, 20 s)
- **Onthullingskaart** bij elke nieuwe zeldzame vis en bij een verslagen boss; **confetti** bij grote momenten
- **Atlas-sets**: een volledige groep vissen per zee geeft rubies + permanent +2% goud
- **Engine-upgrade** (Boat Workshop): tot 3× sneller varen; de boot krijgt een buitenboordmotor (Lv 1), twee motoren (Lv 10) en een turbo (Lv 25)
- **Snellere start**: prijscurve binnen elk level (eerste zones goedkoper), zone 2 opent na ±1 minuut
- **Geheugenlek opgelost**: gedeelde geometrie, het aantal GPU-objecten blijft stabiel (was: groeide onbeperkt)

## Review-ronde: eerste minuten, ruby-economie, aankopen

- **Eerste minuten**: startscherm; de 3e vangst is altijd een zeldzame vis (onthullingskaart); na 5 vangsten komt de eerste
  visser gratis (je ziet je bedrijf meteen); eerste schatkist na 25 s, eerste zee-evenement na 90 s; eerste missies leren de
  basis; dagbeloning-popup pas na 25 vangsten; minder meldingen tegelijk
- **Ruby-economie** (was 55–100 rubies per uur, waardoor kopen zinloos was): 5 missies per dag geven rubies (daarna goud),
  missie wisselen 1× per 10 min, 5% van de kisten 1–2 rubies, 3 reclames voor rubies per dag → ±30 rubies per dag voor een
  dagelijkse speler
- **Aankopen**: pakketten 80–2800 rubies met "Popular"/"Best value", eerste aankoop dubbele rubies, eenmalig
  **Starter Pack** (€2,99, 48 uur na de eerste boss), Captain's Pass; te weinig rubies → winkel opent met "je mist X"
- **Aquarium Museum werkt**: trofeeën → tijdelijke boosts en permanente bonussen
- **Vlootboten varen sneller** mee met je Engine-upgrade
- Aankopen via `src/services/billing.ts` (testmodus: bevestiging, niets afgeschreven; in de Android-app Google Play Billing)
- Speeltest-optie: `?timescale=8` speelt de game 8× versneld (alleen voor testen)

## Beeld en geluid

- **Vissen**: gestroomlijnd lijf met donkere rug en lichte buik, staart-, rug- en borstvinnen, ogen met pupil; ze deuken in bij een tik
- **Boot**: reling, reddingsboei, stootwillen, schoorsteen met rook, wapperende vlag; zachte schaduw onder alle boten
- **Effecten** (`src/render/effects.ts`, één draw call voor alle deeltjes): zachte spetters, kringen in het water, schuimspoor,
  fonkelingen, uitbarstingen bij zeldzame vangsten/bosses/schatten, munten die naar de goudteller vliegen, meeuwen
- **Licht**: warme zon met zachte schaduwen op het eiland, ACES-tonemapping, kleurverloop in de lucht
- **Geluid** (`src/audio.ts`, alles gesynthetiseerd): Caribisch deuntje (steeldrums, calypso-bas, off-beat akkoorden, shaker,
  vier wisselende melodieën) en speelse effecten; muziek en effecten apart aan/uit in Instellingen, pauzeert op de achtergrond

## Playtest-analytics

`src/services/analytics.ts` houdt bij hoe ver spelers komen en wanneer: startscherm, eerste vangst, eerste zeldzame vis,
gratis visser, elke zone en elk level, bosses (gewonnen/verloren), nieuwe reis, aankopen, bekeken reclame, geopende
schermen, missies, dagbeloning en sessielengte. Testers zien dit onder **Instellingen → 📊 Playtest stats** en kunnen er
een screenshot van sturen. In de Play Store-versie stuur je dezelfde gebeurtenissen naar bijv. Firebase Analytics.

## Rubies en beloonde reclame

- **Reclame alleen vrijwillig, op momenten dat het iets oplevert** (max. 12 per dag):
  offline goud ×2, +15 s bij een boss die bijna verslagen is, schatkist of goudvis verdubbelen, missiebeloning ×2,
  2× goud voor 15 minuten (knop rechtsonder), gratis rubies. Nooit gedwongen reclame.
- **Rubywinkel** (3 tabs): rubies / Captain's Pass, permanente bonussen (Golden Hull, Big Hooks, Golden Radar, Night Shift,
  Harbour Manager — blijven ook na een Nieuwe Reis), tijd overslaan (1 / 4 / 24 uur goud), bootskins en eilandversiering.
- **Captain's Pass**: alle reclamebeloningen zonder reclame + dagelijks extra rubies.
- Reclame loopt via `src/services/ads.ts`. Nu toont een testprovider een nepfilmpje van 3 s; in de Android-app komt daar
  AdMob voor in de plaats (bijv. `@capacitor-community/admob`). Aankopen komen via Google Play Billing.

## Projectstructuur

```
src/data/balance.ts     alle balansgetallen (één plek om te tunen)
src/data/fish.ts        vissoorten en level-thema's
src/game/               spellogica zonder graphics (testbaar): economie, Game, bossfight, zee-simulatie, savegame
src/render/             Three.js: zee-shader, lowpoly modellen (placeholder), renderer
src/ui/                 HUD, panelen, overlay (HP-balken, bossfight), stijl
scripts/simulate.ts     balanssimulatie
tests/                  unit tests
android/                Capacitor Android-project
```

## Nog te doen (volgende stappen)

- **Monetisatie**: Google Play Billing (rubies kopen) en AdMob (beloonde advertenties) — de knoppen staan klaar in testmodus
- Harpoen- en net-minigames (GDD), Aquarium Museum-bonussen, Lighthouse
- 30 achievements, profiel
- Echte 3D-art (de modellen zijn nu placeholders uit simpele vormen) en muziek
- Prestige-systeem (lange-termijn retentie, zoals Soul Eggs in Egg Inc)
- Play Store: icoon, splash screen, privacybeleid, Data Safety-formulier, content rating
