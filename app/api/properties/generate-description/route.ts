export const dynamic = 'force-dynamic';

import Anthropic from '@anthropic-ai/sdk';
import { requireApiAuth } from '@/lib/server/api-auth';

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, { module: 'properties', action: 'edit' });
  if (!auth.ok) return auth.response;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: 'ANTHROPIC_API_KEY lipsă — adaugă cheia pentru a folosi AI' },
      { status: 503 }
    );
  }

  try {
    const p = await request.json();

    // ── Build a rich data summary for the prompt ──────────────────────────────
    const tipOferta  = p.tip_oferta || 'vânzare';
    const tipProp    = p.tip_proprietate || 'proprietate';
    const location   = [p.cartier, p.zona, p.localitate, p.judet].filter(Boolean).join(', ');
    const price      = p.price ? `${Number(p.price).toLocaleString('ro-RO')} ${p.currency || 'EUR'}${p.negociabil ? ' (negociabil)' : ''}` : '';

    const suprafete: string[] = [];
    if (p.sup_utila)     suprafete.push(`suprafață utilă: ${p.sup_utila} mp`);
    if (p.sup_construita) suprafete.push(`suprafață construită: ${p.sup_construita} mp`);
    if (p.sup_teren)     suprafete.push(`teren: ${p.sup_teren} mp`);
    if (p.sup_curte)     suprafete.push(`curte: ${p.sup_curte} mp`);
    if (p.sup_balcon)    suprafete.push(`balcon: ${p.sup_balcon} mp`);
    if (p.sup_terasa)    suprafete.push(`terasă: ${p.sup_terasa} mp`);

    const camere: string[] = [];
    if (p.nr_camere)     camere.push(`${p.nr_camere} camere`);
    if (p.nr_dormitoare) camere.push(`${p.nr_dormitoare} dormitoare`);
    if (p.nr_bai)        camere.push(`${p.nr_bai} băi`);
    if (p.nr_bucatarii)  camere.push(`${p.nr_bucatarii} bucătărie`);
    if (p.nr_balcoane)   camere.push(`${p.nr_balcoane} balcoane`);
    if (p.nr_terase)     camere.push(`${p.nr_terase} terase`);

    const etajInfo = p.parter ? 'parter' : p.ultimul_etaj ? `ultimul etaj (${p.etaj})` : p.etaj != null ? `etaj ${p.etaj}${p.nr_etaje ? `/${p.nr_etaje}` : ''}` : '';

    const fin = p.finisaje || {};
    const finisajeList: string[] = [
      fin.stare && `stare: ${fin.stare}`,
      fin.pereti && `pereți: ${fin.pereti}`,
      fin.podele && `podele: ${fin.podele}`,
      fin.tamplarie && `tâmplărie: ${fin.tamplarie}`,
      fin.usa_intrare && `ușă intrare: ${fin.usa_intrare}`,
      fin.acoperis && `acoperiș: ${fin.acoperis}`,
    ].filter(Boolean) as string[];

    const inc = p.incalzire || {};
    const incalzireList: string[] = [
      inc.centrala_proprie && 'centrală proprie',
      inc.centrala_bloc && 'centrală de bloc',
      inc.termoficare && 'termoficare',
      inc.pardoseala && 'încălzire în pardoseală',
      inc.semineu && 'șemineu',
      inc.aer_conditionat && `aer condiționat${p.nr_ac ? ` (${p.nr_ac} unități)` : ''}`,
    ].filter(Boolean) as string[];

    const ut = p.utilitati || {};
    const util: string[] = [
      ut.curent && 'curent electric', ut.apa && 'apă curentă',
      ut.canalizare && 'canalizare', ut.gaz && 'gaz',
      ut.internet && 'internet', ut.cablu && 'cablu TV',
      ut.fotovoltaice && 'panouri fotovoltaice', ut.trifazic && 'curent trifazic',
      ut.fosa && 'fosă septică', ut.put && 'puț',
    ].filter(Boolean) as string[];

    const dot = p.dotari || {};
    const dotari: string[] = [
      dot.lift && 'lift', dot.interfon && 'interfon', dot.videointerfon && 'videointerfon',
      dot.alarma && 'alarmă', dot.supraveghere && 'supraveghere video',
      dot.curte && `curte${p.sup_curte ? ` ${p.sup_curte} mp` : ''}`,
      dot.gradina && 'grădină', dot.piscina && 'piscină', dot.foisor && 'foișor',
      dot.garaj && 'garaj', dot.boxa && `boxă${p.sup_pivnita ? ` ${p.sup_pivnita} mp` : ''}`,
      dot.dressing && 'dressing', dot.debara && 'debara',
      dot.jacuzzi && 'jacuzzi', dot.sauna && 'saună',
      dot.terasa && `terasă${p.sup_terasa ? ` ${p.sup_terasa} mp` : ''}`,
      p.nr_parcare && `${p.nr_parcare} loc(uri) de parcare`,
    ].filter(Boolean) as string[];

    const mobilareLine = [
      p.mobilat && `mobilat: ${p.mobilat}`,
      p.utilat && `utilat: ${p.utilat}`,
    ].filter(Boolean).join('; ');

    const dateConstructie: string[] = [
      p.an_constructie && `an construcție: ${p.an_constructie}`,
      p.an_renovare && `an renovare: ${p.an_renovare}`,
      p.structura && `structură: ${p.structura}`,
      p.regim_inaltime && `regim înălțime: ${p.regim_inaltime}`,
      p.compartimentare && `compartimentare: ${p.compartimentare}`,
      p.confort && `confort: ${p.confort}`,
      p.orientare && `orientare: ${p.orientare}`,
      p.clasa_energetica && `clasă energetică: ${p.clasa_energetica}`,
      p.risc_seismic && `risc seismic: ${p.risc_seismic}`,
    ].filter(Boolean) as string[];

    const isVanzare = tipOferta.toLowerCase().includes('vânzare') || tipOferta.toLowerCase().includes('vanzare');

    // ── System prompt ─────────────────────────────────────────────────────────
    const systemPrompt = `Ești expert SEO specializat în imobiliare din România, cu 15 ani experiență la KIRA Imobiliare.
Generezi descrieri unice, profesioniste, optimizate pentru Google, AI Overview și căutări conversaționale.

REGULI STRICTE:
- Limbaj natural, profesionist, fără clișee repetate
- Fiecare descriere este unică — variezi structura, sinonimele, ordinea
- Nu repeta aceeași propoziție sau frază
- Fără keyword stuffing — cuvintele cheie apar natural
- Scoruri țintă: SEO ≥ 95/100, lizibilitate Flesch ≥ 70
- Nu folosi bullet points în descrierea SEO completă — text curgător în paragrafe`;

    // ── User prompt ───────────────────────────────────────────────────────────
    const userPrompt = `Generează descrieri SEO pentru proprietatea KIRA Imobiliare cu următoarele date:

TIP: ${tipProp} de ${tipOferta}
LOCAȚIE: ${location || p.judet || 'România'}
PREȚ: ${price}
${suprafete.length ? `SUPRAFEȚE: ${suprafete.join('; ')}` : ''}
${camere.length ? `COMPARTIMENTARE: ${camere.join(', ')}` : ''}
${etajInfo ? `ETAJ: ${etajInfo}` : ''}
${dateConstructie.length ? `CONSTRUCȚIE: ${dateConstructie.join('; ')}` : ''}
${finisajeList.length ? `FINISAJE: ${finisajeList.join('; ')}` : ''}
${incalzireList.length ? `ÎNCĂLZIRE/AC: ${incalzireList.join(', ')}` : ''}
${dotari.length ? `DOTĂRI: ${dotari.join(', ')}` : ''}
${util.length ? `UTILITĂȚI: ${util.join(', ')}` : ''}
${mobilareLine ? `MOBILARE: ${mobilareLine}` : ''}
${p.descriere ? `DESCRIERE INTERNĂ AGENT: ${p.descriere}` : ''}
${p.photo_analyses?.overall_observations ? `OBSERVAȚII DIN POZE (AI Vision): ${p.photo_analyses.overall_observations}` : ''}
${p.photo_analyses?.photos?.length ? `CAMERE IDENTIFICATE ÎN POZE: ${(p.photo_analyses.photos as Array<{room_type: string; description: string; features?: string[]}>).map((ph) => `${ph.room_type}: ${ph.description}${ph.features?.length ? ` (${ph.features.join(', ')})` : ''}`).join('; ')}` : ''}

Returnează JSON cu structura EXACTĂ (fără text în afara JSON-ului):
{
  "titlu_seo": "titlu SEO atractiv 60-70 caractere: tip proprietate + nr camere + zona + caracteristici cheie + KIRA Imobiliare",
  "seo": "descriere SEO completă 700-1200 cuvinte, structurată în 6 secțiuni clare separate prin linie goală:\\n\\n1. INTRODUCERE (2 paragrafe): KIRA Imobiliare prezintă proprietatea, tip, localitate, zonă/cartier, suprafață, avantaje principale\\n\\n2. DESCRIERE DETALIATĂ (3-4 paragrafe): compartimentare, luminozitate, orientare, finisaje, calitate construcție, confort, priveliște, etaj, stare imobil, eficiență energetică, costuri întreținere\\n\\n3. FACILITĂȚI (2 paragrafe): toate dotările enumerate natural în text (centrală, AC, lift, parcare, boxă etc.)\\n\\n4. ZONA (2 paragrafe): descriere SEO zonă, incluzând natural proximitate școli/grădinițe, magazine, transport, parc, restaurante, centru comercial dacă sunt relevante pentru ${p.localitate || 'localitate'}\\n\\n5. PENTRU CINE ESTE POTRIVITĂ (1 paragraf): familie/cuplu/investiție/închiriere/cabinet în funcție de tip proprietate${isVanzare ? '\\n\\n6. AVANTAJELE INVESTIȚIEI (1 paragraf): randament, zonă în dezvoltare, cerere, lichiditate, potențial apreciere' : ''}\\n\\nCTA FINAL: Contactați KIRA Imobiliare pentru vizionare și consultanță completă.",
  "meta_desc": "meta description 150-160 caractere pentru Google, cu keyword principal + avantaje + CTA",
  "completa": "descriere completă profesionistă 150-200 cuvinte, elegant, toate avantajele principale",
  "scurta": "descriere scurtă 40-50 cuvinte pentru listing rapid",
  "facebook": "text Facebook/Instagram max 100 cuvinte, informal cu 3-4 emoji relevanți, CTA puternic",
  "olx": "descriere OLX max 150 cuvinte, direct, listing standard",
  "storia": "descriere Storia.ro max 150 cuvinte, focus calitate și lifestyle"
}`;

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('AI nu a returnat JSON valid');

    const descriptions = JSON.parse(jsonMatch[0]);
    return Response.json({ descriptions });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare AI' }, { status: 500 });
  }
}
