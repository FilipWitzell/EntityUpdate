# EntityUpdate

Ett SuperOffice-sidepanel (Vue 3 + Element Plus, cc-vuejs-oppsett) for hurtigoppdatering av
Firma, Person, Prosjekt, Sak og Salg. Startet som kopi av SaleUpdate
(FilipWitzell/SaleUpdate), som står urørt. Appen deployes som egen app `entity-update`
(blobs `ccApp..entity-update..*`), så SaleUpdate i tenanten berøres ikke.

- Arbeidsgren: `feature/generic-entities` (`main` er den uendrede kopien av SaleUpdate). Ingen PR ennå.
- Demo-tenant: Cust30460. Den er eneste target i `deploy.config.json` og også devTarget.
  Publiser bare dit, og legg aldri til andre tenanter uten at brukeren ber om det.
- Brukeren svarer på norsk (bokmål). Tekster i appen er norske, kode og kommentarer engelske.

## Kommandoer

- `npm test`: node:test i `tests/` (moduler som testes, kan bare ha relative `.ts`-importer
  ved kjøretid, ikke `@/`)
- `npx vue-tsc --build`: typesjekk
- `npm run build-only`: bygg uten typesjekk
- `npm run demo`, eller `npx vite` og så `#/demo` (salg), `#/demo/contact`, `#/demo/ticket`
- `npm run deploy cust30460`: må kjøres lokalt hos brukeren, siden den logger inn i nettleser.
  Cloud-containeren når ikke tenanten.
- `npm ci` feiler fordi `package-lock.json` var ute av synk fra før. Bruk `npm install`, og ikke commit lockfile-endringer.

## Arkitektur

- `src/config/entities/<entitet>.ts`: én config per entitet. Den har felt (property / mdoList /
  idField / udef / customField + extraTable), udef-kilde (arkiv + kolonneprefiks), REST-entitet,
  SoProtocol for kortet, tekster og arbeidsliste (OData-arkiv, kolonner, «mine»-filter,
  utvalgstabell). Demodata ligger i `<entitet>Demo.ts`, og alt registreres i `index.ts`.
- `src/views/EntityQuickUpdateView.vue`: generisk panel for Firma og Sak.
  `SaleQuickUpdateView.vue` er fortsatt eget panel for salg, med salgslogikk: fase og salgstype,
  status og grunn, SetAsSold/SetAsLost og neste aktivitet.
- `src/agents/EntityAgent.ts`: REST, driven av config. `DemoEntityAgent.ts` gir demodata.
- Felles: `agents/LayoutPreferences.ts` (feltoppsett i preferences), `agents/superOfficeLists.ts`
  (MDO-lister, udef-kolonner), `config/entityValues.ts` (lese og skrive verdier på REST-entitet),
  `components/EntityWorklist.vue` (mine / utvalg / andres, med «Lagre og neste»),
  `components/FieldEditor.vue`, `components/FieldLayoutDrawer.vue`.
- Feltoppsett lagres i preference-seksjonen `EntityUpdate`, med nøklene `FieldLayout.<entitet>` og
  `MyFieldLayout.<entitet>`. Salg beholder `SaleUpdate`-nøklene, så eksisterende oppsett følger med.
- Lagring er AV til `VITE_ALLOW_SAVE=true` settes. Det er satt i `.env.cust30460.local` (gitignored), så bygg for Cust30460 kan lagre.

## Én web panel-URL for alle kort

`src/services/superOfficeContext.ts` leser SuperOffice-vinduets adresse og finner kortet ut fra
første ledd og `<entitet>_id`, for eksempel:

- `default.aspx?ticket.main.saleupdate?ticket_id=39&selection_id=808`
- `default.aspx?sale.selection.board.saleupdate?sale_id=8&selection_id=808`
- `default.aspx?contact.main.salearchive.saleupdate?contact_id=341`

Kan adressen ikke leses, brukes ID-ene i URL-en i rekkefølgen sak → salg → prosjekt → person → firma.
SuperOffice fyller alle variablene ut fra det som er aktivt, så ID-ene alene sier ikke hvilket kort
panelet står på. Kort uten panel viser `NoCardView.vue`.

URL (Vis i: Firma, Person, Prosjekt, Salg, Sak):

```
https://app.superoffice.com/Cust30460/CS/scripts/blogic.fcgi?action=doScript&includeId=vue-app-loader&app=entity-update&title=Hurtigoppdatering&contactId=<cuid>&personId=<peid>&projectId=<prid>&saleId=<said>&ticketId=<tiid>
```

## Entiteter

- **Firma (contact):**
  - Felt: Navn, Avdeling (skjult), Kategori (`category`), Vår kontakt (`associate`),
    Forretning (`business`), Org.nr.
  - Udef-felt fra arkivet `FindContact` / `contactUdef/`.
  - Utvalg: tabell 5.
- **Sak (ticket):**
  - Felt: Tittel, Eier (OwnedBy/AssociateId) og Kategori (`ejcategory`), pluss alle ekstrafelt.
  - Utvalg: tabell 262.
- **Person:** Fornavn, Etternavn, Tittel, Stilling (`position`), Vår kontakt (`associate`), Sluttet
  (skjult). Udef fra arkivet `Person` / `personUdef/`. Utvalg: tabell 6 (ikke bekreftet).
- **Prosjekt:** Navn, Prosjektnummer, Ansvarlig (`associate`), Type (`projecttype`), Status
  (`projectstatus`), Beskrivelse (skjult). Udef fra arkivet `Project` / `projectUdef/`. Utvalg: tabell 11.
- **Ekstrafelt (x_...)** hardkodes ikke. `EntityAgent` henter dem for hver entitet fra
  `GET /api/v1/<Entitet>/CustomField` (gruppe «Ekstrafelt»). Støttet: tekst, tall, avkrysning,
  dato, «velg fra liste», MDO-liste og relasjon til ekstratabell (`y_...`). Relasjonens visningsfelt
  hentes fra `Agents/CustomObject/GetCustomObjectDefinition` (eksperimentelt i SuperOffice), og radene
  fra `Archive/dynamic`, sortert på id. Dato og klokkeslett, vedlegg og relasjoner til
  firma/person osv. er utelatt foreløpig.
  - Verdier leses i alle former REST gir (`2`, `"[I:2]"`, `"[D:2026.10.14]"` osv.) og skrives tilbake
    i samme form. `ticket.x_product` i Cust30460 kommer som rent tall (rad-id i `y_product`).
- **Salg:** eget panel. Salgsutvalg er tabell 13.

## Status

- Deployet til Cust30460 (skrivebeskyttet bygg), og web panel er lagt inn.
- Typesjekk, 25 tester og bygg er grønne.

## Ikke verifisert mot tenant – sjekkes først

1. Kategori på sak viser «-» selv om saken har en kategori (Salg/Bestilling på sak 39). Sjekk
   hvordan `Category` ser ut på `/api/v1/Ticket/39` mot `idField` og MDO-listen `ejcategory`.
2. At lagring av `x_product` som rent tall godtas. (Lesing er bekreftet: Product viser CW på sak 39,
   og Utstyr ble funnet automatisk.)
3. Person og Prosjekt: feltnavn på REST-entitetene (`Position`, `Retired`, `ProjectType`,
   `ProjectStatus`, `Description`), MDO-listene `position`, `projecttype` og `projectstatus`,
   udef-arkivene `Person` / `Project`, arbeidslistekolonnene (`fullName`, `title`, `projectNumber`)
   og persontabell 6 for utvalg.
4. Filteret «Mine saker» `ownedBy eq <id>` mot `Ticket`, og firmalistens `orgnr` / `associateId`.
5. Feltnavn for «sist endret» på TicketEntity (`updatedAtProperty` i ticket-configen). Uten det
   er konfliktsjekken på sak av.
6. At panelet lastes på nytt og finner riktig kort når man bytter kort i SuperOffice. Hvis ikke,
   må panelet sjekke adressen på nytt når det får fokus.
7. SoProtocol `ticket.main?ticket_id=` for å åpne saken etter lagring.

## Neste steg

- Teste og rette punktene over. Lagring er slått på i Cust30460-bygget.
- Filter for inaktive produkter i `y_product`, hvis tabellen har et slikt felt.
- På sikt: flytte Salg inn i det generiske panelet, med salgslogikken som utvidelse.

## Kjente småting

- `npm audit`: 4 «high» i `braces` via `@vue/eslint-config-typescript`. Det gjelder bare
  lint-verktøyet og havner ikke i bygget. Ikke kjør `npm audit fix --force`, det bytter hovedversjon.
- Lint-feil i `MainView.vue` (`displayError` er ubrukt), arvet fra malen.
