'use client';

// One route (static export, relative asset prefix): five workspace pages switch on the URL hash
// inside one React tree, so the selected run, map selection and scenario form persist across pages.
import { AppProvider } from '../lib/store';
import AppShell from '../components/layout/AppShell';
import OverviewPage from '../components/pages/OverviewPage';
import NetworkExplorerPage from '../components/pages/NetworkExplorerPage';
import ScenarioPlannerPage from '../components/pages/ScenarioPlannerPage';
import ResultsPage from '../components/pages/ResultsPage';
import ReliabilityPage from '../components/pages/ReliabilityPage';

const PAGES = {
    overview: OverviewPage,
    network: NetworkExplorerPage,
    planner: ScenarioPlannerPage,
    results: ResultsPage,
    reliability: ReliabilityPage,
};

export default function Page() {
    return (
        <AppProvider>
            <AppShell pages={PAGES} />
        </AppProvider>
    );
}
