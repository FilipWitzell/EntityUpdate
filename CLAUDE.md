# EntityUpdate

Ett SuperOffice-sidepanel (Vue 3 + Element Plus, cc-vuejs-oppsett) for hurtigoppdatering av
Firma, Sak og Salg. Person og Prosjekt kommer senere. Startet som kopi av SaleUpdate
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
- Lagring er AV til `VITE_ALLOW_SAVE=true` settes, for eksempel i `.env.cust30460.local`.

## Én web panel-URL for alle kort

`src/services/superOfficeContext.ts` leser SuperOffice-vinduets adresse og finner kortet ut fra
første ledd og `<entitet>_id`, for eksempel:

- `default.aspx?ticket.main.saleupdate?ticket_id=39&selection_id=808`
- `default.aspx?sale.selection.board.saleupdate?sale_id=8&selection_id=808`
- `default.aspx?contact.main.salearchive.saleupdate?contact_id=341`

Kan adressen ikke leses, brukes ID-ene i URL-en i rekkefølgen sak → salg → prosjekt → person → firma.
SuperOffice fyller alle variablene ut fra det som er aktivt, så ID-ene alene sier ikke hvilket kort
panelet står på. Person og Prosjekt viser foreløpig «ikke støttet ennå» (`NoCardView.vue`).

URL (Vis i: Firma, Salg, Sak):

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
  - Felt: Tittel, Eier (OwnedBy/AssociateId), Kategori (`ejcategory`) og Produkt.
  - Produkt er en relasjon til ekstratabell: `ticket.x_product` → `y_product`, og
    `y_product.x_product_name` vises. Lest og lagret via `CustomFields["x_product"] = "[I:<id>]"`
    (0 = ingen).
  - Valglisten hentes fra `Archive/dynamic` (`y_product.id`, `y_product.x_product_name`).
  - Utvalg: tabell 262.
- **Salg:** eget panel. Salgsutvalg er tabell 13.

## Status

- Deployet til Cust30460 (skrivebeskyttet bygg), og web panel er lagt inn.
- Typesjekk, 20 tester og bygg er grønne.

## Ikke verifisert mot tenant – sjekkes først

1. Formatet på `x_product` i `CustomFields` (åpne `/api/v1/Ticket/<id>`).
2. Kolonnenavn i svaret fra `archive/dynamic` for `y_product`.
3. Filteret «Mine saker» `ownedBy eq <id>` mot `Ticket`, og firmalistens `orgnr` / `associateId`.
4. Feltnavn for «sist endret» på TicketEntity (`updatedAtProperty` i ticket-configen). Uten det
   er konfliktsjekken på sak av.
5. At panelet lastes på nytt og finner riktig kort når man bytter kort i SuperOffice. Hvis ikke,
   må panelet sjekke adressen på nytt når det får fokus.
6. SoProtocol `ticket.main?ticket_id=` for å åpne saken etter lagring.

## Neste steg

- Teste og rette punktene over, deretter slå på lagring i demoen.
- Filter for inaktive produkter i `y_product`, hvis tabellen har et slikt felt.
- Person og Prosjekt: config, demodata og rute (prosjekttabell 11; persontabell ikke bekreftet).
- På sikt: flytte Salg inn i det generiske panelet, med salgslogikken som utvidelse.

## Kjente småting

- `npm audit`: 4 «high» i `braces` via `@vue/eslint-config-typescript`. Det gjelder bare
  lint-verktøyet og havner ikke i bygget. Ikke kjør `npm audit fix --force`, det bytter hovedversjon.
- Lint-feil i `MainView.vue` (`displayError` er ubrukt), arvet fra malen.
