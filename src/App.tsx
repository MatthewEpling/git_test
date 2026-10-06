import { useEffect, useState } from 'react';
import { Home, type LaunchRequest } from './pages/Home';
import { Player } from './pages/Player';
import { Guest } from './pages/Guest';
import { SettingsDialog } from './pages/Settings';

type Route = { page: 'home' } | { page: 'play'; launch: LaunchRequest } | { page: 'join'; room: string } | { page: 'invite' };

function routeFromHash(): Route {
  const m = location.hash.match(/join=([A-Za-z0-9]{6})/);
  return m ? { page: 'join', room: m[1].toUpperCase() } : { page: 'home' };
}

export default function App() {
  const [route, setRoute] = useState<Route>(routeFromHash);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const onHash = () => setRoute((r) => (r.page === 'play' ? r : routeFromHash()));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const home = () => {
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    setRoute({ page: 'home' });
  };

  if (route.page === 'play') return <Player key={route.launch.gameKey + route.launch.main.name} launch={route.launch} onExit={home} />;
  if (route.page === 'join') return <Guest mode={{ kind: 'room', room: route.room }} onExit={home} />;
  if (route.page === 'invite') return <Guest mode={{ kind: 'invite' }} onExit={home} />;
  return (
    <>
      <Home
        onPlay={(launch) => setRoute({ page: 'play', launch })}
        onJoin={(room) => setRoute({ page: 'join', room })}
        onJoinInvite={() => setRoute({ page: 'invite' })}
        onSettings={() => setSettingsOpen(true)}
      />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
