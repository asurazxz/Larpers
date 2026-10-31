// What the explain button says about the run on screen. Figures go through the same formatters as the cost card,
// so the words always match it. api/plain_english.py sends them to Gemini; fixedText words the same figures when Gemini
// is out of reach, so the button also works on the static fallback.
import type { Solution } from './contract';
import { annualCost, CAPEX_YEARS } from './annual';
import { isProvenOptimal, pct, usd } from './format';

export type ExplainKind = 'network' | 'no_network' | 'trace';
export type Facts = Record<string, string>;

export interface ExplainInput {
    kind: ExplainKind;
    facts: Facts;
}

export const hasNoNetwork = (s: Pick<Solution, 'status'>): boolean => s.status === 'infeasible' || s.status === 'no_solution';

/** 1.20 million tonnes, 850 thousand tonnes: "kt" means nothing to a reader outside logistics. */
function tonnes(kt: number): string {
    return kt >= 1000 ? `${(kt / 1000).toFixed(2)} million tonnes` : `${kt.toFixed(0)} thousand tonnes`;
}

const amount = (text: string) => tonnes(Number(text.replace(/,/g, '')));
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The solver's reason (solver/model.py) as a clause in everyday words; a reason it does not know passes through. */
export function plainReason(reason: string | null | undefined): string {
    if (!reason) return 'the run gave no reason';
    let m = reason.match(/^Demand of ([\d,.]+) kt exceeds the ([\d,.]+) kt of SAF (.+)$/);
    if (m) {
        const source = m[3].startsWith('from sites') ? 'the sites within reach of a depot' : 'the biomass sites';
        return `the airports need ${amount(m[1])} of fuel a year, but ${source} can make at most ${amount(m[2])}`;
    }
    m = reason.match(/^(Refineries|Depots) must take ([\d,.]+) kt, but (\d+) candidate sites hold ([\d,.]+) kt at most$/);
    if (m) {
        const name = m[1].toLowerCase();
        return `the ${name} would have to take in ${amount(m[2])} of biomass a year, but the ${m[3]} candidate sites can hold at most ${amount(m[4])}`;
    }
    m = reason.match(/^No feasible network among (\d+) refinery candidates$/);
    if (m) return `no workable network was found among the ${m[1]} refinery candidates`;
    m = reason.match(/^Could not find a feasible network within (.+?);/);
    if (m) return `the software could not find a workable network within ${m[1]}`;
    return reason;
}

function statusSentence(s: Solution): string {
    if (s.status === 'heuristic') return 'This is a simple rule-of-thumb plan kept for comparison, not an optimised one.';
    if (isProvenOptimal(s)) return `This is the lowest-cost network among the ${s.n_candidates} shortlisted refinery sites.`;
    if (s.gap === null || s.gap === undefined) return 'This is the best plan found, with no measure of how much better one could be.';
    return `This is the best plan found: among the ${s.n_candidates} shortlisted refinery sites, a better one could be at most ${pct(s.gap, 2)} cheaper.`;
}

function auditSentence(s: Solution): string {
    const v = s.validation;
    if (!v) return 'No independent check was run on this plan.';
    if (v.passed) return 'An independent check of the plan passed.';
    const n = v.failures?.length ?? 0;
    return `An independent check found ${plural(n, 'problem', 'problems')}, so treat these figures with caution.`;
}

function networkFacts(s: Solution, baseline: Solution | null): Facts | null {
    const annual = annualCost(s);
    if (annual.total === null) return null;
    const count = (type: string) => s.facilities.filter((f) => f.type === type).length;
    const deliveredKt = s.flows.filter((f) => f.leg === 'refinery_airport').reduce((sum, f) => sum + f.kt, 0);
    const facts: Facts = {
        total_annual_cost: usd(annual.total),
        build_cost_per_year: usd(annual.annualisedCapex),
        upfront_build_cost: usd(s.capex_usd),
        build_cost_years: String(CAPEX_YEARS),
        upkeep_cost_per_year: usd(annual.fixedOpex),
        transport_cost_per_year: usd(annual.transport),
        refineries: plural(count('refinery'), 'refinery', 'refineries'),
        depots: plural(count('depot'), 'depot', 'depots'),
        fuel_delivered: tonnes(deliveredKt),
        status: statusSentence(s),
        audit_note: auditSentence(s),
    };
    if (annual.variableOpex !== null) facts.processing_cost_per_year = usd(annual.variableOpex);
    const baseTotal = baseline && baseline !== s ? annualCost(baseline).total : null;
    if (baseTotal) {
        const saving = baseTotal - annual.total;
        if (saving >= 0) {
            facts.saving_against_simple_plan = usd(saving);
            facts.saving_share_of_simple_plan = pct(saving / baseTotal, 1);
        } else {
            facts.extra_cost_against_simple_plan = usd(-saving);
        }
    }
    return facts;
}

/** The button's input for this run, or null when the run has no total to explain. */
export function explainInput(s: Solution, baseline: Solution | null): ExplainInput | null {
    if (hasNoNetwork(s)) {
        return {
            kind: 'no_network',
            facts: {
                reason: plainReason(s.status_reason),
                status:
                    s.status === 'infeasible'
                        ? 'No network could be found for these settings.'
                        : 'The software ran out of time before finding a network, so one may still exist.',
            },
        };
    }
    const facts = networkFacts(s, baseline);
    return facts && { kind: 'network', facts };
}

/** The same figures in fixed words, with no model involved. */
export function fixedText({ kind, facts: f }: ExplainInput): string {
    if (kind === 'no_network') {
        return `No network was built because ${f.reason}. There is no cost to show because nothing was built. ${f.status}`;
    }
    const parts = [
        `${f.build_cost_per_year} is the up-front build cost of ${f.upfront_build_cost} spread evenly over ${f.build_cost_years} years`,
        `${f.upkeep_cost_per_year} is yearly upkeep`,
        ...(f.processing_cost_per_year ? [`${f.processing_cost_per_year} is handling and processing the plant material`] : []),
        `${f.transport_cost_per_year} is moving the plant material and the fuel`,
    ];
    const compared = f.saving_against_simple_plan
        ? `It costs ${f.saving_against_simple_plan} a year less than a simple rule-of-thumb plan, a saving of ${f.saving_share_of_simple_plan}.`
        : f.extra_cost_against_simple_plan
          ? `It costs ${f.extra_cost_against_simple_plan} a year more than a simple rule-of-thumb plan.`
          : null;
    return [
        `This plan costs ${f.total_annual_cost} a year: ${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}.`,
        `It builds ${f.refineries} and ${f.depots}, and delivers ${f.fuel_delivered} of sustainable aviation fuel a year.`,
        compared,
        f.status,
        f.audit_note,
    ]
        .filter(Boolean)
        .join(' ');
}
