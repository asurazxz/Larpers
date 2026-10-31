'use client';

import RunExplain from '../RunExplain';
import { useApp } from '../../lib/store';
import { statusLabel } from '../../lib/format';
import { EmptyState, Tabs } from '../common/ui';
import { Costs, Overview } from '../results/OverviewCosts';
import { Compare, Demand } from '../results/DemandCompare';
import { FacilitiesTable, FlowsTable } from '../results/FacilitiesFlows';

const TABS = [
    { key: 'overview', label: 'Results Overview' },
    { key: 'costs', label: 'Cost Breakdown' },
    { key: 'facilities', label: 'Facilities' },
    { key: 'flows', label: 'Flows' },
    { key: 'demand', label: 'Demand Fulfilment' },
    { key: 'compare', label: 'Compare Scenarios' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export default function ResultsPage() {
    const { solution, tab, go } = useApp();
    const active: TabKey = TABS.some((t) => t.key === tab) ? (tab as TabKey) : 'overview';
    return (
        <div>
            <div className="flex items-center justify-between gap-4 border-b border-line bg-white px-6 [&_[role=tablist]]:border-b-0 lg:px-8">
                <div className="min-w-0 flex-1"><Tabs tabs={[...TABS]} active={active} onChange={(k) => go('results', k)} /></div>
                {solution && <span className="hidden whitespace-nowrap text-xs text-muted xl:block">{statusLabel(solution)}</span>}
            </div>
            <div className="p-6 lg:p-8">
                {!solution ? (
                    <EmptyState title="No run to show">Run or load a scenario first.</EmptyState>
                ) : (
                    <>
                        {active === 'overview' && (
                            <div className="space-y-5">
                                <RunExplain />
                                <Overview solution={solution} />
                            </div>
                        )}
                        {active === 'costs' && <Costs solution={solution} />}
                        {active === 'facilities' && <FacilitiesTable solution={solution} />}
                        {active === 'flows' && <FlowsTable solution={solution} />}
                        {active === 'demand' && <Demand solution={solution} />}
                        {active === 'compare' && <Compare solution={solution} />}
                    </>
                )}
            </div>
        </div>
    );
}
