# Glossary

The code keeps the Swedish horse feeding vocabulary as its domain language. New technical code is in English. This table maps the terms.

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
| ANTAGANDE | assumption not taken from SLU | code comment marker |
