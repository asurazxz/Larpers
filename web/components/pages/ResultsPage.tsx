'use client';

import { useApp } from '../../lib/store';
import { statusLabel } from '../../lib/format';
import { EmptyState, PageHeader, Tabs } from '../common/ui';
import { Costs, Overview } from '../results/OverviewCosts';
import { Compare, Demand } from '../results/DemandCompare';
import { FacilitiesTable, FlowsTable } from '../results/FacilitiesFlows';

const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'costs', label: 'Costs' },
    { key: 'facilities', label: 'Facilities' },
    { key: 'flows', label: 'Flows' },
    { key: 'demand', label: 'Demand' },
    { key: 'compare', label: 'Compare' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export default function ResultsPage() {
    const { solution, tab, go } = useApp();
    const active: TabKey = TABS.some((t) => t.key === tab) ? (tab as TabKey) : 'overview';
    return (
        <div className="p-6 lg:p-8">
            <PageHeader title="Results" subtitle={solution ? statusLabel(solution) : 'No run selected'} />
            {!solution ? (
                <EmptyState title="No run to show">Run or load a scenario first.</EmptyState>
            ) : (
                <>
                    <Tabs tabs={[...TABS]} active={active} onChange={(k) => go('results', k)} />
                    <div className="mt-5">
                        {active === 'overview' && <Overview solution={solution} />}
                        {active === 'costs' && <Costs solution={solution} />}
                        {active === 'facilities' && <FacilitiesTable solution={solution} />}
                        {active === 'flows' && <FlowsTable solution={solution} />}
                        {active === 'demand' && <Demand solution={solution} />}
                        {active === 'compare' && <Compare solution={solution} />}
                    </div>
                </>
            )}
        </div>
    );
}
