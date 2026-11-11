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

Resultaat van de simulatie (constant actief spelen, slimme aankopen): level 1 ≈ 30 min, oplopend tot ≈ 3,5 uur voor level 10,
≈ 15 uur actief spelen in totaal. Met offline inkomsten erbij speelt een gemiddelde speler weken. De vloot levert 40–55% van het inkomen.

## Eindeloos spelen

- **Na level 10 gaat het door**: de zeeën komen terug als zwaardere versies ("Sunny Shallows II", "III" …) met waardevollere vis
  en sterkere bosses. Vissers blijven elke 100 extra inhuringen ×2 produceren.
- **Nieuwe Reis (prestige)** bij de vuurtoren, vanaf level 3: terug naar level 1 voor **parels**. Elke ooit verdiende parel geeft
  permanent +2% goud. Hoe verder je komt (level + zone), hoe meer parels.
- **Parelwinkel**: Master Angler, Bigger Nets, Head Start, Long Breath, Lucky Charm, Deep Pockets, Pearl Diver.
- Simulatie: `npm run sim -- --voyages 14` — elke reis komt ±10 levels verder dan de vorige, reizen duren geleidelijk langer
  (3 → 20 uur actief). De getallen blijven tot ongeveer level 200 binnen wat JavaScript aankan; daarboven stopt de game veilig.

## Speelplezier (na speeltest)

- **Zee-evenementen** elke 4–7 min: Fish Frenzy (grote school, ×2 goud, 30 s) of Golden Hour (regen van goudvissen, 20 s)
- **Onthullingskaart** bij elke nieuwe zeldzame vis en bij een verslagen boss; **confetti** bij grote momenten
- **Atlas-sets**: een volledige groep vissen per zee geeft rubies + permanent +2% goud
- **Engine-upgrade** (Boat Workshop): tot 3× sneller varen; de boot krijgt een buitenboordmotor (Lv 1), twee motoren (Lv 10) en een turbo (Lv 25)
- **Snellere start**: prijscurve binnen elk level (eerste zones goedkoper), zone 2 opent na ±1 minuut
- **Geheugenlek opgelost**: gedeelde geometrie, het aantal GPU-objecten blijft stabiel (was: groeide onbeperkt)

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
