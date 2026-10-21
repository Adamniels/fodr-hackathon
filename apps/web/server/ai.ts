// Alla anrop till Claude. Körs bara på servern så att API-nyckeln aldrig når webbläsaren.
// AI:n läser, frågar och förklarar. Den räknar aldrig behov eller doser; det gör packages/domain.

import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { RASER } from '@fodr/domain/breeds'
import { INGREDIENSER } from '@fodr/domain/types'

const MODEL = 'claude-sonnet-5-5'
const RAS_ID = RASER.map((r) => r.id) as [string, ...string[]]
let client: Anthropic | null = null
function anthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('Ingen API-nyckel. Lägg ANTHROPIC_API_KEY i app/.env och starta om servern.')
  }
  return (client ??= new Anthropic())
}

const tal = z.number().nullable()

const AnalysSchema = z.object({
  arAnalys: z.boolean().describe('False om dokumentet inte är en foderanalys'),
  typ: z.enum(['hosilage', 'ho']),
  labb: z.string().nullable(),
  provdatum: z.string().nullable().describe('ÅÅÅÅ-MM-DD'),
  tsProcent: tal.describe('Torrsubstans i procent'),
  askaGPerKgTs: tal.describe('Råaska, g/kg ts'),
  perKgTs: z.object({
    energi: tal.describe('Omsättbar energi för HÄST, MJ/kg ts'),
    energiIdisslare: tal.describe('Omsättbar energi för idisslare, MJ/kg ts, bara om hästvärde saknas'),
    smbRp: tal.describe('Smältbart råprotein för häst, g/kg ts'),
    raprotein: tal.describe('Råprotein, g/kg ts'),
    ca: tal.describe('g/kg ts'),
    p: tal.describe('g/kg ts'),
    mg: tal.describe('g/kg ts'),
    na: tal.describe('g/kg ts'),
    fe: tal.describe('mg/kg ts'),
    mn: tal.describe('mg/kg ts'),
    cu: tal.describe('mg/kg ts'),
    zn: tal.describe('mg/kg ts'),
    co: tal.describe('mg/kg ts'),
    jod: tal.describe('mg/kg ts'),
    se: tal.describe('mg/kg ts'),
    socker: tal.describe('Vattenlösliga kolhydrater/socker, g/kg ts'),
    starkelse: tal.describe('g/kg ts'),
  }),
  anmarkningar: z.array(z.string()).describe('Osäkerheter i läsningen, på svenska'),
})
export type AnalysSvar = z.infer<typeof AnalysSchema>

const ANALYS_SYSTEM = `Du läser svenska grovfoderanalyser för häst (hö eller hösilage) från vilket labb som helst.
Returnera värden omräknade till per kg torrsubstans (ts):
- Om labbet anger per kg foder (eller "i foder", "per kg vara"), dividera med ts-halten.
- Procent av ts gånger 10 ger g/kg ts. g/100 g ts gånger 10 ger g/kg ts.
- Energi: använd värdet för häst om det finns (MJ OE häst). Om bara idisslarvärde finns, lägg det i energiIdisslare och lämna energi null.
- Protein: använd smältbart råprotein för häst om det finns, annars råprotein i raprotein.
- Socker kan heta WSC eller vattenlösliga kolhydrater.
Ett värde som inte står i dokumentet ska vara null. Gissa aldrig och fyll aldrig i typvärden.`

export async function lasAnalys(fil: { mediaType: string; base64: string }): Promise<AnalysSvar> {
  const dokument: Anthropic.ContentBlockParam =
    fil.mediaType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fil.base64 } }
      : {
          type: 'image',
          source: {
            type: 'base64',
            media_type: fil.mediaType as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif',
            data: fil.base64,
          },
        }
  const svar = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: ANALYS_SYSTEM,
    output_config: { effort: 'low', format: zodOutputFormat(AnalysSchema) },
    messages: [{ role: 'user', content: [dokument, { type: 'text', text: 'Läs ut analysen.' }] }],
  })
  return parsedOutput(kravSvar(svar))
}

const ProfilSchema = z.object({
  grovfoderKgPerDag: tal.describe('Kg grovfoder (som det utfodras) per dag, om det framgår'),
  grovfoderTyp: z.enum(['hosilage', 'ho']).nullable(),
  nuvarandeFoder: z.array(
    z.object({
      produktId: z.string().nullable().describe('Id från produktlistan om det är samma produkt, annars null'),
      namn: z.string(),
      gramPerDag: z.number().describe('Gram per dag, omräknat från t.ex. liter, mått eller per mål'),
    }),
  ),
  ras: z
    .enum(RAS_ID)
    .nullable()
    .describe('Ras om den nämns. Halvblod räknas som varmblod_rid, kallblodstravare som nordsvensk'),
  prestanda: z
    .enum(['fritid', 'tavling_lokal', 'tavling_hog', 'trav_galopp_traning', 'distans'])
    .nullable()
    .describe('Gren och nivå om det framgår'),
  miljo: z
    .object({
      hallning: z.enum(['box', 'losdrift']).nullable(),
      timmarUtePerDag: tal,
      klippt: z.boolean().nullable(),
      tacke: z.boolean().nullable(),
    })
    .describe('Fält som inte framgår är null'),
  fang: z.boolean(),
  ems: z.boolean(),
  ppid: z.boolean().describe('PPID eller Cushings'),
  magsar: z.boolean(),
  pssm: z.boolean().describe('Korsförlamning, PSSM'),
  luftvagar: z.boolean().describe('Luftvägsbesvär, hosta, dammkänslighet, astma'),
  tandproblem: z.boolean(),
  proteinkanslig: z.boolean(),
  undvik: z.array(z.enum(INGREDIENSER)).describe('Ingredienser ägaren säger att hästen inte tål'),
  ovrigt: z.string().describe('Övrig hälsoinformation som påverkar utfodringen, kort'),
  foljdfragor: z.array(z.string()).describe('Högst två korta frågor om något som behövs men är oklart'),
})
export type ProfilSvar = z.infer<typeof ProfilSchema>

const PROFIL_SYSTEM = `Du hjälper en hästägare att fylla i en hästprofil för foderplanering.
Du får fritext om hästen (ras, arbete, miljö), vad den äter i dag och om hälsan, samt en produktlista.
- Gör om mängder till gram per dag. Om ett mått saknar vikt, ställ en följdfråga i stället för att gissa.
- Matcha bara mot produktlistan när det tydligt är samma produkt.
- Grovfoder (hö, hösilage) hör inte till nuvarandeFoder, utan till grovfoderKgPerDag.
- Känsligheter sätts bara till true när texten tydligt säger det. Gissa inte diagnoser.
- Lösdrift betyder ute dygnet runt: sätt timmarUtePerDag till 24 och fråga inte om det.
- Fråga bara om sådant som påverkar foderplanen. Inga följdfrågor om allt är tydligt.
Svara på svenska.`

export async function tolkaProfil(input: {
  foderText: string
  halsaText: string
  tidigareSvar: { fraga: string; svar: string }[]
  produkter: { id: string; namn: string }[]
}): Promise<ProfilSvar> {
  const text = [
    `Om hästen och vad den äter i dag:\n${input.foderText || '(inget angivet)'}`,
    `Hälsa:\n${input.halsaText || '(inget angivet)'}`,
    input.tidigareSvar.length
      ? `Svar på tidigare följdfrågor:\n${input.tidigareSvar.map((s) => `- ${s.fraga} ${s.svar}`).join('\n')}`
      : '',
    `Produktlista:\n${input.produkter.map((p) => `${p.id}: ${p.namn}`).join('\n')}`,
  ]
    .filter(Boolean)
    .join('\n\n')
  const svar = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: 8000,
    system: PROFIL_SYSTEM,
    output_config: { effort: 'low', format: zodOutputFormat(ProfilSchema) },
    messages: [{ role: 'user', content: text }],
  })
  return parsedOutput(kravSvar(svar))
}

const FORKLARING_SYSTEM = `Du förklarar en färdigberäknad foderplan för en hästägare på vanlig svenska.
Beräkningen är gjord enligt SLU:s utfodringsrekommendationer och är redan klar. Du får den som JSON.
- Använd bara siffror som finns i underlaget. Räkna inte om och hitta inte på nya värden.
- Börja med det viktigaste: vad grovfodret täcker och vad som saknas eller är för mycket.
- Förklara sedan förslaget och varför, och nämn det billigare eller alternativa förslaget om det finns.
- Om underlaget har byten: säg att dagens produkt byts mot en liknande och vad det sparar per månad. Beskriv det som ett byte, inte som att något tas bort och något annat läggs till.
- Om något bygger på uppskattade värden (schablon), säg det kort.
- Nämn kort det viktigaste under omGrovfodret om det påverkar hästen.
- Om hästen har känsligheter: säg i en mening hur planen tagit hänsyn till dem.
- Om det finns varningar om fång, EMS eller sjukdom: avsluta med att rekommendera kontakt med veterinär.
- Inga förkortningar utan förklaring, inga tabeller.
- Högst 120 ord i högst tre korta stycken: läget i dag, förslaget och varför, och det hästägaren ska tänka på. Hellre färre siffror än fler.`

export async function forklaraPlan(underlag: unknown): Promise<string> {
  const svar = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: FORKLARING_SYSTEM,
    output_config: { effort: 'medium' },
    messages: [{ role: 'user', content: JSON.stringify(underlag) }],
  })
  kravSvar(svar)
  return svar.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
}

/**
 * The parsed reply. With structured output the SDK parses it against the schema, and kravSvar has already turned a
 * refusal or a cut-off reply into an error, so it is present.
 */
function parsedOutput<T>(svar: { parsed_output: T | null }): T {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- see the comment above
  return svar.parsed_output!
}

function kravSvar<T extends { stop_reason: string | null }>(svar: T): T {
  if (svar.stop_reason === 'refusal') throw new Error('Modellen avböjde att svara på förfrågan.')
  if (svar.stop_reason === 'max_tokens') throw new Error('Svaret blev avklippt. Försök igen.')
  return svar
}

const JournalSchema = z.object({
  sammanfattning: z.string().describe('Högst 60 ord om hur det gått över tid'),
  monster: z
    .array(
      z.object({
        iakttagelse: z.string(),
        mojligKoppling: z.string().nullable().describe('T.ex. ett foderbyte eller en planändring nära i tid'),
        datum: z.string().nullable(),
      }),
    )
    .describe('Högst tre mönster eller samband i journalen'),
  veterinar: z.object({
    behovs: z.boolean(),
    skal: z.string().nullable(),
  }),
  nastaSteg: z.array(z.string()).describe('Högst tre konkreta saker för ägaren att göra eller följa upp'),
})
export type JournalSvar = z.infer<typeof JournalSchema>

const JOURNAL_SYSTEM = `Du läser en hästs foderjournal åt ägaren och letar mönster över tid.
Du får hästens profil, journalposterna i datumordning, trenden som redan är beräknad och den aktuella foderplanen.
- Koppla iakttagelser till foderbyten eller planändringar nära i tid, men skriv "kan hänga ihop" och aldrig att något orsakat något.
- Ge aldrig doser, gram eller nya foderstater. Planen räknas fram separat enligt SLU.
- Ställ aldrig diagnoser.
- Sätt veterinar.behovs till true vid tecken som kan vara allvarliga: ömhet i hovar eller stel gång (särskilt vid fånghistorik, EMS eller PPID), kolik, snabb avmagring, aptitförlust, feber, upprepad lös mage eller hosta som inte går över. Förklara kort varför.
- Nästa steg ska vara praktiska, till exempel när hästen ska vägas eller vad ägaren ska anteckna.
Svara på enkel svenska.`

export async function analyseraJournal(underlag: unknown): Promise<JournalSvar> {
  const svar = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: 8000,
    system: JOURNAL_SYSTEM,
    output_config: { effort: 'medium', format: zodOutputFormat(JournalSchema) },
    messages: [{ role: 'user', content: JSON.stringify(underlag) }],
  })
  return parsedOutput(kravSvar(svar))
}
