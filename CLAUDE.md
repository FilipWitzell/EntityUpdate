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

## Kortet ved siden av panelet

`src/services/superOfficeCard.ts` leser SuperOffice-vinduet (samme opphav som panelet) og rammene i det:

- Kortet er i redigeringsmodus («Lagre» og «Avbryt» vises): panelet lagrer ikke posten som står på kortet.
- Noen skriver (tekst i en editor eller et tekstfelt), eller vinduet kan ikke leses: panelet verken laster
  kortet på nytt eller flytter det til en annen post. Lagring i panelet går likevel.
- Etter lagring åpnes posten på kortet med SoProtocol (`jumpTo(cardProtocol(id))`). Det laster også et
  kort som allerede viser posten (bekreftet på firma, person og prosjekt 16.10). Sak lastes bare på nytt
  når adressen er ny, så sakens SoProtocol har `&reload=<tid>` (bekreftet 16.10).
  Sakskortet har i tillegg en egen oppdateringsknapp (rund pil i toppen). For sak klikker panelet den
  (`clickCardRefresh`, `cardHasRefreshButton` i configen), og bruker SoProtocol bare hvis knappen ikke finnes. Cross-messaging-kommandoen `refresh` gjør
  ingenting i dagens SuperOffice, og brukes ikke lenger.

## Triggere i SuperOffice

Lagring via REST hopper over kortets CRMScript-triggere. Det er bekreftet i Cust30460: orgnr-triggeren
stopper `1234` på kortet, men panelet lagret det. SuperOffice har heller ingen API-operasjon som kjører
en trigger. `ExecuteAsEvent` kjører bare skript fra «Macros and scripts», så det er forkastet.

Derfor leser panelet triggerne i stedet (`config/beforeSave.ts`, `EntityAgent.GetSaveRules`):

- Henter `GET /api/v1/TriggerScript`, og så hver trigger med `/TriggerScript/{PrimaryKey}`. Listen viser
  hendelse og «på» som visningstekst, så triggerne velges på hver triggers egne `ScreenType` og `Enabled`.
- Hendelsen per entitet står i `beforeSaveEvent` i configen: `SalesBeforeSaveContact`, `-Person`,
  `-Project` og `-Ticket`.
- Felt som en aktiv trigger leser med `getInputValue("ContactEntity.OrgNr")` osv., låses i panelet
  («Låst av regel», tooltip med triggernavn) og må endres på kortet.
- Triggere som ikke leser noe felt ved navn, eller bare en id: panelet spør «Lagre uten disse reglene?»
  før lagring.
- Kan triggerne ikke leses (for eksempel uten admin-rettigheter), vises en advarsel, og ingenting låses.
- «Etter lagring»-triggere er ikke dekket. I Cust30460 lager «Når salg settes til solgt – opprett
  prosjekt» et prosjekt, og den kjører ikke når salgspanelet setter salget til solgt.

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

Standardfeltene kan ikke hentes automatisk fra SuperOffice: ingen kilde gir både REST-feltnavn,
ledetekst og MDO-liste. Ledetekstene er likevel SuperOffice sine egne: hvert felt har `archiveColumn`, og
panelet henter kolonnenavnene på brukerens språk fra `Agents/Archive/GetAvailableColumns` for
`labelProvider` (FindContact, Person, FindProject, FindTicket). `label` i configen brukes bare når
SuperOffice ikke gir noe navn (Firma, Kontaktperson og Notat har ingen kolonne). Bruk alltid
SuperOffice sine standardbenevnelser (f.eks. Posisjon, Bransje), aldri egne ord.
Alle REST-kall ber om norsk (`services/userLanguage.ts`: `SO-Language`/`Accept-Language` = `no`), siden
panelets egne tekster er norske. Uten det svarer REST på engelsk. SuperOffice oppgir ikke brukerens språk:
siden har alltid `lang="en"`, og `currentPrincipal` har ikke språk. `no`, `nb` og `nb-NO` gir alle norsk (bekreftet). Derfor er `fields` i hver config en katalog med alle standardfelt det er
verdt å redigere. Felt med `hiddenByDefault` ligger i feltvelgeren (tannhjulet) til noen slår dem på.
Feltnavn og id-navn følger REST-entiteten i dokumentasjonen (docs.superoffice.com, «Get <Entitet> Entity»).
En MDO-liste som ikke kan leses, gir bare tom liste i sitt eget felt (`EntityAgent.GetOptions`).

- **Firma (contact):**
  - Felt: Navn, Avdeling (skjult), Kategori (`category`), Vår kontakt (`associate`),
    Bransje (`business`), Org.nr.
  - Skjult i katalogen: Kode (`Number1`), Nummer (`Number2`), Land (`country`, `CountryId`),
    Supportkontakt (`SupportAssociate`), Ingen utsendelser (`NoMailing`), Stopp (`Xstop`), Notat (`Description`).
  - Udef-felt fra arkivet `FindContact` / `contactUdef/`.
  - Utvalg: tabell 5.
- **Sak (ticket):**
  - Felt: Tittel, Eier (OwnedBy/AssociateId), Kontaktperson (`Person`/`PersonId`) og Kategori
    (`ejcategory`, id-feltet heter `TicketCategoryId`), pluss alle ekstrafelt.
  - Skjult i katalogen: Prioritet (`ticketpriority`, `TicketPriorityId`), Status (`ticketstatus`,
    `TicketStatusId`), Sakstype (`tickettype`, `TicketTypeId`), Frist (`Deadline`, dato og klokkeslett).
  - Firma (`contactId`, feltype `contact` med `personsFor: "personId"`): et hjelpefelt som ikke lagres.
    Det leses fra `Person.ContactId`/`ContactName` og søkes med `name contains`. Nytt firma tømmer
    Kontaktperson og viser personene der. Panelet lagrer ikke nytt firma uten person, siden firmaet
    følger personen (TicketEntity har ingen egen firmarelasjon).
  - Kontaktperson (feltype `person`): en liste med personene på valgt firma. Uten Firma-felt kan man
    søke etter personer i alle firma (`fullName contains`).
  - «Sist endret» er `LastChanged`, så konfliktsjekken er på.
  - Utvalg: tabell 262.
- **Person:** Fornavn, Etternavn, Tittel, Posisjon (`perspos`), Sluttet (skjult). Ikke «Vår kontakt»:
  den følger firmaet. Personvern vises skrivebeskyttet: E-markedsføring er bryteren på Interesser-fanen
  (`NoMailing` snudd, `inverted`). «Hjemmel - …» er hjemmelen til samtykket i `Consents` med
  `ConsentPurposeKey` som begynner med `EMARKET` (i SuperOffice `EMARKETING`) / `STORE`, ellers
  «Ikke registrert» (bekreftet i Cust30460 16.10). Feltene er merket «Kun visning - endres på kortet» (`readOnly`). Bryteren og samtykket er to
  forskjellige ting: bryteren kan være på uten registrert samtykke. Hjemmelens navn hentes fra MDO-listen
  `legalbase` via `LegalBaseId`. Abonnementene (`ShipmentTypes`) vises ikke. Skjult i katalogen: Mellomnavn, Kategori, Bransje, Land, Supportkontakt, Nummer
  (`PersonNumber`), Notat. Udef fra arkivet `Person` / `personUdef/`. Utvalg: tabell 6 (ikke bekreftet).
- **Prosjekt:** Navn, Prosjektnummer, Ansvarlig (`associate`), Type (`projecttype`), Status
  (`projectstatus`), Beskrivelse (skjult). Skjult i katalogen: Sluttdato (`EndDate`), Ferdig
  (`Completed`), Notat (`Postit`). Udef fra arkivet `Project` / `projectUdef/`. Utvalg: tabell 11.
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

- Deployet til Cust30460 med lagring på, og web panel er lagt inn for Firma, Person, Prosjekt, Salg og Sak.
- Prosjekt er bekreftet: Navn, Prosjektnummer, Ansvarlig, Type og Status vises og lagres.
- Typesjekk, 36 tester og bygg er grønne.
- Katalogen med standardfelt og Kontaktperson på sak er testet i demo, ikke mot tenant ennå.
- Bekreftet i Cust30460: Org.nr på firma låses av orgnr-triggeren. Sak (kategori-triggeren) er ikke sjekket.

## Ikke verifisert mot tenant – sjekkes først

1. Kategori på sak skal nå vises (id-feltet var feil: `TicketCategoryId`, ikke `Id`). Sjekk på sak 39.
2. (Bekreftet: lagring av ekstrafelt som rent tall virker, Product og Utstyr på sak 39.)
3. Person: udef-arkivet `Person`, arbeidslistekolonnene (`fullName`, `title`) og persontabell 6 for
   utvalg. Stilling bruker nå MDO-listen `perspos` (docs har ingen `position`). Prosjekt: udef-arkivet
   `Project` og arbeidslistekolonnen `projectNumber`.
4. Filteret «Mine saker» `ownedBy eq <id>` mot `Ticket`, og firmalistens `orgnr` / `associateId`.
5. Sak: at bytte av kontaktperson lagres med `Person: { PersonId }`, og om firmaet på saken følger med.
   At MDO-listene `ticketpriority`, `ticketstatus` og `tickettype` har samme id som entiteten.
   At `Deadline` kommer uten tidssone (verdien skrives tilbake uten `Z`). At personsøket
   (`Person`-arkivet, `fullName contains`) virker.
6. At panelet lastes på nytt og finner riktig kort når man bytter kort i SuperOffice. Hvis ikke,
   må panelet sjekke adressen på nytt når det får fokus.
7. (Løst og bekreftet 16.10: kortet lastes på nytt etter lagring. Sak med sin egen oppdateringsknapp,
   de andre med SoProtocol. Kortvakten er også bekreftet: tekst i meldingseditoren på sak stopper omlastingen.)
8. Firma-feltet på sak er deployet, men ikke testet i SuperOffice: sjekk at kortet viser nytt firma
   etter at ny person er lagret.

## Neste steg

- Teste og rette punktene over. Lagring er slått på i Cust30460-bygget.
- Filter for inaktive produkter i `y_product`, hvis tabellen har et slikt felt.
- Sak: Salg og Prosjekt som søkbare relasjoner (`Sale`/`SaleId`, `Project`/`ProjectId`), og
  sekundære personer. Salg: gå gjennom `saleFields.ts` og legg til skjulte standardfelt.
- Fødselsdato på person er utelatt: `BirthDate` er UTC og kan bli feil dag med dagens dato-felt.
- På sikt: flytte Salg inn i det generiske panelet, med salgslogikken som utvidelse.

## Kjente småting

- `npm audit`: 4 «high» i `braces` via `@vue/eslint-config-typescript`. Det gjelder bare
  lint-verktøyet og havner ikke i bygget. Ikke kjør `npm audit fix --force`, det bytter hovedversjon.
- Lint-feil i `MainView.vue` (`displayError` er ubrukt), arvet fra malen.
