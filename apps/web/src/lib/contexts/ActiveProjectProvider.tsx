import type {Project} from '@plunk/db';
import {createContext, type ReactNode, use, useEffect, useState} from 'react';
import {useSWRConfig} from 'swr';

import {useProjects} from '../hooks/useProject';

interface ActiveProjectContextValue {
  activeProject: Project | null;
  setActiveProject: (project: Project) => void;
  updateActiveProject: (project: Project) => void;
  availableProjects: Project[];
  isLoading: boolean;
}

const ActiveProjectContext = createContext<ActiveProjectContextValue | undefined>(undefined);

export function ActiveProjectProvider({children}: {children: ReactNode}) {
  const {data: projects, isLoading} = useProjects();
  const {mutate} = useSWRConfig();

  // State is null until projects load, but localStorage is read synchronously by network.ts
  // This ensures consistent behavior: either all calls use stored ID, or all fall back to projects[0]
  const [activeProject, setActiveProjectState] = useState<Project | null>(null);

  // Initialize active project from localStorage or use first project
  useEffect(() => {
    if (!projects || projects.length === 0) return;

    const storedProjectId = localStorage.getItem('activeProjectId');

    if (storedProjectId) {
      // Find the stored project in available projects
      const project = projects.find(p => p.id === storedProjectId);
      if (project) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setActiveProjectState(project);
      } else if (projects[0]) {
        // Stored project not found (user might have been removed), use first project

        setActiveProjectState(projects[0]);
        localStorage.setItem('activeProjectId', projects[0].id);
      }
    } else if (projects[0]) {
      // No stored project, initialize with first one

      setActiveProjectState(projects[0]);
      localStorage.setItem('activeProjectId', projects[0].id);
    }
  }, [projects]);

  const setActiveProject = (project: Project) => {
    setActiveProjectState(project);
    localStorage.setItem('activeProjectId', project.id);

    // Invalidate all SWR cache to refetch data for new project
    void mutate(() => true, undefined, {revalidate: true});
  };

  // Updates the active project's data in-place without invalidating the SWR cache.
  // Use this when saving settings for the current project, not when switching projects.
  const updateActiveProject = (project: Project) => {
    setActiveProjectState(project);
  };

  const value: ActiveProjectContextValue = {
    activeProject,
    setActiveProject,
    updateActiveProject,
    availableProjects: projects ?? [],
    isLoading,
  };

  return <ActiveProjectContext.Provider value={value}>{children}</ActiveProjectContext.Provider>;
}

export function useActiveProject() {
  const context = use(ActiveProjectContext);
  if (context === undefined) {
    throw new Error('useActiveProject must be used within an ActiveProjectProvider');
  }
  return context;
}
