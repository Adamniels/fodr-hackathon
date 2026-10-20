# Glossary

The code names what the domain is about in Swedish and how the software works in English ([ADR 0016](adr/0016-swedish-domain-names-english-technical-names.md)). This table is the list of domain terms: a Swedish identifier needs a row here, and a new Swedish name adds its row in the same change. Identifiers drop å, ä and ö; the "In code" column gives the exact form. English names refer to these concepts with the English column (`HorseStep`, `bodyConditionText`).

| Swedish | English | In code |
|---|---|---|
| häst | horse | `Hastprofil`, `hast` |
| hull | body condition score, SLU scale 1 to 9 | `hull` |
| grovfoder | roughage, forage | `grovfoder`, `Grovfoderanalys` |
| hö | hay | `'ho'` |
| hösilage | haylage | `'hosilage'` |
| ts, torrsubstans | dry matter (DM) | `tsProcent`, `perKgTs` |
| smb rp, smältbart råprotein | digestible crude protein | `smbRp` |
| råprotein | crude protein | `raprotein` |
| OE, omsättbar energi | metabolisable energy, MJ | `energi` |
| behov | requirement | `Behov`, `beraknaBehov` |
| intag, tillförsel | intake, supply | `Intag`, `intag` |
| brist | deficiency | status `'brist'` |
| överskott | surplus | status `'overskott'` |
| schablon | default value used when the analysis lacks a nutrient | `schablonFor` |
| urval | product selection by the optimiser | `valjProdukter`, `Urval` |
| kraftfoder | concentrate feed | category `'kraftfoder'` |
| mineralfoder | mineral feed | category `'mineralfoder'` |
| tillskott | supplement | category `'tillskott'` |
| foderstat | ration | |
| foderplan | feeding plan | `Plan`, `skapaPlan` |
| injustering, foderbyte | feed transition, changeover | `Injustering`, `skapaInjustering` |
| bytekänslighet | sensitivity to feed changes | `Bytekanslighet` |
| fång | laminitis | `halsa.fang` |
| EMS | equine metabolic syndrome | `halsa.ems` |
| PPID | pituitary pars intermedia dysfunction (Cushing's) | `halsa.ppid` |
| korsförlamning, PSSM | polysaccharide storage myopathy | `halsa.pssm` |
| magsår | gastric ulcers | `halsa.magsar` |
| lösdrift | loose housing, group housing outdoors | `'losdrift'` |
| box | stable box | `'box'` |
| täcke | rug, blanket | `miljo.tacke` |
| klippt | clipped | `miljo.klippt` |
| arbetstillägg | work allowance (extra energy for work) | `arbetsMJ` |
| kylatillägg | cold allowance | `kylaMJ` |
| bete | pasture | (not modelled) |
| journal | horse log: weight, condition, notes, saved plans | `Journalpost` |
| ras | breed | `Ras`, `hittaRas` |
| kön | sex: mare, gelding, stallion | `Kon` |
| hälsa | health conditions that affect feeding | `Halsa`, `halsa` |
| miljö | housing and climate: time outside, rug, clipping, lowest temperature | `Miljo`, `miljo` |
| ridning | riding sessions per week | `Ridning` |
| arbetsnivå | work level (SLU tables 9 to 11) | `Arbetsniva` |
| prestanda | discipline and level of performance | `Prestanda` |
| analys, foderanalys | laboratory analysis of a roughage | `Grovfoderanalys`, `UtlastAnalys`, `analysKomplett` |
| omräkning | conversion of an analysis value, for example to per kg dry matter | `Omrakning` |
| foder, foderpost | a feed and its daily amount | `Foderpost`, `NuvarandeFoder` |
| produkt | feed product in the product database | `Produkt`, `Produktkategori`, `filtreraProdukter` |
| ingrediens | ingredient of a feed product | `Ingrediens`, `INGREDIENSER` |
| kostnad per månad | monthly cost of a feed | `kostnadPerManad` |
| nuläge | today's ration, before the plan | `nulage` |
| krav | requirement range for one nutrient | `Krav` |
| balans | intake against requirement, per nutrient | `balans`, `Balansrad` |
| källa, källhänvisning | SLU source cited for a requirement | `Kalla`, `Kallhanvisning`, `kalla` |
| SLU-nivå | the activity level at which SLU's tables are read | `SluNiva` |
| åtgärd | action in a feeding plan | `Atgard`, `atgarder` |
| varning | warning in a feeding plan | `Varning`, `varningar` |
| notering | note in a feeding plan | `Notering`, `noteringar` |
| byte, produktbyte | swap of a current feed for a cheaper or better fitting product (not a feed transition) | `Byte`, `byten`, `hittaBilligareLiknande` |
| skäl | reason given for a swap or an excluded product | `Byteskal`, `skal` |
| uteslutning | product excluded because of a sensitivity | `Uteslutning` |
| grovfoderkvalitet | quality of the roughage itself (SLU table 32) | `Kvalitetsflagga`, `bedomGrovfoder` |
| bytestakt | pace of a feed transition | `Bytestakt`, `BYTESTAKT` |
| trend | weight and body condition over time, from the journal | `Trend`, `beraknaTrend` |
| sparad plan | snapshot of a plan saved in the journal | `PlanOgonblick`, `ogonblickAvPlan` |
| ANTAGANDE | assumption not taken from SLU | code comment marker |
