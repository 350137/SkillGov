// Main App component; routing shell with branded left navigation for the SkillGov SPA.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Route, Routes } from 'react-router-dom';
import { api } from './api';
import { Explore } from './pages/Explore';
import { MySkills } from './pages/MySkills';
import { Settings } from './pages/Settings';
import { Tags } from './pages/Tags';
import type { TargetProfile } from './types';

const appIconUrl = new URL('../../desktop/src-tauri/icons/icon.ico', import.meta.url).href;

type NavIcon = 'skills' | 'explore' | 'tags' | 'settings';

const navIcons: Record<NavIcon, string> = {
  skills: 'M4 7.5 12 3l8 4.5-8 4.5L4 7.5Zm0 4.5 8 4.5 8-4.5M4 16.5 12 21l8-4.5',
  explore: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm3-12-2.2 4.8L8 16l2.2-4.8L15 9Z',
  tags: 'M4 5h8.5L20 12.5 12.5 20 4 11.5V5Zm4 4h.01',
  settings:
    'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm0-5v2m0 13v2m8.5-8.5h-2m-13 0h-2m14.3-6.3-1.4 1.4M7.6 16.4l-1.4 1.4m0-12.1 1.4 1.4m8.8 8.8 1.4 1.4',
};

function NavigationIcon({ icon }: { icon: NavIcon }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-6 w-6 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      <path d={navIcons[icon]} />
    </svg>
  );
}

export function App() {
  const { t } = useTranslation();
  const [targetProfiles, setTargetProfiles] = useState<TargetProfile[]>([]);
  const [projectRoot, setProjectRoot] = useState('');
  const [version, setVersion] = useState('');

  useEffect(() => {
    api
      .getStatus()
      .then((data) => {
        setTargetProfiles(data.targetProfiles || []);
        setProjectRoot(data.projectRoot || '');
        setVersion(data.apiVersion || '');
      })
      .catch(() => {});
  }, []);

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex w-full items-center gap-4 rounded-lg px-4 py-3 text-base no-underline transition-colors ${
      isActive
        ? 'bg-[#965276] text-white shadow-sm'
        : 'text-[#2f2a2d] hover:bg-[#f3ecef] hover:text-[#965276]'
    }`;

  return (
    <div className="min-h-screen bg-[#fbf8f6] text-[#241f22]">
      <div className="flex min-h-screen">
        <aside className="flex w-[280px] shrink-0 flex-col border-r border-[#eadfdd] bg-[#fbf8f6] px-5 py-6">
          <div className="flex items-center gap-4">
            <img
              src={appIconUrl}
              alt="SkillGov"
              data-testid="app-brand-icon"
              className="h-[68px] w-[68px] rounded-lg object-cover shadow-sm"
            />
            <div className="min-w-0">
              <div className="text-[28px] font-semibold leading-tight text-[#191619]">SkillGov</div>
              <div className="mt-2 whitespace-nowrap text-xs text-[#6f676b]">
                {t('appSubtitle')}
              </div>
            </div>
          </div>

          <nav className="mt-16 flex flex-col gap-5">
            <NavLink to="/" end className={navLinkClass}>
              <NavigationIcon icon="skills" />
              <span>{t('mySkills')}</span>
            </NavLink>
            <NavLink to="/explore" className={navLinkClass}>
              <NavigationIcon icon="explore" />
              <span>{t('explore')}</span>
            </NavLink>
            <NavLink to="/tags" className={navLinkClass}>
              <NavigationIcon icon="tags" />
              <span>{t('tags')}</span>
            </NavLink>
            <NavLink to="/settings" className={navLinkClass}>
              <NavigationIcon icon="settings" />
              <span>{t('settings')}</span>
            </NavLink>
          </nav>

          <div className="mt-auto border-t border-[#e6dbd8] pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#68715e] text-xl text-white">
                A
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-medium text-[#241f22]">Alex Chen</div>
                <div className="mt-1 flex items-center gap-2 text-sm text-[#655e62]">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#5f8a5a]" />
                  <span>{t('localMode')}</span>
                </div>
              </div>
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-5 w-5 text-[#5f575b]"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </div>
            {(version || projectRoot) && (
              <div className="mt-4 truncate text-xs text-[#8d8488]" title={projectRoot}>
                {version ? `v${version}` : ''} {projectRoot || t('noProject')}
              </div>
            )}
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <main className="min-w-0">
            <Routes>
              <Route path="/" element={<MySkills />} />
              <Route path="/my-skills" element={<MySkills />} />
              <Route path="/explore" element={<Explore />} />
              <Route path="/tags" element={<Tags />} />
              <Route
                path="/settings"
                element={<Settings targetProfiles={targetProfiles} projectRoot={projectRoot} />}
              />
            </Routes>
          </main>
        </div>
      </div>
    </div>
  );
}
