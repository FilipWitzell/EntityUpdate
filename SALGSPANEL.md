# Hurtigoppdatering av salg

Sidepanel på salgskortet som viser salgets verdier og lar deg velge nye og lagre alt med ett klikk.

## Vise demoen (uten SuperOffice)

```bash
npm run demo
```

Åpner `http://localhost:5173/#/demo` med testdata. Endringer lever til siden lastes på nytt.

## Felter

Feltene styres fra én liste i `src/config/saleFields.ts`. Fjern, flytt eller endre etiketter der.
Nye felttyper (f.eks. udef-felter som Koststed) krever litt kode i `src/agents/SaleAgent.ts`.

| Felt | Verdier fra |
|---|---|
| Tittel, Sum, Sannsynlighet, Salgsdato | Fritt |
| Fase | Salgsfaser (velger du fase, foreslås fasens sannsynlighet) |
| Eier | Brukere |
| Salgstype, Kilde, Konkurrent | SuperOffice-lister |
| Status | Åpen / Solgt / Tapt / Stoppet |
| Grunn | Følger status: grunn solgt, tapt eller stoppet. Må velges når status endres. |
| Prosjekt | Søk på prosjektnavn |

## Koble mot en ekte SuperOffice-tenant

1. Legg tenanten inn som target i `deploy.config.json` (se `deploy.config.schema.json`).
2. `npm run dev` - første gang åpnes et nettleservindu for innlogging.
3. Test et ekte salg: `http://localhost:5173/#/sale/<salgsnummer>`.
4. `npm run deploy` publiserer appen til tenanten.
5. Opprett web panel i SuperOffice (Innstillinger og vedlikehold → Web panel):
   - Synlig i: Salgskort (sidepanel)
   - URL: `https://app.superoffice.com/<tenant>/CS/scripts/blogic.fcgi?action=doScript&includeId=vue-app-loader&app=sale-update&saleId=<said>`
   - `<said>` er SuperOffice-variabelen for salgsnummeret
