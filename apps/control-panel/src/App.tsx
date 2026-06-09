// Main App component — routing shell with navigation header for the SkillGov control panel SPA.
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { api } from './api';
import { Explore } from './pages/Explore';
import { MySkills } from './pages/MySkills';
import { Settings } from './pages/Settings';
import { Tags } from './pages/Tags';
import type { TargetProfile } from './types';

export function App() {
  const { t, i18n } = useTranslation();
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
    `px-3 py-1.5 text-sm rounded ${isActive ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`;

  return (
    <div className="min-h-screen bg-[#f0f2f5]">
      <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-lg font-semibold text-gray-900 no-underline">
            {t('title')}
          </Link>
          {version && <span className="text-xs text-gray-400">v{version}</span>}
          <span className="text-xs text-gray-400">{projectRoot || t('noProject')}</span>
        </div>
        <nav className="flex items-center gap-1">
          <NavLink to="/" end className={navLinkClass}>
            {t('mySkills')}
          </NavLink>
          <NavLink to="/explore" className={navLinkClass}>
            {t('explore')}
          </NavLink>
          <NavLink to="/tags" className={navLinkClass}>
            {t('tags')}
          </NavLink>
          <NavLink to="/settings" className={navLinkClass}>
            {t('settings')}
          </NavLink>
          <select
            value={i18n.language.startsWith('zh') ? 'zh' : 'en'}
            onChange={(e) => i18n.changeLanguage(e.target.value)}
            className="ml-3 px-2 py-1 border border-gray-300 rounded text-sm bg-white"
          >
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
        </nav>
      </header>

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
    </div>
  );
}
